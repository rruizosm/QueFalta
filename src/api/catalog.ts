// Lecturas del espejo del catálogo de Mercadona en Supabase
// (tabla mercadona_products, rellenada 1×/día por scripts/sync-catalog.mjs).
//
// Sustituye al barrido de ~100 endpoints que antes hacía cada usuario para poder
// buscar: ahora es una sola query con índice trigram. La columna `raw` guarda el
// MercadonaProduct completo.
import { supabase } from '../lib/supabase';
import type { MercadonaProduct } from '../types';

/** Búsqueda por nombre en TODO el catálogo (server-side). */
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
  return (data ?? []).map((r: any) => r.raw as MercadonaProduct);
}
