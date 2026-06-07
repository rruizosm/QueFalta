// Lecturas del espejo del catálogo de Mercadona en Supabase
// (tabla mercadona_products, rellenada 1×/día por scripts/sync-catalog.mjs).
//
// Antes esto exigía barrer ~100 endpoints de Mercadona en cada dispositivo;
// ahora es una sola query. La columna `raw` guarda el MercadonaProduct completo.
import { supabase } from '../lib/supabase';
import type { MercadonaProduct } from '../types';

const rows = (data: any[] | null): MercadonaProduct[] =>
  (data ?? []).map((r) => r.raw as MercadonaProduct);

/** Todos los productos marcados como nuevos (price_instructions.is_new === true). */
export async function fetchNewProducts(limit = 100): Promise<MercadonaProduct[]> {
  const { data, error } = await supabase
    .from('mercadona_products')
    .select('raw')
    .eq('is_new', true)
    .eq('published', true)
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return rows(data);
}

/** Productos con bajada de precio (price_instructions.price_decreased === true). */
export async function fetchPriceDrops(limit = 100): Promise<MercadonaProduct[]> {
  const { data, error } = await supabase
    .from('mercadona_products')
    .select('raw')
    .eq('price_decreased', true)
    .eq('published', true)
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return rows(data);
}

/** Búsqueda por nombre en TODO el catálogo (server-side, ya no hace falta barrer la API). */
export async function searchProducts(query: string, limit = 50): Promise<MercadonaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('mercadona_products')
    .select('raw')
    .eq('published', true)
    .ilike('display_name', `%${q}%`)
    .limit(limit);
  if (error) throw error;
  return rows(data);
}
