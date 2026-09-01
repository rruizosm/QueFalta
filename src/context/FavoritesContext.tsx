/**
 * FavoritesContext — categorías y productos favoritos del usuario.
 * Hidrata un snapshot por usuario, lo revalida al haber sesión y mantiene el
 * estado en memoria. Los toggles hacen update optimista y revierten si Supabase falla.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  fetchFavorites,
  addCategoryFavorite,
  addProductFavorite,
  removeFavorite,
} from '../api/favorites';
import type { FavoriteCategory, FavoriteProduct } from '../types';
import type { CatalogStore } from '../constants/stores';
import { useAuth } from './AuthContext';
import {
  readStartupCache,
  startupKeys,
  writeStartupCache,
} from '../lib/startupCache';

type FavoritesSnapshot = {
  categories: FavoriteCategory[];
  products: FavoriteProduct[];
};

interface FavoritesContextValue {
  categories: FavoriteCategory[];
  products: FavoriteProduct[];
  loading: boolean;
  refresh: () => Promise<void>;
  // La identidad de un favorito es (store, refId): los ids se solapan entre súpers.
  isCategoryFavorite: (store: CatalogStore, refId: string) => boolean;
  isProductFavorite: (store: CatalogStore, refId: string) => boolean;
  /** Devuelve true si quedó marcada como favorita, false si se quitó. Lanza si falla. */
  toggleCategoryFavorite: (cat: FavoriteCategory) => Promise<boolean>;
  toggleProductFavorite: (prod: FavoriteProduct) => Promise<boolean>;
}

const FavoritesContext = createContext<FavoritesContextValue>({
  categories: [],
  products: [],
  loading: true,
  refresh: async () => {},
  isCategoryFavorite: () => false,
  isProductFavorite: () => false,
  toggleCategoryFavorite: async () => false,
  toggleProductFavorite: async () => false,
});

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [categories, setCategories] = useState<FavoriteCategory[]>([]);
  const [products, setProducts] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const requestIdRef = useRef(0);

  const applySnapshot = useCallback((snapshot: FavoritesSnapshot) => {
    setCategories(snapshot.categories);
    setProducts(snapshot.products);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const requestId = ++requestIdRef.current;
    const snapshot = await fetchFavorites(userId);
    if (requestId !== requestIdRef.current) return;
    applySnapshot(snapshot);
    writeStartupCache(startupKeys.favorites(userId), snapshot);
  }, [applySnapshot, userId]);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!userId) {
      setCategories([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    const cacheKey = startupKeys.favorites(userId);
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const revalidate = async (attempt = 0) => {
      try {
        const snapshot = await fetchFavorites(userId);
        if (cancelled || requestId !== requestIdRef.current) return;
        applySnapshot(snapshot);
        writeStartupCache(cacheKey, snapshot);
      } catch {
        // Un timeout puntual no debe convertir favoritos válidos en un vacío.
        // Reintenta dos veces en segundo plano; el snapshot local permanece visible.
        if (!cancelled && attempt < 2) {
          retryTimer = setTimeout(() => { void revalidate(attempt + 1); }, 1000 * (attempt + 1));
        }
      } finally {
        if (!cancelled && requestId === requestIdRef.current) setLoading(false);
      }
    };

    setLoading(true);
    void readStartupCache<FavoritesSnapshot>(cacheKey).then((cached) => {
      if (cancelled || requestId !== requestIdRef.current) return;
      if (cached) {
        applySnapshot(cached);
        setLoading(false);
      }
      void revalidate();
    });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [applySnapshot, userId]);

  const isCategoryFavorite = useCallback(
    (store: CatalogStore, refId: string) =>
      categories.some((c) => c.store === store && c.refId === refId),
    [categories],
  );
  const isProductFavorite = useCallback(
    (store: CatalogStore, refId: string) =>
      products.some((p) => p.store === store && p.refId === refId),
    [products],
  );

  const toggleCategoryFavorite = useCallback(
    async (cat: FavoriteCategory): Promise<boolean> => {
      if (!userId) throw new Error('No hay sesión');
      const same = (c: FavoriteCategory) => c.store === cat.store && c.refId === cat.refId;
      const exists = categories.some(same);
      const nextCategories = exists ? categories.filter((c) => !same(c)) : [cat, ...categories];
      // update optimista
      setCategories(nextCategories);
      if (userId) writeStartupCache(startupKeys.favorites(userId), { categories: nextCategories, products });
      try {
        if (exists) await removeFavorite(userId, 'category', cat.store, cat.refId);
        else await addCategoryFavorite(userId, cat);
        return !exists;
      } catch (e) {
        // rollback
        setCategories(categories);
        if (userId) writeStartupCache(startupKeys.favorites(userId), { categories, products });
        throw e;
      }
    },
    [userId, categories, products],
  );

  const toggleProductFavorite = useCallback(
    async (prod: FavoriteProduct): Promise<boolean> => {
      if (!userId) throw new Error('No hay sesión');
      const same = (p: FavoriteProduct) => p.store === prod.store && p.refId === prod.refId;
      const exists = products.some(same);
      const nextProducts = exists ? products.filter((p) => !same(p)) : [prod, ...products];
      setProducts(nextProducts);
      if (userId) writeStartupCache(startupKeys.favorites(userId), { categories, products: nextProducts });
      try {
        if (exists) await removeFavorite(userId, 'product', prod.store, prod.refId);
        else await addProductFavorite(userId, prod);
        return !exists;
      } catch (e) {
        setProducts(products);
        if (userId) writeStartupCache(startupKeys.favorites(userId), { categories, products });
        throw e;
      }
    },
    [userId, categories, products],
  );

  return (
    <FavoritesContext.Provider
      value={{
        categories,
        products,
        loading,
        refresh,
        isCategoryFavorite,
        isProductFavorite,
        toggleCategoryFavorite,
        toggleProductFavorite,
      }}
    >
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesContextValue {
  return useContext(FavoritesContext);
}
