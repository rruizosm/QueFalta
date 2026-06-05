import { Platform } from 'react-native';
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

export async function fetchCategories(): Promise<N1Category[]> {
  console.log('[mercadona] fetchCategories →', `${BASE}/categories/`);
  const res = await fetch(`${BASE}/categories/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: CategoriesResponse = await res.json();
  console.log('[mercadona] fetchCategories ←', data.count, 'categories');
  return data.results;
}


export async function fetchCategoryDetail(id: number): Promise<N2CategoryDetail> {
  const res = await fetch(`${BASE}/categories/${id}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log('[mercadona] fetchCategoryDetail →', `${BASE}/categories/${id}/`);
  const data: N2CategoryDetail = await res.json();
    console.log('[mercadona] fetchCategoryDetail ←', data.name, data.categories.length, 'subcategories');
  return data;
}

/** Full detail for a single product by its Mercadona id. */
export async function fetchProduct(id: string): Promise<MercadonaProductDetail> {
  console.log('[mercadona] fetchProduct →', `${BASE}/products/${id}/`);
  const res = await fetch(`${BASE}/products/${id}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data: MercadonaProductDetail = await res.json();
  console.log('[mercadona] fetchProduct ←', data.display_name);
  return data;
}

/** Flattens all products from an N2 category response. */
export function flattenProducts(detail: N2CategoryDetail): MercadonaProduct[] {
  return detail.categories.flatMap(g => g.products.filter(p => p.published));
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
