// Lecturas del espejo del catálogo de Mercadona en Supabase
// (tabla mercadona_products, rellenada 1×/semana por scripts/sync-catalog.mjs).
//
// Sustituye al barrido de ~100 endpoints que antes hacía cada usuario para poder
// buscar: ahora es una sola query con índice trigram. La columna `raw` guarda el
// MercadonaProduct completo.
import { supabase } from '../lib/supabase';
import { getLanguage } from '../i18n';
import type { MercadonaProduct } from '../types';
import type { CatalogStore } from '../constants/stores';

// Misma normalización que la columna generada `display_name_norm` de la BD
// (NFD + quitar diacríticos combinantes U+0300–U+036F + minúsculas). Igual que
// el normalize de constants/zones.ts.
const stripAccents = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Búsqueda por palabras sobre `display_name_norm` (insensible a acentos y
 *  mayúsculas): divide el texto del usuario en palabras y exige que TODAS
 *  aparezcan, en cualquier orden. Es más permisivo que un único '%frase%' (que
 *  obliga a una subcadena contigua y literal): "tomate frito" también encuentra
 *  "Frito de tomate", "leche hacendado" encuentra "Hacendado Leche entera" y
 *  "platano" encuentra "Plátano", porque cada palabra es un filtro ilike
 *  independiente que PostgREST combina con AND. Se ignoran palabras de 1 letra
 *  (ruido como "y", "de") salvo que no quede ninguna otra. */
function filterByNameWords<T extends { ilike(column: string, pattern: string): T }>(
  builder: T,
  query: string,
  column = 'display_name_norm',
): T {
  const words = stripAccents(query).trim().split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => w.length >= 2);
  const tokens = meaningful.length > 0 ? meaningful : words;
  return tokens.reduce((b, w) => b.ilike(column, `%${w}%`), builder);
}

// ─── Navegación del catálogo (pestaña "Productos" sin búsqueda) ──────────────
// Listado alfabético paginado del catálogo completo de un súper. Pagina por
// keyset (cursor sobre el nombre normalizado), no por OFFSET: cada "cargar 50
// más" es una query con índice que arranca donde quedó la anterior, sin barrer
// ni saltar filas aunque cambie el catálogo entre páginas.

/** Cursor keyset: nombre normalizado + id (clave primaria) como desempate. */
export interface BrowseCursor { name: string; id: string }
export interface BrowsePage<T> { items: T[]; nextCursor: BrowseCursor | null }

// Una página keyset ordenada por (orderCol, id). El desempate por id es
// imprescindible: `orderCol` (el nombre normalizado) NO es único, así que un
// `.gt(orderCol, cursor)` a secas se saltaría los productos que comparten nombre
// con el último de la página anterior. `cols` debe incluir `id`; `orderCol` se
// añade al select para poder leer el cursor de la última fila.
async function keysetPage(
  table: string,
  cols: string,
  orderCol: string,
  cursor: BrowseCursor | null,
  limit: number,
): Promise<{ rows: any[]; nextCursor: BrowseCursor | null }> {
  let q = supabase
    .from(table)
    .select(`${cols}, ${orderCol}`)
    .eq('published', true)
    .order(orderCol, { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (cursor) {
    // Valores entrecomillados (JSON) para que comas/paréntesis del nombre no
    // rompan la sintaxis del filtro `or` de PostgREST.
    const n = JSON.stringify(cursor.name);
    const i = JSON.stringify(cursor.id);
    q = q.or(`${orderCol}.gt.${n},and(${orderCol}.eq.${n},id.gt.${i})`);
  }
  const { data, error } = await q;
  if (error) throw error;
  // El select dinámico (`${cols}, ${orderCol}`) impide a supabase-js inferir la
  // forma de la fila; se trata como any[] (lo consume el map de cada súper).
  const rows = (data ?? []) as any[];
  // Solo hay más páginas si esta vino llena; si no, el cursor es null (fin).
  const last = rows.length === limit ? rows[rows.length - 1] : null;
  const nextCursor = last ? { name: String(last[orderCol] ?? ''), id: String(last.id) } : null;
  return { rows, nextCursor };
}

// Reconstruye el MercadonaProduct del espejo: nombre en català si procede y, sobre
// todo, ADJUNTA la categoría (N2) guardada en el espejo a `categories`. El `raw` de
// listado de Mercadona no incluye `categories` (solo el detalle), así que sin esto
// los productos añadidos desde búsqueda/navegación alfabética entraban en la Lista
// sin categoría y caían en "Otros". mercadonaToUI lee `categories?.[0]?.name` para
// que la Lista los agrupe por zona, igual que la navegación por categorías.
function mirrorMercadonaProduct(r: any, ca: boolean): MercadonaProduct {
  const p = r.raw as MercadonaProduct;
  const display_name = ca && r.display_name_ca ? r.display_name_ca : p.display_name;
  const categories = p.categories ?? (r.category_name
    ? [{ id: Number(r.category_id) || 0, name: r.category_name as string }]
    : undefined);
  // `regions` (CCAA de exclusividad) es columna del espejo, no del raw de la API.
  const regions = Array.isArray(r.regions) && r.regions.length ? (r.regions as string[]) : null;
  return { ...p, display_name, categories, regions };
}

/** Búsqueda por nombre en TODO el catálogo (server-side). Bilingüe (Fase 2):
 *  en català busca y muestra el nombre catalán (columnas display_name_ca[_norm]
 *  del espejo); en castellano, las columnas originales. Si el sync aún no rellenó
 *  el catalán, `display_name_ca` es null → cae al castellano sin romperse. */
export async function searchProducts(query: string, limit = 50): Promise<MercadonaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await filterByNameWords(
    supabase.from('mercadona_products').select('raw, display_name_ca, category_name, category_id, regions').eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => mirrorMercadonaProduct(r, ca));
}

/** Navegación alfabética del catálogo de Mercadona (sin búsqueda), paginada por
 *  keyset. Bilingüe: en català ordena/muestra por el nombre catalán. */
export async function browseProducts(cursor: BrowseCursor | null, limit = 50): Promise<BrowsePage<MercadonaProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage(
    'mercadona_products',
    'id, raw, display_name_ca, category_name, category_id, regions',
    ca ? 'display_name_ca_norm' : 'display_name_norm',
    cursor, limit,
  );
  const items = rows.map((r: any) => mirrorMercadonaProduct(r, ca));
  return { items, nextCursor };
}

/** Productos de una subcategoría (N2) de Mercadona DESDE EL ESPEJO. Antes esta
 *  pantalla pegaba en vivo a la API de Mercadona, que es POR ALMACÉN: con el mad1
 *  por defecto se omitían los productos regionales (p.ej. aguas catalanas), que
 *  solo existen en otro `wh`. El espejo une todos los almacenes (sync multi-wh),
 *  así que aquí SÍ aparecen los regionales en su categoría, igual que el resto de
 *  supers. `category_id` es la N2 bajo la que se sincronizó (= subcategoryId que
 *  navega ProductsScreen). Bilingüe: en català muestra el nombre catalán si existe.
 *  El orden lo pone StoreProductList (reordena alfabéticamente), no hace falta aquí. */
export async function fetchMercadonaProductsByCategory(categoryId: number, limit = 1000): Promise<MercadonaProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('mercadona_products')
    .select('raw, display_name_ca, category_name, category_id, regions')
    .eq('published', true)
    .eq('category_id', categoryId)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => mirrorMercadonaProduct(r, ca));
}

/** Nombres localizados (idioma ACTIVO) de varios productos de Mercadona por id.
 *  La cesta guarda `product_name` como un snapshot del idioma con el que se añadió
 *  el producto (e incluso otro miembro del grupo pudo añadirlo en otro idioma):
 *  con esto la Lista re-traduce esos nombres al idioma actual. Solo Mercadona lo
 *  necesita —Bonpreu/bonÀrea ya se guardan en català y el resto solo en castellano—.
 *  Si el catalán aún no está poblado, cae al castellano (coalesce). */
export async function fetchMercadonaNames(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return out;
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('mercadona_products')
    .select('id, display_name, display_name_ca')
    .in('id', unique);
  if (error) throw error;
  for (const r of data ?? []) {
    const name = ca && r.display_name_ca ? r.display_name_ca : r.display_name;
    if (name) out[String(r.id)] = name;
  }
  return out;
}

/** Almacén (`wh`) + CCAA de exclusividad de un producto Mercadona, según el espejo.
 *  El detalle por defecto usa mad1 y da 404 para productos regionales (solo existen
 *  en otra zona, p.ej. aguas catalanas); con `wh` se reintenta el detalle con su
 *  almacén, y `regions` alimenta la línea "Producto solo disponible en …" de la
 *  ficha. `wh` es null si no se conoce (productos sin source_wh → cae a mad1);
 *  `regions` es null para los nacionales. */
export async function fetchProductMirror(id: string): Promise<{ wh: string | null; regions: string[] | null }> {
  const { data, error } = await supabase
    .from('mercadona_products')
    .select('source_wh, regions')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return { wh: null, regions: null };
  const row = data as { source_wh: string | null; regions: string[] | null };
  const regions = Array.isArray(row.regions) && row.regions.length ? row.regions : null;
  return { wh: row.source_wh ?? null, regions };
}

/** Deduce la tienda a partir del id de producto: Bonpreu usa uuids; Mercadona,
 *  ids numéricos. Sirve para abrir el detalle correcto (p.ej. desde favoritos). */
export function retailerOf(id: string): 'mercadona' | 'esclat' {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(id) ? 'esclat' : 'mercadona';
}

// Etiqueta legible del €/unidad a partir de las columnas canónicas (l/kg/ud),
// compartida por los espejos que la guardan así ("0,96 €/L", "1,50 €/kg").
const ppuLabel = (value: any, unit: any): string | null => {
  if (value == null || !unit) return null;
  const label = unit === 'l' ? 'L' : unit === 'kg' ? 'kg' : 'ud';
  return `${Number(value).toFixed(2).replace('.', ',')} €/${label}`;
};

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
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("1,50 €/kg")
  categoryName: string | null;
}

// Bilingüe: en català muestra display_name_ca si existe (fallback al castellano).
const mapBonpreu = (r: any): BonpreuProduct => {
  const ca = getLanguage() === 'ca';
  return {
    id: r.id,
    displayName: ca && r.display_name_ca ? r.display_name_ca : r.display_name,
    brand: r.brand ?? null,
    packaging: r.packaging ?? null,
    thumbnail: r.thumbnail ?? null,
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    priceFormat: r.price_format ?? null,
    pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
  };
};

const BONPREU_COLS =
  'id, display_name, display_name_ca, brand, packaging, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';

/** Búsqueda por nombre en el catálogo de BonpreuEsclat (server-side). Bilingüe:
 *  en català busca/muestra por la columna catalana (display_name_ca[_norm]). */
export async function searchBonpreuProducts(query: string, limit = 50): Promise<BonpreuProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await filterByNameWords(
    supabase.from('bonpreu_products').select(BONPREU_COLS).eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapBonpreu);
}

/** Navegación alfabética del catálogo de BonpreuEsclat (sin búsqueda), keyset. */
export async function browseBonpreuProducts(cursor: BrowseCursor | null, limit = 50): Promise<BrowsePage<BonpreuProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('bonpreu_products', BONPREU_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit);
  return { items: rows.map(mapBonpreu), nextCursor };
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

/** Árbol de categorías de Bonpreu (N1 → N2) desde el espejo. Bilingüe: en català
 *  usa name_ca si existe (fallback al castellano). Se reordena en cliente. */
export async function fetchBonpreuCategoryTree(): Promise<BonpreuCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('bonpreu_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name');
  if (error) throw error;
  const rows = data ?? [];
  const nameOf = (r: any) => (ca && r.name_ca ? r.name_ca : r.name);
  return rows
    .filter((r: any) => r.parent_id == null)
    .map((n1: any) => ({
      id: n1.id,
      name: nameOf(n1),
      children: rows
        .filter((c: any) => c.parent_id === n1.id && (c.product_count ?? 0) > 0)
        .map((c: any) => ({ id: c.id, name: nameOf(c) })),
    }))
    .filter((n1) => n1.children.length > 0);
}

/** Productos de una subcategoría (N2) de Bonpreu. Usa category_ids (pertenencia
 *  real, un producto puede estar en varias categorías), no el category_id primario. */
export async function fetchBonpreuProductsByCategory(categoryId: string, limit = 400): Promise<BonpreuProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('bonpreu_products')
    .select(BONPREU_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order(ca ? 'display_name_ca_norm' : 'display_name')
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
  pricePerUnit: string | null;  // etiqueta €/unidad canónica ("192,50 €/kg")
  categoryName: string | null;
  // Ficha (solo en fetchCarrefourProduct; null en listados/búsqueda). La rellena
  // scripts/sync-carrefour.mjs del window.__INITIAL_STATE__. Ver carrefour_product_detail.sql.
  ingredients: string | null;
  allergens: string | null;
  nutrition: string | null;
  conservation: string | null;
  preparation: string | null;
  denomination: string | null;
  origin: string | null;
  operator: string | null;
}

const mapCarrefour = (r: any): CarrefourProduct => ({
  id: r.id,
  displayName: r.display_name,
  thumbnail: r.thumbnail ?? null,
  unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: r.price_format ?? null,
  pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
  categoryName: r.category_name ?? null,
  // Solo presentes cuando se piden (detalle); en listados quedan undefined → null.
  ingredients: r.ingredients ?? null,
  allergens: r.allergens ?? null,
  nutrition: r.nutrition ?? null,
  conservation: r.conservation ?? null,
  preparation: r.preparation ?? null,
  denomination: r.denomination ?? null,
  origin: r.origin ?? null,
  operator: r.operator ?? null,
});

// El €/unidad de medida del raw venía sin unidad ("192,50 €"); se usa el €/unidad
// canónico (columnas l/kg/ud) para mostrar "192,50 €/kg" como en el resto de supers.
const CARREFOUR_COLS =
  'id, display_name, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
// Columnas de ficha: solo para el detalle (cargas pesadas → no se piden en listados).
const CARREFOUR_DETAIL_COLS =
  `${CARREFOUR_COLS}, ingredients, allergens, nutrition, conservation, preparation, denomination, origin, operator`;

/** Búsqueda por nombre en el catálogo de Carrefour (server-side). */
export async function searchCarrefourProducts(query: string, limit = 50): Promise<CarrefourProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await filterByNameWords(
    supabase.from('carrefour_products').select(CARREFOUR_COLS).eq('published', true),
    q,
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapCarrefour);
}

/** Navegación alfabética del catálogo de Carrefour (sin búsqueda), keyset. */
export async function browseCarrefourProducts(cursor: BrowseCursor | null, limit = 50): Promise<BrowsePage<CarrefourProduct>> {
  const { rows, nextCursor } = await keysetPage('carrefour_products', CARREFOUR_COLS, 'display_name_norm', cursor, limit);
  return { items: rows.map(mapCarrefour), nextCursor };
}

/** Un producto de Carrefour por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchCarrefourProduct(id: string): Promise<CarrefourProduct | null> {
  const { data, error } = await supabase
    .from('carrefour_products')
    .select(CARREFOUR_DETAIL_COLS)
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
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("6,39 €/kg")
  categoryName: string | null;
  // Ficha (solo en fetchBonareaProduct; null en listados/búsqueda). La rellena
  // scripts/sync-bonarea.mjs leyendo la página del producto. Ver migración
  // bonarea_product_detail.sql.
  description: string | null;
  ingredients: string | null;
  allergens: string | null;
  nutrition: string | null;
  conservation: string | null;
  denomination: string | null;
  origin: string | null;
  operator: string | null;
}

// Bilingüe: en català muestra display_name_ca si existe (fallback al castellano).
const mapBonarea = (r: any): BonareaProduct => {
  const ca = getLanguage() === 'ca';
  return {
    id: r.id,
    displayName: ca && r.display_name_ca ? r.display_name_ca : r.display_name,
    thumbnail: r.thumbnail ?? null,
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    priceFormat: r.price_format ?? null,
    pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
    // Ficha (solo presente en detalle; en listados queda undefined → null). Bilingüe:
    // en català usa la columna _ca si existe, con fallback al castellano.
    description: pickLang(r.description, r.description_ca),
    ingredients: pickLang(r.ingredients, r.ingredients_ca),
    allergens: pickLang(r.allergens, r.allergens_ca),
    nutrition: pickLang(r.nutrition, r.nutrition_ca),
    conservation: pickLang(r.conservation, r.conservation_ca),
    denomination: pickLang(r.denomination, r.denomination_ca),
    origin: pickLang(r.origin, r.origin_ca),
    operator: pickLang(r.operator, r.operator_ca),
  };
};

// Elige el valor catalán si la UI está en català y existe; si no, el castellano.
const pickLang = (es: any, ca: any): string | null =>
  (getLanguage() === 'ca' && ca ? ca : es) ?? null;

// €/unidad canónico (columnas l/kg/ud), igual que el resto de supers, para mostrar
// "6,39 €/kg" de forma consistente (antes se leía la cadena cruda de raw.unitPrice).
const BONAREA_COLS =
  'id, display_name, display_name_ca, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
// Columnas de ficha (es + ca): solo para el detalle (cargas pesadas → no en listados).
const BONAREA_DETAIL_COLS =
  `${BONAREA_COLS}, description, ingredients, allergens, nutrition, conservation, denomination, origin, operator`
  + `, description_ca, ingredients_ca, allergens_ca, nutrition_ca, conservation_ca, denomination_ca, origin_ca, operator_ca`;

/** Búsqueda por nombre en el catálogo de bonÀrea (server-side). Bilingüe: en català
 *  busca/muestra por la columna catalana (display_name_ca[_norm]). */
export async function searchBonareaProducts(query: string, limit = 50): Promise<BonareaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await filterByNameWords(
    supabase.from('bonarea_products').select(BONAREA_COLS).eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapBonarea);
}

/** Navegación alfabética del catálogo de bonÀrea (sin búsqueda), keyset. */
export async function browseBonareaProducts(cursor: BrowseCursor | null, limit = 50): Promise<BrowsePage<BonareaProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('bonarea_products', BONAREA_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit);
  return { items: rows.map(mapBonarea), nextCursor };
}

/** Un producto de bonÀrea por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchBonareaProduct(id: string): Promise<BonareaProduct | null> {
  const { data, error } = await supabase
    .from('bonarea_products')
    .select(BONAREA_DETAIL_COLS)
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

/** Árbol de categorías de bonÀrea (N1 → N2) desde el espejo. Bilingüe: en català
 *  usa name_ca si existe (fallback al castellano). Se reordena en cliente. */
export async function fetchBonareaCategoryTree(): Promise<BonareaCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('bonarea_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name');
  if (error) throw error;
  const rows = data ?? [];
  const nameOf = (r: any) => (ca && r.name_ca ? r.name_ca : r.name);
  return rows
    .filter((r: any) => r.parent_id == null)
    .map((n1: any) => ({
      id: n1.id,
      name: nameOf(n1),
      children: rows
        .filter((c: any) => c.parent_id === n1.id && (c.product_count ?? 0) > 0)
        .map((c: any) => ({ id: c.id, name: nameOf(c) })),
    }))
    .filter((n1) => n1.children.length > 0);
}

/** Productos de una subcategoría (N2) de bonÀrea, vía category_ids (incluye ancestros). */
export async function fetchBonareaProductsByCategory(categoryId: string, limit = 600): Promise<BonareaProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('bonarea_products')
    .select(BONAREA_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order(ca ? 'display_name_ca_norm' : 'display_name')
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
  const { data, error } = await filterByNameWords(
    supabase.from('consum_products').select(CONSUM_COLS).eq('published', true),
    q,
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapConsum);
}

/** Navegación alfabética del catálogo de Consum (sin búsqueda), keyset. */
export async function browseConsumProducts(cursor: BrowseCursor | null, limit = 50): Promise<BrowsePage<ConsumProduct>> {
  const { rows, nextCursor } = await keysetPage('consum_products', CONSUM_COLS, 'display_name_norm', cursor, limit);
  return { items: rows.map(mapConsum), nextCursor };
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
  // Ficha (solo en fetchDiaProduct; null en listados/búsqueda). La rellena
  // scripts/sync-dia.mjs del vike_pageContext. Ver migración dia_product_detail.sql.
  description: string | null;
  ingredients: string | null;
  nutrition: string | null;
  conservation: string | null;
  preparation: string | null;
  denomination: string | null;
  operator: string | null;
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
  // Solo presentes cuando se piden (detalle); en listados quedan undefined → null.
  description: r.description ?? null,
  ingredients: r.ingredients ?? null,
  nutrition: r.nutrition ?? null,
  conservation: r.conservation ?? null,
  preparation: r.preparation ?? null,
  denomination: r.denomination ?? null,
  operator: r.operator ?? null,
});

const DIA_COLS =
  'id, display_name, brand, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
// Columnas de ficha: solo para el detalle (cargas pesadas → no se piden en listados).
const DIA_DETAIL_COLS =
  `${DIA_COLS}, description, ingredients, nutrition, conservation, preparation, denomination, operator`;

/** Búsqueda por nombre en el catálogo de Dia (server-side). */
export async function searchDiaProducts(query: string, limit = 50): Promise<DiaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await filterByNameWords(
    supabase.from('dia_products').select(DIA_COLS).eq('published', true),
    q,
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapDia);
}

/** Navegación alfabética del catálogo de Dia (sin búsqueda), keyset. */
export async function browseDiaProducts(cursor: BrowseCursor | null, limit = 50): Promise<BrowsePage<DiaProduct>> {
  const { rows, nextCursor } = await keysetPage('dia_products', DIA_COLS, 'display_name_norm', cursor, limit);
  return { items: rows.map(mapDia), nextCursor };
}

/** Un producto de Dia por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchDiaProduct(id: string): Promise<DiaProduct | null> {
  const { data, error } = await supabase
    .from('dia_products')
    .select(DIA_DETAIL_COLS)
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
