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
import { useAuth } from './AuthContext';

interface FavoritesContextValue {
  categories: FavoriteCategory[];
  products: FavoriteProduct[];
  loading: boolean;
  isCategoryFavorite: (refId: string) => boolean;
  isProductFavorite: (refId: string) => boolean;
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
    (refId: string) => categories.some((c) => c.refId === refId),
    [categories],
  );
  const isProductFavorite = useCallback(
    (refId: string) => products.some((p) => p.refId === refId),
    [products],
  );

  const toggleCategoryFavorite = useCallback(
    async (cat: FavoriteCategory): Promise<boolean> => {
      if (!userId) throw new Error('No hay sesión');
      const exists = categories.some((c) => c.refId === cat.refId);
      // update optimista
      setCategories((prev) =>
        exists ? prev.filter((c) => c.refId !== cat.refId) : [cat, ...prev],
      );
      try {
        if (exists) await removeFavorite(userId, 'category', cat.refId);
        else await addCategoryFavorite(userId, cat);
        return !exists;
      } catch (e) {
        // rollback
        setCategories((prev) =>
          exists ? [cat, ...prev] : prev.filter((c) => c.refId !== cat.refId),
        );
        throw e;
      }
    },
    [userId, categories],
  );

  const toggleProductFavorite = useCallback(
    async (prod: FavoriteProduct): Promise<boolean> => {
      if (!userId) throw new Error('No hay sesión');
      const exists = products.some((p) => p.refId === prod.refId);
      setProducts((prev) =>
        exists ? prev.filter((p) => p.refId !== prod.refId) : [prod, ...prev],
      );
      try {
        if (exists) await removeFavorite(userId, 'product', prod.refId);
        else await addProductFavorite(userId, prod);
        return !exists;
      } catch (e) {
        setProducts((prev) =>
          exists ? [prod, ...prev] : prev.filter((p) => p.refId !== prod.refId),
        );
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
