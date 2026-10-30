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
// This fixture is a measured narrow carton; unknown images are tested separately.
const cartonBounds = { left: .225, top: 0, right: .775, bottom: 1 };
const measuredSlot = (index, shelfIndex = 0, shelfCount = 3) => layout.compactPantryRow(
  Array.from({ length: Math.min(4, index) + 1 }, () => ({ x: 0, y: 0, size: .28, visibleBounds: cartonBounds })), shelfIndex, shelfCount).at(-1);
const measuredDefault = (index, shelfCount = 3) => measuredSlot(index % 5, Math.floor(index / 5) % shelfCount, shelfCount);
const item = (overrides = {}) => ({ instanceId: 'milk-1', product,
  visibleBounds: cartonBounds, boundsImageUrl: product.illustrationUrl,
  ...measuredDefault(0), ...overrides });

test('shelf names and emojis round-trip without touching products or requiring a new layout version', () => {
  const saved = { items: [item()], shelfCount: 4 };
  const labeled = layout.updatePantryShelfLabel(saved, 0, { name: 'Desayunos y café', emoji: '☕️' });
  assert.equal(labeled.items, saved.items);
  const extra = layout.updatePantryShelfLabel(labeled, 3, { name: '', emoji: '🥣' });
  assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(extra)), extra);
  const removed = layout.updatePantryShelfLabel(extra, 0, null);
  assert.deepEqual(removed.shelfLabels, { 3: { name: '', emoji: '🥣' } });
  assert.deepEqual(saved, { items: [item()], shelfCount: 4 });
  for (const index of [-1, 4, NaN, 1.2]) assert.equal(layout.updatePantryShelfLabel(saved, index, null), saved);
});

test('damaged shelf labels do not prevent recovering the inventory', () => {
  const raw = { version: 1, items: [item()], shelfCount: 3, shelfLabels: {
    0: { name: 'a'.repeat(90), emoji: null }, 1: { name: 'Conservas', emoji: {} },
    2: null, 4: { name: 'Out of bounds' }, '-1': { name: 'Invalid' }, '01': { name: 'Ambiguous' },
  } };
  const restored = layout.decodePantryLayout(JSON.stringify(raw));
  assert.deepEqual(restored.items, raw.items);
  assert.deepEqual(restored.shelfLabels, { 0: { name: 'a'.repeat(40), emoji: null }, 1: { name: 'Conservas', emoji: null } });
});

test('extra shelves and their products survive storage, including empty shelves and legacy layouts', () => {
  assert.deepEqual(layout.decodePantryLayout(null), { items: [], shelfCount: 2 });
  assert.deepEqual(layout.decodePantryLayout(JSON.stringify({ version: 1, items: [item()] })),
    { items: [item()], shelfCount: 3 });
  for (const shelfCount of [4, 6, 12]) {
    const items = [item(), item({ instanceId: 'last-shelf', ...measuredSlot(0, shelfCount - 1, shelfCount) })];
    for (const entries of [[], items]) {
      const saved = { items: entries, shelfCount };
      assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(saved)), saved);
    }
    assert.equal(layout.availablePantrySlots([], shelfCount).length, shelfCount * 5);
    assert.equal(layout.availablePantrySlots(items, shelfCount).length, shelfCount * 5 - 4);
  }
  for (const shelfCount of [null, -1, 0, 4.5, '4']) {
    assert.equal(layout.decodePantryLayout(JSON.stringify({ version: 1, items: [], shelfCount })).shelfCount, 3);
  }
});

test('adding a fourth shelf recovers overflow and preserves existing product placements', () => {
  const existing = Array.from({ length: 15 }, (_, i) => item({ instanceId: `full-${i}`, ...measuredDefault(i) }));
  const overflow = item({ instanceId: 'overflow', pendingPlacement: true });
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
    const placement = measuredDefault(index);
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
  const expected = layout.normalizePantryItems(legacy);
  assert.deepEqual(decodeItems(JSON.stringify({ version: 1, items: legacy })), expected);
  assert.deepEqual(JSON.parse(encodeItems(legacy)).items, expected);
  assert.deepEqual(legacy.map((entry) => entry.y), [0.8, 0.1]);
});

function assertSeparated(items) {
  for (let shelfIndex = 0; shelfIndex < 3; shelfIndex++) {
    const sorted = items.filter((item) => layout.pantryShelfIndex(item) === shelfIndex).sort((a, b) => a.x - layout.pantryHorizontalExtents(a).left - (b.x - layout.pantryHorizontalExtents(b).left));
    for (let i = 0; i < sorted.length; i++) {
      const entry = sorted[i];
      const extent = layout.pantryHorizontalExtents(entry);
      assert.ok(entry.x - extent.left >= layout.PANTRY_SHELF_INSET - 1e-9);
      assert.ok(entry.x + extent.right <= 1 - layout.PANTRY_SHELF_INSET + 1e-9);
      assert.ok(Math.abs(entry.y + entry.size * layout.PANTRY_ASPECT_RATIO / 2 - layout.PANTRY_SHELF_SURFACE_YS[shelfIndex]) < 1e-9);
      const ceiling = shelfIndex === 0 ? 0 : layout.PANTRY_SHELF_SURFACE_YS[shelfIndex - 1] + layout.PANTRY_SHELF_CLEARANCE_Y;
      assert.ok(entry.y - entry.size * layout.PANTRY_ASPECT_RATIO / 2 >= ceiling - 1e-9);
      if (i) assert.ok(entry.x - extent.left >= sorted[i - 1].x
        + layout.pantryHorizontalExtents(sorted[i - 1]).right + layout.PANTRY_PRODUCT_GAP - 1e-9);
    }
  }
}

test('five slots per shelf expose only free add targets on that shelf', () => {
  const slots = Array.from({ length: layout.PANTRY_SLOT_COUNT }, (_, index) => layout.pantrySlotPlacement(index));
  assert.equal(slots.length, 5);
  assert.deepEqual(slots.map((slot) => slot.x), [...slots.map((slot) => slot.x)].sort((a, b) => a - b));
  assert.ok(layout.PANTRY_PRODUCT_FRAME_RATIO < 1);
  assert.equal(layout.availablePantrySlots([]).length, 15);
  assert.equal(layout.availablePantrySlots([slots[2]]).length, 12);
  assert.equal(layout.availablePantrySlots(slots).length, 10);
  assertSeparated(layout.arrangePantryItems(slots.map((placement, i) => item({ ...placement, visibleBounds: undefined, instanceId: `unknown-${i}` }))).placed);
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
    ...measuredSlot(index),
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
  const items = [item(), item({ instanceId: 'milk-2', ...measuredDefault(1) })];
  assert.deepEqual(decodeItems(encodeItems(items)), items);
  const raw = JSON.stringify({ version: 1, items: [...items, item(), item({ instanceId: 'invalid', product: { ...product, illustrationUrl: 'file:///secret.png' } }), item({ instanceId: 'null-x', x: null })] });
  assert.deepEqual(decodeItems(raw), items);
  assert.throws(() => decodeItems('broken'));
  assert.throws(() => decodeItems('{"version":2,"items":[]}'));
});

test('a full top shelf uses the next shelf without moving or shrinking its products', () => {
  const top = Array.from({ length: 5 }, (_, i) => item({ instanceId: `top-${i}`, ...measuredSlot(i) }));
  const snapshot = structuredClone(top);
  assert.equal(layout.findPantryPlacement(item(measuredDefault(0)), top), null);
  const sixth = layout.findPantryPlacementOnAnyShelf(item(measuredDefault(0)), top);
  assert.equal(sixth.shelfIndex, 1);
  assert.equal(sixth.size, layout.PANTRY_DEFAULT_SIZE);
  assert.deepEqual(top, snapshot);
  const all = [...top];
  for (let i = 5; i < 15; i++) {
    const placement = layout.findPantryPlacementOnAnyShelf(item(measuredDefault(i)), all);
    assert.ok(placement);
    all.push(item({ instanceId: `added-${i}`, ...placement }));
  }
  assert.equal(layout.findPantryPlacementOnAnyShelf(item(measuredDefault(15)), all), null);
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
    const entry = item({ instanceId: `legacy-${i}`, ...measuredSlot(i % 5) });
    delete entry.shelfIndex;
    return entry;
  });
  const owner = item({ instanceId: 'middle-owner', ...measuredSlot(0, 1) });
  const saved = decodeItems(JSON.stringify({ version: 1, items: [...legacy, owner] }));
  assert.equal(saved.length, 7);
  assert.deepEqual(saved.find((entry) => entry.instanceId === owner.instanceId), owner);
  assert.equal(saved.filter(entry => entry.instanceId.startsWith('legacy-') && entry.shelfIndex === 1).length, 1);
  assert.equal(saved.filter(entry => entry.instanceId.startsWith('legacy-') && entry.shelfIndex === 0).length, 5);
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
  const second = storage.writePantryLayout('alice', { items: [item({ quantity: 9 })], shelfCount: 4 });
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
  assert.equal((await reading).items[0].quantity, 9);
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
  display_name_norm: 'leche entera', display_name_ca_norm: 'llet sencera',
  thumbnail: 'https://prod-mercadona.imgix.net/milk.jpg', unit_price: 1.25, price_per_unit: 1.25, price_per_unit_unit: 'l', illustration_url: product.illustrationUrl, ...extras });

test('only published illustrated products are paginated, even after many unillustrated matches', async () => {
  const rows = [...Array.from({ length: 40 }, (_, i) => row(`none-${i}`, { illustration_url: null })),
    row('empty', { illustration_url: '' }), row('retired', { published: false }),
    ...Array.from({ length: 31 }, (_, i) => row(String(i)))];
  const api = load('api/pantry', { '../lib/supabase': { supabase: queryDatabase(rows) }, '../lib/pantryLayout': layout, '../constants/regions': { REGION_ALL: 'ALL', REGION_MERCADONA_NAME: {} } });
  const first = await api.searchPantryProducts('léche %', 'es');
  assert.equal(first.products.length, 30);
  assert.equal(first.products[0].id, '0');
  assert.equal(first.products[0].imageUrl, row('').thumbnail);
  assert.equal(first.products[0].illustrationUrl, product.illustrationUrl);
  assert.equal(first.products[0].priceLabel, '');
  assert.equal(first.products[0].unitPrice, null);
  assert.equal(first.products[0].pricePerUnitLabel, null);
  assert.equal(first.hasMore, true);
  const second = await api.searchPantryProducts('', 'es', 30);
  assert.deepEqual(second.products.map((p) => p.id), ['30']);
  assert.equal(second.hasMore, false);
  const ca = await api.searchPantryProducts('llet', 'ca');
  assert.equal(ca.products[0].name, 'Llet sencera');
  assert.equal((await api.searchPantryProducts('tomate', 'es')).products.length, 0);
});

test('large separated pantries preserve item identity and placements through normalization', () => {
  const shelfCount = 100;
  const items = Array.from({ length: shelfCount * 5 }, (_, i) => item({ instanceId: `large-${i}`,
    ...measuredDefault(i, shelfCount) }));
  const before = structuredClone(items);
  const arranged = layout.arrangePantryItems(items, shelfCount);
  assert.deepEqual(arranged.unplaced, []);
  assert.equal(layout.availablePantrySlots(items, shelfCount).length, 0);
  assert.equal(arranged.placed.length, items.length);
  arranged.placed.forEach((entry, i) => assert.equal(entry, items[i], 'unchanged rows must stay memoizable'));
  assert.deepEqual(items, before);
  const changed = items.map((entry, i) => i === 250 ? { ...entry, x: 0.5 } : entry);
  const normalized = layout.normalizePantryItems(changed, shelfCount);
  assert.equal(normalized.length, items.length);
  normalized.forEach((entry, i) => {
    if (layout.pantryShelfIndex(entry, shelfCount) !== 50) assert.equal(entry, items[i]);
  });
});

test('fridge storage is separate per section and account, retaining the original cupboard key', async () => {
  const pantryLayout = { items: [item()], shelfCount: 6 };
  const pantryRaw = layout.encodePantryLayout(pantryLayout);
  const saved = new Map([['@pantry_layout:v1:alice', pantryRaw]]);
  const storage = load('lib/pantryStorage', {
    './pantryLayout': layout,
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => saved.get(key) ?? null,
      setItem: async (key, value) => { saved.set(key, value); },
    },
  });
  assert.equal(storage.pantryStorageKey('alice'), '@pantry_layout:v1:alice');
  assert.equal(storage.pantryStorageKey('alice', 'pantry'), '@pantry_layout:v1:alice');
  assert.equal(storage.pantryStorageKey('alice', 'fridge'), '@fridge_layout:v1:alice');
  assert.deepEqual(await storage.readPantryLayout('alice', 'fridge'), { items: [], shelfCount: 2 });
  const cold = { items: [item({ ...measuredSlot(0, 2) })], shelfCount: 4 };
  await storage.writePantryLayout('alice', cold, 'fridge');
  assert.deepEqual(await storage.readPantryLayout('alice', 'fridge'), cold);
  assert.deepEqual(await storage.readPantryLayout('alice'), pantryLayout);
  assert.equal(saved.get('@pantry_layout:v1:alice'), pantryRaw, 'fridge edits must not even rewrite the cupboard');
  assert.deepEqual(await storage.readPantryLayout('bob', 'fridge'), { items: [], shelfCount: 2 });
  await storage.writePantryLayout('bob', { items: [], shelfCount: 8 }, 'fridge');
  assert.deepEqual(await storage.readPantryLayout('alice', 'fridge'), cold);
  assert.deepEqual(await storage.readPantryLayout('bob'), { items: [], shelfCount: 2 });
});

test('fridge writes stay ordered across remount reads without blocking cupboard writes', async () => {
  const saved = new Map();
  const gates = [];
  const storage = load('lib/pantryStorage', {
    './pantryLayout': layout,
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => saved.get(key) ?? null,
      setItem: (key, value) => key.includes('fridge')
        ? new Promise((resolve) => gates.push(() => { saved.set(key, value); resolve(); }))
        : Promise.resolve(saved.set(key, value)),
    },
  });
  const first = storage.writePantryLayout('alice', { items: [item()], shelfCount: 3 }, 'fridge');
  const moved = { items: [item({ ...measuredSlot(0, 3, 4) })], shelfCount: 4 };
  const second = storage.writePantryLayout('alice', moved, 'fridge');
  let readDone = false;
  const remounted = storage.readPantryLayout('alice', 'fridge').then((value) => { readDone = true; return value; });
  const pantry = { items: [item()], shelfCount: 5 };
  await storage.writePantryLayout('alice', pantry);
  assert.deepEqual(await storage.readPantryLayout('alice'), pantry);
  assert.equal(readDone, false);
  assert.equal(gates.length, 1);
  gates[0]();
  await first;
  await new Promise(setImmediate);
  gates[1]();
  await second;
  assert.deepEqual(await remounted, moved);
});

test('a corrupt fridge does not prevent reading the cupboard and failed saves can be retried', async () => {
  const pantry = { items: [item()], shelfCount: 3 };
  const saved = new Map([['@pantry_layout:v1:alice', layout.encodePantryLayout(pantry)], ['@fridge_layout:v1:alice', 'broken']]);
  let fail = true;
  const storage = load('lib/pantryStorage', {
    './pantryLayout': layout,
    '@react-native-async-storage/async-storage': {
      getItem: async (key) => saved.get(key) ?? null,
      setItem: async (key, value) => { if (fail) throw new Error('disk full'); saved.set(key, value); },
    },
  });
  await assert.rejects(storage.readPantryLayout('alice', 'fridge'));
  assert.deepEqual(await storage.readPantryLayout('alice'), pantry);
  const fridge = { items: [item({ ...measuredSlot(0, 1) })], shelfCount: 3 };
  await assert.rejects(storage.writePantryLayout('alice', fridge, 'fridge'));
  fail = false;
  await storage.writePantryLayout('alice', fridge, 'fridge');
  assert.deepEqual(await storage.readPantryLayout('alice', 'fridge'), fridge);
  assert.deepEqual(await storage.readPantryLayout('alice'), pantry);
});

test('editable stock and notes survive storage without migrating legacy entries or merging copies', () => {
  const original = item();
  const edited = item({ instanceId: 'milk-2', ...measuredDefault(1), quantity: 7, notes: 'Abierto\nReservar para mañana' });
  const saved = { shelfCount: 3, items: [original, edited] };
  assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(saved)), saved);
  assert.equal(layout.pantryQuantity(original.quantity), 1);
  assert.equal('quantity' in layout.decodePantryLayout(layout.encodePantryLayout(saved)).items[0], false);
  const malformed = JSON.stringify({ version: 1, items: [{ ...edited, quantity: -4, notes: 'a'.repeat(600) }] });
  const recovered = layout.decodePantryLayout(malformed).items[0];
  assert.equal(recovered.quantity, 1);
  assert.equal(recovered.notes.length, layout.PANTRY_MAX_NOTES_LENGTH);
  for (const [input, expected] of [[NaN, 1], [Infinity, 1], [2.5, 2], [1000, 999], ['8', 1]]) {
    assert.equal(layout.pantryQuantity(input), expected);
  }
});


test('Lidl products and legacy Mercadona copies survive persistence without confusing their store', () => {
  const lidl = item({ instanceId: 'lidl-copy', product: { ...product, id: '8806215264107_ES', store: 'lidl' },
    ...measuredDefault(1) });
  const legacy = item({ ...measuredDefault(0) });
  const explicitMercadona = item({ instanceId: 'mercadona-copy', product: { ...product, store: 'mercadona' },
    ...measuredDefault(2) });
  assert.deepEqual(decodeItems(encodeItems([legacy, lidl, explicitMercadona])), [legacy, lidl, explicitMercadona]);
  for (const invalid of [{ ...product, store: 'aldi' }, { ...product, id: '8806215264107_ES' },
    { ...product, id: '../bad', store: 'lidl' }]) {
    assert.deepEqual(decodeItems(JSON.stringify({ version: 1, items: [item({ product: invalid })] })), []);
  }
});

test('all five Carrefour catalogue ID formats survive persistence and malformed ids are rejected', () => {
  for (const id of ['520664611', 'fprod12345', 'prod1000001', 'VC4A-10018407', 'VC4AECOMM-10018407']) {
    const saved = item({ product: { ...product, store: 'carrefour', id }, ...measuredDefault(0) });
    assert.deepEqual(decodeItems(encodeItems([saved])), [saved]);
  }
  for (const id of ['../bad', 'fprod', '123_ES', '13*7690', 'VC4AECOMM-', 'VC4A-../10']) {
    assert.deepEqual(decodeItems(JSON.stringify({ version: 1, items: [item({ product: { ...product, store: 'carrefour', id } })] })), []);
  }
});

test('insert shelf between Galletas and Botes shifts stock and signs together and survives reload', () => {
  const saved = { shelfCount: 4, kitchenLocations: ['Armario'], shelfLabels: {
    0: { name: 'Galletas', emoji: '🍪' }, 2: { name: 'Botes', emoji: '🥫' },
    3: { name: 'Otros', emoji: null },
  }, items: [0, 1, 2, 3].map(index => item({ instanceId: `shelf-${index}`,
    ...measuredSlot(0, index, 4), quantity: 2, notes: 'Conservar', kitchenLocation: 'Armario', expiryDate: '2027-01-01' })) };
  const original = structuredClone(saved);
  const next = layout.insertPantryShelfBelow(saved, 1);
  assert.equal(next.shelfCount, 5);
  assert.deepEqual(next.items.map(i => i.shelfIndex), [0, 1, 3, 4]);
  assert.deepEqual(next.shelfLabels, { 0: saved.shelfLabels[0], 3: saved.shelfLabels[2], 4: saved.shelfLabels[3] });
  for (let i = 0; i < saved.items.length; i++) {
    const { y, shelfIndex, ...details } = next.items[i];
    const { y: _y, shelfIndex: _shelfIndex, ...previous } = saved.items[i];
    assert.deepEqual(details, previous);
    assert.equal(y, layout.pantryShelfSurfaceY(shelfIndex) - next.items[i].size * layout.PANTRY_ASPECT_RATIO / 2);
  }
  assert.deepEqual(next.kitchenLocations, saved.kitchenLocations);
  assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(next)), next);
  assert.deepEqual(saved, original);
});

test('insert shelf handles first, last, unnamed and empty shelves and rejects stale indices', () => {
  const saved = { shelfCount: 3, items: [item()] };
  for (const index of [0, 2]) {
    const next = layout.insertPantryShelfBelow(saved, index);
    assert.equal(next.shelfCount, 4);
    assert.deepEqual(next.items, saved.items);
    assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(next)), next);
  }
  const empty = { shelfCount: 3, items: [] };
  assert.deepEqual(layout.insertPantryShelfBelow(empty, 0), { shelfCount: 4, items: [] });
  for (const index of [-1, 3, NaN, 0.5]) assert.equal(layout.insertPantryShelfBelow(saved, index), saved);
});


test('removing an empty middle shelf moves lower stock and signs up without losing details', () => {
  const saved = { shelfCount: 4, kitchenLocations: ['Cocina'], shelfLabels: {
    0: { name: 'Galletas', emoji: '🍪' }, 1: { name: 'Vacía', emoji: null },
    2: { name: 'Botes', emoji: '🥫' }, 3: { name: 'Otros', emoji: null },
  }, items: [0, 2, 3].map(index => item({ instanceId: `row-${index}`,
    ...measuredSlot(0, index, 4), quantity: 7, expiryDate: '2027-01-01', notes: 'Guardar', kitchenLocation: 'Cocina' })) };
  const original = structuredClone(saved);
  assert.deepEqual(layout.removablePantryShelfIndices(saved), [0, 1, 2, 3]);
  const next = layout.removePantryShelf(saved, 1);
  assert.equal(next.shelfCount, 3);
  assert.deepEqual(next.shelfLabels, { 0: saved.shelfLabels[0], 1: saved.shelfLabels[2], 2: saved.shelfLabels[3] });
  assert.deepEqual(next.items, saved.items.map(entry => entry.shelfIndex === 0 ? entry : {
    ...entry, shelfIndex: entry.shelfIndex - 1,
    y: layout.pantryShelfSurfaceY(entry.shelfIndex - 1) - entry.size * layout.PANTRY_ASPECT_RATIO / 2,
  }));
  assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(next)), next);
  assert.deepEqual(saved, original);
});

test('empty first and last shelves can be removed down to one and remain removed after reload', () => {
  for (const index of [0, 2]) {
    const saved = { shelfCount: 3, items: [item({ ...measuredSlot(0, 1) })] };
    const next = layout.removePantryShelf(saved, index);
    assert.equal(next.shelfCount, 2);
    assert.deepEqual(next.items.map(i => i.shelfIndex), [index === 0 ? 0 : 1]);
    assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(next)), next);
  }
  let empty = { shelfCount: 3, items: [] };
  for (const shelfCount of [2, 1]) {
    empty = layout.removePantryShelf(empty, 0);
    assert.equal(empty.shelfCount, shelfCount);
    assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(empty)), empty);
  }
  assert.equal(layout.removePantryShelf(empty, 0), empty);
  assert.deepEqual(layout.removablePantryShelfIndices(empty), []);
  assert.equal(layout.insertPantryShelfBelow(empty, 0).shelfCount, 2);
});

test('removing occupied first, middle and last shelves deletes all their stock and preserves neighbours', () => {
  for (const index of [0, 1, 2]) {
    const saved = { shelfCount: 3, kitchenLocations: ['Cocina'],
      shelfLabels: Object.fromEntries([0, 1, 2].map(i => [i, { name: `Balda ${i}`, emoji: null }])),
      items: [0, 1, 2].flatMap(i => [false, true].map(pendingPlacement => item({
        instanceId: `${i}-${pendingPlacement}`, ...measuredSlot(pendingPlacement ? 1 : 0, i),
        ...(pendingPlacement ? { pendingPlacement: true } : {}), quantity: 5, notes: 'Conservar', expiryDate: '2027-01-01', kitchenLocation: 'Cocina',
      }))) };
    const original = structuredClone(saved);
    const next = layout.removePantryShelf(saved, index);
    assert.equal(next.shelfCount, 2);
    assert.equal(next.items.length, 4);
    assert.deepEqual(next.items, layout.normalizePantryItems(saved.items.filter(entry => entry.shelfIndex !== index).map(entry =>
      entry.shelfIndex < index ? entry : { ...entry, shelfIndex: entry.shelfIndex - 1,
        y: layout.pantryShelfSurfaceY(entry.shelfIndex - 1) - entry.size * layout.PANTRY_ASPECT_RATIO / 2 }), 2));
    assert.deepEqual(Object.values(next.shelfLabels).map(label => label.name),
      [0, 1, 2].filter(i => i !== index).map(i => `Balda ${i}`));
    assert.deepEqual(next.kitchenLocations, saved.kitchenLocations);
    assert.deepEqual(layout.decodePantryLayout(layout.encodePantryLayout(next)), next);
    assert.deepEqual(saved, original);
  }
});

test('legacy top-shelf products are deleted, while invalid indices and the last shelf remain protected', () => {
  const saved = { shelfCount: 3, items: [item({ shelfIndex: undefined })] };
  assert.deepEqual(layout.removePantryShelf(saved, 0).items, []);
  for (const index of [-1, 3, NaN, .5]) assert.equal(layout.removePantryShelf(saved, index), saved);
  assert.deepEqual(layout.removablePantryShelfIndices(saved), [0, 1, 2]);
  const last = { ...saved, shelfCount: 1 };
  assert.equal(layout.removePantryShelf(last, 0), last);
});

test('sign ownership is derived from shelf order, stops at the next sign and follows label edits', () => {
  const labels = { 1: { name: 'Desayuno', emoji: null }, 3: { name: '', emoji: '🥫' } };
  assert.deepEqual([0, 1, 2, 3, 4].map(index => layout.pantryShelfGroupIndex(index, 5, labels)), [null, 1, 1, 3, 3]);
  for (const index of [-1, 5, 1.5, NaN]) assert.equal(layout.pantryShelfGroupIndex(index, 5, labels), null);
  assert.equal(layout.pantryShelfGroupIndex(2, 5), null);
  const saved = { items: [], shelfCount: 5, shelfLabels: labels };
  const removed = layout.updatePantryShelfLabel(saved, 3, null);
  assert.equal(layout.pantryShelfGroupIndex(4, 5, removed.shelfLabels), 1);
  const inserted = layout.updatePantryShelfLabel(saved, 2, { name: 'Nuevo', emoji: null });
  assert.equal(layout.pantryShelfGroupIndex(2, 5, inserted.shelfLabels), 2);
});
