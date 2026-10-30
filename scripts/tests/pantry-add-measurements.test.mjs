import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const bounds = { left: .35, top: 0, right: .65, bottom: 1 };
const product = id => ({ id, name: id, illustrationUrl: `https://example.com/${id}.png` });
function harness() {
  const state = [], memos = [], effects = [], timers = new Set(), cache = new Map();
  let cursor = 0, memoCursor = 0, effectCursor = 0;
  const useMemo = (fn, deps) => {
    const index = memoCursor++;
    if (!memos[index] || deps.some((dep, i) => dep !== memos[index].deps[i])) memos[index] = { deps, value: fn() };
    return memos[index].value;
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial;
      return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
    },
    useMemo, useCallback: (fn, deps) => useMemo(() => fn, deps),
    useEffect(fn, deps) {
      const index = effectCursor++;
      if (!effects[index] || deps.some((dep, i) => dep !== effects[index].deps[i])) {
        effects[index]?.cleanup?.(); effects[index] = { deps, cleanup: fn() };
      }
    },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../../src/hooks/usePantryAddMeasurements.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(name => {
    if (name === 'react') return react;
    if (name === '../components/PantryImageBoundsProbe') return { pantryImageBoundsCache: cache };
    throw new Error(`Unexpected dependency ${name}`);
  }, module, module.exports, fn => { timers.add(fn); return fn; }, fn => timers.delete(fn));
  return {
    cache, timers,
    render(products) { cursor = 0; memoCursor = 0; effectCursor = 0; return module.exports.usePantryAddMeasurements(products); },
    timeout() { for (const fn of [...timers]) { timers.delete(fn); fn(); } },
    unmount() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test('a batch becomes ready only after every distinct photo has real measurements', () => {
  const h = harness(), products = [product('a'), product('b'), product('a')];
  let result = h.render(products);
  assert.equal(result.ready, false);
  assert.equal(result.urls.length, 2);
  const urls = result.urls;
  result.onBounds(products[0].illustrationUrl, bounds);
  result = h.render(products);
  assert.equal(result.ready, false);
  assert.equal(result.urls, urls, 'partial measurements must not restart the decoder');
  result.onBounds(products[1].illustrationUrl, bounds);
  result = h.render(products);
  assert.equal(result.ready, true);
  assert.equal(result.bounds.size, 2);
  assert.equal(h.timers.size, 0);
  h.unmount();
});

test('measurement failure offers retry and never becomes ready with provisional geometry', () => {
  const h = harness(), products = [product('a')];
  h.render(products); h.timeout();
  let result = h.render(products);
  assert.equal(result.failed, true);
  assert.equal(result.ready, false);
  result.retry();
  result = h.render(products);
  assert.equal(result.failed, false);
  assert.equal(result.attempt, 1);
  assert.equal(result.ready, false);
  result.onBounds(products[0].illustrationUrl, bounds);
  assert.equal(h.render(products).ready, true);
  h.unmount(); assert.equal(h.timers.size, 0);
});

test('cache reuse is tied to the exact URL; old selection results cannot complete a new selection', () => {
  const h = harness(), a = product('a'), b = product('b');
  h.cache.set(a.illustrationUrl, bounds);
  const first = h.render([a]);
  assert.equal(first.ready, true);
  assert.equal(h.render([b]).ready, false);
  first.onBounds(a.illustrationUrl, bounds);
  assert.equal(h.render([b]).ready, false);
  h.timeout();
  assert.equal(h.render([b]).failed, true);
  const c = product('c');
  assert.equal(h.render([c]).failed, false);
  h.unmount(); assert.equal(h.timers.size, 0);
});
