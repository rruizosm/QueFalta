import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function apiFor(rows, tableName = 'lidl_store_products') {
  const calls = [];
  const supabase = { from: (table) => {
    assert.equal(table, tableName);
    calls.push(['from', table]);
    let result = rows;
    const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
    const builder = {
      select: (columns) => { calls.push(['select', columns]); return builder; },
      eq: (column, value) => { result = result.filter(row => get(row, column) === value); return builder; },
      neq: (column, value) => { result = result.filter(row => get(row, column) !== value); return builder; },
      not: (column, operator, value) => {
        if (operator === 'in') { const excluded = JSON.parse(`[${value.slice(1, -1)}]`); result = result.filter(row => !excluded.includes(get(row, column))); }
        else if (operator === 'ov') { const excluded = value.slice(1, -1).split(','); result = result.filter(row => !(get(row, column) ?? []).some(id => excluded.includes(id))); }
        else result = result.filter(row => get(row, column) !== value);
        return builder;
      },
      or: (filter) => { calls.push(['or', filter]); result = result.filter(row => !row.regions?.length || row.regions.includes('Cataluña')); return builder; },
      overlaps: (column, values) => { result = result.filter(row => get(row, column).some(value => values.includes(value))); return builder; },
      ilike: (column, value) => { result = result.filter(row => get(row, column).includes(value.slice(1, -1))); return builder; },
      order: () => builder,
      range: (start, end) => { result = result.slice(start, end + 1); return builder; },
      abortSignal: (signal) => { calls.push(['signal', signal]); return builder; },
      then: (resolve) => Promise.resolve({ data: result, error: null }).then(resolve),
    };
    return builder;
  } };
  const deps = {
    '../lib/supabase': { supabase },
    '../lib/pantryLayout': { isPantryImageUrl: (url) => typeof url === 'string' && url.startsWith('https://') },
    '../constants/regions': { REGION_ALL: 'ES', REGION_MERCADONA_NAME: { CT: 'Cataluña' } },
  };
  const module = { exports: {} };
  const source = readFileSync(new URL('../../src/api/pantry.ts', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(name => { assert.ok(name in deps, name); return deps[name]; }, module, module.exports);
  return { ...module.exports, calls };
}
const row = (id, extras = {}) => ({ store_id: 'ES3572', published: true, product_id: id,
  category_ids: ['milk'], category_name: 'Lácteos', unit_price: 1,
  master: { id, display_name: 'Leche Lidl', display_name_norm: 'leche lidl', published: true,
    thumbnail: 'https://static-product-catalog.lidlplus.com/images/productdata/milk.jpg',
    illustration_url: 'https://example.com/lidl.webp' }, ...extras });

test('Lidl paginates illustrated products within the selected store and category', async () => {
  const rows = [
    ...Array.from({ length: 45 }, (_, i) => row(`no-art-${i}`, { master: { ...row('').master, illustration_url: null } })),
    row('wrong-store', { store_id: 'ES1000' }), row('retired', { published: false }),
    row('retired-master', { master: { ...row('').master, published: false } }),
    row('bread', { category_ids: ['bread'] }),
    ...Array.from({ length: 31 }, (_, i) => row(`${i}_ES`)),
  ];
  const api = apiFor(rows);
  const signal = new AbortController().signal;
  const options = { store: 'lidl', lidlStoreId: 'ES3572', categoryIds: ['milk'] };
  const first = await api.searchPantryProducts('léche %', 'ca', 0, signal, options);
  assert.equal(first.products.length, 30);
  assert.equal(first.products[0].id, '0_ES');
  assert.equal(first.products[0].store, 'lidl');
  assert.equal(first.products[0].categoryName, 'Lácteos');
  assert.equal(first.products[0].imageUrl, row('').master.thumbnail);
  assert.equal(first.products[0].illustrationUrl, row('').master.illustration_url);
  assert.equal(first.products[0].priceLabel, '');
  assert.equal(first.products[0].unitPrice, null);
  assert.equal(first.products[0].pricePerUnitLabel, null);
  assert.equal(first.hasMore, true);
  assert.deepEqual(api.calls.find(call => call[0] === 'signal'), ['signal', signal]);
  const second = await api.searchPantryProducts('', 'es', 30, undefined, options);
  assert.deepEqual(second.products.map(p => p.id), ['30_ES']);
  assert.equal(second.hasMore, false);
  assert.equal((await api.searchPantryProducts('tomate', 'es', 0, undefined, options)).products.length, 0);
});

test('Lidl requires an explicit local store and never silently uses a reference store', async () => {
  const api = apiFor([row('milk')]);
  assert.deepEqual(await api.searchPantryProducts('', 'es', 0, undefined, { store: 'lidl' }), { products: [], hasMore: false });
  assert.equal(api.calls.length, 0);
});

test('Carrefour filters exclusions, category, availability, images and region before pagination, also in Catalan', async () => {
  const product = (id, extra = {}) => ({ id, published: true, available: true, category_name: 'Lácteos', category_ids: ['milk'],
    display_name: 'Leche Carrefour', display_name_norm: 'leche carrefour', thumbnail: 'https://example.com/original.jpg',
    illustration_url: 'https://example.com/cutout.png', ...extra });
  const api = apiFor([
    ...Array.from({ length: 35 }, (_, i) => product(`excluded-${i}`, { category_ids: ['milk', 'cat20037'] })),
    product('paper', { category_name: 'Papelería' }), product('shoes', { category_ids: ['cat20038'] }),
    product('not-published', { published: false }), product('not-available', { available: false }),
    product('no-image', { illustration_url: null }), product('empty-image', { illustration_url: '' }),
    product('madrid', { regions: ['Madrid'] }), product('other-category', { category_ids: ['bread'] }),
    ...Array.from({ length: 31 }, (_, i) => product(String(i), { regions: i % 2 ? ['Cataluña'] : null })),
  ], 'carrefour_products');
  const options = { store: 'carrefour', region: 'CT', categoryIds: ['milk'] };
  const first = await api.searchPantryProducts('léche %', 'ca', 0, undefined, options);
  assert.equal(first.products.length, 30);
  assert.equal(first.products[0].store, 'carrefour');
  assert.equal(first.products[0].name, 'Leche Carrefour');
  assert.equal(first.products[0].imageUrl, 'https://example.com/original.jpg');
  assert.equal(first.products[0].illustrationUrl, 'https://example.com/cutout.png');
  assert.equal(first.hasMore, true);
  assert.deepEqual((await api.searchPantryProducts('', 'es', 30, undefined, options)).products.map(p => p.id), ['30']);
  assert.ok(api.calls.some(call => call[0] === 'or' && call[1].includes('Cataluña')));
  assert.ok(api.PANTRY_STORES.includes('carrefour'));
  for (const [id, name] of [['cat260001', 'Otra'], ['other', 'PAPELERIA'], ['cat20037', 'Bazar'], ['cat20038', 'Calzado']]) {
    assert.equal(api.isCarrefourPantryCategory(id, name), false);
  }
});


test('Mercadona reads actual contents rather than the container type in search results', async () => {
  const api = apiFor([{ id: '123', display_name: 'Carne picada', display_name_norm: 'carne picada',
    packaging: 'Bandeja', size_instructions: { unit_size: .5, size_format: 'kg' }, published: true,
    illustration_url: 'https://example.com/meat.png' }], 'mercadona_products');
  const result = await api.searchPantryProducts('carne', 'es');
  assert.equal(result.products[0].metaLabel, '500 g');
  assert.ok(api.calls.some(call => call[0] === 'select' && call[1].includes('size_instructions:raw->price_instructions')));
  assert.equal(api.pantryPackageContents('mercadona', { packaging: 'Botella', size_instructions: { unit_size: 1, size_format: 'L' } }), '1 L');
  assert.equal(api.pantryPackageContents('mercadona', { packaging: 'Botella', size_instructions: { unit_size: .25, size_format: 'L' } }), '250 ml');
  assert.equal(api.pantryPackageContents('mercadona', { packaging: 'Bandeja' }), null);
  for (const value of [0, -1, 'bad', null]) assert.equal(api.pantryPackageContents('mercadona', { size_instructions: { unit_size: value, size_format: 'kg' } }), null);
  assert.equal(api.pantryPackageContents('lidl', { packaging: 'Bandeja' }), null);
  assert.equal(api.pantryPackageContents('lidl', { packaging: '500 g' }), '500 g');
});
