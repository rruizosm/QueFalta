import { useSyncExternalStore } from 'react';
import { getCatalogSearchGeneration, subscribeCatalogSearch } from '../lib/catalogSearchScope';

export function useCatalogSearchGeneration(): number {
  return useSyncExternalStore(subscribeCatalogSearch, getCatalogSearchGeneration, getCatalogSearchGeneration);
}
