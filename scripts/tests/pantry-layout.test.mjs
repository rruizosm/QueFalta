import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}) {
  const source = readFileSync(new URL(`../../src/${path}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
const layout = load('lib/pantryLayout');
const decodeItems = (raw) => layout.decodePantryLayout(raw).items;
const encodeItems = (items) => layout.encodePantryLayout({ items, shelfCount: 3 });
const product = { id: '10699', name: 'Leche entera sin lactosa Hacendado', illustrationUrl: 'https://example.com/milk.png' };
const item = (overrides = {}) => ({ instanceId: 'milk-1', product,
  ...layout.clampPantryPlacement({ x: 0.3, y: 0, size: 0.28 }), ...overrides });

test('extra shelves and their products survive storage, including empty shelves and legacy layouts', () => {
  assert.deepEqual(layout.decodePantryLayout(null), { items: [], shelfCount: 3 });
  assert.deepEqual(layout.decodePantryLayout(JSON.stringify({ version: 1, items: [item()] })),
    { items: [item()], shelfCount: 3 });
  for (const shelfCount of [4, 6, 12]) {
    const items = [item(), item({ instanceId: 'last-shelf', ...layout.pantrySlotPlacement(2, shelfCount - 1, shelfCount) })];
    for (const entries of [[], items]) {
      const saved = { items: entries, shelfCount };
      assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(saved)), saved);
    }
    assert.equal(layout.availablePantrySlots([], shelfCount).length, shelfCount * 5);
    assert.equal(layout.availablePantrySlots(items, shelfCount).length, shelfCount * 5 - 2);
  }
  for (const shelfCount of [null, -1, 0, 2, 4.5, '4']) {
    assert.equal(layout.decodePantryLayout(JSON.stringify({ version: 1, items: [], shelfCount })).shelfCount, 3);
  }
});

test('adding a fourth shelf recovers overflow and preserves existing product placements', () => {
  const existing = Array.from({ length: 15 }, (_, i) => item({ instanceId: `full-${i}`, ...layout.defaultPantryPlacement(i) }));
  const overflow = item({ instanceId: 'overflow' });
  assert.equal(layout.arrangePantryItems([...existing, overflow]).unplaced.length, 1);
  const result = layout.arrangePantryItems([...existing, overflow], 4);
  assert.equal(result.unplaced.length, 0);
  assert.deepEqual(result.placed.slice(0, 15), existing);
  assert.equal(result.placed[15].shelfIndex, 3);
  assert.equal(result.placed[15].size, overflow.size);
  assert.equal(layout.findPantryPlacement({ ...overflow, shelfIndex: 3, size: 0.4 }, [], 4), null);
});

test('new products cycle through all three shelves', () => {
  for (let index = 0; index < 20; index++) {
    const placement = layout.defaultPantryPlacement(index);
    const bottom = placement.y + placement.size * layout.PANTRY_ASPECT_RATIO / 2;
    assert.ok(Math.abs(bottom - layout.PANTRY_SHELF_SURFACE_YS[Math.floor(index / 5) % 3]) < 1e-10);
    assert.deepEqual(layout.clampPantryPlacement(placement), placement);
  }
});

test('saved sizes are normalized inside the active shelf bounds', () => {
  assert.deepEqual(layout.clampPantryPlacement({ x: NaN, y: Infinity, size: NaN }),
    { shelfIndex: 0, x: 0.5, y: layout.PANTRY_SHELF_SURFACE_Y - 0.14 * layout.PANTRY_ASPECT_RATIO, size: 0.28 });
  for (const size of [-50, 0.14, 0.28, 0.4, 0.65, 50]) {
    for (const x of [-10, 0, 0.5, 1, 10]) for (const y of [-10, 0, 0.5, 1, 10]) {
      const p = layout.clampPantryPlacement({ x, y, size });
      assert.ok(p.size >= layout.PANTRY_MIN_SIZE && p.size <= layout.PANTRY_MAX_SIZE);
      // These are also the pixel bounds on phone, tablet and rotated canvases.
      for (const width of [230, 370, 520]) {
        const height = width / layout.PANTRY_ASPECT_RATIO;
        const side = p.size * width;
        const frameWidth = layout.pantryProductWidth(p.size) * width;
        assert.ok(p.x * width - frameWidth / 2 >= -1e-10);
        assert.ok(p.x * width + frameWidth / 2 <= width + 1e-10);
        assert.ok(p.y * height - side / 2 >= -1e-10);
        assert.ok(p.x - layout.pantryProductWidth(p.size) / 2 >= layout.PANTRY_SHELF_INSET - 1e-10);
        assert.ok(p.x + layout.pantryProductWidth(p.size) / 2 <= 1 - layout.PANTRY_SHELF_INSET + 1e-10);
        assert.ok(Math.abs(p.y * height + side / 2 - height * layout.PANTRY_SHELF_SURFACE_Y) < 1e-10);
      }
    }
  }
});

test('legacy floating placements are anchored on read and write without removing products', () => {
  const legacy = [item({ y: 0.8 }), item({ instanceId: 'milk-2', x: 1, y: 0.1, size: 0.65 })];
  const expected = legacy.map((entry) => ({ ...entry, ...layout.clampPantryPlacement(entry) }));
  assert.deepEqual(decodeItems(JSON.stringify({ version: 1, items: legacy })), expected);
  assert.deepEqual(JSON.parse(encodeItems(legacy)).items, expected);
  assert.deepEqual(legacy.map((entry) => entry.y), [0.8, 0.1]);
});

function assertSeparated(items) {
  for (let shelfIndex = 0; shelfIndex < 3; shelfIndex++) {
    const sorted = items.filter((item) => layout.pantryShelfIndex(item) === shelfIndex).sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const entryWidth = layout.pantryProductWidth(entry.size);
      assert.ok(entry.x - entryWidth / 2 >= layout.PANTRY_SHELF_INSET - 1e-9);
      assert.ok(entry.x + entryWidth / 2 <= 1 - layout.PANTRY_SHELF_INSET + 1e-9);
      assert.ok(Math.abs(entry.y + entry.size * layout.PANTRY_ASPECT_RATIO / 2 - layout.PANTRY_SHELF_SURFACE_YS[shelfIndex]) < 1e-9);
      const ceiling = shelfIndex === 0 ? 0 : layout.PANTRY_SHELF_SURFACE_YS[shelfIndex - 1] + layout.PANTRY_SHELF_CLEARANCE_Y;
      assert.ok(entry.y - entry.size * layout.PANTRY_ASPECT_RATIO / 2 >= ceiling - 1e-9);
      if (i) assert.ok(entry.x - entryWidth / 2 >= sorted[i - 1].x
        + layout.pantryProductWidth(sorted[i - 1].size) / 2 + layout.PANTRY_PRODUCT_GAP - 1e-9);
    }
  }
}

test('five slots per shelf expose only free add targets on that shelf', () => {
  const slots = Array.from({ length: layout.PANTRY_SLOT_COUNT }, (_, index) => layout.pantrySlotPlacement(index));
  assert.equal(slots.length, 5);
  assert.deepEqual(slots.map((slot) => slot.x), [...slots.map((slot) => slot.x)].sort((a, b) => a - b));
  assert.ok(layout.PANTRY_PRODUCT_FRAME_RATIO < 1);
  assert.equal(layout.availablePantrySlots([]).length, 15);
  assert.equal(layout.availablePantrySlots([slots[2]]).length, 14);
  assert.equal(layout.availablePantrySlots(slots).length, 10);
  assertSeparated(slots);
});

test('collision snaps to the closest fitting gap on either side, leaving neighbours untouched', () => {
  const neighbour = item({ x: 0.5 });
  const snapshot = structuredClone(neighbour);
  for (const x of [0.45, 0.55]) {
    const desired = item({ x });
    const result = layout.findPantryPlacement(desired, [neighbour]);
    assert.ok(result);
    const expected = 0.5 + (x < 0.5 ? -1 : 1)
      * (layout.pantryProductWidth(0.28) + layout.PANTRY_PRODUCT_GAP);
    assert.ok(Math.abs(result.x - expected) < 1e-9);
    assert.equal(result.size, desired.size);
    assertSeparated([neighbour, result]);
  }
  assert.deepEqual(neighbour, snapshot);
});

test('uses a farther gap when the nearer one is too small, including exact fits', () => {
  const occupied = [0.2, 0.4, 0.6].map((x, index) => item({ instanceId: `occupied-${index}`, x }));
  const result = layout.findPantryPlacement(item({ x: 0.4 }), occupied);
  assert.ok(result && result.x > 0.7);
  assertSeparated([...occupied, result]);
  const exactSize = 0.2;
  const neighbour = item({ x: layout.PANTRY_SHELF_INSET + layout.pantryProductWidth(exactSize)
    + layout.PANTRY_PRODUCT_GAP + layout.pantryProductWidth(0.28) / 2 });
  const exact = layout.findPantryPlacement(item({ x: 0, size: exactSize }), [neighbour]);
  assert.ok(exact);
  assert.ok(Math.abs(exact.x - (layout.PANTRY_SHELF_INSET + layout.pantryProductWidth(exactSize) / 2)) < 1e-9);
});

test('a full or fragmented shelf rejects placements that do not fit', () => {
  const occupied = Array.from({ length: layout.PANTRY_SLOT_COUNT }, (_, index) => item({
    instanceId: `copy-${index}`,
    ...layout.pantrySlotPlacement(index),
  }));
  const snapshot = structuredClone(occupied);
  assert.equal(layout.findPantryPlacement(item(), occupied), null);
  assert.equal(layout.findPantryPlacement(item({ x: 0.5, size: 0.4 }), occupied.filter((_, index) => index !== 2)), null);
  assert.ok(layout.findPantryPlacement(item({ x: 0.5, size: 0.2 }), occupied.filter((_, index) => index !== 2)));
  assert.deepEqual(occupied, snapshot);
});

test('legacy collisions and overflow survive persistence and recover when space is freed', () => {
  const legacy = Array.from({ length: 16 }, (_, i) => item({ instanceId: `copy-${i}`, x: 0.5 }));
  const repaired = decodeItems(JSON.stringify({ version: 1, items: legacy }));
  const { placed, unplaced } = layout.arrangePantryItems(repaired);
  assert.equal(placed.length, 15);
  assert.equal(unplaced.length, 1);
  assertSeparated(placed);
  assert.equal(repaired.length, legacy.length);
  assert.deepEqual(repaired.map((entry) => entry.size), legacy.map((entry) => entry.size));
  assert.deepEqual(decodeItems(encodeItems(repaired)), repaired);
  assert.deepEqual(legacy.map((entry) => entry.x), Array(16).fill(0.5));
  const afterRemoval = layout.arrangePantryItems(repaired.filter((entry) => entry.instanceId !== placed[1].instanceId));
  assert.equal(afterRemoval.placed.length, 15);
  assert.equal(afterRemoval.unplaced.length, 0);
  assertSeparated(afterRemoval.placed);
});

test('many normalized legacy placements never overlap, change neighbours, or leave the shelf', () => {
  let items = layout.arrangePantryItems(Array.from({ length: 4 }, (_, i) => item({ instanceId: `random-${i}`, size: 0.16 }))).placed;
  let seed = 7;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let step = 0; step < 1000; step++) {
    const index = Math.floor(random() * items.length);
    const previous = items[index];
    const neighbours = items.filter((_, i) => i !== index);
    const next = layout.findPantryPlacement({ x: random() * 2 - 0.5, y: random(), shelfIndex: Math.floor(random() * 3), size: 0.1 + random() * 0.5 }, neighbours);
    if (next) items = items.map((entry, i) => i === index ? { ...entry, ...next } : entry);
    else assert.equal(items[index], previous);
    assertSeparated(items);
    assert.deepEqual(items.filter((_, i) => i !== index), neighbours);
  }
});

test('saved placement survives reload, preserves copies, and ignores malformed items', () => {
  const items = [item(), item({ instanceId: 'milk-2', x: 0.75 })];
  assert.deepEqual(decodeItems(encodeItems(items)), items);
  const raw = JSON.stringify({ version: 1, items: [...items, item(), item({ instanceId: 'invalid', product: { ...product, illustrationUrl: 'file:///secret.png' } }), item({ instanceId: 'null-x', x: null })] });
  assert.deepEqual(decodeItems(raw), items);
  assert.throws(() => decodeItems('broken'));
  assert.throws(() => decodeItems('{"version":2,"items":[]}'));
});

test('a full top shelf uses the next shelf without moving or shrinking its products', () => {
  const top = Array.from({ length: 5 }, (_, i) => item({ instanceId: `top-${i}`, ...layout.pantrySlotPlacement(i) }));
  const snapshot = structuredClone(top);
  assert.equal(layout.findPantryPlacement(layout.defaultPantryPlacement(0), top), null);
  const sixth = layout.findPantryPlacementOnAnyShelf(layout.defaultPantryPlacement(0), top);
  assert.equal(sixth.shelfIndex, 1);
  assert.equal(sixth.size, layout.PANTRY_DEFAULT_SIZE);
  assert.deepEqual(top, snapshot);
  const all = [...top];
  for (let i = 5; i < 15; i++) {
    const placement = layout.findPantryPlacementOnAnyShelf(layout.defaultPantryPlacement(i), all);
    assert.ok(placement);
    all.push(item({ instanceId: `added-${i}`, ...placement }));
  }
  assert.equal(layout.findPantryPlacementOnAnyShelf(layout.defaultPantryPlacement(15), all), null);
  assert.equal(layout.availablePantrySlots(all).length, 0);
  assertSeparated(all);
  assert.deepEqual(decodeItems(encodeItems(all)), all);
});

test('lower shelves collide independently and reject a too-tall transfer without resizing', () => {
  const top = item({ x: 0.5 });
  const middle = layout.findPantryPlacement({ ...top, shelfIndex: 1 }, [top]);
  const bottom = layout.findPantryPlacement({ ...top, shelfIndex: 2 }, [top, middle]);
  assert.equal(middle.x, top.x);
  assert.equal(bottom.x, top.x);
  assertSeparated([top, middle, bottom]);
  for (const shelfIndex of [1, 2]) {
    const tall = item({ size: 0.4, shelfIndex });
    assert.equal(layout.findPantryPlacement(tall, []), null);
    assert.equal(layout.isPantryPlacementFree(tall, []), false);
    assert.equal(tall.size, 0.4);
  }
});

test('legacy top-shelf overflow recovers without displacing saved lower-shelf owners', () => {
  const legacy = Array.from({ length: 6 }, (_, i) => {
    const entry = item({ instanceId: `legacy-${i}`, ...layout.pantrySlotPlacement(i % 5) });
    delete entry.shelfIndex;
    return entry;
  });
  const owner = item({ instanceId: 'middle-owner', ...layout.pantrySlotPlacement(0, 1) });
  const saved = decodeItems(JSON.stringify({ version: 1, items: [...legacy, owner] }));
  assert.equal(saved.length, 7);
  assert.deepEqual(saved.find((entry) => entry.instanceId === owner.instanceId), owner);
  assert.equal(saved.find((entry) => entry.instanceId === 'legacy-5').shelfIndex, 1);
  for (const entry of saved.filter((entry) => /^legacy-[0-4]$/.test(entry.instanceId))) assert.equal(entry.shelfIndex, 0);
  assertSeparated(saved);
  assert.deepEqual(decodeItems(encodeItems(saved)), saved);
});

test('device storage is isolated by account; later edits cannot be overtaken by slow writes', async () => {
  const saved = new Map();
  const started = [];
  const gates = [];
  const storage = load('lib/pantryStorage', {
    './pantryLayout': layout,
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => saved.get(key) ?? null,
      setItem: (key, value) => {
        started.push(key);
        return new Promise((resolve) => gates.push(() => { saved.set(key, value); resolve(); }));
      },
    },
  });
  const first = storage.writePantryLayout('alice', { items: [item()], shelfCount: 3 });
  const second = storage.writePantryLayout('alice', { items: [item({ x: 0.6 })], shelfCount: 4 });
  const bob = storage.writePantryLayout('bob', { items: [], shelfCount: 5 });
  let readDone = false;
  const reading = storage.readPantryLayout('alice').then((value) => { readDone = true; return value; });
  await new Promise(setImmediate);
  assert.deepEqual(started, [storage.pantryStorageKey('alice'), storage.pantryStorageKey('bob')]);
  assert.equal(readDone, false);
  gates[0](); gates[1]();
  await Promise.all([first, bob]);
  await new Promise(setImmediate);
  assert.equal(started.length, 3);
  gates[2]();
  await second;
  assert.equal((await reading).items[0].x, 0.6);
  assert.equal((await reading).shelfCount, 4);
  assert.deepEqual(await storage.readPantryLayout('bob'), { items: [], shelfCount: 5 });
});

test('a failed write is reported and a subsequent save can recover', async () => {
  let calls = 0;
  let value = null;
  const storage = load('lib/pantryStorage', {
    './pantryLayout': layout,
    '@react-native-async-storage/async-storage': {
      getItem: async () => value,
      setItem: async (_key, next) => { if (++calls === 1) throw new Error('disk unavailable'); value = next; },
    },
  });
  await assert.rejects(storage.writePantryLayout('alice', { items: [item()], shelfCount: 3 }));
  await storage.writePantryLayout('alice', { items: [item({ size: 0.4 })], shelfCount: 4 });
  assert.equal((await storage.readPantryLayout('alice')).items[0].size, 0.4);
});

function queryDatabase(rows) {
  return {
    from: (table) => {
      assert.equal(table, 'mercadona_products');
      let result = rows;
      const builder = {
        select: () => builder,
        eq: (column, value) => { result = result.filter((row) => row[column] === value); return builder; },
        neq: (column, value) => { result = result.filter((row) => row[column] !== value); return builder; },
        not: (column, operator, value) => { assert.equal(operator, 'is'); result = result.filter((row) => row[column] !== value); return builder; },
        ilike: (column, value) => { result = result.filter((row) => row[column].includes(value.slice(1, -1))); return builder; },
        order: () => builder,
        range: (start, end) => { result = result.slice(start, end + 1); return builder; },
        abortSignal: () => builder,
        then: (resolve) => Promise.resolve({ data: result, error: null }).then(resolve),
      };
      return builder;
    },
  };
}
const row = (id, extras = {}) => ({ id, published: true, display_name: 'Leche entera', display_name_ca: 'Llet sencera',
  display_name_norm: 'leche entera', display_name_ca_norm: 'llet sencera', illustration_url: product.illustrationUrl, ...extras });

test('only published illustrated products are paginated, even after many unillustrated matches', async () => {
  const rows = [...Array.from({ length: 40 }, (_, i) => row(`none-${i}`, { illustration_url: null })),
    row('empty', { illustration_url: '' }), row('retired', { published: false }),
    ...Array.from({ length: 31 }, (_, i) => row(String(i)))];
  const api = load('api/pantry', { '../lib/supabase': { supabase: queryDatabase(rows) }, '../lib/pantryLayout': layout });
  const first = await api.searchPantryProducts('léche %', 'es');
  assert.equal(first.products.length, 30);
  assert.equal(first.products[0].id, '0');
  assert.equal(first.hasMore, true);
  const second = await api.searchPantryProducts('', 'es', 30);
  assert.deepEqual(second.products.map((p) => p.id), ['30']);
  assert.equal(second.hasMore, false);
  const ca = await api.searchPantryProducts('llet', 'ca');
  assert.equal(ca.products[0].name, 'Llet sencera');
  assert.equal((await api.searchPantryProducts('tomate', 'es')).products.length, 0);
});
