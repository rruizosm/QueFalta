import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function apiFor(rows) {
  const calls = [];
  const supabase = { from: (table) => {
    assert.equal(table, 'lidl_store_products');
    calls.push(['from', table]);
    let result = rows;
    const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row);
    const builder = {
      select: (columns) => { calls.push(['select', columns]); return builder; },
      eq: (column, value) => { result = result.filter(row => get(row, column) === value); return builder; },
      neq: (column, value) => { result = result.filter(row => get(row, column) !== value); return builder; },
      not: (column, _operator, value) => { result = result.filter(row => get(row, column) !== value); return builder; },
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
    '../constants/regions': { REGION_ALL: 'ES', REGION_MERCADONA_NAME: {} },
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
