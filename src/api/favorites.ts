import { supabase } from '../lib/supabase';
import type { FavoriteCategory, FavoriteProduct } from '../types';

export type FavoriteKind = 'category' | 'product';

interface FavoriteRow {
  kind: FavoriteKind;
  ref_id: string;
  name: string;
  emoji: string | null;
  color: string | null;
  image_url: string | null;
  price: string | null;
}

/** Todos los favoritos del usuario, ya separados por tipo. */
export async function fetchFavorites(
  userId: string,
): Promise<{ categories: FavoriteCategory[]; products: FavoriteProduct[] }> {
  const { data, error } = await supabase
    .from('favorites')
    .select('kind, ref_id, name, emoji, color, image_url, price')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const categories: FavoriteCategory[] = [];
  const products: FavoriteProduct[] = [];
  for (const row of (data ?? []) as FavoriteRow[]) {
    if (row.kind === 'category') {
      categories.push({
        refId: row.ref_id,
        name: row.name,
        emoji: row.emoji ?? '🛒',
        color: row.color ?? '#888',
      });
    } else {
      products.push({
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
  refId: string,
): Promise<void> {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('ref_id', refId);
  if (error) throw error;
}
