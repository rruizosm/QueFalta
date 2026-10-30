import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function harness() {
  let cursor = 0;
  const slots = [], effects = [], dependencies = [], cleanups = [], requests = [];
  let listener;
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../../src/hooks/usePantryCartMembership.ts', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const deps = {
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in slots)) slots[i] = initial;
        return [slots[i], value => { slots[i] = value; }];
      },
      useEffect(fn, next) {
        const i = cursor++;
        if (!dependencies[i] || next.some((value, index) => value !== dependencies[i][index])) {
          dependencies[i] = next;
          effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
        }
      },
    },
    'react-native': { AppState: { addEventListener(event, callback) {
      listener = callback;
      return { remove() { listener = null; } };
    } } },
    '../api/lists': { fetchListItems(listId) {
      return new Promise((resolve, reject) => requests.push({ listId, resolve, reject }));
    } },
  };
  new Function('require', 'module', 'exports', source)(name => {
    assert.ok(name in deps, `Unexpected import ${name}`);
    return deps[name];
  }, module, module.exports);
  return {
    requests,
    render(listId = 'list-a', store = 'mercadona') {
      cursor = 0;
      const result = module.exports.usePantryCartMembership(listId, { id: 'milk', store });
      effects.splice(0).forEach(fn => fn());
      return result;
    },
    resume() { listener?.('active'); },
    unmount() { cleanups.forEach(fn => fn?.()); },
    get subscribed() { return !!listener; },
  };
}
const row = (patch = {}) => ({ storeKey: 'mercadona', storeProductId: 'milk', deferredToNextPurchase: false, ...patch });
const flush = async () => { await Promise.resolve(); };

test('membership matches store and id, supports legacy Mercadona ids and excludes deferred products', async () => {
  for (const [items, expected] of [
    [[row()], true],
    [[row({ inCart: true })], true],
    [[row({ deferredToNextPurchase: true })], false],
    [[row({ storeKey: 'bonarea' })], false],
    [[row({ storeProductId: 'other' })], false],
    [[row({ storeProductId: null, mercadonaProductId: 'milk' })], true],
    [[], false],
  ]) {
    const h = harness();
    assert.equal(h.render(), false);
    h.requests[0].resolve(items);
    await flush();
    assert.equal(h.render(), expected);
    h.unmount();
    assert.equal(h.subscribed, false);
  }
});

test('list switches discard previous responses and returning to foreground rechecks membership', async () => {
  const h = harness();
  h.render();
  h.requests[0].resolve([row()]);
  await flush();
  assert.equal(h.render(), true);
  assert.equal(h.render('list-b'), false);
  h.resume();
  h.requests[2].resolve([]);
  await flush();
  h.requests[1].resolve([row()]);
  await flush();
  assert.equal(h.render('list-b'), false);
  h.resume();
  h.requests[3].resolve([row()]);
  await flush();
  assert.equal(h.render('list-b'), true);
  assert.equal(h.render(null), false);
  assert.equal(h.subscribed, false);
});

test('read errors and absent active lists do not claim membership', async () => {
  const h = harness();
  assert.equal(h.render(null), false);
  assert.equal(h.requests.length, 0);
  h.render();
  h.requests[0].reject(new Error('offline'));
  await flush();
  assert.equal(h.render(), false);
  h.unmount();
});
