import { supabase } from '../lib/supabase';
import { isPantryImageUrl, type PantryProduct } from '../lib/pantryLayout';
import type { NewListItem } from './lists';
import type { AppLanguage } from '../i18n';
import type { UIProduct } from '../lib/productAdapters';
import { REGION_ALL, REGION_MERCADONA_NAME, type RegionValue } from '../constants/regions';

export const PANTRY_SEARCH_PAGE_SIZE = 30;
export const PANTRY_STORES = ['mercadona', 'lidl'] as const;
export type PantryStore = typeof PANTRY_STORES[number];
export interface PantryCatalogProduct extends UIProduct {
  store: PantryStore;
  illustrationUrl: string;
}
interface PantrySearchOptions {
  store?: PantryStore;
  lidlStoreId?: string | null;
  region?: RegionValue | null;
  categoryIds?: readonly string[];
}

/** Resolve archived products by retailer/id, retaining row order and duplicates.
 * Stock already bought may be discontinued or outside the current store/region.
 * Only an existing valid illustration is needed to place it in the pantry. */
export async function resolvePantryPurchaseProducts(
  items: readonly NewListItem[], signal?: AbortSignal,
): Promise<(PantryProduct | null)[]> {
  const refs = items.map((item) => {
    const store = item.storeKey;
    if (store !== 'mercadona' && store !== 'lidl') return null;
    const id = store === 'mercadona' ? item.mercadonaProductId || item.storeProductId : item.storeProductId;
    return id ? { store, id } : null;
  });
  const illustrations = new Map<string, string>();
  await Promise.all(PANTRY_STORES.map(async (store) => {
    const ids = [...new Set(refs.filter((ref) => ref?.store === store).map((ref) => ref!.id))];
    for (let start = 0; start < ids.length; start += 100) {
      let request = supabase.from(store === 'lidl' ? 'lidl_product_master' : 'mercadona_products')
        .select('id, illustration_url').in('id', ids.slice(start, start + 100));
      if (signal) request = request.abortSignal(signal);
      const { data, error } = await request;
      if (error) throw error;
      for (const row of data ?? []) {
        if (isPantryImageUrl(row.illustration_url)) illustrations.set(`${store}:${row.id}`, row.illustration_url);
      }
    }
  }));
  return refs.map((ref, index) => {
    const illustrationUrl = ref && illustrations.get(`${ref.store}:${ref.id}`);
    return ref && illustrationUrl ? { id: ref.id, store: ref.store, name: items[index].productName, illustrationUrl } : null;
  });
}

/** Illustration, availability and category filters precede ordering/pagination. */
export async function searchPantryProducts(
  query: string,
  language: AppLanguage,
  offset = 0,
  signal?: AbortSignal,
  { store = 'mercadona', lidlStoreId, region, categoryIds }: PantrySearchOptions = {},
): Promise<{ products: PantryCatalogProduct[]; hasMore: boolean }> {
  if (store === 'lidl' && !lidlStoreId) return { products: [], hasMore: false };
  const lidl = store === 'lidl';
  const nameColumn = lidl ? 'master.display_name_norm'
    : language === 'ca' ? 'display_name_ca_norm' : 'display_name_norm';
  const illustrationColumn = lidl ? 'master.illustration_url' : 'illustration_url';
  let request = supabase.from(lidl ? 'lidl_store_products' : 'mercadona_products')
    .select(lidl
      ? 'product_id, category_name, master:lidl_product_master!inner(id, display_name, display_name_norm, packaging, thumbnail, illustration_url)'
      : 'id, display_name, display_name_ca, packaging, category_name, thumbnail, illustration_url')
    .eq('published', true)
    .not(illustrationColumn, 'is', null)
    .neq(illustrationColumn, '');
  if (lidl) {
    request = request.eq('store_id', lidlStoreId!).eq('master.published', true);
    if (categoryIds?.length) request = request.overlaps('category_ids', [...categoryIds]);
  } else {
    if (categoryIds?.length) request = request.in('category_id', categoryIds.map(Number));
    if (region && region !== REGION_ALL) {
      const community = REGION_MERCADONA_NAME[region];
      if (community) request = request.or(`regions.is.null,regions.eq.{},regions.cs.{"${community}"}`);
    }
  }
  // Words only: punctuation and PostgREST operators cannot broaden a query.
  const words = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) request = request.ilike(nameColumn, `%${word}%`);
  request = request.order(lidl ? 'master(display_name_norm)' : nameColumn)
    .order(lidl ? 'product_id' : 'id').range(offset, offset + PANTRY_SEARCH_PAGE_SIZE);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  const rows = data ?? [];
  return {
    products: rows.slice(0, PANTRY_SEARCH_PAGE_SIZE).flatMap((row: any): PantryCatalogProduct[] => {
      const product = lidl ? row.master : row;
      if (!product || !isPantryImageUrl(product.illustration_url)) return [];
      return [{
        id: String(product.id), store,
        name: !lidl && language === 'ca' && product.display_name_ca ? product.display_name_ca : product.display_name,
        // Browse with the retailer photo; keep the illustration for shelf placement.
        illustrationUrl: product.illustration_url, imageUrl: product.thumbnail ?? null,
        unitPrice: null, priceLabel: '', pricePerUnit: null, pricePerUnitLabel: null,
        metaLabel: product.packaging ?? null, categoryName: row.category_name ?? null,
      }];
    }),
    hasMore: rows.length > PANTRY_SEARCH_PAGE_SIZE,
  };
}
