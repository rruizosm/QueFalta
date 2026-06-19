/**
 * FavoritesContext — categorías y productos favoritos del usuario.
 * Carga una vez al haber sesión (como ProfileContext) y mantiene el estado en
 * memoria. Los toggles hacen update optimista y revierten si Supabase falla.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  fetchFavorites,
  addCategoryFavorite,
  addProductFavorite,
  removeFavorite,
} from '../api/favorites';
import type { FavoriteCategory, FavoriteProduct } from '../types';
import type { CatalogStore } from '../constants/stores';
import { useAuth } from './AuthContext';

interface FavoritesContextValue {
  categories: FavoriteCategory[];
  products: FavoriteProduct[];
  loading: boolean;
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

  useEffect(() => {
    if (!userId) {
      setCategories([]);
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchFavorites(userId)
      .then(({ categories, products }) => {
        setCategories(categories);
        setProducts(products);
      })
      .catch(() => {
        // conserva lo que hubiera
      })
      .finally(() => setLoading(false));
  }, [userId]);

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
      // update optimista
      setCategories((prev) => (exists ? prev.filter((c) => !same(c)) : [cat, ...prev]));
      try {
        if (exists) await removeFavorite(userId, 'category', cat.store, cat.refId);
        else await addCategoryFavorite(userId, cat);
        return !exists;
      } catch (e) {
        // rollback
        setCategories((prev) => (exists ? [cat, ...prev] : prev.filter((c) => !same(c))));
        throw e;
      }
    },
    [userId, categories],
  );

  const toggleProductFavorite = useCallback(
    async (prod: FavoriteProduct): Promise<boolean> => {
      if (!userId) throw new Error('No hay sesión');
      const same = (p: FavoriteProduct) => p.store === prod.store && p.refId === prod.refId;
      const exists = products.some(same);
      setProducts((prev) => (exists ? prev.filter((p) => !same(p)) : [prod, ...prev]));
      try {
        if (exists) await removeFavorite(userId, 'product', prod.store, prod.refId);
        else await addProductFavorite(userId, prod);
        return !exists;
      } catch (e) {
        setProducts((prev) => (exists ? [prod, ...prev] : prev.filter((p) => !same(p))));
        throw e;
      }
    },
    [userId, products],
  );

  return (
    <FavoritesContext.Provider
      value={{
        categories,
        products,
        loading,
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
