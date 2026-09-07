import { prefetchProductImages } from '../lib/prefetchProductImages';
import { useProfile } from './ProfileContext';
import { useTranslation } from './LanguageContext';
import { catalogStoreRequiresPlus } from '../constants/limits';
import { storeInRegion } from '../constants/regions';
import { clearCatalogRequests } from '../lib/catalogRequestCache';
import { loadBrowsePage } from '../api/catalogBrowse';
import { fetchWeeklyNewProducts, fetchPriceChanges, fetchStoreOffers, OFFER_STORES } from '../api/catalog';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { StoreSelection } from '../components/StoreDropdown';
import { useAuth } from './AuthContext';

interface CatalogStoreContextValue {
  store: StoreSelection;
  setStore: React.Dispatch<React.SetStateAction<StoreSelection>>;
}

const CatalogStoreContext = createContext<CatalogStoreContextValue | null>(null);

/**
 * Seleccion unica para las cuatro vistas del catalogo. Vive por encima de los
 * navegadores Home/Catalog para que cambiar de pestaña o abrir una pantalla de
 * novedades no reinicie el supermercado activo.
 */
export function CatalogStoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { profile, isPremium } = useProfile();
  const { lang } = useTranslation();
  const [store, setStore] = useState<StoreSelection>('mercadona');

  // El estado es de sesion, no una preferencia compartida entre cuentas que
  // usen el mismo dispositivo.
  useEffect(() => {
    clearCatalogRequests();
    setStore('mercadona');
  }, [userId]);


  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const lidlStoreId = profile?.lidlStoreId ?? null;
  const enabledStores = profile?.catalogStores;
  useEffect(() => {
    if (!userId || !profile || store === 'all' || catalogStoreRequiresPlus(store, isPremium)
      || !storeInRegion(store, region) || (enabledStores && !enabledStores.includes(store))
      || (store === 'lidl' && !lidlStoreId)) return;
    let cancelled = false;
    let stopImages = () => {};
    const timer = setTimeout(async () => {
      await Promise.allSettled([
        loadBrowsePage(store, null, region, postalCode, lidlStoreId).then((page) => {
          if (!cancelled) stopImages = prefetchProductImages(page.items.map((p) => p.imageUrl));
        }),
        fetchWeeklyNewProducts(store, region, postalCode, 50, 0, undefined, lidlStoreId),
      ]);
      if (cancelled) return;
      await Promise.allSettled([
        fetchPriceChanges(store, 'down', region, postalCode, 50, 0, null, lidlStoreId),
        ...(OFFER_STORES.includes(store)
          ? [fetchStoreOffers(store, null, region, postalCode, 50, undefined, lidlStoreId)] : []),
      ]);
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); stopImages(); };
  }, [userId, profile, store, isPremium, lang, region, postalCode, lidlStoreId, enabledStores]);

  const value = useMemo(() => ({ store, setStore }), [store]);
  return <CatalogStoreContext.Provider value={value}>{children}</CatalogStoreContext.Provider>;
}

export function useCatalogStore(): CatalogStoreContextValue {
  const context = useContext(CatalogStoreContext);
  if (!context) throw new Error('useCatalogStore must be used within CatalogStoreProvider');
  return context;
}
