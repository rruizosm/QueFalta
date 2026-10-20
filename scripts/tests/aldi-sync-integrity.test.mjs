import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertAldiSyncIntegrity, resolveAldiSeasonalAliases } from '../lib/aldi-sync-integrity.mjs';

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

const roots = ['/productos/bebidas-alcoholicas', '/productos/platos-preparados-y-pizza', '/productos/bebidas'];
const solar = '/productos/cuidado-personal/proteccion-solar';
const aliases = ['/productos/verano/bebidas-alcoholicas-verano', '/productos/verano/cremas-solares', '/productos/verano/platos-preparados-y-snacks', '/productos/verano/bebidas'];

test('Aldi removes only verified seasonal aliases with canonical coverage', () => {
  const leaves = [solar, ...aliases, '/productos/verano/helados', '/productos/charcuteria/jamon'];
  const resolved = resolveAldiSeasonalAliases({ roots, leaves });
  assert.deepEqual(resolved.leaves, [solar, '/productos/verano/helados', '/productos/charcuteria/jamon']);
  assert.equal(resolved.aliases.length, 4);
  assert.equal(leaves.length, 7);
});

test('Aldi aborts when a replacement leaf is absent', () => {
  assert.throws(() => resolveAldiSeasonalAliases({ roots, leaves: aliases }), /sin destino.*proteccion-solar/);
});

test('Aldi aborts when a replacement root is absent', () => {
  assert.throws(() => resolveAldiSeasonalAliases({ roots: [], leaves: [solar, ...aliases] }), /sin destino.*bebidas-alcoholicas/);
});

test('Aldi still rejects failed canonical and unknown seasonal pages', () => {
  for (const path of [solar, '/productos/bebidas.html', '/productos/verano/helados.html']) {
    assert.throws(() => assertAldiSyncIntegrity({ ...healthy, failedPages: [{ path, reason: 'HTTP 404' }] }), /páginas Aldi sin datos/);
  }
});
