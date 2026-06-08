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

// ─── BonpreuEsclat (tabla bonpreu_products, espejo aparte) ───────────────────
// Forma normalizada para la UI (la del producto de Bonpreu difiere de Mercadona).
export interface BonpreuProduct {
  id: string;
  displayName: string;
  brand: string | null;
  packaging: string | null;
  thumbnail: string | null;
  unitPrice: number | null;
  priceFormat: string | null;
  categoryName: string | null;
}

const mapBonpreu = (r: any): BonpreuProduct => ({
  id: r.id,
  displayName: r.display_name,
  brand: r.brand ?? null,
  packaging: r.packaging ?? null,
  thumbnail: r.thumbnail ?? null,
  unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: r.price_format ?? null,
  categoryName: r.category_name ?? null,
});

const BONPREU_COLS = 'id, display_name, brand, packaging, thumbnail, unit_price, price_format, category_name';

/** Búsqueda por nombre en el catálogo de BonpreuEsclat (server-side). */
export async function searchBonpreuProducts(query: string, limit = 50): Promise<BonpreuProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('bonpreu_products')
    .select(BONPREU_COLS)
    .eq('published', true)
    .ilike('display_name', `%${q}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapBonpreu);
}

/** Una categoría N1 de Bonpreu con sus subcategorías (N2) que tienen productos. */
export interface BonpreuCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Bonpreu (N1 → N2) desde el espejo. */
export async function fetchBonpreuCategoryTree(): Promise<BonpreuCategory[]> {
  const { data, error } = await supabase
    .from('bonpreu_categories')
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name');
  if (error) throw error;
  const rows = data ?? [];
  return rows
    .filter((r: any) => r.parent_id == null)
    .map((n1: any) => ({
      id: n1.id,
      name: n1.name,
      children: rows
        .filter((c: any) => c.parent_id === n1.id && (c.product_count ?? 0) > 0)
        .map((c: any) => ({ id: c.id, name: c.name })),
    }))
    .filter((n1) => n1.children.length > 0);
}

/** Productos de una subcategoría (N2) de Bonpreu. Usa category_ids (pertenencia
 *  real, un producto puede estar en varias categorías), no el category_id primario. */
export async function fetchBonpreuProductsByCategory(categoryId: string, limit = 400): Promise<BonpreuProduct[]> {
  const { data, error } = await supabase
    .from('bonpreu_products')
    .select(BONPREU_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapBonpreu);
}
