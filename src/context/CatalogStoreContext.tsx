import { prefetchProductImages } from '../lib/prefetchProductImages';
import { useProfile } from './ProfileContext';
import { useTranslation } from './LanguageContext';
import { catalogStoreRequiresPlus } from '../constants/limits';
import { storeInRegion } from '../constants/regions';
import { clearCatalogRequests } from '../lib/catalogRequestCache';
import { loadBrowsePage } from '../api/catalogBrowse';
import { fetchWeeklyNewProducts, fetchPriceChanges, fetchStoreOffers, OFFER_STORES } from '../api/catalog';
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import type { StoreSelection } from '../components/StoreDropdown';
import { useAuth } from './AuthContext';
import type { CatalogStore } from '../constants/stores';
import {
  readCatalogFavoriteStore,
  writeCatalogFavoriteStore,
} from '../lib/catalogFavoriteStore';

interface CatalogStoreContextValue {
  store: StoreSelection;
  setStore: React.Dispatch<React.SetStateAction<StoreSelection>>;
  favoriteStore: CatalogStore | null;
  toggleFavoriteStore: (store: CatalogStore) => void;
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
  const { profile, isPremium, loading: profileLoading } = useProfile();
  const { lang } = useTranslation();
  const [store, setStore] = useState<StoreSelection>('mercadona');
  const [favoriteStore, setFavoriteStore] = useState<CatalogStore | null>(null);
  const [favoriteLoadedForUser, setFavoriteLoadedForUser] = useState<string | null>(null);
  const favoriteStoreRef = useRef<CatalogStore | null>(null);
  const favoriteLoadRevision = useRef(0);
  const favoriteWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const defaultAppliedUser = useRef<string | null>(null);

  // La selección manual sigue siendo de sesión. El favorito sí se restaura en
  // cada arranque, siempre bajo una clave propia de la cuenta del dispositivo.
  useEffect(() => {
    const revision = ++favoriteLoadRevision.current;
    clearCatalogRequests();
    setStore('mercadona');
    favoriteStoreRef.current = null;
    setFavoriteStore(null);
    setFavoriteLoadedForUser(null);
    defaultAppliedUser.current = null;
    if (!userId) return;

    readCatalogFavoriteStore(userId)
      .catch(() => null)
      .then((favorite) => {
        if (favoriteLoadRevision.current !== revision) return;
        favoriteStoreRef.current = favorite;
        setFavoriteStore(favorite);
        setFavoriteLoadedForUser(userId);
      });
  }, [userId]);

  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const lidlStoreId = profile?.lidlStoreId ?? null;
  const enabledStores = profile?.catalogStores;

  // El favorito determina la selección inicial una sola vez por sesión. Una
  // cadena temporalmente inaccesible (región, preferencia o Plus) se conserva
  // como favorita, pero no se abre automáticamente durante ese arranque.
  useEffect(() => {
    if (!userId || profileLoading || profile?.id !== userId
      || favoriteLoadedForUser !== userId || defaultAppliedUser.current === userId) return;
    defaultAppliedUser.current = userId;
    if (!favoriteStore || catalogStoreRequiresPlus(favoriteStore, isPremium)
      || !storeInRegion(favoriteStore, region, postalCode)
      || (enabledStores && !enabledStores.includes(favoriteStore))
      || (favoriteStore === 'lidl' && !lidlStoreId)) return;
    setStore(favoriteStore);
  }, [
    enabledStores, favoriteLoadedForUser, favoriteStore, isPremium, lidlStoreId,
    postalCode, profile?.id, profileLoading, region, userId,
  ]);

  const toggleFavoriteStore = useCallback((nextStore: CatalogStore) => {
    if (!userId) return;
    ++favoriteLoadRevision.current;
    const nextFavorite = favoriteStoreRef.current === nextStore ? null : nextStore;
    favoriteStoreRef.current = nextFavorite;
    setFavoriteStore(nextFavorite);
    setFavoriteLoadedForUser(userId);
    defaultAppliedUser.current = userId;
    favoriteWriteQueue.current = favoriteWriteQueue.current
      .then(() => writeCatalogFavoriteStore(userId, nextFavorite))
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId || !profile || store === 'all' || catalogStoreRequiresPlus(store, isPremium)
      || !storeInRegion(store, region, postalCode) || (enabledStores && !enabledStores.includes(store))
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
          // Comparte el orden inicial de OffersScreen y su petición/caché.
          ? [fetchStoreOffers(store, null, region, postalCode, 50, { sort: 'asc' }, lidlStoreId)] : []),
      ]);
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); stopImages(); };
  }, [userId, profile, store, isPremium, lang, region, postalCode, lidlStoreId, enabledStores]);

  const value = useMemo(() => ({
    store, setStore, favoriteStore, toggleFavoriteStore,
  }), [favoriteStore, store, toggleFavoriteStore]);
  return <CatalogStoreContext.Provider value={value}>{children}</CatalogStoreContext.Provider>;
}

export function useCatalogStore(): CatalogStoreContextValue {
  const context = useContext(CatalogStoreContext);
  if (!context) throw new Error('useCatalogStore must be used within CatalogStoreProvider');
  return context;
}
