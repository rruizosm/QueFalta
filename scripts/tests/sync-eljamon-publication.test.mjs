import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareEljamonPublication } from '../lib/eljamon-publication.mjs';

const runStart = '2026-10-27T12:00:00.000Z';
const categories = [{ id: '01' }, { id: '0101' }, { id: '0102' }];
const product = (id, categoryIds = ['01', '0101'], resolution = 'detail_breadcrumb') => ({
  id, display_name: `Producto ${id}`, category_ids: categoryIds,
  raw: { category_resolution: resolution },
});

test('el timeout de un SKU excluye solo ese producto del catálogo de 7.049 filas', () => {
  const valid = Array.from({ length: 7048 }, (_, index) => product(String(index)));
  const failed = product('11014088', ['01'], 'unresolved');
  const result = prepareEljamonPublication([...valid, failed].values(), categories.values(), runStart);
  assert.equal(result.rows.length, 7048);
  assert.deepEqual(result.rows, valid);
  assert.deepEqual(result.excluded, [{
    id: '11014088', display_name: 'Producto 11014088', reason: 'unresolved_category',
  }]);
  assert.deepEqual(result.categoryRows.map((row) => row.product_count), [7048, 7048, 0]);
  assert.ok(result.categoryRows.every((row) => row.synced_at === runStart && row.published));
});

test('excluye categorías no resueltas, solo raíz y rutas ausentes sin interrumpir las siguientes filas', () => {
  const missing = product('missing');
  delete missing.category_ids;
  const result = prepareEljamonPublication([
    product('unresolved', ['01', '0101'], 'unresolved'),
    product('root', ['01']), missing, product('empty', []), product('valid'),
  ], categories, runStart);
  assert.deepEqual(result.rows.map((row) => row.id), ['valid']);
  assert.deepEqual(result.excluded.map((row) => row.id), ['unresolved', 'root', 'missing', 'empty']);
});

test('conserva productos resueltos por nombre, breadcrumb o ancestro y sus datos', () => {
  const products = ['source_name_unique', 'detail_breadcrumb', 'source_name_parent'].map((resolution, index) => ({
    ...product(String(index), ['01', '0102'], resolution), unit_price: 1.5, published: true,
  }));
  const result = prepareEljamonPublication(products, categories, runStart);
  assert.deepEqual(result.rows, products);
  assert.deepEqual(result.excluded, []);
  assert.deepEqual(result.categoryRows.map((row) => row.product_count), [3, 0, 3]);
});

test('un lote sin productos válidos produce cero filas publicables', () => {
  const result = prepareEljamonPublication([product('failed', ['01'], 'unresolved')], categories, runStart);
  assert.deepEqual(result.rows, []);
  assert.equal(result.excluded.length, 1);
  assert.ok(result.categoryRows.every((row) => row.product_count === 0));
});
