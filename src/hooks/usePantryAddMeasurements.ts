import { useCallback, useEffect, useMemo, useState } from 'react';
import { pantryImageBoundsCache } from '../components/PantryImageBoundsProbe';
import type { PantryProduct } from '../lib/pantryLayout';
import type { PantryVisibleBounds } from '../lib/pantryVisibleBounds';

/** Measure the selection before reserving any shelf space. Never commit fallback boxes. */
export function usePantryAddMeasurements(products: readonly PantryProduct[]) {
  const key = JSON.stringify([...new Set(products.map(product => product.illustrationUrl))]);
  const urls = useMemo<string[]>(() => JSON.parse(key), [key]);
  const [measured, setMeasured] = useState(() => new Map<string, PantryVisibleBounds>());
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onBounds = useCallback((url: string, bounds: PantryVisibleBounds) => {
    setMeasured(previous => {
      if (previous.get(url) === bounds) return previous;
      return new Map(previous).set(url, bounds);
    });
  }, []);
  const bounds = new Map<string, PantryVisibleBounds>();
  for (const url of urls) {
    const value = measured.get(url) ?? pantryImageBoundsCache.get(url);
    if (value) bounds.set(url, value);
  }
  const ready = urls.length > 0 && bounds.size === urls.length;
  useEffect(() => {
    if (!urls.length || ready) return;
    const timer = setTimeout(() => setFailedKey(key), 20000);
    return () => clearTimeout(timer);
  }, [key, urls.length, ready, attempt]);
  return { urls, bounds, onBounds, ready, failed: !ready && failedKey === key, attempt,
    retry: () => { setFailedKey(null); setAttempt(value => value + 1); } };
}
