import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const module = { exports: {} };
new Function('module', 'exports', ts.transpileModule(readFileSync(new URL('../../src/lib/pantryLayout.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(module, module.exports);
const l = module.exports;
const bounds = (left, right) => ({ left, right, top: .03, bottom: .98 });
function item(id, x, visibleBounds, shelfIndex = 0) {
  const url = `https://example.com/${id}.png`;
  return { instanceId: id, product: { id: '10699', name: id, illustrationUrl: url },
    boundsImageUrl: url, ...l.clampPantryPlacement({ x, y: 0, size: .28, visibleBounds, shelfIndex }),
    quantity: 5, notes: 'Abierto', expiryDate: '2027-01-02' };
}
const leftEdge = entry => entry.x - l.pantryHorizontalExtents(entry).left;
const rightEdge = entry => entry.x + l.pantryHorizontalExtents(entry).right;
function assertPacked(items, shelfCount = 3) {
  for (let row = 0; row < shelfCount; row++) {
    const entries = items.filter(i => l.pantryShelfIndex(i, shelfCount) === row).sort((a, b) => leftEdge(a) - leftEdge(b));
    let left = l.PANTRY_SHELF_INSET;
    for (const entry of entries) {
      assert.ok(Math.abs(leftEdge(entry) - left) < 1e-9, `unexpected visible gap before ${entry.instanceId ?? '?'}`);
      assert.ok(rightEdge(entry) <= 1 - l.PANTRY_SHELF_INSET + 1e-9);
      left = rightEdge(entry) + l.PANTRY_PRODUCT_GAP;
      assert.equal(entry.size, .28);
    }
  }
}
const visualOrder = positions => Object.keys(positions).sort((a, b) => leftEdge(positions[a]) - leftEdge(positions[b]));
function positions(items) { return Object.fromEntries(items.map(i => [i.instanceId, l.clampPantryPlacement(i)])); }

test('narrow cartons and wide bags use the same visible gap, closing excessive saved spacing', () => {
  const original = [item('chicken', .25, bounds(.35, .65)), item('milk', .55, bounds(.42, .58)), item('bread', .8, bounds(.05, .95))];
  const { placed, unplaced } = l.arrangePantryItems(original);
  assert.equal(unplaced.length, 0);
  assert.deepEqual(placed.map(i => i.instanceId), original.map(i => i.instanceId));
  assertPacked(placed);
  assert.ok(placed[1].x < original[1].x);
  for (const entry of placed) {
    assert.equal(entry.quantity, 5);
    assert.equal(entry.notes, 'Abierto');
    assert.equal(entry.expiryDate, '2027-01-02');
  }
  const again = l.normalizePantryItems(placed);
  again.forEach((entry, i) => assert.equal(entry, placed[i], 'canonical rows keep memoized instances'));
});

test('visual order is preserved independently of saved/list order, including asymmetric photos', () => {
  const right = item('right', .75, bounds(.05, .4));
  const left = item('left', .1, bounds(.6, .95));
  const middle = item('middle', .5, bounds(.4, .6));
  const { placed } = l.arrangePantryItems([right, left, middle]);
  assert.deepEqual(placed.map(i => i.instanceId), ['right', 'left', 'middle']);
  assert.deepEqual(visualOrder(positions(placed)), ['left', 'middle', 'right']);
  assertPacked(placed);
});

test('drag insertion pushes neighbours and keeps geometry without requiring an empty pre-existing gap', () => {
  const original = l.normalizePantryItems([item('a', .2, bounds(.2, .8)), item('b', .5, bounds(.4, .6)), item('c', .8, bounds(.05, .95))]);
  const start = positions(original);
  const snapshot = structuredClone(start);
  const moved = l.insertPantryPlacement(start, 'c', { ...start.c, x: 0 }, 3, 'a');
  assert.ok(moved);
  assert.deepEqual(visualOrder(moved), ['c', 'a', 'b']);
  assertPacked(Object.values(moved));
  assert.deepEqual(start, snapshot, 'preview must not mutate its input');
  assert.deepEqual(moved.c.visibleBounds, start.c.visibleBounds);
  const end = l.insertPantryPlacement(moved, 'c', { ...moved.c, x: 1 }, 3, null);
  assert.deepEqual(visualOrder(end), ['a', 'b', 'c']);
  assertPacked(Object.values(end));
});

test('moving to another shelf closes the source gap and packs the destination atomically', () => {
  const stock = l.normalizePantryItems([item('a', .2, bounds(.2, .8)), item('b', .5, bounds(.4, .6)), item('c', .8, bounds(.1, .9)),
    item('target', .5, bounds(.4, .6), 1)]);
  const start = positions(stock);
  const moved = l.insertPantryPlacement(start, 'b', { ...start.b, shelfIndex: 1 }, 3, 'target');
  assert.equal(moved.b.shelfIndex, 1);
  assertPacked(Object.values(moved));
  assert.ok(moved.c.x < start.c.x);
  assert.ok(moved.target.x > start.target.x);
});

test('full or too-short target shelves reject the entire insertion, retaining both shelves', () => {
  const stock = l.normalizePantryItems([item('a', .2, bounds(0, 1)), item('b', .5, bounds(0, 1)), item('c', .8, bounds(0, 1)),
    item('other', .5, bounds(.2, .8), 1)]);
  const start = positions(stock), snapshot = structuredClone(start);
  assert.equal(l.insertPantryPlacement(start, 'other', { ...start.other, shelfIndex: 0 }), null);
  assert.deepEqual(start, snapshot);
  const tall = { ...start, other: { ...start.other, size: .4, shelfIndex: 0 } };
  assert.equal(l.insertPantryPlacement(tall, 'other', { ...tall.other, shelfIndex: 1 }), null);
});

test('overflow does not displace existing owners or rotate on repeated reads and can recover after removal', () => {
  const input = Array.from({ length: 18 }, (_, i) => item(`copy-${i}`, .5, bounds(.225, .775)));
  let canonical = l.normalizePantryItems(input);
  const snapshot = structuredClone(canonical);
  assert.equal(canonical.filter(i => i.pendingPlacement).length, 3);
  for (let i = 0; i < 5; i++) {
    canonical = l.decodePantryLayout(l.encodePantryLayout({ items: canonical, shelfCount: 3 })).items;
    assert.deepEqual(canonical, snapshot, 'reloading must not swap overflow with placed products');
  }
  const first = canonical.find(i => !i.pendingPlacement);
  const after = l.arrangePantryItems(canonical.filter(i => i.instanceId !== first.instanceId));
  assert.equal(after.placed.length, 15);
  assert.equal(after.unplaced.length, 2);
  assert.equal(after.placed.every(i => !i.pendingPlacement), true);
  assertPacked(after.placed);
});

test('later image measurements preserve visual order as newly detected transparent margins change widths', () => {
  const first = item('a', .3, bounds(.4, .6));
  const second = item('b', .6, bounds(.4, .6));
  const stock = l.normalizePantryItems([first, second]);
  const updated = l.updatePantryImageBounds(stock, first.product.illustrationUrl, bounds(.01, .99));
  const next = l.normalizePantryItems(updated);
  assert.deepEqual(visualOrder(positions(next)), ['a', 'b']);
  assertPacked(next);
});

test('manual drops keep the chosen gap through normalization, reload and removal', () => {
  const initial = l.normalizePantryItems([item('a', .2, bounds(.2, .8)), item('b', .5, bounds(.2, .8))]);
  const start = positions(initial);
  const desired = l.pantryDropPlacement(start, 'b', .75, l.pantryShelfSurfaceY(0), 3, []);
  const moved = l.insertPantryPlacement(start, 'b', desired);
  assert.equal(moved.b.x, .75);
  assert.equal(moved.a.x, start.a.x, 'an unobstructed move does not pull the neighbour along');
  assert.equal(moved.b.manualPosition, true);
  let saved = initial.map(entry => ({ ...entry, ...moved[entry.instanceId] }));
  for (let i = 0; i < 3; i++) saved = l.decodePantryLayout(l.encodePantryLayout({ items: saved, shelfCount: 3 })).items;
  assert.equal(saved.find(entry => entry.instanceId === 'b').x, .75);
  const remaining = l.normalizePantryItems(saved.filter(entry => entry.instanceId !== 'a'));
  assert.equal(remaining[0].x, .75, 'removing another item does not close a deliberate gap');
  assert.equal(remaining[0].notes, 'Abierto');
  assert.equal(remaining[0].quantity, 5);
});

test('manual insertion pushes only obstructing neighbours and preserves the source spacing', () => {
  const start = positions([item('held', .5, bounds(.2, .8), 1), item('source', .8, bounds(.2, .8), 1),
    item('left', .2, bounds(.2, .8)), item('right', .6, bounds(.2, .8)), item('far', .9, bounds(.2, .8))]);
  const snapshot = structuredClone(start);
  const desired = l.pantryDropPlacement(start, 'held', .5, l.pantryShelfSurfaceY(0), 3, []);
  const moved = l.insertPantryPlacement(start, 'held', desired);
  assert.equal(moved.held.x, .5);
  assert.equal(moved.left.x, start.left.x);
  assert.ok(moved.right.x > start.right.x);
  assert.equal(moved.far.x, start.far.x);
  assert.equal(moved.source.x, start.source.x);
  assert.ok(l.isPantryPlacementFree(moved.held, Object.entries(moved).filter(([id]) => id !== 'held').map(([, entry]) => entry)));
  assert.deepEqual(start, snapshot);
  const stock = Object.entries(moved).map(([id, placement]) => ({ ...item(id, .5, bounds(.2, .8)), ...placement }));
  assert.equal(l.normalizePantryItems(stock).find(entry => entry.instanceId === 'held').x, .5);
});
