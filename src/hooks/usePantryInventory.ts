import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { usePantryLayout } from './usePantryLayout';
import { fetchGroupPantry, compareAndSetGroupPantry, subscribeGroupPantry } from '../api/groupPantry';
import { fetchPantryImageUrls } from '../api/pantry';
import { refreshPantryItemImages } from '../lib/pantryImages';
import { mergePantryLayout, PantryConflictError } from '../lib/pantryMerge';
import { normalizePantryItems, insertPantryShelfBelow, removePantryShelf, removablePantryShelfIndices,
  updatePantryShelfLabel, updatePantryImageBounds, PANTRY_DEFAULT_SHELF_COUNT,
  decodePantryLayout, encodePantryLayout, type PantryLayout, type PantrySection, type PantryShelfLabel, type PantryItem } from '../lib/pantryLayout';
import type { PantryVisibleBounds } from '../lib/pantryVisibleBounds';

type Edit = { before: PantryLayout; after: PantryLayout };
// Durable pending edits, isolated by account/group/section, also survive app restarts.
const drafts = new Map<string, Edit[]>();
const storageQueues = new Map<string, Promise<void>>();
const loadingDrafts = new Map<string, Promise<void>>();
const outboxKey = (key: string) => `@group_pantry_pending:v1:${key}`;
function storeDrafts(key: string): Promise<void> {
  const snapshot = JSON.stringify((drafts.get(key) ?? []).map(edit => ({ before: encodePantryLayout(edit.before), after: encodePantryLayout(edit.after) })));
  const write = (storageQueues.get(key) ?? Promise.resolve()).catch(() => {}).then(() => AsyncStorage.setItem(outboxKey(key), snapshot));
  storageQueues.set(key, write);
  const cleanup = () => { if (storageQueues.get(key) === write) storageQueues.delete(key); };
  void write.then(cleanup, cleanup);
  return write;
}
function loadDrafts(key: string): Promise<void> {
  if (drafts.has(key)) return Promise.resolve();
  const existing = loadingDrafts.get(key);
  if (existing) return existing;
  const read = AsyncStorage.getItem(outboxKey(key)).then(raw => {
    const saved = raw ? JSON.parse(raw) as { before: string; after: string }[] : [];
    if (!Array.isArray(saved)) throw new Error('Invalid pantry draft');
    drafts.set(key, saved.map(edit => ({ before: decodePantryLayout(edit.before), after: decodePantryLayout(edit.after) })));
  }).finally(() => { loadingDrafts.delete(key); });
  loadingDrafts.set(key, read);
  return read;
}
const queues = new Map<string, Promise<void>>();

function useSharedPantry(userId: string | null, groupId: string | null, section: PantrySection, maxShelfCount = Infinity) {
  const [layout, setLayout] = useState<PantryLayout>({ items: [], shelfCount: PANTRY_DEFAULT_SHELF_COUNT });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [conflict, setConflict] = useState(false);
  const current = useRef(layout);
  const generation = useRef(0);
  const alive = useRef(false);
  const key = `${userId}:${groupId}:${section}`;
  const publish = useCallback((next: PantryLayout) => {
    if (encodePantryLayout(current.current) === encodePantryLayout(next)) return;
    current.current = next;
    setLayout(next);
  }, []);

  const flush = useCallback(async () => {
    if (!userId || !groupId) return;
    const edits = drafts.get(key) ?? [];
    const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
      await storeDrafts(key);
      while (edits.length) {
        const edit = edits[0];
        let saved = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          const remote = await fetchGroupPantry(groupId, section);
          const merged = mergePantryLayout(edit.before, edit.after, remote.layout);
          const next = { ...merged, items: normalizePantryItems(merged.items, merged.shelfCount) };
          const revision = await compareAndSetGroupPantry(groupId, section, remote.revision, next);
          if (revision === null) continue;
          edits.shift();
          await storeDrafts(key);
          saved = true;
          generation.current++;
          if (!edits.length && alive.current) publish(next);
          break;
        }
        if (!saved) throw new Error('Pantry busy');
      }
    });
    queues.set(key, run);
    try {
      await run;
      if (alive.current) { setSaveError(false); setConflict(false); }
    } catch (error) {
      if (alive.current) { setSaveError(true); setConflict(error instanceof PantryConflictError); }
    } finally {
      if (queues.get(key) === run) queues.delete(key);
    }
  }, [userId, groupId, section, key, publish]);

  const refresh = useCallback(async () => {
    if (!userId || !groupId) return;
    const request = ++generation.current;
    try {
      await loadDrafts(key);
      await queues.get(key)?.catch(() => {});
      const remote = await fetchGroupPantry(groupId, section);
      if (!alive.current || request !== generation.current) return;
      let next = remote.layout;
      for (const edit of drafts.get(key) ?? []) next = mergePantryLayout(edit.before, edit.after, next);
      publish(next);
      setReady(true);
      setLoadError(false);
      if (drafts.get(key)?.length) void flush();
    } catch (error) {
      if (alive.current && request === generation.current) {
        setLoadError(true);
        const code = (error as { code?: string })?.code;
        if (code === '42501' || code === 'PGRST116') publish({ items: [], shelfCount: PANTRY_DEFAULT_SHELF_COUNT });
        if (error instanceof PantryConflictError) { setConflict(true); setSaveError(true); }
      }
    }
  }, [userId, groupId, section, key, publish, flush]);

  useEffect(() => {
    if (!userId || !groupId) return;
    alive.current = true;
    void refresh();
    const unsubscribe = subscribeGroupPantry(groupId, section, () => { void refresh(); });
    const app = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    // Recovery for lost websocket events or membership revocation while open.
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    return () => { alive.current = false; unsubscribe(); app.remove(); clearInterval(timer); };
  }, [userId, groupId, section, refresh]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const change = useCallback((transform: (previous: PantryLayout) => PantryLayout) => {
    if (!alive.current || !ready || loadError || conflict) return;
    const before = current.current;
    const after = transform(before);
    if (after === before) return;
    generation.current++;
    const edits = drafts.get(key) ?? [];
    edits.push({ before, after });
    drafts.set(key, edits);
    publish(after);
    void storeDrafts(key).catch(() => { if (alive.current) setSaveError(true); });
    void flush();
  }, [ready, loadError, conflict, key, publish, flush]);
  const update = useCallback((transform: (items: PantryItem[]) => PantryItem[]) => change(previous => {
    const items = transform(previous.items);
    return items === previous.items ? previous : { ...previous, items: normalizePantryItems(items, previous.shelfCount) };
  }), [change]);
  useFocusEffect(useCallback(() => {
    if (!userId || !groupId || !ready) return;
    let controller: AbortController | undefined;
    const refreshImages = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const requested = current.current.items;
      const contents = new Map<string, string | null>();
      void fetchPantryImageUrls(requested.map(item => item.product), request.signal, contents).then(urls => {
        if (!request.signal.aborted && alive.current) update(items => refreshPantryItemImages(items, requested, urls, contents));
      }).catch(() => { /* Keep saved images and retry at the next focus/foreground. */ });
    };
    refreshImages();
    const app = AppState.addEventListener('change', state => {
      if (state === 'active') refreshImages(); else controller?.abort();
    });
    return () => { controller?.abort(); app.remove(); };
  }, [userId, groupId, ready, update]));

  const actions = useMemo(() => ({
    setImageBounds: (url: string, bounds: PantryVisibleBounds) => update(items => updatePantryImageBounds(items, url, bounds)),
    addShelf: () => change(previous => {
      if (previous.shelfCount >= maxShelfCount) return previous;
      const shelfCount = previous.shelfCount + 1;
      return { ...previous, shelfCount, items: normalizePantryItems(previous.items, shelfCount) };
    }),
    insertShelfBelow: (index: number) => change(previous => previous.shelfCount >= maxShelfCount ? previous : insertPantryShelfBelow(previous, index)),
    removeShelf: (index: number) => change(previous => removePantryShelf(previous, index)),
    setShelfLabel: (index: number, label: PantryShelfLabel | null) => change(previous => updatePantryShelfLabel(previous, index, label)),
  }), [change, update, maxShelfCount]);
  return { ...layout, ready: ready && !loadError && !conflict, loadError, saveError, conflict,
    removableShelfIndices: removablePantryShelfIndices(layout), update,
    ...actions,
    setKitchenLocations: (locations: string[], previousLocations: string[], removedIndex?: number) => change(previous => ({
      ...previous, kitchenLocations: locations, items: previous.items.map(item => {
        if (removedIndex !== undefined) return item.kitchenLocation === previousLocations[removedIndex] ? { ...item, kitchenLocation: '' } : item;
        const index = previousLocations.indexOf(item.kitchenLocation ?? '');
        return index >= 0 && locations[index] !== undefined ? { ...item, kitchenLocation: locations[index] } : item;
      }),
    })),
    retryLoad: () => {
      if (conflict) {
        void (async () => {
          await queues.get(key)?.catch(() => {});
          const pending = drafts.get(key);
          if (pending) pending.length = 0;
          await storeDrafts(key);
          if (!alive.current) return;
          generation.current++;
          setConflict(false); setSaveError(false);
          await refresh();
        })().catch(() => { if (alive.current) setSaveError(true); });
      } else void refresh();
    }, retrySave: () => { void flush(); },
  };
}

/** Screen owner remounts synchronously whenever the account or active group changes. */
export function usePantryInventory(userId: string | null, section: PantrySection, groupId: string | null, maxShelfCount = Infinity) {
  const local = usePantryLayout(groupId ? null : userId, section, maxShelfCount);
  const shared = useSharedPantry(userId, groupId, section, maxShelfCount);
  return groupId ? shared : { ...local, conflict: false };
}
