import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { fetchListItems } from '../api/lists';
import type { PantryProduct } from '../lib/pantryLayout';

/** Read on opening the product and on returning to the app; never retain another list's result. */
export function usePantryCartMembership(listId: string | null, product: PantryProduct): boolean {
  const store = product.store ?? 'mercadona';
  const id = product.id;
  const [match, setMatch] = useState<{ listId: string; store: string; id: string; included: boolean } | null>(null);
  useEffect(() => {
    if (!listId) return;
    let disposed = false;
    let version = 0;
    const load = async () => {
      const request = ++version;
      try {
        const items = await fetchListItems(listId);
        if (disposed || request !== version) return;
        const included = items.some(item => !item.deferredToNextPurchase && item.storeKey === store
          && (item.storeProductId ?? (store === 'mercadona' ? item.mercadonaProductId : null)) === id);
        setMatch({ listId, store, id, included });
      } catch {
        if (!disposed && request === version) setMatch(null);
      }
    };
    void load();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void load();
    });
    return () => { disposed = true; subscription.remove(); };
  }, [listId, store, id]);
  return !!match && match.listId === listId && match.store === store && match.id === id && match.included;
}
