import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/recipeFeedCache.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const mod = { exports: {} };
vm.runInNewContext(outputText, { module: mod, exports: mod.exports });
const { createRecipeFeedCache } = mod.exports;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const recipe = (id, isSaved = false) => ({ id, title: id, imageUrl: `${id}.jpg`,
  author: { name: 'Chef' }, ingredients: [], steps: ['Cook'], isSaved });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const clock = 1_000_000_000;
function setup(cached = null) {
  const requests = [], writes = [];
  const disk = deferred();
  const feed = createRecipeFeedCache({
    peek: (user) => user === 'a' ? cached : null,
    read: () => disk.promise,
    write: (user, data) => writes.push({ user, data }),
    now: () => clock,
    load: (user) => { const request = deferred(); requests.push({ ...request, user }); return request.promise; },
  });
  return { feed, requests, writes, disk };
}

test('a warm visit shows recipes synchronously with no new request or loading indicator', async () => {
  const { feed, requests } = setup({ recipes: [recipe('cached')], updatedAt: clock - 1000 });
  assert.equal(feed.snapshot('a').recipes[0].id, 'cached');
  await feed.refresh('a');
  assert.equal(feed.snapshot('a').loading, false);
  assert.equal(requests.length, 0);
});

test('prefetch and tab focus share the same request; stale content stays visible', async () => {
  const { feed, requests } = setup({ recipes: [recipe('cached')], updatedAt: clock - 61000 });
  const first = feed.refresh('a');
  const second = feed.refresh('a');
  assert.equal(first, second);
  assert.equal(feed.snapshot('a').loading, false);
  assert.equal(feed.snapshot('a').recipes[0].id, 'cached');
  await tick();
  assert.equal(requests.length, 1);
  requests[0].resolve([recipe('fresh')]);
  await first;
  assert.equal(feed.snapshot('a').recipes[0].id, 'fresh');
});

test('disk supplies the first render while a cold network request is still pending', async () => {
  const { feed, requests, disk } = setup();
  const request = feed.refresh('a');
  assert.equal(feed.snapshot('a').loading, true);
  disk.resolve({ recipes: [recipe('disk')], updatedAt: clock - 61000 });
  await tick();
  assert.equal(feed.snapshot('a').recipes[0].id, 'disk');
  assert.equal(feed.snapshot('a').loading, false);
  requests[0].resolve([recipe('network')]);
  await request;
  assert.equal(feed.snapshot('a').recipes[0].id, 'network');
});

test('late disk reads cannot replace a successful empty network response', async () => {
  const { feed, requests, disk } = setup();
  const request = feed.refresh('a');
  await tick(); requests[0].resolve([]); await request;
  disk.resolve({ recipes: [recipe('deleted')], updatedAt: clock - 1000 });
  await tick();
  assert.equal(feed.snapshot('a').recipes.length, 0);
});

test('refresh failure preserves usable content and permits an explicit retry', async () => {
  const { feed, requests } = setup({ recipes: [recipe('cached')], updatedAt: clock - 61000 });
  const first = feed.refresh('a');
  await tick(); requests[0].reject(new Error('offline')); await first;
  assert.equal(feed.snapshot('a').recipes[0].id, 'cached');
  assert.equal(feed.snapshot('a').loading, false);
  assert.equal(feed.snapshot('a').error, true);
  const retry = feed.refresh('a', true);
  await tick(); requests[1].resolve([recipe('recovered')]); await retry;
  assert.equal(feed.snapshot('a').error, false);
});

test('accounts never share data or pending requests', async () => {
  const { feed, requests, writes } = setup();
  const a = feed.refresh('a'), b = feed.refresh('b');
  await tick();
  requests.find((r) => r.user === 'b').resolve([recipe('b', true)]); await b;
  requests.find((r) => r.user === 'a').resolve([recipe('a')]); await a;
  assert.equal(feed.snapshot('b').recipes[0].id, 'b');
  assert.equal(feed.snapshot('b').recipes[0].isSaved, true);
  assert.equal(feed.snapshot('a').recipes[0].isSaved, false);
  assert.equal(feed.snapshot('').recipes, null);
  assert.deepEqual(writes.map((w) => w.user), ['b', 'a']);
});

test('a late refresh cannot undo a save, rollback or newly published recipe', async () => {
  const { feed, requests } = setup({ recipes: [recipe('old')], updatedAt: clock - 61000 });
  const pending = feed.refresh('a'); await tick();
  const finish = feed.beginMutation('a');
  feed.update('a', (rows) => rows.map((r) => ({ ...r, isSaved: true })));
  await feed.refresh('a');
  assert.equal(requests.length, 1);
  finish();
  feed.update('a', (rows) => [recipe('published'), ...rows]);
  requests[0].resolve([recipe('old')]); await pending;
  assert.equal(feed.snapshot('a').recipes[0].id, 'published');
  assert.equal(feed.snapshot('a').recipes[1].isSaved, true);
  feed.update('a', (rows) => rows.map((r) => ({ ...r, isSaved: false })));
  assert.equal(feed.snapshot('a').recipes[1].isSaved, false);
});

test('expired or malformed persisted data is ignored', () => {
  for (const cached of [
    { recipes: [recipe('old')], updatedAt: clock - 86400001 },
    { recipes: [null], updatedAt: clock },
    { recipes: {}, updatedAt: clock },
    { recipes: [recipe('future')], updatedAt: clock + 1 },
  ]) assert.equal(setup(cached).feed.snapshot('a').recipes, null);
});

test('empty feeds are cached and do not keep showing the initial loading state', async () => {
  const { feed, requests } = setup({ recipes: [], updatedAt: clock - 1000 });
  await feed.refresh('a');
  assert.equal(feed.snapshot('a').recipes.length, 0);
  assert.equal(feed.snapshot('a').loading, false);
  assert.equal(requests.length, 0);
});

test('startup disk hydration cannot overwrite a newer network snapshot and keys isolate accounts', async () => {
  const disk = deferred();
  const startupModule = { exports: {} };
  const startupSource = readFileSync(new URL('../../src/lib/startupCache.ts', import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(startupSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(transpiled, {
    module: startupModule, exports: startupModule.exports,
    require: () => ({ getItem: () => disk.promise, setItem: async () => {} }),
  });
  const { readStartupCache, writeStartupCache, startupKeys, peekStartupCache } = startupModule.exports;
  const aKey = startupKeys.recipes('a'), bKey = startupKeys.recipes('b');
  assert.notEqual(aKey, bKey);
  const pending = readStartupCache(aKey);
  writeStartupCache(aKey, { recipes: [recipe('new')], updatedAt: clock });
  disk.resolve(JSON.stringify({ recipes: [recipe('old')], updatedAt: clock - 1000 }));
  assert.equal((await pending).recipes[0].id, 'new');
  assert.equal(peekStartupCache(bKey), null);
});
