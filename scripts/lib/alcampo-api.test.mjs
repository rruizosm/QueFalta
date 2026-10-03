import test from 'node:test';
import assert from 'node:assert/strict';
import { AlcampoApi, AlcampoApiError } from './alcampo-api.mjs';

const json = (data, headers = {}) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...headers } });
const productPage = (id, nextPageToken) => ({ productGroups: [{ decoratedProducts: [{ productId: id }] }], metadata: { nextPageToken } });

test('pagination retains rotated anonymous cookies, encodes tokens, and finishes only at the end', async () => {
  const requests = [];
  const api = new AlcampoApi({ delayMs: 0, fetchImpl: async (url, options) => {
    requests.push({ url: new URL(url), options });
    if (requests.length === 1) return json(productPage('first', 'token+/='), { 'set-cookie': 'VISITORID=first==; Path=/; HttpOnly' });
    return json(productPage('second'), { 'set-cookie': 'VISITORID=second==; Path=/; HttpOnly' });
  } });
  const pages = [];
  for await (const page of api.pages({ promotions: true, regionId: 'region', maxPages: 3 })) pages.push(page);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].complete, false);
  assert.equal(pages[1].complete, true);
  assert.equal(requests[1].options.headers.Cookie, 'VISITORID=first==');
  assert.equal(requests[1].url.searchParams.get('pageToken'), 'token+/=');
  assert.equal(requests[1].url.searchParams.get('includeAdditionalPageInfo'), 'false');
  assert.equal(api.cookies.get('VISITORID'), 'second==');
});

test('a page cap is explicitly partial and repeated cursors are rejected', async () => {
  const api = new AlcampoApi({ delayMs: 0, fetchImpl: async () => json(productPage('one', 'same')) });
  const pages = [];
  for await (const page of api.pages({ maxPages: 1 })) pages.push(page);
  assert.equal(pages[0].complete, false);
  assert.equal(pages[0].truncated, true);
  await assert.rejects(async () => { for await (const _ of api.pages({ maxPages: 3 })) { /* consume */ } }, /repeated pagination/);
});

test('HTTP denials and HTML verification pages never become an empty successful catalogue', async () => {
  for (const status of [200, 403, 429]) {
    let calls = 0;
    const api = new AlcampoApi({ fetchImpl: async () => { calls++; return new Response('Human verification', { status, headers: { 'content-type': 'text/html' } }); } });
    await assert.rejects(api.categories(), AlcampoApiError);
    assert.equal(calls, 1);
  }
});

test('invalid successful product shapes are rejected and storefront tag parameters are repeated', async () => {
  const api = new AlcampoApi({ fetchImpl: async url => {
    assert.deepEqual(new URL(url).searchParams.getAll('tag'), ['web', 'category-item']);
    return json({ message: 'not a product page' });
  } });
  await assert.rejects(async () => { for await (const _ of api.pages()) { /* consume */ } }, /invalid product page/);
});
