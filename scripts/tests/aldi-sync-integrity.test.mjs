import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAldiSyncIntegrity } from '../lib/aldi-sync-integrity.mjs';

const healthy = {
  products: 2020, categories: 126, roots: 20, leaves: 106,
  failedPages: [], previousProducts: 2000, previousCategories: 126,
  minProducts: 800,
};

test('Aldi accepts a complete catalogue', () => {
  assert.doesNotThrow(() => assertAldiSyncIntegrity(healthy));
});

test('Aldi rejects the 14 September partial run before writing', () => {
  assert.throws(() => assertAldiSyncIntegrity({ ...healthy, products: 895, categories: 45 }), /cayó de 2000 a 895/);
});

test('Aldi rejects a missing category page even when totals look healthy', () => {
  assert.throws(() => assertAldiSyncIntegrity({
    ...healthy,
    failedPages: [{ path: '/productos/charcuteria.html', reason: 'HTTP 200 sin __NEXT_DATA__' }],
  }), /páginas Aldi sin datos/);
});

test('Aldi rejects lost categories independently of product totals', () => {
  assert.throws(() => assertAldiSyncIntegrity({ ...healthy, categories: 80 }), /categorías/);
});
