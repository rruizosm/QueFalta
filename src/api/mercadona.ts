import { Platform } from 'react-native';
import { getLanguage } from '../i18n';
import type {
  CategoriesResponse, N1Category, N2CategoryDetail, MercadonaProduct, MercadonaProductDetail,
} from '../types';

export type { N1Category, N2CategoryDetail, MercadonaProduct, MercadonaProductDetail };

// On web the browser enforces CORS — Mercadona blocks localhost origins.
// Run `node proxy.js` alongside the dev server; native devices connect directly.
const BASE =
  Platform.OS === 'web'
    ? 'http://localhost:3001/api'
    : 'https://tienda.mercadona.es/api';

// La API de Mercadona es POR ALMACÉN: cada `wh` tiene su propio catálogo e ids, y
// `GET /products/{id}/` devuelve 404 si ese id no existe en el almacén consultado.
// mad1 (Madrid) cubre el catálogo NACIONAL (la inmensa mayoría). Para los productos
// REGIONALES (p.ej. aguas catalanas), que dan 404 en mad1, el detalle se reintenta
// con su almacén de zona: el sync multi-almacén guarda ese `wh` en source_wh y
// ProductDetailModal lo pasa a fetchProduct(id, wh). Ver scripts/sync-catalog.mjs.
const WH = 'mad1';

/**
 * Añade lang + almacén a cualquier endpoint. El `lang` sigue al idioma de la app
 * (Mercadona devuelve nombres/descripciones en català con `lang=ca`); el `wh`
 * NO depende del idioma (solo cambia el texto, no qué productos existen ni sus
 * ids), así que el detalle por id sigue coincidiendo con el espejo (ver WH).
 */
const url = (path: string, wh: string = WH) => {
  const lang = getLanguage() === 'ca' ? 'ca' : 'es';
  return `${BASE}${path}${path.includes('?') ? '&' : '?'}lang=${lang}&wh=${wh}`;
};

export async function fetchCategories(): Promise<N1Category[]> {
  console.log('[mercadona] fetchCategories →', url('/categories/'));
  const res = await fetch(url('/categories/'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: CategoriesResponse = await res.json();
  console.log('[mercadona] fetchCategories ←', data.count, 'categories');
  return data.results;
}


export async function fetchCategoryDetail(id: number): Promise<N2CategoryDetail> {
  const res = await fetch(url(`/categories/${id}/`));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('[mercadona] fetchCategoryDetail →', url(`/categories/${id}/`));
  const data: N2CategoryDetail = await res.json();
    console.log('[mercadona] fetchCategoryDetail ←', data.name, data.categories.length, 'subcategories');
  return data;
}

/**
 * Full detail for a single product by its Mercadona id.
 * `wh` permite consultar el almacén que tiene el producto (regionales): el detalle
 * por defecto usa mad1 y da 404 para productos que solo existen en otra zona. El
 * cliente lo obtiene de `source_wh` del espejo (ver fetchProductWh en api/catalog).
 */
export async function fetchProduct(id: string, wh?: string): Promise<MercadonaProductDetail> {
  console.log('[mercadona] fetchProduct →', url(`/products/${id}/`, wh));
  const res = await fetch(url(`/products/${id}/`, wh));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: MercadonaProductDetail = await res.json();
  console.log('[mercadona] fetchProduct ←', data.display_name);
  return data;
}

/** Flattens all products from an N2 category response. */
export function flattenProducts(detail: N2CategoryDetail): MercadonaProduct[] {
  return detail.categories.flatMap(g => g.products.filter(p => p.published));
}

/**
 * Productos sugeridos para el inicio cuando aún no hay favoritos.
 * Coge la primera subcategoría de "Fruta y verdura" (id 1) y devuelve los primeros.
 */
export async function fetchSuggestedProducts(limit = 8): Promise<MercadonaProduct[]> {
  const cats = await fetchCategories();
  const preferred = cats.find((c) => c.id === 1) ?? cats[0];
  const subId = preferred?.categories?.[0]?.id;
  if (!subId) return [];
  const detail = await fetchCategoryDetail(subId);
  return flattenProducts(detail).slice(0, limit);
}

/**
 * Novedades reales de Mercadona. Usa el endpoint dedicado (el campo
 * price_instructions.is_new viene siempre false, no sirve para detectarlas).
 */
export async function fetchNewArrivals(): Promise<MercadonaProduct[]> {
  console.log('[mercadona] fetchNewArrivals →', url('/home/new-arrivals/'));
  const res = await fetch(url('/home/new-arrivals/'));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: { items?: MercadonaProduct[] } = await res.json();
  console.log('[mercadona] fetchNewArrivals ←', data.items?.length ?? 0, 'productos');
  return (data.items ?? []).filter((p) => p.published);
}

/** Returns a price string like "1,15 €" */
export function formatPrice(product: MercadonaProduct): string {
  const price = parseFloat(product.price_instructions.unit_price);
  return `${price.toFixed(2).replace('.', ',')} €`;
}

/** Returns a size string like "200 g" or falls back to packaging */
export function formatSize(product: MercadonaProduct): string {
  const { unit_size, size_format } = product.price_instructions;
  if (unit_size && size_format) return `${unit_size} ${size_format}`;
  return product.packaging ?? '';
}

/**
 * Precio por unidad de medida ("3,90 €/L", "1,50 €/kg") a partir de
 * reference_price + reference_format de Mercadona, o null si no hay. Es el
 * precio que permite comparar entre formatos; se muestra junto al del envase.
 */
export function formatReferencePrice(product: MercadonaProduct): string | null {
  const { reference_price, reference_format } = product.price_instructions;
  const n = parseFloat(reference_price);
  if (!Number.isFinite(n) || n <= 0 || !reference_format) return null;
  return `${n.toFixed(2).replace('.', ',')} €/${reference_format}`;
}
