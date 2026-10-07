import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizePantryItems, PANTRY_DEFAULT_SHELF_COUNT, type PantryItem, type PantryLayout } from '../lib/pantryLayout';
import { readPantryLayout, writePantryLayout } from '../lib/pantryStorage';

/** The owning screen is keyed by account, including its in-memory edits. */
export function usePantryLayout(userId: string | null) {
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
    if (userId) readPantryLayout(userId).then((saved) => {
      if (cancelled) return;
      current.current = saved;
      setLayout(saved);
      setReady(true);
    }).catch(() => { if (!cancelled) setLoadError(true); });
    return () => { cancelled = true; mounted.current = false; };
  }, [userId, attempt]);

  const persist = useCallback((next: PantryLayout) => {
    if (!userId) return;
    const version = ++revision.current;
    void writePantryLayout(userId, next).then(() => {
      if (mounted.current && revision.current === version) setSaveError(false);
    }).catch(() => {
      if (mounted.current && revision.current === version) setSaveError(true);
    });
  }, [userId]);

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
    const next = { shelfCount, items: normalizePantryItems(current.current.items, shelfCount) };
    current.current = next;
    setLayout(next);
    persist(next);
  }, [persist, ready, userId]);

  return {
    ...layout, ready, loadError, saveError, update, addShelf,
    retryLoad: () => setAttempt((n) => n + 1),
    retrySave: () => persist(current.current),
  };
}
