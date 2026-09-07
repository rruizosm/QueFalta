import assert from 'node:assert/strict';
import test from 'node:test';
import { cacheCatalogRequest, catalogRequestKey, clearCatalogRequests, peekCatalogRequest, seedCatalogRequest, withCatalogRequestSignal } from '../../src/lib/catalogRequestCache.ts';
import { productImageSource } from '../../src/lib/productImageSource.ts';

test('simultaneous readers share one request and revisits use its result', async () => {
  clearCatalogRequests();
  let calls = 0;
  const load = async () => { calls++; return { items: [1, 2], nextCursor: 'next' }; };
  const [a, b] = await Promise.all([cacheCatalogRequest('page', load), cacheCatalogRequest('page', load)]);
  assert.equal(a, b);
  assert.equal(peekCatalogRequest('page'), a);
  assert.equal(await cacheCatalogRequest('page', load), a);
  assert.equal(calls, 1);
});

test('errors can be retried and expiry requires fresh data', async (t) => {
  clearCatalogRequests();
  await assert.rejects(cacheCatalogRequest('page', async () => { throw new Error('offline'); }));
  assert.equal(peekCatalogRequest('page'), undefined);
  await cacheCatalogRequest('page', async () => 'recovered');
  const now = Date.now();
  t.mock.method(Date, 'now', () => now + 300001);
  assert.equal(peekCatalogRequest('page'), undefined);
  assert.equal(await cacheCatalogRequest('page', async () => 'fresh'), 'fresh');
});

test('logout discards pending writes without removing a new session request', async () => {
  clearCatalogRequests();
  let resolveOld;
  const old = cacheCatalogRequest('page', () => new Promise((resolve) => { resolveOld = resolve; }));
  await Promise.resolve();
  clearCatalogRequests();
  const fresh = cacheCatalogRequest('page', async () => 'new session');
  resolveOld('previous session');
  await old;
  await fresh;
  assert.equal(peekCatalogRequest('page'), 'new session');
});

test('keys preserve location, language, sorting, pagination and nonempty filters', () => {
  const key = (context) => catalogRequestKey('offers', context);
  assert.equal(key(['es', 'ES001', {}]), key(['es', 'ES001', { search: '', categories: [], sort: null }]));
  assert.notEqual(key(['es', 'ES001']), key(['ca', 'ES001']));
  assert.notEqual(key(['es', 'ES001']), key(['es', 'ES002']));
  assert.notEqual(key({ cursor: 'a' }), key({ cursor: 'b' }));
  assert.notEqual(key({ sort: 'asc' }), key({ sort: 'desc' }));
  assert.notEqual(key({ priceMin: 0 }), key({}));
});

test('cache has a bounded LRU capacity', () => {
  clearCatalogRequests();
  for (let i = 0; i < 180; i++) seedCatalogRequest(String(i), i);
  assert.equal(peekCatalogRequest('0'), 0);
  seedCatalogRequest('180', 180);
  assert.equal(peekCatalogRequest('1'), undefined);
  assert.equal(peekCatalogRequest('0'), 0);
});

test('Lidl shares the long-cached rendition across list, grid and detail', () => {
  const base = 'https://static-product-catalog.lidlplus.com/images/productdata/ES/original/highres/product.png';
  const canonical = `${base}?im=Resize=(384)`;
  assert.equal(productImageSource(canonical), canonical);
  assert.equal(productImageSource(`${base}?im=Resize=(192)`), canonical);
  assert.equal(productImageSource(`${base}?im=Resize=%28192%29`), canonical);
  assert.equal(productImageSource(base), canonical);
  assert.equal(productImageSource(`${base}?im=Resize=(192)&v=2`), `${canonical}&v=2`);
  assert.equal(productImageSource('https://static-product-catalog.lidlplus.com/images/common/ImagePlaceholderMedium.png'), '');
  for (const url of ['invalid', 'https://other.com/photo.png?im=Resize=(384)', `${base}?im=Crop=(20)`]) {
    assert.equal(productImageSource(url), url);
  }
});

test('cancelling a screen prevents late page insertion without cancelling other readers', async () => {
  clearCatalogRequests();
  let finish;
  const request = cacheCatalogRequest('shared', () => new Promise((resolve) => { finish = resolve; }));
  const controller = new AbortController();
  const cancelled = withCatalogRequestSignal(request, controller.signal);
  const survivor = cacheCatalogRequest('shared', async () => 'must not load twice');
  controller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  finish('page');
  assert.equal(await survivor, 'page');
  assert.equal(peekCatalogRequest('shared'), 'page');
});
