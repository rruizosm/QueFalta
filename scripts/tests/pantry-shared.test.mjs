import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
  const source = ts.transpileModule(readFileSync(new URL(`../../src/${path}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(globals), source)(name => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  }, module, module.exports, ...Object.values(globals));
  return module.exports;
}
const layout = load('lib/pantryLayout');
const merge = load('lib/pantryMerge', { './pantryLayout': layout });
const empty = () => ({ items: [], shelfCount: 3 });
const product = { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' };
const item = (id, notes = '') => ({ instanceId: id, product, x: .3, y: .2, size: .2, shelfIndex: 0, quantity: 1, notes });
const stock = (...items) => ({ ...empty(), items });
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };

test('concurrent additions survive, and edits merge by field without resurrecting deletions', () => {
  const before = stock(item('milk'));
  const local = stock({ ...item('milk'), notes: 'Abierta' }, item('bread'));
  const remote = stock({ ...item('milk'), quantity: 4 }, item('rice'));
  const result = merge.mergePantryLayout(before, local, remote);
  assert.deepEqual(result.items.map(entry => entry.instanceId), ['milk', 'rice', 'bread']);
  assert.equal(result.items[0].notes, 'Abierta');
  assert.equal(result.items[0].quantity, 4);
  assert.deepEqual(merge.mergePantryLayout(before, local, empty()).items.map(entry => entry.instanceId), ['bread']);
  assert.deepEqual(merge.mergePantryLayout(before, empty(), remote).items.map(entry => entry.instanceId), ['rice']);
});

test('shared shelf removal commits stock deletion together with the structural change and rejects stale stock', () => {
  const before = { ...stock(item('milk'), { ...item('bread'), shelfIndex: 1 }),
    shelfLabels: { 0: { name: 'Lácteos', emoji: null }, 1: { name: 'Pan', emoji: null } } };
  const after = layout.removePantryShelf(before, 0);
  const merged = merge.mergePantryLayout(before, after, before);
  assert.equal(merged.shelfCount, 2);
  assert.deepEqual(merged.items.map(entry => entry.instanceId), ['bread']);
  assert.equal(merged.items[0].shelfIndex, 0);
  assert.deepEqual(merged.shelfLabels, { 0: before.shelfLabels[1] });
  assert.deepEqual(merge.mergePantryLayout(before, after, merged), merged);
  assert.throws(() => merge.mergePantryLayout(before, after,
    { ...before, items: [...before.items, item('new-milk')] }), merge.PantryConflictError);
});

test('concurrent label edits survive; incompatible shelf structures cannot overwrite stock', () => {
  const before = stock(item('milk'));
  const local = { ...before, shelfLabels: { 0: { name: 'Lácteos', emoji: '🥛' } } };
  const remote = { ...before, shelfLabels: { 2: { name: 'Otros', emoji: '🍚' } } };
  assert.deepEqual(merge.mergePantryLayout(before, local, remote).shelfLabels, { ...local.shelfLabels, ...remote.shelfLabels });
  assert.throws(() => merge.mergePantryLayout(before, { ...before, shelfCount: 4 }, stock(item('rice'))), merge.PantryConflictError);
  assert.throws(() => merge.mergePantryLayout(before, local, { ...before, shelfCount: 2 }), merge.PantryConflictError);
  // Canonical serialization handles normalized/omitted empty metadata.
  assert.equal(merge.mergePantryLayout({ ...before, shelfLabels: {} }, { ...before, shelfLabels: {}, shelfCount: 4 }, before).shelfCount, 4);
});

function environment(disk = new Map(), database = new Map()) {
  let active, failSave = false, revoke = false, race, delayedRead, delayNextRead = false;
  const subscribers = new Set();
  const localReads = [];
  const writes = [];
  const react = {
    useRef(initial) { const i = active.cursor++; return active.slots[i] ??= { current: initial }; },
    useState(initial) { const h = active, i = h.cursor++; if (!(i in h.slots)) h.slots[i] = initial;
      return [h.slots[i], value => { if (h.unmounted) h.lateUpdates++; h.slots[i] = typeof value === 'function' ? value(h.slots[i]) : value; }]; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useMemo(fn, deps) { const h = active, i = h.cursor++;
      if (!h.memos[i] || deps.some((value, index) => !Object.is(value, h.memos[i].deps[index]))) h.memos[i] = { value: fn(), deps };
      return h.memos[i].value; },
    useEffect(fn, deps) { const h = active, i = h.cursor++;
      if (!h.deps[i] || deps.some((value, index) => !Object.is(value, h.deps[i][index]))) {
        h.deps[i] = deps; h.effects.push(() => { h.cleanups[i]?.(); h.cleanups[i] = fn(); });
      }
    },
  };
  const api = {
    async fetchGroupPantry(group, section) {
      if (revoke) throw Object.assign(new Error('denied'), { code: '42501' });
      const snapshot = database.get(`${group}:${section}`) ?? { layout: empty(), revision: 0 };
      const result = structuredClone(snapshot);
      if (delayNextRead) { delayNextRead = false; return new Promise(resolve => { delayedRead = () => resolve(result); }); }
      return result;
    },
    async compareAndSetGroupPantry(group, section, revision, next) {
      if (failSave) throw new Error('offline');
      if (race) { const fn = race; race = null; fn(); }
      const key = `${group}:${section}`, current = database.get(key);
      if ((current?.revision ?? 0) !== revision) return null;
      const normalized = layout.decodePantryLayout(layout.encodePantryLayout(next));
      database.set(key, { layout: normalized, revision: revision + 1 });
      writes.push({ group, section, revision: revision + 1 });
      for (const fn of subscribers) queueMicrotask(fn);
      return revision + 1;
    },
    subscribeGroupPantry(group, section, fn) { subscribers.add(fn); return () => subscribers.delete(fn); },
  };
  const { usePantryInventory } = load('hooks/usePantryInventory', {
    react,
    '@react-native-async-storage/async-storage': { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); } },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    '@react-navigation/native': { useFocusEffect() {} },
    './usePantryLayout': { usePantryLayout(user, section) { localReads.push({ user, section }); return { ...empty(), ready: true }; } },
    '../api/groupPantry': api,
    '../api/pantry': { fetchPantryImageUrls: async () => new Map() },
    '../lib/pantryImages': load('lib/pantryImages'),
    '../lib/pantryMerge': merge,
    '../lib/pantryLayout': layout,
  }, { setInterval: () => 1, clearInterval() {} });
  return { database, disk, writes, localReads,
    delayRead() { delayNextRead = true; }, releaseRead() { delayedRead?.(); },
    fail(value) { failSave = value; }, revoke(value) { revoke = value; }, race(fn) { race = fn; },
    notify() { for (const fn of subscribers) fn(); },
    mount(user, group, section = 'pantry', maxShelfCount = Infinity) {
      const h = { cursor: 0, slots: [], memos: [], deps: [], effects: [], cleanups: [], unmounted: false, lateUpdates: 0 };
      return { h, render() { active = h; h.cursor = 0; const result = usePantryInventory(user, section, group, maxShelfCount); h.effects.splice(0).forEach(fn => fn()); return result; },
        unmount() { h.unmounted = true; h.cleanups.forEach(fn => fn?.()); } };
    },
  };
}

test('two members see additions/edits/deletions; CAS conflict retries preserve another addition', async () => {
  const env = environment();
  const a = env.mount('alice', 'home'), b = env.mount('bob', 'home');
  a.render(); b.render(); await settle();
  env.race(() => env.database.set('home:pantry', { layout: stock(item('rice')), revision: 1 }));
  a.render().update(items => [...items, item('milk')]); await settle();
  assert.deepEqual(b.render().items.map(entry => entry.instanceId).sort(), ['milk', 'rice']);
  b.render().update(items => items.map(entry => entry.instanceId === 'milk' ? { ...entry, notes: 'Abierta', quantity: 3 } : entry));
  await settle();
  assert.equal(a.render().items.find(entry => entry.instanceId === 'milk').notes, 'Abierta');
  a.render().update(items => items.filter(entry => entry.instanceId !== 'rice')); await settle();
  assert.deepEqual(b.render().items.map(entry => entry.instanceId), ['milk']);
  assert.ok(env.localReads.every(read => read.user === null));
  a.unmount(); b.unmount();
});

test('group, account and fridge isolation; old requests never update an unmounted owner', async () => {
  const env = environment();
  const a = env.mount('alice', 'home'); a.render(); await settle();
  a.render().update(items => [...items, item('milk')]); a.unmount();
  const other = env.mount('alice', 'office'), fridge = env.mount('alice', 'home', 'fridge');
  other.render(); fridge.render(); await settle();
  assert.equal(other.render().items.length, 0); assert.equal(fridge.render().items.length, 0);
  assert.equal(a.h.lateUpdates, 0);
  const personal = env.mount('bob', null); personal.render();
  assert.ok(env.localReads.some(read => read.user === 'bob'));
  other.unmount(); fridge.unmount(); personal.unmount();
});

test('pending edits survive restart and retry without touching another account or group', async () => {
  const first = environment(); first.fail(true);
  const a = first.mount('alice', 'home'); a.render(); await settle();
  a.render().update(items => [...items, item('milk')]); await settle();
  assert.equal(a.render().saveError, true); a.unmount();
  const restarted = environment(first.disk, first.database);
  const other = restarted.mount('bob', 'office'); other.render(); await settle();
  assert.equal(other.render().items.length, 0);
  const restored = restarted.mount('alice', 'home'); restored.render(); await settle();
  assert.equal(restored.render().saveError, false);
  assert.deepEqual(restored.render().items.map(entry => entry.instanceId), ['milk']);
  assert.equal(restarted.database.get('home:pantry').layout.items.length, 1);
  assert.ok([...first.disk.values()].every(raw => JSON.parse(raw).length === 0));
  restored.unmount(); other.unmount();
});

test('rapid queued changes persist in order; failed saves can retry', async () => {
  const env = environment(), a = env.mount('alice', 'home'); a.render(); await settle();
  env.fail(true);
  a.render().update(items => [...items, item('milk')]);
  a.render().update(items => items.map(entry => ({ ...entry, notes: 'Nota' })));
  await settle(); assert.equal(a.render().saveError, true);
  env.fail(false); a.render().retrySave(); await settle();
  assert.equal(a.render().saveError, false);
  assert.equal(env.database.get('home:pantry').layout.items[0].notes, 'Nota');
  assert.equal(env.database.get('home:pantry').layout.items.length, 1);
  a.unmount();
});

test('conflicting shelf changes require explicit discard; revocation hides stock and blocks edits', async () => {
  const env = environment(), a = env.mount('alice', 'home'); a.render(); await settle();
  env.database.set('home:pantry', { layout: stock(item('remote')), revision: 1 });
  a.render().addShelf(); await settle();
  assert.equal(a.render().conflict, true); assert.equal(a.render().ready, false);
  a.render().retryLoad(); await settle();
  assert.equal(a.render().conflict, false); assert.equal(a.render().shelfCount, 3);
  assert.equal(a.render().items[0].instanceId, 'remote');
  env.revoke(true); env.notify(); await settle();
  assert.equal(a.render().ready, false); assert.equal(a.render().items.length, 0);
  a.render().update(items => [...items, item('forbidden')]); await settle();
  assert.equal(env.writes.length, 0); a.unmount();
});

test('expiry reminders follow the active group and disabling them works offline', async () => {
  const data = new Map([['activeCart:alice', JSON.stringify({ groupId: 'home' })]]);
  const scheduled = [], cancelled = [], reads = [];
  let enabled = true, offline = false;
  const future = { ...item('same-id'), expiryDate: '2099-01-01' };
  const { syncPantryExpiryNotifications } = load('lib/pantryExpiryNotifications', {
    '@react-native-async-storage/async-storage': { getItem: async key => data.get(key) ?? null,
      setItem: async (key, value) => { data.set(key, value); } },
    'react-native': { Platform: { OS: 'ios' } },
    'expo-notifications': {
      SchedulableTriggerInputTypes: { DATE: 'date' },
      getAllScheduledNotificationsAsync: async () => scheduled.filter(request => !cancelled.includes(request.identifier)),
      cancelScheduledNotificationAsync: async id => { cancelled.push(id); },
      scheduleNotificationAsync: async request => {
        const id = `notification-${scheduled.length}`;
        scheduled.push({ ...request, identifier: id }); return id;
      },
    },
    '../i18n': { t: key => key },
    './notifications': { getNotificationsEnabled: async () => enabled, hasPermission: async () => true },
    './pantryStorage': { readPantryLayout: async user => { reads.push(user); return empty(); } },
    '../api/groupPantry': { fetchGroupPantry: async (group, section) => {
      if (offline) throw new Error('offline');
      reads.push(`${group}:${section}`); return { layout: section === 'pantry' ? stock(future) : empty() };
    } },
    './pantryLayout': layout,
  });
  await syncPantryExpiryNotifications('alice');
  assert.deepEqual(reads.sort(), ['home:fridge', 'home:pantry']);
  assert.equal(scheduled[0].content.data.notificationKey, 'pantry:group:home:same-id');
  await syncPantryExpiryNotifications('alice', { groupId: 'office', pantry: stock(future), fridge: empty() });
  assert.ok(cancelled.includes('notification-0'));
  assert.equal(scheduled[1].content.data.notificationKey, 'pantry:group:office:same-id');
  enabled = false; offline = true;
  await syncPantryExpiryNotifications('alice');
  assert.ok(cancelled.includes('notification-1'));
});


test('a slow refresh cannot replace a more recently saved edit', async () => {
  const env = environment(), a = env.mount('alice', 'home'); a.render(); await settle();
  a.render().update(items => [...items, item('milk')]); await settle();
  env.delayRead(); env.notify(); await settle();
  a.render().update(items => items.map(entry => ({ ...entry, notes: 'Reciente' })));
  await settle(); env.releaseRead(); await settle();
  assert.equal(a.render().items[0].notes, 'Reciente');
  assert.equal(env.database.get('home:pantry').layout.items[0].notes, 'Reciente');
  a.unmount();
});

test('manual shelf gaps persist in the group and are shown at the same x to another member', async () => {
  const env = environment(), a = env.mount('alice', 'home'), b = env.mount('bob', 'home');
  a.render(); b.render(); await settle();
  a.render().update(items => [...items, { ...item('milk'), x: .8, manualPosition: true }]);
  await settle();
  assert.equal(b.render().items[0].x, .8);
  assert.equal(env.database.get('home:pantry').layout.items[0].manualPosition, true);
  a.unmount(); b.unmount();
});


test('shared free shelves stop at two even with rapid actions; Plus can grow and legacy stock is preserved', async () => {
  const env = environment();
  for (const section of ['pantry', 'fridge']) {
    env.database.set(`home:${section}`, { layout: { items: [], shelfCount: 1 }, revision: 0 });
    const free = env.mount('alice', 'home', section, 2);
    free.render(); await settle();
    const actions = free.render();
    actions.addShelf(); actions.addShelf(); actions.insertShelfBelow(0);
    await settle();
    assert.equal(free.render().shelfCount, 2);
    free.unmount();
    const plus = env.mount('alice', 'home', section);
    plus.render(); await settle();
    plus.render().insertShelfBelow(0); await settle();
    plus.render().addShelf(); await settle();
    assert.equal(plus.render().shelfCount, 4);
    plus.unmount();
    const expired = env.mount('alice', 'home', section, 2);
    expired.render(); await settle();
    expired.render().addShelf(); expired.render().insertShelfBelow(0); await settle();
    assert.equal(expired.render().shelfCount, 4);
    expired.unmount();
  }
});
