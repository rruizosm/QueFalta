import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizePantryItems, updatePantryShelfLabel, PANTRY_DEFAULT_SHELF_COUNT,
  type PantryItem, type PantryLayout, type PantrySection, type PantryShelfLabel } from '../lib/pantryLayout';
import { readPantryLayout, writePantryLayout } from '../lib/pantryStorage';

/** The owning screen is keyed by account and keeps one stable hook instance per section. */
export function usePantryLayout(userId: string | null, section: PantrySection = 'pantry') {
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

  const update = useCallback((change: (previous: PantryItem[]) => PantryItem[]) => {
    if (!mounted.current || !ready || !userId) return;
    const changed = change(current.current.items);
    if (changed === current.current.items) return;
    const next = { ...current.current, items: normalizePantryItems(changed, current.current.shelfCount) };
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId]);

  const addShelf = useCallback(() => {
    if (!mounted.current || !ready || !userId) return;
    const shelfCount = current.current.shelfCount + 1;
    const next = { ...current.current, shelfCount, items: normalizePantryItems(current.current.items, shelfCount) };
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
    ...layout, ready, loadError, saveError, update, addShelf, setShelfLabel, setKitchenLocations,
    retryLoad: () => setAttempt((n) => n + 1),
    retrySave: () => persist(current.current),
  };
}
