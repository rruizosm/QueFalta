import { supabase } from '../lib/supabase';
import type { FavoriteCategory, FavoriteProduct } from '../types';
import { storeOfItem, type CatalogStore } from '../constants/stores';

export type FavoriteKind = 'category' | 'product';

interface FavoriteRow {
  kind: FavoriteKind;
  store: CatalogStore | null;
  ref_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  image_url: string | null;
  price: string | null;
}

// Tienda de una fila legacy sin `store` poblado (por si la migración aún no corrió
// del todo): productos por el dominio de la imagen; categorías → mercadona (lo
// único marcable hasta ahora). storeOfItem puede devolver 'otros' (no es un
// CatalogStore) → cae a mercadona.
function rowStore(row: FavoriteRow): CatalogStore {
  if (row.store) return row.store;
  if (row.kind === 'product') {
    const s = storeOfItem({ imageUrl: row.image_url });
    return s === 'otros' ? 'mercadona' : s;
  }
  return 'mercadona';
}

/** Todos los favoritos del usuario, ya separados por tipo. */
export async function fetchFavorites(
  userId: string,
): Promise<{ categories: FavoriteCategory[]; products: FavoriteProduct[] }> {
  const { data, error } = await supabase
    .from('favorites')
    .select('kind, store, ref_id, name, emoji, color, image_url, price')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const categories: FavoriteCategory[] = [];
  const products: FavoriteProduct[] = [];
  for (const row of (data ?? []) as FavoriteRow[]) {
    if (row.kind === 'category') {
      categories.push({
        store: rowStore(row),
        refId: row.ref_id,
        name: row.name,
        emoji: row.emoji ?? '🛒',
        color: row.color ?? '#888',
      });
    } else {
      products.push({
        store: rowStore(row),
        refId: row.ref_id,
        name: row.name,
        imageUrl: row.image_url,
        price: row.price,
      });
    }
  }
  return { categories, products };
}

export async function addCategoryFavorite(userId: string, cat: FavoriteCategory): Promise<void> {
  const { error } = await supabase.from('favorites').insert({
    user_id: userId,
    kind: 'category',
    store: cat.store,
    ref_id: cat.refId,
    name: cat.name,
    emoji: cat.emoji,
    color: cat.color,
  });
  if (error) throw error;
}

export async function addProductFavorite(userId: string, prod: FavoriteProduct): Promise<void> {
  const { error } = await supabase.from('favorites').insert({
    user_id: userId,
    kind: 'product',
    store: prod.store,
    ref_id: prod.refId,
    name: prod.name,
    image_url: prod.imageUrl ?? null,
    price: prod.price ?? null,
  });
  if (error) throw error;
}

export async function removeFavorite(
  userId: string,
  kind: FavoriteKind,
  store: CatalogStore,
  refId: string,
): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('store', store)
    .eq('ref_id', refId);
  if (error) throw error;
}
