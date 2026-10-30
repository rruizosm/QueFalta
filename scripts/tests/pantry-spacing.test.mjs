import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(`../../src/${file}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const l = load('lib/pantryLayout');
const breadUrl = 'https://example.com/bread.png';
const pastaUrl = 'https://example.com/pasta.png';
const bounds = (left, right) => ({ left, right, top: .05, bottom: .95 });
function item(id, url, x, visibleBounds, shelfIndex = 0) {
  return { instanceId: id, product: { id: '10699', name: id, illustrationUrl: url },
    ...l.clampPantryPlacement({ x, size: .28, y: 0, shelfIndex, visibleBounds }),
    ...(visibleBounds ? { boundsImageUrl: url } : {}), quantity: 3, notes: 'Conservar', expiryDate: '2027-01-01' };
}
function assertVisibleGap(items, shelfCount = 3) {
  for (const a of items) {
    const ae = l.pantryHorizontalExtents(a);
    assert.ok(a.x - ae.left >= l.PANTRY_SHELF_INSET - 1e-9);
    assert.ok(a.x + ae.right <= 1 - l.PANTRY_SHELF_INSET + 1e-9);
    for (const b of items) {
      if (a.instanceId === b.instanceId || l.pantryShelfIndex(a, shelfCount) !== l.pantryShelfIndex(b, shelfCount)) continue;
      const be = l.pantryHorizontalExtents(b);
      assert.ok(a.x + ae.right + l.PANTRY_PRODUCT_GAP <= b.x - be.left + 1e-9
        || b.x + be.right + l.PANTRY_PRODUCT_GAP <= a.x - ae.left + 1e-9,
      `visible bounds of ${a.instanceId} and ${b.instanceId} overlap`);
    }
  }
}

test('bread and pasta use their visible width; compaction keeps art size, stock details and visual order', () => {
  const bread = item('bread', breadUrl, .3, bounds(.02, .98));
  const pasta = item('pasta', pastaUrl, .46, bounds(.3, .8));
  const untouched = item('bottle', 'https://example.com/bottle.png', .85, bounds(.45, .55));
  const result = l.arrangePantryItems([bread, pasta, untouched]);
  assert.equal(result.unplaced.length, 0);
  assertVisibleGap(result.placed);
  assert.deepEqual(result.placed.map(i => i.instanceId), ['bread', 'pasta', 'bottle']);
  assert.ok(Math.abs(result.placed[0].x - l.pantryHorizontalExtents(bread).left - l.PANTRY_SHELF_INSET) < 1e-9);
  assert.notEqual(result.placed[1].x, pasta.x);
  for (const entry of result.placed) {
    assert.equal(entry.size, .28);
    assert.equal(entry.quantity, 3);
    assert.equal(entry.notes, 'Conservar');
    assert.equal(entry.expiryDate, '2027-01-01');
  }
});

test('asymmetric transparency affects both shelf edges and collision intervals', () => {
  const shifted = bounds(.65, .95); // All visible content lies to the right of the image center.
  const clamped = l.clampPantryPlacement({ x: 1, y: 0, size: .28, visibleBounds: shifted });
  assert.ok(Math.abs(clamped.x + .28 * (.95 - .5) - (1 - l.PANTRY_SHELF_INSET)) < 1e-9);
  const first = item('shifted', breadUrl, .3, shifted);
  const desired = item('left-heavy', pastaUrl, .5, bounds(.05, .4));
  const placement = l.findPantryPlacement(desired, [first]);
  assert.ok(placement);
  assertVisibleGap([first, { ...desired, ...placement }]);
  assert.equal(l.isPantryPlacementFree(placement, [first]), true);
});

test('unknown or invalid image bounds reserve the full square, then measured narrow products recover space', () => {
  const unknown = Array.from({ length: 12 }, (_, i) => item(`unknown-${i}`, breadUrl, .5));
  const before = l.arrangePantryItems(unknown);
  assert.equal(before.placed.length, 9);
  assert.equal(before.unplaced.length, 3);
  assertVisibleGap(before.placed);
  assert.deepEqual(l.pantryHorizontalExtents({ x: .5, y: 0, size: .28, visibleBounds: bounds(.8, .2) }), { left: .14, right: .14 });
  const measured = l.updatePantryImageBounds([...before.placed, ...before.unplaced], breadUrl, bounds(.3, .7));
  const after = l.arrangePantryItems(measured);
  assert.equal(after.placed.length, 12);
  assert.equal(after.unplaced.length, 0);
  assertVisibleGap(after.placed);
  assert.deepEqual(new Set(after.placed.map(i => i.instanceId)), new Set(unknown.map(i => i.instanceId)));
});

test('new additions and transfers to another shelf obey the same measured extents', () => {
  const existing = Array.from({ length: 3 }, (_, i) => item(`wide-${i}`, breadUrl, .16 + i * .3, bounds(0, 1)));
  const next = item('new-wide', pastaUrl, .5, bounds(.05, .95));
  assert.equal(l.findPantryPlacement(next, existing), null);
  const placement = l.findPantryPlacementOnAnyShelf(next, existing);
  assert.equal(placement.shelfIndex, 1);
  assertVisibleGap([...existing, { ...next, ...placement }]);
  const duplicate = l.pantryProductImageGeometry(existing[0].product, existing);
  assert.deepEqual(duplicate, { visibleBounds: bounds(0, 1), boundsImageUrl: breadUrl });
});

test('measurements persist only with their exact URL and survive offline reloads without repeated moves', () => {
  const measured = item('saved', breadUrl, .5, bounds(.2, .8));
  const layout = { items: l.normalizePantryItems([measured]), shelfCount: 3 };
  const restored = l.decodePantryLayout(l.encodePantryLayout(layout));
  assert.deepEqual(restored, layout);
  assert.equal(l.normalizePantryItems(restored.items)[0], restored.items[0]);
  const changedImage = { ...measured, product: { ...measured.product, illustrationUrl: pastaUrl } };
  const invalidated = l.decodePantryLayout(JSON.stringify({ version: 1, items: [changedImage], shelfCount: 3 })).items[0];
  assert.equal(invalidated.visibleBounds, undefined);
  assert.equal(invalidated.boundsImageUrl, undefined);
  assert.equal(l.arrangePantryItems([changedImage]).placed[0].visibleBounds, undefined);
  const invalid = { ...measured, visibleBounds: { ...measured.visibleBounds, left: 'bad' } };
  assert.equal(l.decodePantryLayout(JSON.stringify({ version: 1, items: [invalid] })).items[0].visibleBounds, undefined);
});

test('late decoder responses update live copies only, preserve edits and cannot restore deletions or old images', () => {
  const existing = [item('edited', breadUrl, .3), item('copy', breadUrl, .6), item('new-image', pastaUrl, .5)];
  existing[0].notes = 'Nota nueva';
  const measured = l.updatePantryImageBounds(existing, breadUrl, bounds(.1, .9));
  assert.equal(measured.length, 3);
  assert.equal(measured[0].notes, 'Nota nueva');
  assert.equal(measured[1].boundsImageUrl, breadUrl);
  assert.equal(measured[2], existing[2]);
  assert.equal(l.updatePantryImageBounds(measured, breadUrl, bounds(.1, .9)), measured);
  assert.equal(l.updatePantryImageBounds(measured, breadUrl, bounds(.9, .1)), measured);
  assert.equal(l.updatePantryImageBounds([], breadUrl, bounds(.1, .9)).length, 0);
});

test('the real stock hook saves measured spacing per user and inventory and retains deletions on remount', async () => {
  const data = new Map();
  const storage = load('lib/pantryStorage', {
    './pantryLayout': l,
    '@react-native-async-storage/async-storage': {
      getItem: async key => data.get(key) ?? null,
      setItem: async (key, value) => { data.set(key, value); },
    },
  });
  const original = l.normalizePantryItems([item('one', breadUrl, .3, bounds(.225, .775)), item('two', breadUrl, .48, bounds(.225, .775))]);
  await storage.writePantryLayout('alice', { items: original, shelfCount: 3 });
  await storage.writePantryLayout('bob', { items: original, shelfCount: 3 });
  await storage.writePantryLayout('alice', { items: original, shelfCount: 3 }, 'fridge');
  function mount(user, section = 'pantry') {
    let cursor = 0;
    const slots = [], effects = [], cleanups = [], dependencies = [];
    const { usePantryLayout } = load('hooks/usePantryLayout', {
      react: {
        useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
        useState: initial => {
          const i = cursor++;
          if (!(i in slots)) slots[i] = initial;
          return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
        },
        useCallback: fn => fn,
        useEffect: (fn, deps) => {
          const i = cursor++;
          if (!dependencies[i] || deps.some((dep, index) => !Object.is(dep, dependencies[i][index]))) {
            dependencies[i] = deps;
            effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
          }
        },
      },
      'react-native': { AppState: {} },
      '@react-navigation/native': { useFocusEffect() {} },
      '../api/pantry': { fetchPantryImageUrls: async () => new Map() },
      '../lib/pantryImages': load('lib/pantryImages'),
      '../lib/pantryLayout': l,
      '../lib/pantryStorage': storage,
    });
    return {
      render() { cursor = 0; const result = usePantryLayout(user, section); effects.splice(0).forEach(fn => fn()); return result; },
      unmount() { cleanups.forEach(fn => fn?.()); },
    };
  }
  const h = mount('alice');
  h.render();
  await new Promise(resolve => setImmediate(resolve));
  let stock = h.render();
  assert.equal(stock.ready, true);
  stock.setImageBounds(breadUrl, bounds(.02, .98));
  stock = h.render();
  assertVisibleGap(stock.items);
  const saved = await storage.readPantryLayout('alice');
  assert.deepEqual(saved.items, stock.items);
  assert.deepEqual((await storage.readPantryLayout('bob')).items, original);
  assert.deepEqual((await storage.readPantryLayout('alice', 'fridge')).items, original);
  assert.deepEqual(stock.removableShelfIndices, [0, 1, 2]);
  stock.removeShelf(1);
  stock = h.render();
  assert.equal(stock.shelfCount, 2);
  assert.equal((await storage.readPantryLayout('alice')).shelfCount, 2);
  assert.equal((await storage.readPantryLayout('bob')).shelfCount, 3);
  assert.equal((await storage.readPantryLayout('alice', 'fridge')).shelfCount, 3);
  stock.insertShelfBelow(0);
  stock.update(previous => previous.map(entry => entry.instanceId === 'two'
    ? { ...entry, ...l.clampPantryPlacement({ ...entry, shelfIndex: 1 }, 3) } : entry));
  stock = h.render();
  stock.removeShelf(1); // Occupied shelf: its product must stay deleted after reload.
  stock.setImageBounds(breadUrl, bounds(.05, .95)); // Late response after deletion.
  h.unmount();
  const reopened = mount('alice');
  reopened.render();
  await new Promise(resolve => setImmediate(resolve));
  const restored = reopened.render();
  assert.equal(restored.shelfCount, 2);
  assert.equal(restored.items.length, 1);
  assert.equal(restored.items[0].instanceId, 'one');
  assert.deepEqual(restored.items[0].visibleBounds, bounds(.05, .95));
  assert.equal(restored.items[0].quantity, 3);
  assert.equal(restored.items[0].notes, 'Conservar');
  reopened.unmount();
});
