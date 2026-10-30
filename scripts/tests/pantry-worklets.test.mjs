import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { transformSync } from '@babel/core';

// TypeScript-only tests miss functions captured before Expo initializes them.
const filename = new URL('../../src/lib/pantryLayout.ts', import.meta.url).pathname;
const { code } = transformSync(readFileSync(filename, 'utf8'), {
  filename, babelrc: false, configFile: false, presets: ['babel-preset-expo'],
});
const module = { exports: {} };
new Function('module', 'exports', 'require', code)(module, module.exports, createRequire(import.meta.url));
const layout = module.exports;

// Execute serialized worklets with their captured closures, as on the UI runtime.
function uiWorklet(worklet) {
  assert.ok(worklet.__initData?.code, 'expected an Expo-transformed worklet');
  const convert = value => typeof value === 'function' && value.__initData ? uiWorklet(value) : value;
  const closure = Array.isArray(worklet.__closure)
    ? worklet.__closure.map(convert)
    : Object.fromEntries(Object.entries(worklet.__closure ?? {}).map(([key, value]) => [key, convert(value)]));
  return new Function(`return (${worklet.__initData.code})`)().bind({ __closure: closure });
}

test('Expo-serialized drag worklets compact and transfer products with initialized dependencies', () => {
  const compact = uiWorklet(layout.compactPantryRow);
  const insert = uiWorklet(layout.insertPantryPlacement);
  const photo = { x: .5, y: 0, size: .28, shelfIndex: 0,
    visibleBounds: { left: .3, right: .7, top: .05, bottom: .95 } };
  const row = compact([photo, photo], 0, 3);
  assert.equal(row.length, 2);
  const start = { a: row[0], b: row[1] };
  const reordered = insert(start, 'b', { ...start.b, x: 0 }, 3, 'a');
  assert.ok(reordered.b.x < reordered.a.x);
  const transferred = insert(reordered, 'b', { ...reordered.b, shelfIndex: 1 }, 3);
  assert.equal(transferred.b.shelfIndex, 1);
  assert.equal(transferred.a.x, row[0].x);
  assert.deepEqual(start, { a: row[0], b: row[1] });
});


test('Expo-serialized free-space measurement respects width, height and the held instance', () => {
  const spaces = uiWorklet(layout.pantryMoveSpaces);
  const compact = uiWorklet(layout.compactPantryRow);
  const wide = { x: .5, y: 0, size: .28, shelfIndex: 0,
    visibleBounds: { left: 0, right: 1, top: 0, bottom: 1 } };
  const fullRow = compact([wide, wide, wide], 1, 3);
  const positions = { held: { ...wide, shelfIndex: 0 },
    a: fullRow[0], b: fullRow[1], c: fullRow[2] };
  const before = structuredClone(positions);
  const wideSpaces = spaces(positions, 'held', 3);
  assert.deepEqual(wideSpaces.map(space => space.shelfIndex), [0, 2]);
  assert.equal(wideSpaces[0].left, layout.PANTRY_SHELF_INSET);
  assert.equal(wideSpaces[0].right, 1 - layout.PANTRY_SHELF_INSET);
  const narrow = { ...positions, held: { ...wide, visibleBounds: { left: .4, right: .6, top: 0, bottom: 1 } } };
  assert.deepEqual(spaces(narrow, 'held', 3).map(space => space.shelfIndex), [0, 1, 2]);
  assert.deepEqual(spaces({ held: { ...wide, size: .4 } }, 'held', 3).map(space => space.shelfIndex), [0]);
  assert.deepEqual(spaces(positions, 'deleted', 3), []);
  assert.deepEqual(positions, before);
});


test('serialized drop validation aligns approximate releases and rejects distant or full destinations', () => {
  const drop = uiWorklet(layout.pantryDropPlacement);
  const compact = uiWorklet(layout.compactPantryRow);
  const photo = { x: .5, y: 0, size: .28, visibleBounds: { left: .3, right: .7, top: 0, bottom: 1 } };
  const row = compact([photo, photo], 0, 3);
  const positions = { held: row[0], other: row[1] };
  const before = structuredClone(positions);
  const surface = layout.pantryShelfSurfaceY(0);
  assert.equal(drop(positions, 'held', row[1].x, surface, 3, []).x, row[1].x);
  assert.equal(drop(positions, 'held', -.2, surface, 3, []), null);
  assert.equal(drop(positions, 'held', 1.2, surface, 3, []), null);
  assert.equal(drop(positions, 'held', row[0].x, surface + .12, 3, []).shelfIndex, 0);
  assert.equal(drop(positions, 'held', row[0].x, -1, 3, []), null);
  assert.equal(drop(positions, 'held', row[0].x, 2, 3, []), null);
  assert.equal(drop(positions, 'held', row[0].x, surface, 3, []).shelfIndex, 0);
  assert.equal(drop(positions, 'held', .5, layout.pantryShelfSurfaceY(1) + .08, 3, [.08, .08, .08]).shelfIndex, 1);
  assert.equal(drop(positions, 'deleted', .5, surface, 3, []), null);
  assert.deepEqual(positions, before);
});


test('approximate drops accept a fitting gap even when the released photo straddles its borders', () => {
  const drop = uiWorklet(layout.pantryDropPlacement);
  const compact = uiWorklet(layout.compactPantryRow);
  const photo = { x: .5, y: 0, size: .28, visibleBounds: { left: .1, right: .9, top: .1, bottom: .95 } };
  const row = compact([photo, photo, photo], 1, 3);
  const positions = { held: { ...photo, shelfIndex: 0 }, a: row[0], b: row[1], c: row[2] };
  const gaps = layout.pantryMoveSpaces(positions, 'held', 3);
  const target = gaps.find(space => space.shelfIndex === 1);
  assert.ok(target);
  const extents = layout.pantryHorizontalExtents(photo);
  // Centre aimed at the start of the gap: left half overlaps the neighbour.
  const accepted = drop(positions, 'held', target.left, layout.pantryShelfSurfaceY(1) - .09, 3, []);
  assert.equal(accepted.shelfIndex, 1);
  const packed = layout.insertPantryPlacement(positions, 'held', accepted, 3);
  assert.ok(Math.abs(packed.held.x - extents.left - target.left) < 1e-9);
  assert.ok(layout.isPantryPlacementFree(packed.held, [packed.a, packed.b, packed.c], 3));
  assert.ok(drop(positions, 'held', .5, layout.pantryShelfSurfaceY(1), 3, []),
    'insertion can open space between existing products when the row fits');
  const wide = { ...positions, held: { ...photo, visibleBounds: { left: 0, right: 1, top: 0, bottom: 1 } } };
  assert.equal(drop(wide, 'held', target.left, layout.pantryShelfSurfaceY(1), 3, []), null,
    'tolerance cannot make an undersized gap fit');
  const edge = drop({ held: photo }, 'held', -.02, layout.pantryShelfSurfaceY(0) + .08, 3, []);
  assert.ok(edge);
  assert.ok(edge.x - extents.left >= layout.PANTRY_SHELF_INSET - 1e-9);
});

test('serialized manual placement retains free horizontal spacing and leaves distant neighbours still', () => {
  const drop = uiWorklet(layout.pantryDropPlacement);
  const insert = uiWorklet(layout.insertPantryPlacement);
  const photo = { x: .2, y: 0, size: .28, shelfIndex: 0,
    visibleBounds: { left: .3, right: .7, top: .05, bottom: .95 } };
  const positions = { held: { ...photo, x: .4 }, neighbour: photo };
  const desired = drop(positions, 'held', .8, layout.pantryShelfSurfaceY(0), 3, []);
  const moved = insert(positions, 'held', desired, 3);
  assert.equal(moved.held.x, .8);
  assert.equal(moved.neighbour.x, .2);
  assert.equal(moved.held.manualPosition, true);
});
