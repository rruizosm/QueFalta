import assert from 'node:assert/strict';
import test from 'node:test';
import { lidlRequest, sortedLidlRows, isLidlAccessFailure } from './lidl-http.mjs';

test('shared rows use the same lock order regardless of download order and batch boundary', () => {
  const rows = Array.from({ length: 600 }, (_, i) => ({ id: String(i).padStart(5, '0') }));
  assert.deepEqual(sortedLidlRows([...rows].reverse()), rows);
  assert.deepEqual(sortedLidlRows([...rows.slice(250), ...rows.slice(0, 250)]), rows);
  assert.deepEqual(sortedLidlRows([{ store_id: 'ES2', product_id: '1' }, { store_id: 'ES1', product_id: '2' }]),
    [{ store_id: 'ES1', product_id: '2' }, { store_id: 'ES2', product_id: '1' }]);
});

test('deadlock retries identical writes and accepts an empty minimal response', async () => {
  const calls = [], waits = [];
  const result = await lidlRequest('https://example.invalid', { method: 'POST', body: '[{"id":"a"}]' }, {
    json: false, random: () => 0, wait: async (ms) => waits.push(ms),
    fetchImpl: async (_, init) => {
      calls.push(init.body);
      return calls.length < 3 ? new Response('{"code":"40P01","message":"deadlock detected"}', { status: 500 }) : new Response(null, { status: 201 });
    },
  });
  assert.equal(result, null);
  assert.deepEqual(calls, Array(3).fill('[{"id":"a"}]'));
  assert.deepEqual(waits, [1000, 2000]);
});

test('truncated JSON is retried with endpoint context on exhaustion', async () => {
  let calls = 0;
  assert.deepEqual(await lidlRequest('https://example.invalid', {}, {
    wait: async () => {}, fetchImpl: async () => new Response(++calls < 3 ? '{' : '{"products":[]}'),
  }), { products: [] });
  await assert.rejects(lidlRequest('https://example.invalid', {}, {
    label: '/categories', attempts: 2, wait: async () => {}, fetchImpl: async () => new Response(''),
  }), /\/categories: JSON incompleto.*0 bytes/);
});

test('403 is not hammered and only retailer access errors trip the circuit', async () => {
  let calls = 0;
  await assert.rejects(lidlRequest('https://example.invalid', {}, {
    label: '/categories', fetchImpl: async () => { calls++; return new Response('denied', { status: 403 }); },
  }), /HTTP 403/);
  assert.equal(calls, 1);
  assert.equal(isLidlAccessFailure('/categories: HTTP 403 denied'), true);
  assert.equal(isLidlAccessFailure('ofertas: HTTP 429'), true);
  assert.equal(isLidlAccessFailure('upsert lidl_product_master: HTTP 403'), false);
});

test('only verified small stores get a narrow floor; ordinary stores retain 2200', async () => {
  const { lidlMinimumProducts, LIDL_VERIFIED_SMALL_CATALOGS } = await import('./lidl-store-coverage.mjs');
  for (const [store, observed] of Object.entries(LIDL_VERIFIED_SMALL_CATALOGS)) {
    assert.equal(lidlMinimumProducts(store), Math.floor(observed * .98));
    assert.ok(lidlMinimumProducts(store) > 2100);
  }
  assert.equal(lidlMinimumProducts('ES3572'), 2200);
  assert.equal(lidlMinimumProducts('ES0951'), 2200);
});
