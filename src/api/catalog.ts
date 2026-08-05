// Lecturas del espejo del catálogo de Mercadona en Supabase
// (tabla mercadona_products, rellenada 1×/semana por scripts/sync-catalog.mjs).
//
// Sustituye al barrido de ~100 endpoints que antes hacía cada usuario para poder
// buscar: ahora es una sola query con índice trigram. La columna `raw` guarda el
// MercadonaProduct completo.
import { supabase } from '../lib/supabase';
import { offerTypesOf, type OfferType } from '../lib/offerTypes';
export { offerTypesForStore } from '../lib/offerTypes';
export type { OfferType } from '../lib/offerTypes';
import { getLanguage } from '../i18n';
import type { MercadonaProduct } from '../types';
import type { CatalogStore } from '../constants/stores';
import { REGION_ALL, REGION_MERCADONA_NAME, type RegionValue } from '../constants/regions';
import { consumZoneFromPostalCode, plusfrescCenterFromPostalCode } from '../constants/retailerZones';
import { fetchNewArrivals, resolveWarehouseForPostalCode } from './mercadona';
// Solo type-only en sentido inverso (productAdapters importa los tipos de este
// fichero con `import type`), así que este import NO crea un ciclo en runtime.
import {
  mercadonaToUI, bonpreuToUI, carrefourToUI, bonareaToUI, consumToUI, diaToUI, sorliToUI,
  condisToUI, eroskiToUI, capraboToUI, ametllerToUI, aldiToUI, hiperdinoToUI, alcampoToUI, plusfrescToUI,
  type UIProduct,
} from '../lib/productAdapters';

export interface ProductPriceChange {
  previousPrice: number;
  direction: 'up' | 'down';
}

const PRICE_CHANGE_TABLE: Record<CatalogStore, string> = {
  mercadona: 'mercadona_products', esclat: 'bonpreu_products', carrefour: 'carrefour_products',
  bonarea: 'bonarea_products', consum: 'consum_products', dia: 'dia_products', sorli: 'sorli_products',
  eroski: 'eroski_products', caprabo: 'caprabo_products', condis: 'condis_products',
  ametller: 'ametller_products', aldi: 'aldi_products', hiperdino: 'hiperdino_products',
  alcampo: 'alcampo_products', plusfresc: 'plusfresc_products',
};

/** Última variación semanal del precio base de un producto. Si la migración aún
 * no existe en un espejo, se oculta el indicador sin impedir abrir la ficha. */
export async function fetchProductPriceChange(
  store: CatalogStore,
  productId: string,
  postalCode: string | null = null,
): Promise<ProductPriceChange | null> {
  const locationId = locationForPriceHistory(store, postalCode);
  if (locationId && (store === 'consum' || store === 'plusfresc')) {
    const { data, error } = await supabase
      .from('catalog_location_price_changes')
      .select('prev_unit_price, new_unit_price, price_delta_pct, changed_at')
      .eq('store', store)
      .eq('location_id', locationId)
      .eq('product_id', productId)
      .gte('changed_at', weekAgoISO())
      .order('changed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const previousPrice = Number(data.prev_unit_price);
    const delta = Number(data.price_delta_pct);
    if (!Number.isFinite(previousPrice) || previousPrice < 0 || !Number.isFinite(delta) || delta === 0) {
      return null;
    }
    return { previousPrice, direction: delta < 0 ? 'down' : 'up' };
  }
  const { data, error } = await supabase
    .from(PRICE_CHANGE_TABLE[store])
    .select('prev_unit_price, price_delta_pct, price_changed_at')
    .eq('id', productId)
    .gte('price_changed_at', weekAgoISO())
    .maybeSingle();
  if (error || !data) return null;
  const previousPrice = Number(data.prev_unit_price);
  const delta = Number(data.price_delta_pct);
  if (!Number.isFinite(previousPrice) || previousPrice < 0 || !Number.isFinite(delta) || delta === 0) {
    return null;
  }
  return { previousPrice, direction: delta < 0 ? 'down' : 'up' };
}

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

/** Restringe un espejo a los productos disponibles en la CCAA seleccionada.
 * `regions` solo se rellena para productos exclusivos: NULL (y las filas
 * antiguas con {}) equivale a disponibilidad nacional. */
function filterRegionalAvailability(query: any, region: RegionValue | null): any {
  if (region == null || region === REGION_ALL) return query;
  const community = REGION_MERCADONA_NAME[region];
  if (!community) return query;
  const pgArray = `{${JSON.stringify(community)}}`;
  return query.or(`regions.is.null,regions.eq.{},regions.cs.${pgArray}`);
}

/** `centers` is NULL for products present in every Plusfresc center. */
function filterCenterAvailability(query: any, center: string | null): any {
  if (!center) return query;
  return query.or(`centers.is.null,centers.eq.{},centers.cs.{${JSON.stringify(center)}}`);
}

/** Adjunta cancelación real al fetch de PostgREST sin obligar a los llamantes
 * que no la necesitan a crear un AbortController. */
function abortable<T>(query: T, signal?: AbortSignal): T {
  return signal ? (query as any).abortSignal(signal) : query;
}

// ─── Navegación del catálogo (pestaña "Productos" sin búsqueda) ──────────────
// Listado alfabético paginado del catálogo completo de un súper. Pagina por
// keyset (cursor sobre el nombre normalizado), no por OFFSET: cada "cargar 50
// más" es una query con índice que arranca donde quedó la anterior, sin barrer
// ni saltar filas aunque cambie el catálogo entre páginas.

/** Cursor keyset: valor de orden + id (clave primaria) como desempate. */
export interface BrowseCursor { name: string | number; id: string }
export interface BrowsePage<T> { items: T[]; nextCursor: BrowseCursor | null }
type BrowseOrder = boolean | 'priceAsc' | 'priceDesc';

// Una página keyset ordenada por (orderCol, id). El desempate por id es
// imprescindible: `orderCol` (el nombre normalizado) NO es único, así que un
// `.gt(orderCol, cursor)` a secas se saltaría los productos que comparten nombre
// con el último de la página anterior. `cols` debe incluir `id`; `orderCol` se
// añade al select para poder leer el cursor de la última fila. `apply` permite
// añadir filtros extra a la query (p. ej. "solo con oferta viva"): cada llamada
// a .or() de PostgREST es una condición independiente que se combina con AND,
// así que no choca con el .or() del cursor.
async function keysetPage(
  table: string,
  cols: string,
  orderCol: string,
  cursor: BrowseCursor | null,
  limit: number,
  apply?: (q: any) => any,
  order: BrowseOrder = false,
  signal?: AbortSignal,
): Promise<{ rows: any[]; nextCursor: BrowseCursor | null }> {
  const priceOrder = order === 'priceAsc' || order === 'priceDesc';
  const desc = order === true || order === 'priceDesc';
  const activeOrderCol = priceOrder ? 'unit_price' : orderCol;
  // Las proyecciones ligeras ya contienen normalmente `unit_price` y la
  // columna de nombre. Repetirla en el select provoca un 500 de PostgREST al
  // mezclar supermercados y pedir el orden por precio.
  const selectCols = cols.split(',').some((column) => column.trim() === activeOrderCol)
    ? cols
    : `${cols}, ${activeOrderCol}`;
  let q = supabase
    .from(table)
    .select(selectCols)
    .eq('published', true)
    .order(activeOrderCol, { ascending: !desc })
    .order('id', { ascending: true })
    .limit(limit);
  if (apply) q = apply(q);
  // El cursor por precio no puede atravesar valores nulos. En la práctica son
  // artículos sin precio publicable, que tampoco deben mezclarse en este orden.
  if (priceOrder) q = q.not('unit_price', 'is', null);
  if (cursor) {
    // Valores entrecomillados (JSON) para que comas/paréntesis del nombre no
    // rompan la sintaxis del filtro `or` de PostgREST.
    const n = JSON.stringify(cursor.name);
    const i = JSON.stringify(cursor.id);
    const cmp = desc ? 'lt' : 'gt';
    q = q.or(`${activeOrderCol}.${cmp}.${n},and(${activeOrderCol}.eq.${n},id.gt.${i})`);
  }
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) throw error;
  // El select dinámico (`${cols}, ${orderCol}`) impide a supabase-js inferir la
  // forma de la fila; se trata como any[] (lo consume el map de cada súper).
  const rows = (data ?? []) as any[];
  // Solo hay más páginas si esta vino llena; si no, el cursor es null (fin).
  const last = rows.length === limit ? rows[rows.length - 1] : null;
  const nextCursor = last ? { name: last[activeOrderCol], id: String(last.id) } : null;
  return { rows, nextCursor };
}

// Columnas ligeras suficientes para pintar las tarjetas de Mercadona. Antes los
// listados descargaban `raw` completo (aprox. 65 KB por página de 50) aunque la
// ficha vuelve a pedir el detalle al abrirse. Todas estas columnas ya las rellena
// sync-catalog.mjs, así que no dependen de una migración nueva.
const MERCADONA_LIST_COLS =
  'id, display_name, display_name_ca, slug, packaging, thumbnail, unit_price, price_per_unit, price_per_unit_unit, category_name, category_id';

// Reconstruye la forma mínima MercadonaProduct que consumen los adaptadores. Se
// conserva compatibilidad con cualquier llamada antigua que todavía aporte raw.
function mirrorMercadonaProduct(r: any, ca: boolean): MercadonaProduct {
  const raw = r.raw && typeof r.raw === 'object' ? r.raw as Partial<MercadonaProduct> : null;
  const display_name = ca && r.display_name_ca
    ? r.display_name_ca
    : r.display_name ?? raw?.display_name ?? '';
  const ppuUnit = r.price_per_unit_unit === 'l' ? 'L' : r.price_per_unit_unit ?? '';
  const priceInstructions = raw?.price_instructions ?? {
    unit_price: r.unit_price != null ? String(r.unit_price) : '0',
    bulk_price: '',
    unit_size: 0,
    size_format: '',
    reference_price: r.price_per_unit != null ? String(r.price_per_unit) : '',
    reference_format: ppuUnit,
  };
  const categories = raw?.categories ?? (r.category_name
    ? [{ id: Number(r.category_id) || 0, name: r.category_name as string }]
    : undefined);
  return {
    id: String(r.id ?? raw?.id ?? ''),
    slug: String(r.slug ?? raw?.slug ?? ''),
    display_name,
    packaging: String(r.packaging ?? raw?.packaging ?? ''),
    thumbnail: String(r.thumbnail ?? raw?.thumbnail ?? ''),
    price_instructions: priceInstructions,
    published: true,
    categories,
  };
}

/** Búsqueda por nombre en TODO el catálogo (server-side). Bilingüe (Fase 2):
 *  en català busca y muestra el nombre catalán (columnas display_name_ca[_norm]
 *  del espejo); en castellano, las columnas originales. Si el sync aún no rellenó
 *  el catalán, `display_name_ca` es null → cae al castellano sin romperse. */
export async function searchProducts(query: string, region: RegionValue | null, limit = 50, signal?: AbortSignal): Promise<MercadonaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(filterByNameWords(
    filterRegionalAvailability(
      supabase.from('mercadona_products').select(MERCADONA_LIST_COLS).eq('published', true),
      region,
    ),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map((r: any) => mirrorMercadonaProduct(r, ca));
}

/** Navegación alfabética del catálogo de Mercadona (sin búsqueda), paginada por
 *  keyset. Bilingüe: en català ordena/muestra por el nombre catalán. */
export async function browseProducts(cursor: BrowseCursor | null, region: RegionValue | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<MercadonaProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage(
    'mercadona_products',
    MERCADONA_LIST_COLS,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
    cursor, limit, (q) => filterRegionalAvailability(q, region), descending, signal,
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
export async function fetchMercadonaProductsByCategory(categoryId: number, region: RegionValue | null, limit = 1000): Promise<MercadonaProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await filterRegionalAvailability(
    supabase
      .from('mercadona_products')
      .select(MERCADONA_LIST_COLS)
      .eq('published', true)
      .eq('category_id', categoryId),
    region,
  ).limit(limit);
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

/** Almacén (`wh`) y EAN de un producto Mercadona según el espejo. El detalle por
 * defecto usa mad1; para un producto regional se reintenta con un almacén que sí
 * lo vende, evitando el 404. */
export async function fetchProductMirror(id: string): Promise<{
  wh: string | null;
  ean: string | null;
  nutrition: unknown | null;
  categoryName: string | null;
}> {
  const { data, error } = await supabase
    .from('mercadona_products')
    .select('source_wh, ean, nutrition, category_name')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return { wh: null, ean: null, nutrition: null, categoryName: null };
  const row = data as {
    source_wh: string | null;
    ean: string | null;
    nutrition: unknown | null;
    category_name: string | null;
  };
  return {
    wh: row.source_wh ?? null,
    ean: row.ean ?? null,
    nutrition: row.nutrition ?? null,
    categoryName: row.category_name ?? null,
  };
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
  productInfo: string | null;
  supplierName: string | null;
  ingredients: string | null;
  nutrition: string | null;
  packaging: string | null;
  thumbnail: string | null;
  unitPrice: number | null;
  promoPrice: number | null;
  promoBasePrice: number | null;
  promoName: string | null;
  promoText: string | null;
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
    productInfo: r.product_info ?? null,
    supplierName: r.supplier_name ?? null,
    ingredients: r.ingredients ?? null,
    nutrition: r.nutrition ?? null,
    packaging: r.packaging ?? null,
    thumbnail: r.thumbnail ?? null,
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    promoPrice: r.promo_price != null ? Number(r.promo_price) : null,
    promoBasePrice: r.promo_base_price != null ? Number(r.promo_base_price) : null,
    promoName: (ca && r.promo_name_ca ? r.promo_name_ca : r.promo_name) ?? null,
    promoText: r.promo_text ?? null,
    priceFormat: r.price_format ?? null,
    pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
  };
};

const BONPREU_COLS =
  'id, display_name, display_name_ca, brand, product_info, supplier_name, ingredients, nutrition, packaging, thumbnail, unit_price, promo_price, promo_base_price, promo_name, promo_name_ca, promo_text, price_format, category_name, price_per_unit, price_per_unit_unit';

/** Búsqueda por nombre en el catálogo de BonpreuEsclat (server-side). Bilingüe:
 *  en català busca/muestra por la columna catalana (display_name_ca[_norm]). */
export async function searchBonpreuProducts(query: string, limit = 50, signal?: AbortSignal): Promise<BonpreuProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('bonpreu_products').select(BONPREU_COLS).eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapBonpreu);
}

/** Navegación alfabética del catálogo de BonpreuEsclat (sin búsqueda), keyset. */
export async function browseBonpreuProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<BonpreuProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('bonpreu_products', BONPREU_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit, undefined, descending, signal);
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
export async function fetchBonpreuCategoryTree(signal?: AbortSignal): Promise<BonpreuCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(supabase
    .from('bonpreu_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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
  ean: string | null;
  // Oferta (solo en fetchCarrefourProduct; null en listados/búsqueda). Ver
  // carrefour_offers.sql. promoText incluye las condiciones y la validez.
  promoName: string | null;         // "3x2", "2ª unidad -70%"…
  promoText: string | null;
  promoEnd: string | null;          // ISO "2026-07-13" (para ocultar caducadas)
  strikethroughPrice: number | null; // precio ANTERIOR (unitPrice ya es el rebajado)
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

/** Carrefour guarda Madrid en las columnas base y solo persiste en
 * `regional_prices` los valores distintos. Selecciona el override de la CCAA
 * activa sin alterar las consultas de otras pantallas (ofertas/histórico). */
const mapCarrefour = (r: any, region: RegionValue | null = null): CarrefourProduct => {
  const community = region != null && region !== REGION_ALL
    ? REGION_MERCADONA_NAME[region]
    : null;
  const regional = community && r.regional_prices && typeof r.regional_prices === 'object'
    ? r.regional_prices[community]
    : null;
  return {
  id: r.id,
  displayName: r.display_name,
  thumbnail: r.thumbnail ?? null,
  unitPrice: regional?.p != null ? Number(regional.p) : r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: regional?.pf ?? r.price_format ?? null,
  pricePerUnit: regional?.ppu != null ? ppuLabel(regional.ppu, regional.ppuu) : ppuLabel(r.price_per_unit, r.price_per_unit_unit),
  categoryName: r.category_name ?? null,
  ean: r.ean ?? null,
  // Solo presentes cuando se piden (detalle); en listados quedan undefined → null.
  promoName: r.promo_name ?? null,
  promoText: r.promo_text ?? null,
  promoEnd: r.promo_end ?? null,
  strikethroughPrice: r.strikethrough_price != null ? Number(r.strikethrough_price) : null,
  ingredients: r.ingredients ?? null,
  allergens: r.allergens ?? null,
  nutrition: r.nutrition ?? null,
  conservation: r.conservation ?? null,
  preparation: r.preparation ?? null,
  denomination: r.denomination ?? null,
  origin: r.origin ?? null,
  operator: r.operator ?? null,
  };
};

// El €/unidad de medida del raw venía sin unidad ("192,50 €"); se usa el €/unidad
// canónico (columnas l/kg/ud) para mostrar "192,50 €/kg" como en el resto de supers.
const CARREFOUR_COLS =
  'id, display_name, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit, regional_prices';
// Columnas de ficha + oferta: solo para el detalle (no se piden en listados).
const CARREFOUR_DETAIL_COLS =
  `${CARREFOUR_COLS}, promo_name, promo_text, promo_end, strikethrough_price`
  + `, ean, ingredients, allergens, nutrition, conservation, preparation, denomination, origin, operator`;

/** Búsqueda por nombre en el catálogo de Carrefour (server-side). */
export async function searchCarrefourProducts(query: string, region: RegionValue | null, limit = 50, signal?: AbortSignal): Promise<CarrefourProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await abortable(filterByNameWords(
    filterRegionalAvailability(
      supabase.from('carrefour_products').select(CARREFOUR_COLS).eq('published', true),
      region,
    ),
    q,
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapCarrefour(r, region));
}

/** Navegación alfabética del catálogo de Carrefour (sin búsqueda), keyset. */
export async function browseCarrefourProducts(cursor: BrowseCursor | null, region: RegionValue | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<CarrefourProduct>> {
  const { rows, nextCursor } = await keysetPage(
    'carrefour_products', CARREFOUR_COLS, 'display_name_norm', cursor, limit,
    (q) => filterRegionalAvailability(q, region), descending, signal,
  );
  return { items: rows.map((r) => mapCarrefour(r, region)), nextCursor };
}

/** Un producto de Carrefour por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchCarrefourProduct(id: string, region: RegionValue | null): Promise<CarrefourProduct | null> {
  const { data, error } = await filterRegionalAvailability(
    supabase
      .from('carrefour_products')
      .select(CARREFOUR_DETAIL_COLS)
      .eq('id', id),
    region,
  ).maybeSingle();
  if (error) throw error;
  return data ? mapCarrefour(data, region) : null;
}

/** Una categoría N1 de Carrefour con sus subcategorías (N2) con productos. */
export interface CarrefourCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Carrefour (N1 → N2) desde el espejo. */
export async function fetchCarrefourCategoryTree(signal?: AbortSignal): Promise<CarrefourCategory[]> {
  const { data, error } = await abortable(supabase
    .from('carrefour_categories')
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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
export async function fetchCarrefourProductsByCategory(categoryId: string, region: RegionValue | null, limit = 400): Promise<CarrefourProduct[]> {
  const { data, error } = await filterRegionalAvailability(
    supabase
      .from('carrefour_products')
      .select(CARREFOUR_COLS)
      .eq('published', true)
      .contains('category_ids', [categoryId])
      .order('display_name'),
    region,
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapCarrefour(r, region));
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
export async function searchBonareaProducts(query: string, limit = 50, signal?: AbortSignal): Promise<BonareaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('bonarea_products').select(BONAREA_COLS).eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapBonarea);
}

/** Navegación alfabética del catálogo de bonÀrea (sin búsqueda), keyset. */
export async function browseBonareaProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<BonareaProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('bonarea_products', BONAREA_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit, undefined, descending, signal);
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
export async function fetchBonareaCategoryTree(signal?: AbortSignal): Promise<BonareaCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(supabase
    .from('bonarea_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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
  ean: string | null;
}

const mapConsum = (r: any, postalCode: string | null = null): ConsumProduct => {
  const regional = consumZoneFromPostalCode(postalCode) && r.regional_prices && typeof r.regional_prices === 'object'
    ? r.regional_prices[consumZoneFromPostalCode(postalCode)!]
    : null;
  return {
  id: r.id,
  displayName: r.display_name,
  brand: r.brand ?? null,
  packaging: r.packaging ?? null,
  thumbnail: r.thumbnail ?? null,
  unitPrice: regional?.p != null ? Number(regional.p) : r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: regional?.pf ?? r.price_format ?? null,
  pricePerUnit: regional?.ppu != null ? ppuLabel(regional.ppu, regional.ppuu) : ppuLabel(r.price_per_unit, r.price_per_unit_unit),
  categoryName: r.category_name ?? null,
  ean: r.ean ?? null,
  };
};

const CONSUM_COLS =
  'id, display_name, brand, packaging, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit, regional_prices';
const CONSUM_DETAIL_COLS = `${CONSUM_COLS}, ean`;
const CONSUM_OFFER_COLS = `${CONSUM_COLS}, promo_base_price`;

/** Búsqueda por nombre en el catálogo de Consum (server-side). */
export async function searchConsumProducts(query: string, region: RegionValue | null, postalCode: string | null, limit = 50, signal?: AbortSignal): Promise<ConsumProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await abortable(filterByNameWords(
    filterRegionalAvailability(supabase.from('consum_products').select(CONSUM_COLS).eq('published', true), region),
    q,
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapConsum(r, postalCode));
}

/** Navegación alfabética del catálogo de Consum (sin búsqueda), keyset. */
export async function browseConsumProducts(cursor: BrowseCursor | null, region: RegionValue | null, postalCode: string | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<ConsumProduct>> {
  const { rows, nextCursor } = await keysetPage('consum_products', CONSUM_COLS, 'display_name_norm', cursor, limit, (q) => filterRegionalAvailability(q, region), descending, signal);
  return { items: rows.map((r) => mapConsum(r, postalCode)), nextCursor };
}

/** Un producto de Consum por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchConsumProduct(id: string, region: RegionValue | null, postalCode: string | null): Promise<ConsumProduct | null> {
  const { data, error } = await filterRegionalAvailability(supabase
    .from('consum_products')
    .select(CONSUM_DETAIL_COLS)
    .eq('id', id), region).maybeSingle();
  if (error) throw error;
  return data ? mapConsum(data, postalCode) : null;
}

/** Una categoría N1 de Consum con sus subcategorías (N2) con productos. */
export interface ConsumCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Consum (N1 → N2) desde el espejo. El árbol real tiene
 *  4 niveles; category_ids incluye ancestros, así que la N2 cubre su subárbol. */
export async function fetchConsumCategoryTree(signal?: AbortSignal): Promise<ConsumCategory[]> {
  const { data, error } = await abortable(supabase
    .from('consum_categories')
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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
export async function fetchConsumProductsByCategory(categoryId: string, region: RegionValue | null, postalCode: string | null, limit = 600): Promise<ConsumProduct[]> {
  const { data, error } = await filterRegionalAvailability(supabase
    .from('consum_products')
    .select(CONSUM_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name'), region).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapConsum(r, postalCode));
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
  promoName: string | null;       // "3x2", "2ª unidad al 50%", "CLUB Dia · 25%"…
  promoText: string | null;       // condiciones completas publicadas por Dia
  promoBasePrice: number | null;  // precio tachado en descuentos directos
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

const mapDia = (r: any, region: RegionValue | null = null): DiaProduct => {
  const community = region != null && region !== REGION_ALL
    ? REGION_MERCADONA_NAME[region]
    : null;
  const regionalOffers = r.regional_offers && typeof r.regional_offers === 'object'
    ? r.regional_offers
    : {};
  const regionalOffer = community ? regionalOffers[community] : null;
  const hasRegionalSnapshots = Object.keys(regionalOffers).length > 0;
  const offerRegions = Array.isArray(r.offer_regions) ? r.offer_regions : null;
  const baseOfferApplies = r.promo_name != null && (
    !community
    || offerRegions == null
    || offerRegions.includes(community)
  );
  // Sin una CCAA concreta (perfil "Todas") se usa la oferta base. Con CCAA,
  // el snapshot regional manda; el backfill anterior al primer sync regional
  // conserva la semántica nacional mediante offer_regions = NULL.
  const offerActive = regionalOffer != null
    || (!community && r.promo_name != null)
    || (!hasRegionalSnapshots && baseOfferApplies);
  return {
    id: r.id,
    displayName: r.display_name,
    brand: r.brand ?? null,
    thumbnail: r.thumbnail ?? null,
    unitPrice: regionalOffer?.p != null ? Number(regionalOffer.p) : r.unit_price != null ? Number(r.unit_price) : null,
    priceFormat: regionalOffer?.pf ?? r.price_format ?? null,
    pricePerUnit: regionalOffer?.ppu != null
      ? ppuLabel(regionalOffer.ppu, regionalOffer.ppuu)
      : ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
    promoName: offerActive ? regionalOffer?.n ?? r.promo_name ?? null : null,
    promoText: offerActive ? regionalOffer?.t ?? r.promo_text ?? null : null,
    promoBasePrice: offerActive
      ? regionalOffer?.bp != null ? Number(regionalOffer.bp) : r.promo_base_price != null ? Number(r.promo_base_price) : null
      : null,
    // Solo presentes cuando se piden (detalle); en listados quedan undefined → null.
    description: r.description ?? null,
    ingredients: r.ingredients ?? null,
    nutrition: r.nutrition ?? null,
    conservation: r.conservation ?? null,
    preparation: r.preparation ?? null,
    denomination: r.denomination ?? null,
    operator: r.operator ?? null,
  };
};

const DIA_COLS =
  'id, display_name, brand, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit, promo_name, promo_text, promo_base_price, offer_regions, regional_offers';
const DIA_OFFER_COLS = DIA_COLS;
// Columnas de ficha: solo para el detalle (cargas pesadas → no se piden en listados).
const DIA_DETAIL_COLS =
  `${DIA_COLS}, description, ingredients, nutrition, conservation, preparation, denomination, operator`;

/** Búsqueda por nombre en el catálogo de Dia (server-side). */
export async function searchDiaProducts(query: string, region: RegionValue | null, limit = 50, signal?: AbortSignal): Promise<DiaProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await abortable(filterByNameWords(
    filterRegionalAvailability(
      supabase.from('dia_products').select(DIA_COLS).eq('published', true),
      region,
    ),
    q,
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapDia(r, region));
}

/** Navegación alfabética del catálogo de Dia (sin búsqueda), keyset. */
export async function browseDiaProducts(cursor: BrowseCursor | null, region: RegionValue | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<DiaProduct>> {
  const { rows, nextCursor } = await keysetPage(
    'dia_products', DIA_COLS, 'display_name_norm', cursor, limit,
    (q) => filterRegionalAvailability(q, region), descending, signal,
  );
  return { items: rows.map((r) => mapDia(r, region)), nextCursor };
}

/** Un producto de Dia por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchDiaProduct(id: string, region: RegionValue | null): Promise<DiaProduct | null> {
  const { data, error } = await filterRegionalAvailability(
    supabase
      .from('dia_products')
      .select(DIA_DETAIL_COLS)
      .eq('id', id),
    region,
  ).maybeSingle();
  if (error) throw error;
  return data ? mapDia(data, region) : null;
}

/** Una categoría N1 de Dia con sus subcategorías (N2) con productos. */
export interface DiaCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Dia (N1 → N2) desde el espejo. */
export async function fetchDiaCategoryTree(signal?: AbortSignal): Promise<DiaCategory[]> {
  const { data, error } = await abortable(supabase
    .from('dia_categories')
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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
export async function fetchDiaProductsByCategory(categoryId: string, region: RegionValue | null, limit = 600): Promise<DiaProduct[]> {
  const { data, error } = await filterRegionalAvailability(
    supabase
      .from('dia_products')
      .select(DIA_COLS)
      .eq('published', true)
      .contains('category_ids', [categoryId])
      .order('display_name'),
    region,
  ).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapDia(r, region));
}

// ─── Sorli (tabla sorli_products, espejo aparte) ─────────────────────────────
// Mismo modelo que Consum/Dia (espejo + category_ids + ppu en columnas reales),
// pero BILINGÜE (es/ca) como Bonpreu/bonÀrea. Lo puebla scripts/sync-sorli.mjs
// (GitHub Action con navegador headless para firmar la sesión) desde la API JSON
// de Sorliclic. El árbol tiene 3 niveles; category_ids incluye ancestros, así que
// la N2 cubre su subárbol. nutriScore/agrupaciones viven en `raw` (sin columna).
export interface SorliProduct {
  id: string;                  // idArticulo ("122"), el de la URL del producto
  displayName: string;         // incluye marca y formato ("Naranja Bolsa 2kg")
  brand: string | null;
  thumbnail: string | null;
  unitPrice: number | null;    // precio con oferta aplicada si la hay
  priceFormat: string | null;  // precio mostrado ("3,79 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("1,90 €/kg")
  categoryName: string | null;
  nutriScoreGrade: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  promoName: string | null;
  promoText: string | null;
  promoBasePrice: number | null;
  promoStart: string | null;
  promoEnd: string | null;
}

const nutriScoreGrade = (value: unknown): SorliProduct['nutriScoreGrade'] => {
  const candidate = typeof value === 'object' && value != null
    ? (value as any).grade ?? (value as any).letter ?? (value as any).value
    : value;
  const grade = typeof candidate === 'string' ? candidate.trim().toUpperCase() : null;
  return grade && ['A', 'B', 'C', 'D', 'E'].includes(grade)
    ? grade as SorliProduct['nutriScoreGrade']
    : null;
};

// Bilingüe: en català muestra display_name_ca si existe (fallback al castellano).
const mapSorli = (r: any): SorliProduct => {
  const ca = getLanguage() === 'ca';
  const promoEnd = r.promo_end ?? null;
  const promoLive = r.promo_name != null && (promoEnd == null || promoEnd >= todayLocalISO());
  return {
    id: r.id,
    displayName: ca && r.display_name_ca ? r.display_name_ca : r.display_name,
    brand: r.brand ?? null,
    thumbnail: r.thumbnail ?? null,
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    priceFormat: r.price_format ?? null,
    pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
    nutriScoreGrade: nutriScoreGrade(r.nutri_score),
    promoName: promoLive ? (ca && r.promo_name_ca ? r.promo_name_ca : r.promo_name) ?? null : null,
    promoText: promoLive ? (ca && r.promo_text_ca ? r.promo_text_ca : r.promo_text) ?? null : null,
    promoBasePrice: promoLive && r.promo_base_price != null ? Number(r.promo_base_price) : null,
    promoStart: promoLive ? r.promo_start ?? null : null,
    promoEnd: promoLive ? promoEnd : null,
  };
};

const SORLI_COLS =
  'id, display_name, display_name_ca, brand, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit, nutri_score, promo_name, promo_name_ca, promo_text, promo_text_ca, promo_base_price, promo_start, promo_end';

/** Búsqueda por nombre en el catálogo de Sorli (server-side). Bilingüe: en català
 *  busca/muestra por la columna catalana (display_name_ca[_norm]). */
export async function searchSorliProducts(query: string, limit = 50, signal?: AbortSignal): Promise<SorliProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('sorli_products').select(SORLI_COLS).eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapSorli);
}

/** Navegación alfabética del catálogo de Sorli (sin búsqueda), keyset. */
export async function browseSorliProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<SorliProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('sorli_products', SORLI_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit, undefined, descending, signal);
  return { items: rows.map(mapSorli), nextCursor };
}

/** Un producto de Sorli por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchSorliProduct(id: string): Promise<SorliProduct | null> {
  const { data, error } = await supabase
    .from('sorli_products')
    .select(SORLI_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSorli(data) : null;
}

/** Una categoría N1 de Sorli con sus subcategorías (N2) con productos. */
export interface SorliCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Sorli (N1 → N2) desde el espejo. Bilingüe: en català
 *  usa name_ca si existe (fallback al castellano). Se reordena en cliente. */
export async function fetchSorliCategoryTree(signal?: AbortSignal): Promise<SorliCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(supabase
    .from('sorli_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

/** Productos de una subcategoría (N2) de Sorli, vía category_ids (incluye ancestros). */
export async function fetchSorliProductsByCategory(categoryId: string, limit = 600): Promise<SorliProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('sorli_products')
    .select(SORLI_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order(ca ? 'display_name_ca_norm' : 'display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapSorli);
}

// ─── Condis (tabla condis_products, espejo aparte) ──────────────────────────
// Mismo modelo que Sorli (espejo + category_ids + ppu en columnas, BILINGÜE es/ca).
// Lo puebla scripts/sync-condis.mjs desde la API JSON abierta de Empathy (buscador
// de compraonline.condis.es). Árbol de 2 niveles (N1 sección → N2 family);
// category_ids incluye el N1, así que la N2 cubre su subárbol. La ficha se obtiene
// del productInformation RSC mediante una sesión OAuth anónima incremental.
export interface CondisProduct {
  id: string;                  // id de Empathy ("704048")
  displayName: string;         // incluye marca y formato ("Leche Condis semidesnatada 1 L")
  brand: string | null;
  ingredients: string | null;
  nutrition: string | null;
  conservation: string | null;
  manufacturer: string | null;
  thumbnail: string | null;
  unitPrice: number | null;    // precio con oferta aplicada si la hay
  priceFormat: string | null;  // precio mostrado ("0,87 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("0,87 €/L")
  categoryName: string | null;
}

// Bilingüe: en català muestra display_name_ca si existe (fallback al castellano).
const mapCondis = (r: any): CondisProduct => {
  const ca = getLanguage() === 'ca';
  return {
    id: r.id,
    displayName: ca && r.display_name_ca ? r.display_name_ca : r.display_name,
    brand: r.brand ?? null,
    ingredients: r.ingredients ?? null,
    nutrition: r.nutrition ?? null,
    conservation: r.conservation ?? null,
    manufacturer: r.manufacturer ?? null,
    thumbnail: r.thumbnail ?? null,
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    priceFormat: r.price_format ?? null,
    pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
  };
};

const CONDIS_COLS =
  'id, display_name, display_name_ca, brand, ingredients, nutrition, conservation, manufacturer, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
const CONDIS_OFFER_COLS =
  `${CONDIS_COLS}, promo_name, promo_text, promo_price, promo_base_price, promo_start, promo_end`;

/** Búsqueda por nombre en el catálogo de Condis (server-side). Bilingüe: en català
 *  busca/muestra por la columna catalana (display_name_ca[_norm]). */
export async function searchCondisProducts(query: string, limit = 50, signal?: AbortSignal): Promise<CondisProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('condis_products').select(CONDIS_COLS).eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapCondis);
}

/** Navegación alfabética del catálogo de Condis (sin búsqueda), keyset. */
export async function browseCondisProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<CondisProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('condis_products', CONDIS_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit, undefined, descending, signal);
  return { items: rows.map(mapCondis), nextCursor };
}

/** Un producto de Condis por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchCondisProduct(id: string): Promise<CondisProduct | null> {
  const { data, error } = await supabase
    .from('condis_products')
    .select(CONDIS_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCondis(data) : null;
}

/** Una categoría N1 de Condis con sus subcategorías (N2) con productos. */
export interface CondisCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Condis (N1 → N2) desde el espejo. Bilingüe: en català
 *  usa name_ca si existe (fallback al castellano). Se reordena en cliente. */
export async function fetchCondisCategoryTree(signal?: AbortSignal): Promise<CondisCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(supabase
    .from('condis_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

/** Productos de una subcategoría (N2) de Condis, vía category_ids (incluye ancestros). */
export async function fetchCondisProductsByCategory(categoryId: string, limit = 600): Promise<CondisProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('condis_products')
    .select(CONDIS_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order(ca ? 'display_name_ca_norm' : 'display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapCondis);
}

// ─── Ametller Origen (tabla ametller_products, espejo aparte) ────────────────
// Mismo modelo que bonÀrea (espejo + category_ids + ppu en columnas + FICHA
// bilingüe es/ca). Lo puebla scripts/sync-ametller.mjs desde la SCAPI de
// Salesforce Commerce Cloud (token de invitado por PKCE, 100% fetch). Árbol de
// hasta 3 niveles; category_ids incluye ancestros. Único espejo (con Consum) con
// EAN estructurado. Ficha: ingredientes/nutrición/conservación/origen (bilingües;
// SIN alérgenos: SFCC los da como códigos numéricos sin leyenda pública).
export interface AmetllerProduct {
  id: string;                  // productId SFCC ("55274")
  displayName: string;         // incluye marca y formato ("… Ametller Origen 150 g")
  brand: string | null;
  thumbnail: string | null;
  unitPrice: number | null;    // precio del envase
  priceFormat: string | null;  // precio mostrado ("1,49 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("9,93 €/kg")
  categoryName: string | null;
  ean: string | null;
  // Ficha (solo en fetchAmetllerProduct; null en listados/búsqueda). Bilingüe.
  ingredients: string | null;
  nutrition: string | null;
  conservation: string | null;
  origin: string | null;
}

// Bilingüe: en català muestra display_name_ca / ficha _ca si existen (fallback es).
const mapAmetller = (r: any): AmetllerProduct => {
  const ca = getLanguage() === 'ca';
  return {
    id: r.id,
    displayName: ca && r.display_name_ca ? r.display_name_ca : r.display_name,
    brand: r.brand ?? null,
    thumbnail: r.thumbnail ?? null,
    unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
    priceFormat: r.price_format ?? null,
    pricePerUnit: ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
    ean: r.ean ?? null,
    // Ficha (solo presente en detalle; en listados queda undefined → null).
    ingredients: pickLang(r.ingredients, r.ingredients_ca),
    nutrition: pickLang(r.nutrition, r.nutrition_ca),
    conservation: pickLang(r.conservation, r.conservation_ca),
    origin: pickLang(r.origin, r.origin_ca),
  };
};

const AMETLLER_COLS =
  'id, display_name, display_name_ca, brand, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
const AMETLLER_OFFER_COLS =
  `${AMETLLER_COLS}, promo_name, promo_text, promo_price, promo_base_price, promo_start, promo_end`;
// Columnas de ficha (es + ca) + ean: solo para el detalle (no en listados).
const AMETLLER_DETAIL_COLS =
  `${AMETLLER_COLS}, ean, ingredients, nutrition, conservation, origin`
  + `, ingredients_ca, nutrition_ca, conservation_ca, origin_ca`;

/** Búsqueda por nombre en el catálogo de Ametller (server-side). Bilingüe: en català
 *  busca/muestra por la columna catalana (display_name_ca[_norm]). */
export async function searchAmetllerProducts(query: string, limit = 50, signal?: AbortSignal): Promise<AmetllerProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('ametller_products').select(AMETLLER_COLS).eq('published', true),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapAmetller);
}

/** Navegación alfabética del catálogo de Ametller (sin búsqueda), keyset. */
export async function browseAmetllerProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<AmetllerProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('ametller_products', AMETLLER_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit, undefined, descending, signal);
  return { items: rows.map(mapAmetller), nextCursor };
}

/** Un producto de Ametller por id (con ficha; p.ej. para abrir el detalle). */
export async function fetchAmetllerProduct(id: string): Promise<AmetllerProduct | null> {
  const { data, error } = await supabase
    .from('ametller_products')
    .select(AMETLLER_DETAIL_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAmetller(data) : null;
}

/** Una categoría N1 de Ametller con sus subcategorías (N2) con productos. */
export interface AmetllerCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Ametller (N1 → N2) desde el espejo. Bilingüe: en català
 *  usa name_ca si existe (fallback al castellano). Se reordena en cliente. */
export async function fetchAmetllerCategoryTree(signal?: AbortSignal): Promise<AmetllerCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(supabase
    .from('ametller_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

/** Productos de una subcategoría (N2) de Ametller, vía category_ids (incluye ancestros). */
export async function fetchAmetllerProductsByCategory(categoryId: string, limit = 600): Promise<AmetllerProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await supabase
    .from('ametller_products')
    .select(AMETLLER_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order(ca ? 'display_name_ca_norm' : 'display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapAmetller);
}

// ─── Aldi (tabla aldi_products, espejo aparte) ───────────────────────────────
// Mismo modelo que Consum (espejo + category_ids + ppu en columnas reales, con
// marca y formato del envase), pero SOLO castellano (aldi.es no es bilingüe) y
// SIN ficha ni EAN. Lo puebla scripts/sync-aldi.mjs raspando el JSON de Algolia
// embebido en el SSR de cada categoría hoja de aldi.es. Árbol de 2 niveles
// (N1 → N2 hoja); category_ids incluye el N1, así que la N2 cubre su subárbol.
export interface AldiProduct {
  id: string;                  // objectID de Algolia ("970000")
  displayName: string;
  brand: string | null;
  packaging: string | null;    // salesUnit ("1 l unidad", "140 g unidad")
  thumbnail: string | null;
  unitPrice: number | null;    // precio del envase
  priceFormat: string | null;  // precio mostrado ("1,05 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("1,05 €/L")
  categoryName: string | null;
}

const mapAldi = (r: any): AldiProduct => ({
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

const ALDI_COLS =
  'id, display_name, brand, packaging, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
const ALDI_OFFER_COLS = `${ALDI_COLS}, promo_name, promo_base_price, promo_end`;

/** Búsqueda por nombre en el catálogo de Aldi (server-side). */
export async function searchAldiProducts(query: string, limit = 50, signal?: AbortSignal): Promise<AldiProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('aldi_products').select(ALDI_COLS).eq('published', true),
    q,
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapAldi);
}

/** Navegación alfabética del catálogo de Aldi (sin búsqueda), keyset. */
export async function browseAldiProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<AldiProduct>> {
  const { rows, nextCursor } = await keysetPage('aldi_products', ALDI_COLS, 'display_name_norm', cursor, limit, undefined, descending, signal);
  return { items: rows.map(mapAldi), nextCursor };
}

/** Un producto de Aldi por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchAldiProduct(id: string): Promise<AldiProduct | null> {
  const { data, error } = await supabase
    .from('aldi_products')
    .select(ALDI_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAldi(data) : null;
}

/** Una categoría N1 de Aldi con sus subcategorías (N2) con productos. */
export interface AldiCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Aldi (N1 → N2) desde el espejo. */
export async function fetchAldiCategoryTree(signal?: AbortSignal): Promise<AldiCategory[]> {
  const { data, error } = await abortable(supabase
    .from('aldi_categories')
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

/** Productos de una subcategoría (N2) de Aldi, vía category_ids (incluye el N1). */
export async function fetchAldiProductsByCategory(categoryId: string, limit = 600): Promise<AldiProduct[]> {
  const { data, error } = await supabase
    .from('aldi_products')
    .select(ALDI_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapAldi);
}

// ─── HiperDino (tabla hiperdino_products, espejo aparte) ─────────────────────
// Mismo modelo que Aldi (espejo + category_ids, con category_name), pero SOLO
// castellano (hiperdino.es no es bilingüe), SIN ficha, SIN EAN y SIN €/unidad
// (Magento no lo expone). Lo puebla scripts/sync-hiperdino.mjs vía GraphQL de
// Magento. Árbol de 2 niveles (N1 → N2); category_ids incluye el N1.
// OJO: HiperDino solo opera en Canarias (ver COMUNIDAD-AUTONOMA.md).
export interface HiperdinoProduct {
  id: string;                  // sku de Magento ("000000000003970669")
  displayName: string;
  brand: string | null;        // null (el nombre ya incluye marca)
  packaging: string | null;    // null (el formato va en el nombre)
  thumbnail: string | null;
  unitPrice: number | null;    // precio del envase
  priceFormat: string | null;  // precio mostrado ("1,99 €")
  pricePerUnit: string | null; // null (HiperDino no expone €/ud)
  categoryName: string | null;
}

const mapHiperdino = (r: any): HiperdinoProduct => ({
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

const HIPERDINO_COLS =
  'id, display_name, brand, packaging, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
const HIPERDINO_OFFER_COLS = `${HIPERDINO_COLS}, promo_base_price`;

/** Búsqueda por nombre en el catálogo de HiperDino (server-side). */
export async function searchHiperdinoProducts(query: string, limit = 50, signal?: AbortSignal): Promise<HiperdinoProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('hiperdino_products').select(HIPERDINO_COLS).eq('published', true),
    q,
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapHiperdino);
}

/** Navegación alfabética del catálogo de HiperDino (sin búsqueda), keyset. */
export async function browseHiperdinoProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<HiperdinoProduct>> {
  const { rows, nextCursor } = await keysetPage('hiperdino_products', HIPERDINO_COLS, 'display_name_norm', cursor, limit, undefined, descending, signal);
  return { items: rows.map(mapHiperdino), nextCursor };
}

/** Un producto de HiperDino por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchHiperdinoProduct(id: string): Promise<HiperdinoProduct | null> {
  const { data, error } = await supabase
    .from('hiperdino_products')
    .select(HIPERDINO_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapHiperdino(data) : null;
}

/** Una categoría N1 de HiperDino con sus subcategorías (N2) con productos. */
export interface HiperdinoCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de HiperDino (N1 → N2) desde el espejo. */
export async function fetchHiperdinoCategoryTree(signal?: AbortSignal): Promise<HiperdinoCategory[]> {
  const { data, error } = await abortable(supabase
    .from('hiperdino_categories')
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

/** Productos de una subcategoría (N2) de HiperDino, vía category_ids (incluye el N1). */
export async function fetchHiperdinoProductsByCategory(categoryId: string, limit = 600): Promise<HiperdinoProduct[]> {
  const { data, error } = await supabase
    .from('hiperdino_products')
    .select(HIPERDINO_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapHiperdino);
}

// ─── Alcampo (tabla alcampo_products, espejo aparte) ─────────────────────────
// Mismo modelo que Dia (espejo + category_ids + ppu en columnas reales, CON ficha).
// SOLO castellano (compraonline.alcampo.es sirve es-ES). Lo puebla
// scripts/sync-alcampo.mjs desde la API REST de Ocado (product-pages, listado
// decorado) + el HTML de la PDP (ficha). El árbol es de 2 niveles (N1→N2). El EAN
// solo está en ~20 % de las fichas (columna, no mostrada); el comparador casa por
// nombre. Ver migración alcampo_catalog.sql.
export interface AlcampoProduct {
  id: string;                  // productId (UUID de Ocado)
  displayName: string;         // incluye marca y formato
  brand: string | null;
  packaging: string | null;    // packSizeDescription ("9000ml", "10x41.5g")
  thumbnail: string | null;
  unitPrice: number | null;    // precio del envase
  priceFormat: string | null;  // precio mostrado ("5,04 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("0,84 €/L")
  categoryName: string | null;
  // Ficha (solo en fetchAlcampoProduct; null en listados/búsqueda). La rellena
  // scripts/sync-alcampo.mjs del HTML de la PDP. Ver migración alcampo_catalog.sql.
  description: string | null;
  ingredients: string | null;
  nutrition: string | null;
  conservation: string | null;
  preparation: string | null;
  denomination: string | null;
  operator: string | null;
  origin: string | null;
  ean: string | null;
}

const mapAlcampo = (r: any): AlcampoProduct => ({
  id: r.id,
  displayName: r.display_name,
  brand: r.brand ?? null,
  packaging: r.packaging ?? null,
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
  origin: r.origin ?? null,
  ean: r.ean ?? null,
});

const ALCAMPO_COLS =
  'id, display_name, brand, packaging, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit';
const ALCAMPO_OFFER_COLS =
  `${ALCAMPO_COLS}, promo_name, promo_text, promo_price, promo_base_price, promo_start, promo_end`;
// Columnas de ficha: solo para el detalle (cargas pesadas → no se piden en listados).
const ALCAMPO_DETAIL_COLS =
  `${ALCAMPO_COLS}, description, ingredients, nutrition, conservation, preparation, denomination, operator, origin, ean`;

/** Búsqueda por nombre en el catálogo de Alcampo (server-side). */
export async function searchAlcampoProducts(query: string, limit = 50, signal?: AbortSignal): Promise<AlcampoProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await abortable(filterByNameWords(
    supabase.from('alcampo_products').select(ALCAMPO_COLS).eq('published', true),
    q,
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapAlcampo);
}

/** Navegación alfabética del catálogo de Alcampo (sin búsqueda), keyset. */
export async function browseAlcampoProducts(cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<AlcampoProduct>> {
  const { rows, nextCursor } = await keysetPage('alcampo_products', ALCAMPO_COLS, 'display_name_norm', cursor, limit, undefined, descending, signal);
  return { items: rows.map(mapAlcampo), nextCursor };
}

/** Un producto de Alcampo por id (p.ej. para abrir el detalle desde la comparativa). */
export async function fetchAlcampoProduct(id: string): Promise<AlcampoProduct | null> {
  const { data, error } = await supabase
    .from('alcampo_products')
    .select(ALCAMPO_DETAIL_COLS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapAlcampo(data) : null;
}

/** Una categoría N1 de Alcampo con sus subcategorías (N2) con productos. */
export interface AlcampoCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Alcampo (N1 → N2) desde el espejo. */
export async function fetchAlcampoCategoryTree(signal?: AbortSignal): Promise<AlcampoCategory[]> {
  const { data, error } = await abortable(supabase
    .from('alcampo_categories')
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

/** Productos de una subcategoría (N2) de Alcampo, vía category_ids (incluye el N1). */
export async function fetchAlcampoProductsByCategory(categoryId: string, limit = 600): Promise<AlcampoProduct[]> {
  const { data, error } = await supabase
    .from('alcampo_products')
    .select(ALCAMPO_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapAlcampo);
}

// ─── Eroski + Caprabo (tablas eroski_products / caprabo_products) ────────────
// Comparten backend (Apache Tapestry): mismo modelo de producto, mismos ids de
// categoría, mismo scraper (scripts/lib/eroski-tapestry.mjs). Solo castellano y
// SIN precio por unidad (el €/L no está en el listado, solo en la ficha) → una
// forma común `TapestryProduct` y helpers genéricos por tabla; los exports por
// tienda solo fijan la tabla. `store` en el mapa a UI lo pone cada adaptador.
export interface TapestryProduct {
  id: string;
  displayName: string;
  brand: string | null;
  thumbnail: string | null;
  unitPrice: number | null;
  priceFormat: string | null;
  categoryName: string | null;
  nutrition: string | null;
}

const mapTapestry = (r: any): TapestryProduct => ({
  id: r.id,
  displayName: r.display_name,
  brand: r.brand ?? null,
  thumbnail: r.thumbnail ?? null,
  unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
  priceFormat: r.price_format ?? null,
  categoryName: r.category_name ?? null,
  nutrition: r.nutrition ?? null,
});

const TAPESTRY_COLS = 'id, display_name, brand, thumbnail, unit_price, price_format, category_name';
const TAPESTRY_OFFER_COLS =
  `${TAPESTRY_COLS}, promo_name, promo_text, promo_price, promo_base_price, promo_start, promo_end`;
const TAPESTRY_DETAIL_COLS = `${TAPESTRY_COLS}, nutrition`;

async function searchTapestry(table: string, query: string, limit: number, signal?: AbortSignal): Promise<TapestryProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { data, error } = await abortable(filterByNameWords(
    supabase.from(table).select(TAPESTRY_COLS).eq('published', true),
    q,
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map(mapTapestry);
}

async function browseTapestry(table: string, cursor: BrowseCursor | null, limit: number, signal?: AbortSignal, descending = false): Promise<BrowsePage<TapestryProduct>> {
  const { rows, nextCursor } = await keysetPage(table, TAPESTRY_COLS, 'display_name_norm', cursor, limit, undefined, descending, signal);
  return { items: rows.map(mapTapestry), nextCursor };
}

async function fetchTapestryProduct(table: string, id: string): Promise<TapestryProduct | null> {
  const { data, error } = await supabase.from(table).select(TAPESTRY_DETAIL_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapTapestry(data) : null;
}

export interface TapestryCategory { id: string; name: string; children: { id: string; name: string }[]; }

async function fetchTapestryTree(catTable: string, signal?: AbortSignal): Promise<TapestryCategory[]> {
  const { data, error } = await abortable(supabase
    .from(catTable)
    .select('id, name, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

async function fetchTapestryByCategory(table: string, categoryId: string, limit: number): Promise<TapestryProduct[]> {
  const { data, error } = await supabase
    .from(table)
    .select(TAPESTRY_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order('display_name')
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapTapestry);
}

// Exports por tienda (solo fijan la tabla; misma forma TapestryProduct).
export const searchEroskiProducts = (q: string, limit = 50, signal?: AbortSignal) => searchTapestry('eroski_products', q, limit, signal);
export const browseEroskiProducts = (cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false) => browseTapestry('eroski_products', cursor, limit, signal, descending);
export const fetchEroskiProduct = (id: string) => fetchTapestryProduct('eroski_products', id);
export const fetchEroskiCategoryTree = (signal?: AbortSignal) => fetchTapestryTree('eroski_categories', signal);
export const fetchEroskiProductsByCategory = (categoryId: string, limit = 600) => fetchTapestryByCategory('eroski_products', categoryId, limit);

export const searchCapraboProducts = (q: string, limit = 50, signal?: AbortSignal) => searchTapestry('caprabo_products', q, limit, signal);
export const browseCapraboProducts = (cursor: BrowseCursor | null, limit = 50, signal?: AbortSignal, descending = false) => browseTapestry('caprabo_products', cursor, limit, signal, descending);
export const fetchCapraboProduct = (id: string) => fetchTapestryProduct('caprabo_products', id);
export const fetchCapraboCategoryTree = (signal?: AbortSignal) => fetchTapestryTree('caprabo_categories', signal);
export const fetchCapraboProductsByCategory = (categoryId: string, limit = 600) => fetchTapestryByCategory('caprabo_products', categoryId, limit);

// ─── Plusfresc (tabla plusfresc_products, espejo aparte) ─────────────────────
// Mismo modelo que bonÀrea/Ametller (espejo + category_ids + ppu en columnas +
// FICHA bilingüe es/ca). Lo puebla scripts/sync-plusfresc.mjs desde la API REST
// abierta de wscompra.plusfresc.cat (JWT de invitado, fetch puro). Árbol de
// hasta 4 niveles por prefijo de id; category_ids incluye ancestros. Ficha:
// descripción/ingredientes/ALÉRGENOS/nutrición/conservación (único espejo con
// alérgenos legibles junto a Carrefour); las columnas _ca solo existen si la
// API los dio traducidos (fallback al castellano vía pickLang).
export interface PlusfrescProduct {
  id: string;                  // item_id ("002843")
  displayName: string;         // incluye marca y formato ("Leche fresca entera LETONA, 1.5 l")
  brand: string | null;
  thumbnail: string | null;
  unitPrice: number | null;    // precio del envase
  priceFormat: string | null;  // precio mostrado ("2,89 €")
  pricePerUnit: string | null; // etiqueta €/unidad canónica ("1,92 €/L")
  categoryName: string | null;
  // Ficha (solo en fetchPlusfrescProduct; null en listados/búsqueda). Bilingüe.
  description: string | null;
  ingredients: string | null;
  allergens: string | null;
  nutrition: string | null;
  conservation: string | null;
}

// Bilingüe: en català muestra display_name_ca / ficha _ca si existen (fallback es).
const mapPlusfresc = (r: any, postalCode: string | null = null): PlusfrescProduct => {
  const ca = getLanguage() === 'ca';
  const center = plusfrescCenterFromPostalCode(postalCode);
  const regional = center && r.center_prices && typeof r.center_prices === 'object'
    ? r.center_prices[center]
    : null;
  return {
    id: r.id,
    displayName: ca && r.display_name_ca ? r.display_name_ca : r.display_name,
    brand: r.brand ?? null,
    thumbnail: r.thumbnail ?? null,
    unitPrice: regional?.p != null ? Number(regional.p) : r.unit_price != null ? Number(r.unit_price) : null,
    priceFormat: regional?.pf ?? r.price_format ?? null,
    pricePerUnit: regional?.ppu != null ? ppuLabel(regional.ppu, regional.ppuu) : ppuLabel(r.price_per_unit, r.price_per_unit_unit),
    categoryName: r.category_name ?? null,
    // Ficha (solo presente en detalle; en listados queda undefined → null).
    description: pickLang(r.description, r.description_ca),
    ingredients: pickLang(r.ingredients, r.ingredients_ca),
    allergens: pickLang(r.allergens, r.allergens_ca),
    nutrition: pickLang(r.nutrition, r.nutrition_ca),
    conservation: pickLang(r.conservation, r.conservation_ca),
  };
};

const PLUSFRESC_COLS =
  'id, display_name, display_name_ca, brand, thumbnail, unit_price, price_format, category_name, price_per_unit, price_per_unit_unit, center_prices';
const PLUSFRESC_OFFER_COLS =
  `${PLUSFRESC_COLS}, promo_name, promo_name_ca, promo_offer_price, promo_base_price, promo_end`;
// Columnas de ficha (es + ca): solo para el detalle (no en listados).
const PLUSFRESC_DETAIL_COLS =
  `${PLUSFRESC_COLS}, description, ingredients, allergens, nutrition, conservation`
  + `, description_ca, ingredients_ca, allergens_ca, nutrition_ca, conservation_ca`;

/** Búsqueda por nombre en el catálogo de Plusfresc (server-side). Bilingüe: en català
 *  busca/muestra por la columna catalana (display_name_ca[_norm]). */
export async function searchPlusfrescProducts(query: string, postalCode: string | null, limit = 50, signal?: AbortSignal): Promise<PlusfrescProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(filterByNameWords(
    filterCenterAvailability(supabase.from('plusfresc_products').select(PLUSFRESC_COLS).eq('published', true), plusfrescCenterFromPostalCode(postalCode)),
    q,
    ca ? 'display_name_ca_norm' : 'display_name_norm',
  ).limit(limit), signal);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapPlusfresc(r, postalCode));
}

/** Navegación alfabética del catálogo de Plusfresc (sin búsqueda), keyset. */
export async function browsePlusfrescProducts(cursor: BrowseCursor | null, postalCode: string | null, limit = 50, signal?: AbortSignal, descending = false): Promise<BrowsePage<PlusfrescProduct>> {
  const ca = getLanguage() === 'ca';
  const { rows, nextCursor } = await keysetPage('plusfresc_products', PLUSFRESC_COLS, ca ? 'display_name_ca_norm' : 'display_name_norm', cursor, limit, (q) => filterCenterAvailability(q, plusfrescCenterFromPostalCode(postalCode)), descending, signal);
  return { items: rows.map((r) => mapPlusfresc(r, postalCode)), nextCursor };
}

/** Un producto de Plusfresc por id (con ficha; p.ej. para abrir el detalle). */
export async function fetchPlusfrescProduct(id: string, postalCode: string | null): Promise<PlusfrescProduct | null> {
  const { data, error } = await filterCenterAvailability(supabase
    .from('plusfresc_products')
    .select(PLUSFRESC_DETAIL_COLS)
    .eq('id', id), plusfrescCenterFromPostalCode(postalCode)).maybeSingle();
  if (error) throw error;
  return data ? mapPlusfresc(data, postalCode) : null;
}

/** Una categoría N1 de Plusfresc con sus subcategorías (N2) con productos. */
export interface PlusfrescCategory {
  id: string;
  name: string;
  children: { id: string; name: string }[];
}

/** Árbol de categorías de Plusfresc (N1 → N2) desde el espejo. Bilingüe: en català
 *  usa name_ca si existe (fallback al castellano). Se reordena en cliente. */
export async function fetchPlusfrescCategoryTree(signal?: AbortSignal): Promise<PlusfrescCategory[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await abortable(supabase
    .from('plusfresc_categories')
    .select('id, name, name_ca, parent_id, product_count')
    .eq('published', true)
    .order('name'), signal);
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

/** Productos de una subcategoría (N2) de Plusfresc, vía category_ids (incluye ancestros). */
export async function fetchPlusfrescProductsByCategory(categoryId: string, postalCode: string | null, limit = 600): Promise<PlusfrescProduct[]> {
  const ca = getLanguage() === 'ca';
  const { data, error } = await filterCenterAvailability(supabase
    .from('plusfresc_products')
    .select(PLUSFRESC_COLS)
    .eq('published', true)
    .contains('category_ids', [categoryId])
    .order(ca ? 'display_name_ca_norm' : 'display_name'), plusfrescCenterFromPostalCode(postalCode)).limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => mapPlusfresc(r, postalCode));
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

// ─── Novedades de la semana + cambios de precio (accesos del Home) ───────────
// Ambas leen el espejo con una config por súper (tabla + columnas de listado +
// adaptador fila→UIProduct que reutiliza el map* correspondiente). Requieren
// las migraciones catalog_first_seen.sql y catalog_price_changes.sql: sin
// ellas la query falla por columna inexistente y la pantalla muestra su error.

const MIRROR_QUERY: Record<CatalogStore, { table: string; cols: string; toUI: (r: any) => UIProduct }> = {
  mercadona: {
    table: 'mercadona_products',
    // unit_price se añade a las columnas de búsqueda para que fetchPriceChanges
    // tenga el precio nuevo como columna (el resto de súpers ya lo llevan).
    cols: 'id, raw, display_name_ca, category_name, category_id, unit_price',
    toUI: (r) => mercadonaToUI(mirrorMercadonaProduct(r, getLanguage() === 'ca')),
  },
  esclat:    { table: 'bonpreu_products',   cols: BONPREU_COLS,   toUI: (r) => bonpreuToUI(mapBonpreu(r)) },
  carrefour: { table: 'carrefour_products', cols: CARREFOUR_COLS, toUI: (r) => carrefourToUI(mapCarrefour(r)) },
  bonarea:   { table: 'bonarea_products',   cols: BONAREA_COLS,   toUI: (r) => bonareaToUI(mapBonarea(r)) },
  consum:    { table: 'consum_products',    cols: CONSUM_COLS,    toUI: (r) => consumToUI(mapConsum(r)) },
  dia:       { table: 'dia_products',       cols: DIA_COLS,       toUI: (r) => diaToUI(mapDia(r)) },
  sorli:     { table: 'sorli_products',     cols: SORLI_COLS,     toUI: (r) => sorliToUI(mapSorli(r)) },
  eroski:    { table: 'eroski_products',    cols: TAPESTRY_COLS,  toUI: (r) => eroskiToUI(mapTapestry(r)) },
  caprabo:   { table: 'caprabo_products',   cols: TAPESTRY_COLS,  toUI: (r) => capraboToUI(mapTapestry(r)) },
  condis:    { table: 'condis_products',    cols: CONDIS_COLS,    toUI: (r) => condisToUI(mapCondis(r)) },
  ametller:  { table: 'ametller_products',  cols: AMETLLER_COLS,  toUI: (r) => ametllerToUI(mapAmetller(r)) },
  aldi:      { table: 'aldi_products',       cols: ALDI_COLS,      toUI: (r) => aldiToUI(mapAldi(r)) },
  hiperdino: { table: 'hiperdino_products',  cols: HIPERDINO_COLS, toUI: (r) => hiperdinoToUI(mapHiperdino(r)) },
  alcampo:   { table: 'alcampo_products',    cols: ALCAMPO_COLS,   toUI: (r) => alcampoToUI(mapAlcampo(r)) },
  plusfresc: { table: 'plusfresc_products',  cols: PLUSFRESC_COLS, toUI: (r) => plusfrescToUI(mapPlusfresc(r)) },
};

/** Aplica la disponibilidad que cada espejo conoce. Los catálogos sin columnas
 * regionales se mantienen tal cual; su visibilidad global se resuelve en UI por
 * STORE_REGIONS. */
function filterMirrorLocation(query: any, store: CatalogStore, region: RegionValue | null, postalCode: string | null): any {
  if (store === 'mercadona' || store === 'carrefour' || store === 'consum' || store === 'dia') {
    return filterRegionalAvailability(query, region);
  }
  if (store === 'plusfresc') return filterCenterAvailability(query, plusfrescCenterFromPostalCode(postalCode));
  return query;
}

/** Mismo adaptador que el catálogo principal, pero conservando la ubicación del
 * perfil al pintar feeds transversales (Novedades/Cambios de precios). */
function mirrorToUIAtLocation(store: CatalogStore, row: any, region: RegionValue | null, postalCode: string | null): UIProduct {
  if (store === 'carrefour') return carrefourToUI(mapCarrefour(row, region));
  if (store === 'consum') return consumToUI(mapConsum(row, postalCode));
  if (store === 'dia') return diaToUI(mapDia(row, region));
  if (store === 'plusfresc') return plusfrescToUI(mapPlusfresc(row, postalCode));
  return MIRROR_QUERY[store].toUI(row);
}

// Ventana de "esta semana": los syncs son semanales (lunes); 8 días cubren el
// último lote con margen sin llegar a solapar dos.
const WEEK_WINDOW_DAYS = 8;
const weekAgoISO = () => new Date(Date.now() - WEEK_WINDOW_DAYS * 86_400_000).toISOString();

// Más novedades que esto en una semana no son novedades: es el PRIMER llenado
// de la tabla (súper recién estrenado o backfill) → se oculta el lote entero.
const NEW_INITIAL_FILL_CAP = 400;

export interface WeeklyNewProductsPage {
  items: UIProduct[];
  nextOffset: number | null;
}

/** Novedades de la semana de un súper. Mercadona usa su endpoint oficial de
 *  novedades (curado por ellos, en vivo, disponible desde ya); el resto, la
 *  columna first_seen_at del espejo: los productos que APARECIERON en el
 *  último sync. Devuelve UIProduct listos para StoreProductList. */
export async function fetchWeeklyNewProducts(
  store: CatalogStore,
  region: RegionValue | null,
  postalCode: string | null,
  limit = 50,
  offset = 0,
): Promise<WeeklyNewProductsPage> {
  if (store === 'mercadona') {
    // El raw de new-arrivals no trae `categories` → categoryName null y el
    // producto cae en la zona "Otros" al añadirlo (igual que los favoritos).
    const warehouse = await resolveWarehouseForPostalCode(postalCode);
    const items = await fetchNewArrivals(warehouse ?? undefined);
    return {
      items: items.slice(offset, offset + limit).map((p) => mercadonaToUI(p)),
      nextOffset: items.length > offset + limit ? offset + limit : null,
    };
  }
  const m = MIRROR_QUERY[store];
  const { data, error, count } = await filterMirrorLocation(supabase
    .from(m.table)
    .select(m.cols, { count: 'exact' })
    .eq('published', true)
    .gte('first_seen_at', weekAgoISO())
    .order('first_seen_at', { ascending: false })
    .order('display_name', { ascending: true }), store, region, postalCode)
    .range(offset, offset + limit - 1);
  if (error) throw error;
  if ((count ?? 0) > NEW_INITIAL_FILL_CAP) return { items: [], nextOffset: null };
  return {
    items: (data ?? []).map((r: any) => mirrorToUIAtLocation(store, r, region, postalCode)),
    nextOffset: (count ?? 0) > offset + limit ? offset + limit : null,
  };
}

/** Un cambio de precio detectado por el trigger del espejo (catalog_price_changes.sql). */
export interface PriceChangeProduct {
  product: UIProduct;      // con el precio NUEVO (el actual del espejo)
  prevPrice: number;
  newPrice: number;
  /** Variación en % (negativa = bajada), redondeada a 1 decimal en la BD. */
  deltaPct: number;
}

export interface PriceChangesPage {
  items: PriceChangeProduct[];
  nextOffset: number | null;
}

function locationForPriceHistory(
  store: CatalogStore,
  postalCode: string | null,
): string | null {
  if (store === 'consum') return consumZoneFromPostalCode(postalCode);
  if (store === 'plusfresc') return plusfrescCenterFromPostalCode(postalCode);
  return null;
}

/** Price changes in the normalized location history. Product data is read from
 * the catalog mirror afterwards so modals, cart and favorites keep working. */
async function fetchLocationPriceChanges(
  store: 'consum' | 'plusfresc',
  locationId: string,
  direction: 'down' | 'up',
  region: RegionValue | null,
  postalCode: string | null,
  limit: number,
  offset: number,
): Promise<PriceChangesPage> {
  const down = direction === 'down';
  let changesQuery = supabase
    .from('catalog_location_price_changes')
    .select('product_id, prev_unit_price, new_unit_price, price_delta_pct, changed_at')
    .eq('store', store)
    .eq('location_id', locationId)
    .gte('changed_at', weekAgoISO());
  changesQuery = down ? changesQuery.lt('price_delta_pct', 0) : changesQuery.gt('price_delta_pct', 0);
  const { data: changes, error: changesError } = await changesQuery
    .order('price_delta_pct', { ascending: down })
    .order('changed_at', { ascending: false })
    .order('product_id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (changesError) throw changesError;

  // A product can change twice in one week. Preserve the current behavior of
  // one card per product, using the most relevant change from the ordered feed.
  const latestByProduct = new Map<string, any>();
  for (const change of changes ?? []) {
    if (!latestByProduct.has(change.product_id)) latestByProduct.set(change.product_id, change);
  }
  const productIds = [...latestByProduct.keys()];
  if (productIds.length === 0) {
    return { items: [], nextOffset: (changes ?? []).length === limit ? offset + limit : null };
  }

  const m = MIRROR_QUERY[store];
  const { data: products, error: productsError } = await filterMirrorLocation(supabase
    .from(m.table)
    .select(m.cols)
    .in('id', productIds)
    .eq('published', true), store, region, postalCode);
  if (productsError) throw productsError;
  const productById = new Map((products ?? []).map((product: any) => [product.id, product]));

  const items = [...latestByProduct.values()].flatMap((change: any) => {
    const product = productById.get(change.product_id);
    if (!product) return [];
    return [{
      product: mirrorToUIAtLocation(store, product, region, postalCode),
      prevPrice: Number(change.prev_unit_price),
      newPrice: Number(change.new_unit_price),
      deltaPct: Number(change.price_delta_pct),
    }];
  });
  return {
    items: items.slice(0, limit),
    nextOffset: (changes ?? []).length === limit ? offset + limit : null,
  };
}

/** Cambios de precio de la última semana en un súper, con la mayor bajada o
 *  subida primero. Filtra y ordena por price_delta_pct, que calcula el trigger
 *  junto con prev_unit_price (PostgREST no compara columna contra columna). */
export async function fetchPriceChanges(
  store: CatalogStore,
  direction: 'down' | 'up',
  region: RegionValue | null,
  postalCode: string | null,
  limit = 50,
  offset = 0,
): Promise<PriceChangesPage> {
  const locationId = locationForPriceHistory(store, postalCode);
  if (locationId && (store === 'consum' || store === 'plusfresc')) {
    return fetchLocationPriceChanges(store, locationId, direction, region, postalCode, limit, offset);
  }
  const m = MIRROR_QUERY[store];
  const down = direction === 'down';
  let q = filterMirrorLocation(supabase
    .from(m.table)
    .select(`${m.cols}, prev_unit_price, price_delta_pct`)
    .eq('published', true)
    .gte('price_changed_at', weekAgoISO()), store, region, postalCode);
  q = down ? q.lt('price_delta_pct', 0) : q.gt('price_delta_pct', 0);
  const { data, error } = await q
    // Bajadas: el % más negativo primero (asc); subidas: el más positivo (desc).
    .order('price_delta_pct', { ascending: down })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const items = (data ?? [])
    .filter((r: any) => r.unit_price != null && r.prev_unit_price != null && r.price_delta_pct != null)
    .map((r: any) => ({
      product: mirrorToUIAtLocation(store, r, region, postalCode),
      prevPrice: Number(r.prev_unit_price),
      newPrice: Number(r.unit_price),
      deltaPct: Number(r.price_delta_pct),
    }));
  return {
    items: items.slice(0, limit),
    nextOffset: (data ?? []).length === limit ? offset + limit : null,
  };
}

// ─── Ofertas (acceso del Home) ───────────────────────────────────────────────
// Cada retailer entra únicamente con una señal explícita de promoción del feed:
// nunca se confunde una variación semanal ordinaria con una oferta.

/** Súpers con ofertas; OffersScreen monta su selector con
 *  esta lista, así que añadir un súper aquí + su fetch lo estrena en la UI. */
export const OFFER_STORES: CatalogStore[] = [
  'carrefour', 'esclat', 'consum', 'dia', 'sorli', 'eroski', 'caprabo',
  'condis', 'ametller', 'aldi', 'hiperdino', 'alcampo', 'plusfresc',
];

type NormalizedOfferStore = 'eroski' | 'caprabo' | 'condis' | 'ametller' | 'alcampo';

const NORMALIZED_OFFER_CONFIG: Record<NormalizedOfferStore, {
  table: string;
  columns: string;
  bilingual: boolean;
  toUI: (row: any) => UIProduct;
}> = {
  eroski: {
    table: 'eroski_products',
    columns: TAPESTRY_OFFER_COLS,
    bilingual: false,
    toUI: (row) => eroskiToUI(mapTapestry(row)),
  },
  caprabo: {
    table: 'caprabo_products',
    columns: TAPESTRY_OFFER_COLS,
    bilingual: false,
    toUI: (row) => capraboToUI(mapTapestry(row)),
  },
  condis: {
    table: 'condis_products',
    columns: CONDIS_OFFER_COLS,
    bilingual: true,
    toUI: (row) => condisToUI(mapCondis(row)),
  },
  ametller: {
    table: 'ametller_products',
    columns: AMETLLER_OFFER_COLS,
    bilingual: true,
    toUI: (row) => ametllerToUI(mapAmetller(row)),
  },
  alcampo: {
    table: 'alcampo_products',
    columns: ALCAMPO_OFFER_COLS,
    bilingual: false,
    toUI: (row) => alcampoToUI(mapAlcampo(row)),
  },
};

const isNormalizedOfferStore = (store: CatalogStore): store is NormalizedOfferStore =>
  store === 'eroski' || store === 'caprabo' || store === 'condis'
  || store === 'ametller' || store === 'alcampo';

export interface CarrefourOffer {
  product: UIProduct;        // con el precio ACTUAL (rebajado si es descuento directo)
  promoName: string | null;  // "3x2", "2ª unidad -70%"… (null en descuento directo puro)
  promoEnd: string | null;   // fin de validez ISO ("2026-07-13"), null si el badge no lo traía
  prevPrice: number | null;  // precio anterior tachado (null en promos de lote)
}
/** Alias genérico: una oferta cualquiera de la pantalla "Ofertas" (varios súpers). */
export type StoreOffer = CarrefourOffer;

/** Filtros de la pantalla Ofertas. Nombre/categoría/precio se aplican en
 * PostgREST; el tipo se resuelve sobre la promoción final y recorre páginas
 * keyset completas. Nunca se filtra solo lo ya visible. */
export interface OfferFilters {
  /** Búsqueda por nombre (insensible a acentos, palabras en cualquier orden). */
  search?: string;
  /** Categorías seleccionadas (multi); [] = todas. */
  categories?: string[];
  /** Rango de precio: min exclusivo, max inclusivo (null = sin tope). */
  priceMin?: number | null;
  priceMax?: number | null;
  /** Orden por precio; sin él, alfabético. */
  sort?: 'asc' | 'desc' | null;
  /** Tipos de promoción seleccionados (multi); [] = todos. */
  offerTypes?: OfferType[];
}

// Condiciones comunes de OfferFilters sobre una query de espejo (todas se
// AND-combinan con el filtro de oferta viva y el cursor). Con orden por precio
// se excluyen filas sin precio: el cursor keyset no sabe compararlas.
function applyOfferFilters(q: any, f: OfferFilters | undefined, normCol: string) {
  if (!f) return q;
  if (f.search && f.search.trim().length >= 2) q = filterByNameWords(q, f.search, normCol);
  if (f.categories && f.categories.length > 0) q = q.in('category_name', f.categories);
  if (f.priceMin != null && f.priceMin > 0) q = q.gt('unit_price', f.priceMin);
  if (f.priceMax != null) q = q.lte('unit_price', f.priceMax);
  if (f.sort) q = q.not('unit_price', 'is', null);
  return q;
}

// "YYYY-MM-DD" en hora LOCAL (toISOString es UTC y adelanta/atrasa el día en
// torno a medianoche): una promo válida "hasta hoy" debe verse todo el día.
const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// La web de Plusfresc y el sync usan Lleida (centro 12) como catálogo de
// referencia cuando el CP no pertenece a una zona de reparto conocida.
const plusfrescOfferCenter = (postalCode: string | null) =>
  plusfrescCenterFromPostalCode(postalCode) ?? '12';

// Filtro PostgREST de "oferta viva" de Carrefour (compartido por el listado y
// el recuento de categorías): precio tachado o promo de lote no caducada.
const carrefourOfferLiveness = () =>
  `strikethrough_price.not.is.null,and(promo_name.not.is.null,or(promo_end.is.null,promo_end.gte.${todayLocalISO()}))`;

/** Categorías con ofertas vivas del súper (para la hoja de filtros).
 * PostgREST tiene los agregados deshabilitados en producción (PGRST123), así
 * que se leen solo id+categoría en páginas de 1.000 y se deduplican en cliente.
 * El resultado se cachea por súper/ubicación en OffersScreen. */
export async function fetchOfferCategories(
  store: CatalogStore,
  region: RegionValue | null,
  postalCode: string | null,
): Promise<string[]> {
  try {
    const buildQuery = () => {
      let q: any;
      if (store === 'esclat') {
        q = supabase.from('bonpreu_products').select('id, category_name')
          .eq('published', true).not('promo_name', 'is', null).not('category_name', 'is', null);
      } else if (store === 'consum') {
        const zone = consumZoneFromPostalCode(postalCode);
        if (!zone) return null;
        q = filterRegionalAvailability(
          supabase.from('consum_products').select('id, category_name')
            .eq('published', true)
            .not('category_name', 'is', null)
            .contains('offer_zones', [zone]),
          region,
        );
      } else if (store === 'dia') {
        q = filterRegionalAvailability(
          supabase.from('dia_products').select('id, category_name')
            .eq('published', true)
            .not('promo_name', 'is', null)
            .not('category_name', 'is', null),
          region,
        );
        if (region != null && region !== REGION_ALL) {
          const community = REGION_MERCADONA_NAME[region];
          if (community) {
            const pgArray = `{${JSON.stringify(community)}}`;
            q = q.or(`offer_regions.is.null,offer_regions.cs.${pgArray}`);
          }
        }
      } else if (store === 'sorli') {
        q = supabase.from('sorli_products').select('id, category_name')
          .eq('published', true)
          .not('promo_name', 'is', null)
          .not('category_name', 'is', null)
          .or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`);
      } else if (store === 'plusfresc') {
        const center = plusfrescOfferCenter(postalCode);
        q = filterCenterAvailability(
          supabase.from('plusfresc_products').select('id, category_name')
            .eq('published', true)
            .not('category_name', 'is', null)
            .contains('offer_centers', [center])
            .or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`),
          center,
        );
      } else if (store === 'hiperdino') {
        q = supabase.from('hiperdino_products').select('id, category_name')
          .eq('published', true)
          .not('category_name', 'is', null)
          .not('promo_base_price', 'is', null);
      } else if (store === 'aldi') {
        q = supabase.from('aldi_products').select('id, category_name')
          .eq('published', true)
          .not('category_name', 'is', null)
          .not('promo_base_price', 'is', null)
          .or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`);
      } else if (isNormalizedOfferStore(store)) {
        const config = NORMALIZED_OFFER_CONFIG[store];
        q = supabase.from(config.table).select('id, category_name')
          .eq('published', true)
          .not('category_name', 'is', null)
          .not('promo_name', 'is', null)
          .or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`);
      } else {
        q = filterRegionalAvailability(
          supabase.from('carrefour_products').select('id, category_name')
            .eq('published', true).not('category_name', 'is', null).or(carrefourOfferLiveness()),
          region,
        );
      }
      return q;
    };

    const categories = new Set<string>();
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const query = buildQuery();
      if (!query) return [];
      const { data, error } = await query.order('id').range(offset, offset + pageSize - 1);
      if (error) throw error;
      const rows = (data ?? []) as any[];
      for (const row of rows) {
        if (row.category_name) categories.add(String(row.category_name));
      }
      if (rows.length < pageSize) break;
    }
    return [...categories].sort((a, b) => a.localeCompare(b, 'es'));
  } catch {
    return [];
  }
}

/** Ofertas vivas de Carrefour, paginadas por keyset (orden alfabético, todas
 *  alcanzables — nada de un limit sin order). Una fila tiene oferta viva si
 *  conserva precio tachado o si su promo de lote no ha caducado (promo_end
 *  null = el badge no traía fecha → se muestra hasta que el sync la retire).
 *  Los datos son del último sync semanal; el filtro de caducidad evita enseñar
 *  promos que expiraron a mitad de semana. */
export async function fetchCarrefourOffers(
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: CarrefourOffer[]; nextCursor: BrowseCursor | null }> {
  const { rows, nextCursor } = await keysetPage(
    'carrefour_products',
    `${CARREFOUR_COLS}, promo_name, promo_end, strikethrough_price`,
    filters?.sort ? 'unit_price' : 'display_name_norm',
    cursor,
    limit,
    (q) => applyOfferFilters(filterRegionalAvailability(q.or(carrefourOfferLiveness()), region), filters, 'display_name_norm'),
    filters?.sort === 'desc',
  );
  const items = rows.map((r: any) => ({
    product: carrefourToUI(mapCarrefour(r, region)),
    promoName: r.promo_name ?? null,
    promoEnd: r.promo_end ?? null,
    prevPrice: r.strikethrough_price != null ? Number(r.strikethrough_price) : null,
  }));
  return { items, nextCursor };
}

/** Ofertas de BonpreuEsclat: productos de la categoría "Ofertas" (bilingüe), que
 *  el sync marca con `promo_name` = tipo de promo ("Precio rebajado", "2ª unidad
 *  con descuento"…). En el listado de Bonpreu no hay precio tachado ni fecha de
 *  caducidad → prevPrice/promoEnd van null y la oferta se ve mientras el sync la
 *  siga listando (se limpia sola cuando el producto sale de "Ofertas"). Keyset
 *  alfabético como Carrefour. Requiere supabase/migrations/bonpreu_offers.sql. */
export async function fetchBonpreuOffers(
  cursor: BrowseCursor | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const ca = getLanguage() === 'ca';
  const normCol = ca ? 'display_name_ca_norm' : 'display_name_norm';
  const { rows, nextCursor } = await keysetPage(
    'bonpreu_products',
    BONPREU_COLS,
    filters?.sort ? 'unit_price' : normCol,
    cursor,
    limit,
    (q) => applyOfferFilters(q.not('promo_name', 'is', null), filters, normCol),
    filters?.sort === 'desc',
  );
  const items = rows.map((r: any) => ({
    product: bonpreuToUI(mapBonpreu(r)),
    promoName: (ca && r.promo_name_ca ? r.promo_name_ca : r.promo_name) ?? null,
    promoEnd: null,
    prevPrice: null,
  }));
  return { items, nextCursor };
}

/** La API de Consum solo considera oferta una fila con OFFER_PRICE. La zona se
 * guarda por separado en offer_zones para que una bajada ordinaria de precio,
 * aunque coincida con el sync anterior, nunca entre en esta pantalla. */
function consumOfferAt(row: any, postalCode: string | null): { basePrice: number; offerPrice: number } | null {
  const zone = consumZoneFromPostalCode(postalCode);
  const regional = zone && row.regional_prices && typeof row.regional_prices === 'object'
    ? row.regional_prices[zone]
    : null;
  const basePrice = regional?.pb ?? row.promo_base_price;
  const offerPrice = regional?.p ?? row.unit_price;
  if (basePrice == null || offerPrice == null || Number(basePrice) <= Number(offerPrice)) return null;
  return { basePrice: Number(basePrice), offerPrice: Number(offerPrice) };
}

export async function fetchConsumOffers(
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const zone = consumZoneFromPostalCode(postalCode);
  if (!zone) return { items: [], nextCursor: null };
  const { rows, nextCursor } = await keysetPage(
    'consum_products',
    CONSUM_OFFER_COLS,
    filters?.sort ? 'unit_price' : 'display_name_norm',
    cursor,
    limit,
    (q) => applyOfferFilters(
      filterRegionalAvailability(q.contains('offer_zones', [zone]), region),
      filters,
      'display_name_norm',
    ),
    filters?.sort === 'desc',
  );
  const items = rows.flatMap((row: any) => {
    const offer = consumOfferAt(row, postalCode);
    if (!offer) return [];
    return [{
      product: consumToUI(mapConsum(row, postalCode)),
      promoName: 'Oferta',
      promoEnd: null,
      prevPrice: offer.basePrice,
    }];
  });
  return { items, nextCursor };
}

/** DIA publica en el mismo PLP estructurado dos señales explícitas: rebajas
 * CLUB Dia (precio tachado + porcentaje) y promociones de lote/online
 * (`promotions[].description`). El sync las normaliza y guarda por CCAA. */
export async function fetchDiaOffers(
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const community = region != null && region !== REGION_ALL
    ? REGION_MERCADONA_NAME[region]
    : null;
  const { rows, nextCursor } = await keysetPage(
    'dia_products',
    DIA_OFFER_COLS,
    filters?.sort ? 'unit_price' : 'display_name_norm',
    cursor,
    limit,
    (q) => {
      let live = filterRegionalAvailability(q.not('promo_name', 'is', null), region);
      if (community) {
        const pgArray = `{${JSON.stringify(community)}}`;
        live = live.or(`offer_regions.is.null,offer_regions.cs.${pgArray}`);
      }
      return applyOfferFilters(live, filters, 'display_name_norm');
    },
    filters?.sort === 'desc',
  );
  const items = rows.flatMap((row: any) => {
    const product = mapDia(row, region);
    if (!product.promoName) return [];
    return [{
      product: diaToUI(product),
      promoName: product.promoName,
      promoEnd: null,
      prevPrice: product.promoBasePrice,
    }];
  });
  return { items, nextCursor };
}

/** Sorliclic expone la sección oficial `/ofertas` mediante `soloOfertas=true`.
 * El catálogo general contiene la misma señal estructurada (`oferta`,
 * `textoOferta`, vigencia y precio), normalizada por el sync en columnas. */
export async function fetchSorliOffers(
  cursor: BrowseCursor | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const ca = getLanguage() === 'ca';
  const normCol = ca ? 'display_name_ca_norm' : 'display_name_norm';
  const { rows, nextCursor } = await keysetPage(
    'sorli_products',
    SORLI_COLS,
    filters?.sort ? 'unit_price' : normCol,
    cursor,
    limit,
    (q) => applyOfferFilters(
      q.not('promo_name', 'is', null).or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`),
      filters,
      normCol,
    ),
    filters?.sort === 'desc',
  );
  const items = rows.flatMap((row: any) => {
    const product = mapSorli(row);
    if (!product.promoName) return [];
    return [{
      product: sorliToUI(product),
      promoName: product.promoName,
      promoEnd: product.promoEnd,
      prevPrice: product.promoBasePrice,
    }];
  });
  return { items, nextCursor };
}

/** Eroski/Caprabo (tile HTML), Condis (Empathy), Ametller (SCAPI) y Alcampo
 * (Ocado) comparten el contrato normalizado. promo_price solo sustituye al
 * precio ordinario cuando el retailer publica un precio final directo; los
 * lotes conservan el precio unitario normal y muestran su condición. */
export async function fetchNormalizedRetailerOffers(
  store: NormalizedOfferStore,
  cursor: BrowseCursor | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const config = NORMALIZED_OFFER_CONFIG[store];
  const ca = config.bilingual && getLanguage() === 'ca';
  const normCol = ca ? 'display_name_ca_norm' : 'display_name_norm';
  const { rows, nextCursor } = await keysetPage(
    config.table,
    config.columns,
    filters?.sort ? 'unit_price' : normCol,
    cursor,
    limit,
    (q) => applyOfferFilters(
      q.not('promo_name', 'is', null)
        .or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`),
      filters,
      normCol,
    ),
    filters?.sort === 'desc',
  );

  const items = rows.map((row: any) => {
    const promoPrice = row.promo_price != null ? Number(row.promo_price) : null;
    const currentPrice = promoPrice != null && promoPrice > 0 ? promoPrice : Number(row.unit_price);
    const offerRow = promoPrice != null && promoPrice > 0
      ? {
          ...row,
          unit_price: promoPrice,
          price_format: `${promoPrice.toFixed(2).replace('.', ',')} €`,
        }
      : row;
    const basePrice = row.promo_base_price != null ? Number(row.promo_base_price) : null;
    return {
      product: config.toUI(offerRow),
      promoName: row.promo_name ?? null,
      promoEnd: row.promo_end ?? null,
      prevPrice: basePrice != null && Number.isFinite(currentPrice) && basePrice > currentPrice
        ? basePrice
        : null,
    };
  });
  return { items, nextCursor };
}

/** HiperDino solo entra en Ofertas cuando Magento publica un regular_price
 * estrictamente mayor que el final_price actual. */
export async function fetchHiperdinoOffers(
  cursor: BrowseCursor | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const { rows, nextCursor } = await keysetPage(
    'hiperdino_products',
    HIPERDINO_OFFER_COLS,
    filters?.sort ? 'unit_price' : 'display_name_norm',
    cursor,
    limit,
    (q) => applyOfferFilters(q.not('promo_base_price', 'is', null), filters, 'display_name_norm'),
    filters?.sort === 'desc',
  );
  const items = rows.flatMap((row: any) => {
    if (row.unit_price == null || row.promo_base_price == null || Number(row.promo_base_price) <= Number(row.unit_price)) return [];
    return [{
      product: hiperdinoToUI(mapHiperdino(row)),
      promoName: 'Oferta',
      promoEnd: null,
      prevPrice: Number(row.promo_base_price),
    }];
  });
  return { items, nextCursor };
}

/** Aldi expone el precio tachado y la vigencia en el hit de Algolia. */
export async function fetchAldiOffers(
  cursor: BrowseCursor | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const { rows, nextCursor } = await keysetPage(
    'aldi_products',
    ALDI_OFFER_COLS,
    filters?.sort ? 'unit_price' : 'display_name_norm',
    cursor,
    limit,
    (q) => applyOfferFilters(
      q.not('promo_base_price', 'is', null).or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`),
      filters,
      'display_name_norm',
    ),
    filters?.sort === 'desc',
  );
  const items = rows.flatMap((row: any) => {
    if (row.unit_price == null || row.promo_base_price == null || Number(row.promo_base_price) <= Number(row.unit_price)) return [];
    return [{
      product: aldiToUI(mapAldi(row)),
      promoName: row.promo_name ?? 'Oferta',
      promoEnd: row.promo_end ?? null,
      prevPrice: Number(row.promo_base_price),
    }];
  });
  return { items, nextCursor };
}

function plusfrescOfferAt(row: any, postalCode: string | null) {
  const center = plusfrescOfferCenter(postalCode);
  const regional = center && row.center_prices && typeof row.center_prices === 'object'
    ? row.center_prices[center]
    : null;
  const offerPrice = regional?.po ?? row.promo_offer_price;
  if (offerPrice == null) return null;
  return {
    center,
    offerPrice: Number(offerPrice),
    basePrice: regional?.pb ?? row.promo_base_price,
    promoName: regional?.pn ?? row.promo_name ?? 'Promoción',
    promoNameCa: regional?.pnc ?? row.promo_name_ca ?? 'Promoció',
    promoEnd: regional?.pe ?? row.promo_end ?? null,
  };
}

export async function fetchPlusfrescOffers(
  cursor: BrowseCursor | null,
  postalCode: string | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const center = plusfrescOfferCenter(postalCode);
  const ca = getLanguage() === 'ca';
  const normCol = ca ? 'display_name_ca_norm' : 'display_name_norm';
  const { rows, nextCursor } = await keysetPage(
    'plusfresc_products',
    PLUSFRESC_OFFER_COLS,
    filters?.sort ? 'unit_price' : normCol,
    cursor,
    limit,
    (q) => applyOfferFilters(
      filterCenterAvailability(
        q.contains('offer_centers', [center]).or(`promo_end.is.null,promo_end.gte.${todayLocalISO()}`),
        center,
      ),
      filters,
      normCol,
    ),
    filters?.sort === 'desc',
  );
  const items = rows.flatMap((row: any) => {
    const offer = plusfrescOfferAt(row, postalCode);
    if (!offer) return [];
    // El catálogo general conserva el precio ordinario. Solo en la pantalla de
    // Ofertas se sustituye por el precio explícito de Oferta2.
    const offerRow: any = {
      ...row,
      unit_price: offer.offerPrice,
      price_format: `${offer.offerPrice.toFixed(2).replace('.', ',')} €`,
    };
    if (offer.center) {
      offerRow.center_prices = {
        ...(row.center_prices ?? {}),
        [offer.center]: {
          ...(row.center_prices?.[offer.center] ?? {}),
          p: offer.offerPrice,
          pf: offerRow.price_format,
        },
      };
    }
    return [{
      product: plusfrescToUI(mapPlusfresc(offerRow, postalCode)),
      promoName: ca ? offer.promoNameCa : offer.promoName,
      promoEnd: offer.promoEnd,
      prevPrice: offer.basePrice != null && Number(offer.basePrice) > offer.offerPrice
        ? Number(offer.basePrice)
        : null,
    }];
  });
  return { items, nextCursor };
}

/** Una página cruda de ofertas del retailer. Los filtros de nombre, categoría y
 * precio ya viajan a PostgREST; el tipo se clasifica sobre la promoción final
 * resuelta (incluidas variantes regionales/bilingües). */
function fetchStoreOfferPage(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  if (store === 'esclat') return fetchBonpreuOffers(cursor, limit, filters);
  if (store === 'consum') return fetchConsumOffers(cursor, region, postalCode, limit, filters);
  if (store === 'dia') return fetchDiaOffers(cursor, region, limit, filters);
  if (store === 'sorli') return fetchSorliOffers(cursor, limit, filters);
  if (store === 'plusfresc') return fetchPlusfrescOffers(cursor, postalCode, limit, filters);
  if (store === 'hiperdino') return fetchHiperdinoOffers(cursor, limit, filters);
  if (store === 'aldi') return fetchAldiOffers(cursor, limit, filters);
  if (isNormalizedOfferStore(store)) return fetchNormalizedRetailerOffers(store, cursor, limit, filters);
  return fetchCarrefourOffers(cursor, region, limit, filters);
}

/** Ofertas de un súper con paginación completa también al filtrar por tipo.
 * Se recorren páginas keyset del servidor hasta reunir resultados suficientes;
 * se devuelve la página filtrada entera para no saltarse coincidencias cuando
 * el cursor avance al siguiente bloque crudo. */
export async function fetchStoreOffers(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  limit = 50,
  filters?: OfferFilters,
): Promise<{ items: StoreOffer[]; nextCursor: BrowseCursor | null }> {
  const selectedTypes = filters?.offerTypes?.length ? new Set(filters.offerTypes) : null;
  if (!selectedTypes) {
    return fetchStoreOfferPage(store, cursor, region, postalCode, limit, filters);
  }

  const serverFilters: OfferFilters = { ...filters, offerTypes: undefined };
  const items: StoreOffer[] = [];
  let scanCursor = cursor;
  const scanLimit = Math.max(limit, 100);

  for (;;) {
    const page = await fetchStoreOfferPage(
      store,
      scanCursor,
      region,
      postalCode,
      scanLimit,
      serverFilters,
    );
    items.push(...page.items.filter((offer) =>
      offerTypesOf(offer).some((type) => selectedTypes.has(type)),
    ));

    if (!page.nextCursor || items.length >= limit) {
      return { items, nextCursor: page.nextCursor };
    }
    scanCursor = page.nextCursor;
  }
}
