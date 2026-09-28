import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as cache from '../../src/lib/catalogRequestCache.ts';
import { createMultiStorePager } from '../../src/lib/multiStorePager.ts';

function browseWith(load) {
  const source = readFileSync(new URL('../../src/api/catalogBrowse.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const mod = { exports: {} };
  const dependencies = {
    './catalog': { browseProducts: load },
    '../lib/productAdapters': { mercadonaToUI: (product) => product },
    '../i18n': { getLanguage: () => 'es' },
    '../lib/catalogRequestCache': cache,
  };
  vm.runInNewContext(outputText, {
    module: mod, exports: mod.exports,
    require: (name) => { assert.ok(name in dependencies, name); return dependencies[name]; },
  });
  return mod.exports.loadBrowsePage;
}

test('a timeout issues one query, preserves its error and allows an explicit retry', async () => {
  cache.clearCatalogRequests();
  const timeout = { code: '57014', message: 'canceling statement due to statement timeout' };
  const calls = [];
  const load = browseWith(async (...args) => {
    calls.push(args);
    if (calls.length === 1) throw timeout;
    return { items: [{ id: 'ok' }], nextCursor: null };
  });
  await assert.rejects(load('mercadona', null, null, null, null), (error) => error === timeout);
  assert.equal(calls.length, 1);
  assert.equal((await load('mercadona', null, null, null, null)).items[0].id, 'ok');
  assert.equal(calls.length, 2);
});

test('failed price pagination never retries a numeric cursor in alphabetical order', async () => {
  cache.clearCatalogRequests();
  const calls = [];
  const load = browseWith(async (...args) => { calls.push(args); throw { code: '57014' }; });
  const cursor = { name: 2.5, id: '42' };
  await assert.rejects(load('mercadona', cursor, null, null, null, undefined, 'priceDesc'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], cursor);
  assert.equal(calls[0][4], 'priceDesc');
});

test('a dominant store fills 50 results in two rounds, with no gaps on subsequent pages', async () => {
  const data = { cheap: Array.from({ length: 100 }, (_, i) => i), expensive: [100, 101] };
  const calls = [];
  const pager = createMultiStorePager({
    stores: ['cheap', 'expensive'], pageSize: 12, compare: (a, b) => a - b,
    loadPage: async (store, cursor, limit) => {
      calls.push({ store, cursor, limit });
      const start = cursor ?? 0;
      const items = data[store].slice(start, start + limit);
      return { items, nextCursor: start + items.length < data[store].length ? start + items.length : null };
    },
  });
  const first = await pager.nextPage(50);
  assert.deepEqual(first, data.cheap.slice(0, 50));
  assert.deepEqual(calls.filter((call) => call.store === 'cheap').map((call) => call.limit), [12, 38]);
  assert.equal(calls.find((call) => call.store === 'expensive').limit, 12);
  const rest = [...await pager.nextPage(50), ...await pager.nextPage(50)];
  assert.deepEqual([...first, ...rest], [...data.cheap, ...data.expensive]);
  assert.equal(pager.hasMore(), false);
});

test('interleaved stores preserve global order, buffered rows and partial success', async () => {
  const data = { even: [0, 2, 4, 6, 8], odd: [1, 3, 5, 7, 9] };
  let failures = 0;
  const pager = createMultiStorePager({
    stores: ['even', 'broken', 'odd'], pageSize: 2, compare: (a, b) => a - b,
    loadPage: async (store, cursor, limit) => {
      if (store === 'broken') { failures++; throw new Error('timeout'); }
      const start = cursor ?? 0;
      const items = data[store].slice(start, start + limit);
      return { items, nextCursor: start + items.length < data[store].length ? start + items.length : null };
    },
  });
  assert.deepEqual([...await pager.nextPage(6), ...await pager.nextPage(6)], Array.from({ length: 10 }, (_, i) => i));
  assert.equal(failures, 1);
  assert.equal(pager.hasMore(), false);
});

test('total failure propagates, and an aborted page does not start any request', async () => {
  let calls = 0;
  const pager = createMultiStorePager({
    stores: ['a'], pageSize: 12, compare: (a, b) => a - b,
    loadPage: async () => { calls++; throw new Error('timeout'); },
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(pager.nextPage(50, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
  await assert.rejects(pager.nextPage(50), /timeout/);
  assert.equal(calls, 1);
});
