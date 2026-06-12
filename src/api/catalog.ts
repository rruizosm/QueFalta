// Lecturas del espejo del catálogo de Mercadona en Supabase
// (tabla mercadona_products, rellenada 1×/día por scripts/sync-catalog.mjs).
//
// Sustituye al barrido de ~100 endpoints que antes hacía cada usuario para poder
// buscar: ahora es una sola query con índice trigram. La columna `raw` guarda el
// MercadonaProduct completo.
import { supabase } from '../lib/supabase';
import type { MercadonaProduct } from '../types';
import type { CatalogStore } from '../constants/stores';

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

/** Deduce la tienda a partir del id de producto: Bonpreu usa uuids; Mercadona,
 *  ids numéricos. Sirve para abrir el detalle correcto (p.ej. desde favoritos). */
export function retailerOf(id: string): 'mercadona' | 'esclat' {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(id) ? 'esclat' : 'mercadona';
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

/** Un producto de Bonpreu por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchBonpreuProduct(id: string): Promise<BonpreuProduct | null> {
  const { data, error } = await supabase
    .from('bonpreu_products')
    .select(BONPREU_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBonpreu(data) : null;
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

// ─── Carrefour (tabla carrefour_products, espejo aparte) ─────────────────────
// Mismo modelo que Bonpreu (espejo + category_ids). El sync corre en local
// (scripts/sync-carrefour.mjs vía tarea programada) porque Cloudflare bloquea CI.
export interface CarrefourProduct {
  id: string;
  displayName: string;
  thumbnail: string | null;
  unitPrice: number | null;     // precio numérico (15.4)
  priceFormat: string | null;   // precio mostrado tal cual ("15,40 €")
  pricePerUnit: string | null;  // precio por unidad de medida ("192,50 €"), de raw
  categoryName: string | null;
}

const mapCarrefour = (r: any): CarrefourProduct => ({
  id: r.id,
  displayName: r.display_name,
  thumbnail: r.thumbnail ?? null,
  unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: r.price_format ?? null,
  pricePerUnit: r.price_per_unit ?? null,
  categoryName: r.category_name ?? null,
});

// price_per_unit no es columna: se saca del jsonb `raw` con un alias de PostgREST.
const CARREFOUR_COLS =
  'id, display_name, thumbnail, unit_price, price_format, category_name, price_per_unit:raw->>price_per_unit';

/** Búsqueda por nombre en el catálogo de Carrefour (server-side). */
export async function searchCarrefourProducts(query: string, limit = 50): Promise<CarrefourProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('carrefour_products')
    .select(CARREFOUR_COLS)
    .eq('published', true)
    .ilike('display_name', `%${q}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapCarrefour);
}

/** Un producto de Carrefour por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchCarrefourProduct(id: string): Promise<CarrefourProduct | null> {
  const { data, error } = await supabase
    .from('carrefour_products')
    .select(CARREFOUR_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCarrefour(data) : null;
}

/** Una categoría N1 de Carrefour con sus subcategorías (N2) con productos. */
export interface CarrefourCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Carrefour (N1 → N2) desde el espejo. */
export async function fetchCarrefourCategoryTree(): Promise<CarrefourCategory[]> {
  const { data, error } = await supabase
    .from('carrefour_categories')
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

/** Productos de una subcategoría (N2) de Carrefour, vía category_ids. */
export async function fetchCarrefourProductsByCategory(categoryId: string, limit = 400): Promise<CarrefourProduct[]> {
  const { data, error } = await supabase
    .from('carrefour_products')
    .select(CARREFOUR_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapCarrefour);
}

// ─── bonÀrea (tabla bonarea_products, espejo aparte) ─────────────────────────
// Mismo modelo que Bonpreu/Carrefour (espejo + category_ids). Lo puebla
// scripts/sync-bonarea.mjs (GitHub Action) desde la API JSON propia de bonÀrea.
// El árbol real tiene 4 niveles; aquí se navega como 2 (N1→N2), y category_ids
// incluye los ancestros para que una N2 devuelva los productos de todo su subárbol.
export interface BonareaProduct {
  id: string;                  // identifier con asterisco ("13*5304"), lo que pide el carrito
  displayName: string;
  thumbnail: string | null;
  unitPrice: number | null;    // precio numérico (4.08)
  priceFormat: string | null;  // precio mostrado ("4,08 €/u.")
  pricePerUnit: string | null; // precio por medida ("6,39 €/kg"), de raw.unitPrice
  categoryName: string | null;
}

const mapBonarea = (r: any): BonareaProduct => ({
  id: r.id,
  displayName: r.display_name,
  thumbnail: r.thumbnail ?? null,
  unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: r.price_format ?? null,
  pricePerUnit: r.price_per_unit ?? null,
  categoryName: r.category_name ?? null,
});

// price_per_unit no es columna: se saca del jsonb `raw` (campo unitPrice) con un alias.
const BONAREA_COLS =
  'id, display_name, thumbnail, unit_price, price_format, category_name, price_per_unit:raw->>unitPrice';

/** Búsqueda por nombre en el catálogo de bonÀrea (server-side). */
export async function searchBonareaProducts(query: string, limit = 50): Promise<BonareaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('bonarea_products')
    .select(BONAREA_COLS)
    .eq('published', true)
    .ilike('display_name', `%${q}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapBonarea);
}

/** Un producto de bonÀrea por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchBonareaProduct(id: string): Promise<BonareaProduct | null> {
  const { data, error } = await supabase
    .from('bonarea_products')
    .select(BONAREA_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBonarea(data) : null;
}

/** Una categoría N1 de bonÀrea con sus subcategorías (N2) con productos. */
export interface BonareaCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de bonÀrea (N1 → N2) desde el espejo. */
export async function fetchBonareaCategoryTree(): Promise<BonareaCategory[]> {
  const { data, error } = await supabase
    .from('bonarea_categories')
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

/** Productos de una subcategoría (N2) de bonÀrea, vía category_ids (incluye ancestros). */
export async function fetchBonareaProductsByCategory(categoryId: string, limit = 600): Promise<BonareaProduct[]> {
  const { data, error } = await supabase
    .from('bonarea_products')
    .select(BONAREA_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapBonarea);
}

// ─── Consum (tabla consum_products, espejo aparte) ───────────────────────────
// Mismo modelo que Bonpreu/Carrefour/bonÀrea (espejo + category_ids). Lo puebla
// scripts/sync-consum.mjs (GitHub Action) desde la API REST abierta de Consum.
// Único súper con EAN y marca estructurados; price_per_unit es columna real
// (no viene de raw) porque la API da centUnitAmount + unitPriceUnitType.
export interface ConsumProduct {
  id: string;                  // `code` público ("1669"), el de la URL del producto
  displayName: string;
  brand: string | null;
  packaging: string | null;    // formato del envase ("250 Gr"), derivado de description
  thumbnail: string | null;
  unitPrice: number | null;    // precio del envase (1.15); con oferta, el de oferta
  priceFormat: string | null;  // precio mostrado ("1,15 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("4,60 €/kg")
  categoryName: string | null;
}

// Etiqueta legible del €/unidad a partir de las columnas canónicas (l/kg/ud).
const ppuLabel = (value: any, unit: any): string | null => {
  if (value == null || !unit) return null;
  const label = unit === 'l' ? 'L' : unit === 'kg' ? 'kg' : 'ud';
  return `${Number(value).toFixed(2).replace('.', ',')} €/${label}`;
};

const mapConsum = (r: any): ConsumProduct => ({
  id: r.id,
  displayName: r.display_name,
  brand: r.brand ?? null,
  packaging: r.packaging ?? null,
  thumbnail: r.thumbnail ?? null,
  unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: r.price_format ?? null,
  pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
  categoryName: r.category_name ?? null,
});

const CONSUM_COLS =
  'id, display_name, brand, packaging, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';

/** Búsqueda por nombre en el catálogo de Consum (server-side). */
export async function searchConsumProducts(query: string, limit = 50): Promise<ConsumProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('consum_products')
    .select(CONSUM_COLS)
    .eq('published', true)
    .ilike('display_name', `%${q}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapConsum);
}

/** Un producto de Consum por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchConsumProduct(id: string): Promise<ConsumProduct | null> {
  const { data, error } = await supabase
    .from('consum_products')
    .select(CONSUM_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapConsum(data) : null;
}

/** Una categoría N1 de Consum con sus subcategorías (N2) con productos. */
export interface ConsumCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Consum (N1 → N2) desde el espejo. El árbol real tiene
 *  4 niveles; category_ids incluye ancestros, así que la N2 cubre su subárbol. */
export async function fetchConsumCategoryTree(): Promise<ConsumCategory[]> {
  const { data, error } = await supabase
    .from('consum_categories')
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

/** Productos de una subcategoría (N2) de Consum, vía category_ids (incluye ancestros). */
export async function fetchConsumProductsByCategory(categoryId: string, limit = 600): Promise<ConsumProduct[]> {
  const { data, error } = await supabase
    .from('consum_products')
    .select(CONSUM_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapConsum);
}

// ─── Dia (tabla dia_products, espejo aparte) ─────────────────────────────────
// Mismo modelo que Consum (espejo + category_ids + ppu en columnas reales). Lo
// puebla scripts/sync-dia.mjs (GitHub Action) desde el SSR de dia.es (JSON
// vike_pageContext embebido). El árbol es de 2 niveles exactos (N1→N2).
export interface DiaProduct {
  id: string;                  // object_id ("72170"), el de la URL del producto (/p/72170)
  displayName: string;         // incluye marca y formato ("... Dia 600 g")
  brand: string | null;
  thumbnail: string | null;
  unitPrice: number | null;    // precio con promo aplicada si la hay
  priceFormat: string | null;  // precio mostrado ("5,89 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("9,82 €/kg")
  categoryName: string | null;
}

const mapDia = (r: any): DiaProduct => ({
  id: r.id,
  displayName: r.display_name,
  brand: r.brand ?? null,
  thumbnail: r.thumbnail ?? null,
  unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: r.price_format ?? null,
  pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
  categoryName: r.category_name ?? null,
});

const DIA_COLS =
  'id, display_name, brand, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';

/** Búsqueda por nombre en el catálogo de Dia (server-side). */
export async function searchDiaProducts(query: string, limit = 50): Promise<DiaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase
    .from('dia_products')
    .select(DIA_COLS)
    .eq('published', true)
    .ilike('display_name', `%${q}%`)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapDia);
}

/** Un producto de Dia por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchDiaProduct(id: string): Promise<DiaProduct | null> {
  const { data, error } = await supabase
    .from('dia_products')
    .select(DIA_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDia(data) : null;
}

/** Una categoría N1 de Dia con sus subcategorías (N2) con productos. */
export interface DiaCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Dia (N1 → N2) desde el espejo. */
export async function fetchDiaCategoryTree(): Promise<DiaCategory[]> {
  const { data, error } = await supabase
    .from('dia_categories')
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

/** Productos de una subcategoría (N2) de Dia, vía category_ids. */
export async function fetchDiaProductsByCategory(categoryId: string, limit = 600): Promise<DiaProduct[]> {
  const { data, error } = await supabase
    .from('dia_products')
    .select(DIA_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapDia);
}

// ─── Comparativa: producto similar más barato entre supers (RPC similar_products) ─
export interface SimilarProduct {
  store: CatalogStore;
  /** null en filas bloqueadas (teaser del plan free). */
  id: string | null;
  displayName: string | null;
  thumbnail: string | null;
  priceTotal: number | null;      // precio del envase
  pricePerUnit: number | null;    // € por unidad canónica
  pricePerUnitUnit: 'l' | 'kg' | 'ud' | null;
  /** Teaser free (paywall activo): existe más barato en `store`, sin detalle. */
  locked: boolean;
}

/** El equivalente MÁS BARATO por €/unidad en cada tienda de `stores` (1 por tienda).
 *  Excluye la tienda del propio producto pasándola fuera de `stores`. */
export async function fetchSimilarProducts(
  name: string,
  stores: CatalogStore[],
): Promise<SimilarProduct[]> {
  if (!name?.trim() || stores.length === 0) return [];
  const { data, error } = await supabase.rpc('similar_products', { p_name: name, p_stores: stores });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    store: r.store,
    id: r.id ?? null,
    displayName: r.display_name ?? null,
    thumbnail: r.thumbnail ?? null,
    priceTotal: r.price_total != null ? Number(r.price_total) : null,
    pricePerUnit: r.price_per_unit != null ? Number(r.price_per_unit) : null,
    pricePerUnitUnit: r.price_per_unit_unit ?? null,
    locked: !!r.locked, // tolera el RPC viejo sin la columna (→ false)
  }));
}
