import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchPantryImageUrls } from '../api/pantry';
import { refreshPantryItemImages } from '../lib/pantryImages';
import { normalizePantryItems, insertPantryShelfBelow, removePantryShelf, removablePantryShelfIndices, updatePantryShelfLabel, updatePantryImageBounds, PANTRY_DEFAULT_SHELF_COUNT,
  type PantryItem, type PantryLayout, type PantrySection, type PantryShelfLabel } from '../lib/pantryLayout';
import type { PantryVisibleBounds } from '../lib/pantryVisibleBounds';
import { readPantryLayout, writePantryLayout } from '../lib/pantryStorage';

/** The owning screen is keyed by account and keeps one stable hook instance per section. */
export function usePantryLayout(userId: string | null, section: PantrySection = 'pantry', maxShelfCount = Infinity) {
  const [layout, setLayout] = useState<PantryLayout>({ items: [], shelfCount: PANTRY_DEFAULT_SHELF_COUNT });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const current = useRef(layout);
  const mounted = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    mounted.current = true;
    setLoadError(false);
    let cancelled = false;
    if (userId) readPantryLayout(userId, section).then((saved) => {
      if (cancelled) return;
      current.current = saved;
      setLayout(saved);
      setReady(true);
    }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; mounted.current = false; };
  }, [userId, section, attempt]);

  const persist = useCallback((next: PantryLayout) => {
    if (!userId) return;
    const version = ++revision.current;
    void writePantryLayout(userId, next, section).then(() => {
      if (mounted.current && revision.current === version) setSaveError(false);
    }).catch(() => {
      if (mounted.current && revision.current === version) setSaveError(true);
    });
  }, [userId, section]);

  useFocusEffect(useCallback(() => {
    if (!ready || !userId) return;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const requested = current.current.items;
      const contents = new Map<string, string | null>();
      void fetchPantryImageUrls(requested.map((item) => item.product), request.signal, contents).then((urls) => {
        if (request.signal.aborted || !mounted.current) return;
        const items = refreshPantryItemImages(current.current.items, requested, urls, contents);
        if (items === current.current.items) return;
        const next = { ...current.current, items: normalizePantryItems(items, current.current.shelfCount) };
        current.current = next;
        setLayout(next);
        persist(next);
      }).catch(() => { /* Keep saved images offline; retry on next focus/foreground. */ });
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
      else controller?.abort();
    });
    return () => { controller?.abort(); subscription.remove(); };
  }, [ready, userId, persist]));

  const update = useCallback((change: (previous: PantryItem[]) => PantryItem[]) => {
    if (!mounted.current || !ready || !userId) return;
    const changed = change(current.current.items);
    if (changed === current.current.items) return;
    const next = { ...current.current, items: normalizePantryItems(changed, current.current.shelfCount) };
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId]);

  const setImageBounds = useCallback((url: string, bounds: PantryVisibleBounds) => {
    update(previous => updatePantryImageBounds(previous, url, bounds));
  }, [update]);

  const addShelf = useCallback(() => {
    if (!mounted.current || !ready || !userId || current.current.shelfCount >= maxShelfCount) return;
    const shelfCount = current.current.shelfCount + 1;
    const next = { ...current.current, shelfCount, items: normalizePantryItems(current.current.items, shelfCount) };
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId, maxShelfCount]);

  const insertShelfBelow = useCallback((index: number) => {
    if (!mounted.current || !ready || !userId || current.current.shelfCount >= maxShelfCount) return;
    const next = insertPantryShelfBelow(current.current, index);
    if (next === current.current) return;
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId, maxShelfCount]);

  const removeShelf = useCallback((index: number) => {
    if (!mounted.current || !ready || !userId) return;
    const next = removePantryShelf(current.current, index);
    if (next === current.current) return;
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId]);

  const setShelfLabel = useCallback((index: number, label: PantryShelfLabel | null) => {
    if (!mounted.current || !ready || !userId) return;
    const next = updatePantryShelfLabel(current.current, index, label);
    if (next === current.current) return;
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId]);

  const setKitchenLocations = useCallback((kitchenLocations: string[], previousLocations: string[], removedIndex?: number) => {
    if (!mounted.current || !ready || !userId) return;
    const items = current.current.items.map((item) => {
      if (removedIndex !== undefined) {
        return item.kitchenLocation === previousLocations[removedIndex] ? { ...item, kitchenLocation: '' } : item;
      }
      const index = previousLocations.indexOf(item.kitchenLocation ?? '');
      return index >= 0 && kitchenLocations[index] !== undefined && kitchenLocations[index] !== item.kitchenLocation
        ? { ...item, kitchenLocation: kitchenLocations[index] } : item;
    });
    const next = { ...current.current, items, kitchenLocations };
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId]);

  return {
    ...layout, removableShelfIndices: removablePantryShelfIndices(layout), removeShelf, ready, loadError, saveError, update, setImageBounds, addShelf, insertShelfBelow, setShelfLabel, setKitchenLocations,
    retryLoad: () => setAttempt((n) => n + 1),
    retrySave: () => persist(current.current),
  };
}
