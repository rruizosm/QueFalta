import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadModule(path, dependencies = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, {
    module: mod,
    exports: mod.exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return mod.exports;
}

const { recipeIngredientsToListItems } = loadModule('../../src/lib/recipeCart.ts');
const ingredient = {
  store: 'mercadona', productId: '123', productName: 'Arroz',
  productImageUrl: 'https://example.com/arroz.jpg', priceLabel: '1,30 €',
  metaLabel: '1 kg', quantity: ' 250 g ', categoryName: 'Arroz, legumbres y pasta',
  unitPrice: 1.3,
};

test('recipe ingredients retain cooking amounts without turning grams into packs', () => {
  const items = recipeIngredientsToListItems([
    ingredient,
    { ...ingredient, store: 'esclat', quantity: 'al gusto', categoryName: 'Especias' },
  ]);
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].unit, 'ud');
  assert.equal(items[0].note, '250 g');
  assert.equal(items[0].categoryName, 'Arroz, legumbres y pasta');
  assert.equal(items[0].storeKey, 'mercadona');
  assert.equal(items[0].mercadonaProductId, '123');
  assert.equal(items[0].storeProductId, '123');
  assert.equal(items[0].unitPrice, 1.3);
  assert.equal(items[0].imageUrl, ingredient.productImageUrl);
  assert.equal(items[1].quantity, 1);
  assert.equal(items[1].note, 'al gusto');
  assert.equal(items[1].storeKey, 'esclat');
  assert.equal(items[1].mercadonaProductId, null);
  assert.equal(items[1].storeProductId, '123');
  assert.equal(items[1].categoryName, 'Especias');
});

test('old recipes work without category, numeric price or cooking amount', () => {
  const { categoryName, unitPrice, quantity, ...legacy } = ingredient;
  const [item] = recipeIngredientsToListItems([legacy]);
  assert.equal(item.categoryName, null);
  assert.equal(item.note, null);
  assert.equal(item.unitPrice, 1.3);
  assert.equal(item.quantity, 1);
  assert.equal(recipeIngredientsToListItems([]).length, 0);
});

test('missing prices and promotional labels never become misleading cart totals', () => {
  for (const priceLabel of ['', '3,90 €/kg', '2 x 5 €', 'Desde 1,50 €']) {
    const [item] = recipeIngredientsToListItems([{ ...ingredient, unitPrice: undefined, priceLabel }]);
    assert.equal(item.unitPrice, null, priceLabel);
  }
  for (const unitPrice of [null, NaN, Infinity, -1]) {
    const [item] = recipeIngredientsToListItems([{ ...ingredient, unitPrice }]);
    assert.equal(item.unitPrice, null);
  }
  const [free] = recipeIngredientsToListItems([{ ...ingredient, unitPrice: 0 }]);
  assert.equal(free.unitPrice, 0);
});

function listApi(error = null) {
  const writes = [];
  const notifications = [];
  const api = loadModule('../../src/api/lists.ts', {
    '../lib/supabase': {
      supabase: {
        from(table) {
          assert.equal(table, 'list_items');
          return { async insert(rows) { writes.push(rows); return { error }; } };
        },
      },
    },
    './push': { notifyCartItemAdded: (...args) => notifications.push(args) },
    '../constants/stores': { CATALOG_STORE_KEYS: ['mercadona', 'esclat'] },
  });
  return { ...api, writes, notifications };
}

test('the entire recipe is inserted together into the selected shopping list', async () => {
  const api = listApi();
  const items = recipeIngredientsToListItems([
    ingredient, { ...ingredient, store: 'esclat', quantity: '2 cucharadas' },
  ]);
  await api.addItemsToList('active-list', items, 'current-user');
  assert.equal(api.writes.length, 1);
  assert.equal(api.writes[0].length, 2);
  for (const row of api.writes[0]) {
    assert.equal(row.list_id, 'active-list');
    assert.equal(row.added_by, 'current-user');
    assert.equal(row.quantity, 1);
    assert.equal(row.category_name, ingredient.categoryName);
    assert.equal(row.store_product_id, ingredient.productId);
  }
  assert.equal(api.writes[0][1].note, '2 cucharadas');
  assert.equal(api.notifications.length, 1);
});

test('a rejected cart write is propagated so the recipe can offer a retry', async () => {
  const error = new Error('Cart write rejected');
  const api = listApi(error);
  await assert.rejects(
    api.addItemsToList('active-list', recipeIngredientsToListItems([ingredient]), 'current-user'),
    error,
  );
  assert.equal(api.notifications.length, 0);
});
