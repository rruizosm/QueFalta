import { supabase } from '../lib/supabase';
import { isPantryImageUrl, type PantryProduct } from '../lib/pantryLayout';
import type { NewListItem } from './lists';
import type { AppLanguage } from '../i18n';
import type { UIProduct } from '../lib/productAdapters';
import { REGION_ALL, REGION_MERCADONA_NAME, type RegionValue } from '../constants/regions';

export const PANTRY_SEARCH_PAGE_SIZE = 30;
export const PANTRY_STORES = ['mercadona', 'lidl', 'bonarea', 'carrefour'] as const;
export type PantryStore = typeof PANTRY_STORES[number];
const pantryTables: Record<PantryStore, string> = {
  mercadona: 'mercadona_products', lidl: 'lidl_product_master', bonarea: 'bonarea_products', carrefour: 'carrefour_products',
};
const carrefourExcludedIds = ['cat260001', 'cat20037', 'cat20038'];
interface PantryImageRow {
  id: string;
  illustration_url: string | null;
  thumbnail?: string | null;
  packaging?: string | null;
  size_instructions?: { unit_size?: unknown; size_format?: unknown } | null;
  category_id?: string | null;
  category_name?: string | null;
  category_ids?: string[] | null;
}
/** Mercadona packaging names the container; the actual contents live in raw price instructions. */
export function pantryPackageContents(store: PantryStore, row: Pick<PantryImageRow, 'packaging' | 'size_instructions'>): string | null {
  if (store === 'mercadona') {
    const value = row.size_instructions?.unit_size;
    const unit = row.size_instructions?.size_format;
    if ((typeof value !== 'number' && typeof value !== 'string') || typeof unit !== 'string') return null;
    let amount = Number(value);
    let measure = unit.trim();
    if (!Number.isFinite(amount) || amount <= 0 || !measure) return null;
    if (amount < 1 && measure.toLowerCase() === 'kg') { amount *= 1000; measure = 'g'; }
    else if (amount < 1 && measure.toLowerCase() === 'l') { amount *= 1000; measure = 'ml'; }
    return `${Number(amount.toFixed(3)).toString().replace('.', ',')} ${measure}`;
  }
  const packaging = row.packaging?.trim();
  return packaging && /\d\s*(?:kg|mg|g|gr|ml|cl|l|ud|uds|unidades?)\b/i.test(packaging) ? packaging : null;
}

export function isCarrefourPantryCategory(id: string, name: string): boolean {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return !carrefourExcludedIds.includes(id) && !['papeleria', 'bazar', 'calzado'].includes(normalized);
}
function eligibleCarrefourRow(row: PantryImageRow): boolean {
  return isCarrefourPantryCategory(row.category_id ?? '', row.category_name ?? '')
    && !(row.category_ids ?? []).some((id: string) => carrefourExcludedIds.includes(id));
}

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

/** Saved stock can outlive availability; refresh by identity without catalogue filters. */
export async function fetchPantryImageUrls(
  products: readonly PantryProduct[], signal?: AbortSignal, contents?: Map<string, string | null>,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  await Promise.all(PANTRY_STORES.map(async (store) => {
    const ids = [...new Set(products.filter((product) => (product.store ?? 'mercadona') === store)
      .map((product) => product.id))];
    for (let start = 0; start < ids.length; start += 100) {
      const columns = store === 'carrefour' ? 'id, illustration_url, category_id, category_name, category_ids'
        : store === 'mercadona' ? 'id, illustration_url, size_instructions:raw->price_instructions'
          : store === 'lidl' ? 'id, illustration_url, packaging' : 'id, illustration_url';
      let request = supabase.from(pantryTables[store]).select(columns).in('id', ids.slice(start, start + 100)).returns<PantryImageRow[]>();
      if (signal) request = request.abortSignal(signal);
      const { data, error } = await request;
      if (error) throw error;
      for (const row of data ?? []) {
        if (store === 'carrefour' && !eligibleCarrefourRow(row)) continue;
        if (store === 'mercadona' || store === 'lidl') contents?.set(`${store}:${row.id}`, pantryPackageContents(store, row));
        if (isPantryImageUrl(row.illustration_url)) urls.set(`${store}:${row.id}`, row.illustration_url);
      }
    }
  }));
  return urls;
}

/** Resolve archived products by retailer/id, retaining row order and duplicates.
 * Stock already bought may be discontinued or outside the current store/region.
 * Only an existing valid illustration is needed to place it in the pantry. */
export async function resolvePantryPurchaseProducts(
  items: readonly NewListItem[], signal?: AbortSignal,
): Promise<(PantryProduct | null)[]> {
  const refs = items.map((item) => {
    const store = item.storeKey;
    if (store !== 'mercadona' && store !== 'lidl' && store !== 'bonarea' && store !== 'carrefour') return null;
    const id = store === 'mercadona' ? item.mercadonaProductId || item.storeProductId : item.storeProductId;
    return id ? { store, id } : null;
  });
  const illustrations = new Map<string, string>();
  await Promise.all(PANTRY_STORES.map(async (store) => {
    const ids = [...new Set(refs.filter((ref) => ref?.store === store).map((ref) => ref!.id))];
    for (let start = 0; start < ids.length; start += 100) {
      const columns = store === 'carrefour'
        ? 'id, illustration_url, thumbnail, category_id, category_name, category_ids'
        : store === 'mercadona' ? 'id, illustration_url, thumbnail, size_instructions:raw->price_instructions'
          : store === 'lidl' ? 'id, illustration_url, thumbnail, packaging'
          : 'id, illustration_url, thumbnail';
      let request = supabase.from(pantryTables[store])
        .select(columns)
        .in('id', ids.slice(start, start + 100)).returns<PantryImageRow[]>();
      if (signal) request = request.abortSignal(signal);
      const { data, error } = await request;
      if (error) throw error;
      for (const row of data ?? []) {
        if (store === 'carrefour' && !eligibleCarrefourRow(row)) continue;
        if (isPantryImageUrl(row.illustration_url)) illustrations.set(`${store}:${row.id}`, JSON.stringify({
          illustrationUrl: row.illustration_url,
          ...(pantryPackageContents(store, row) ? { metaLabel: pantryPackageContents(store, row) } : {}),
          ...(isPantryImageUrl(row.thumbnail) ? { originalImageUrl: row.thumbnail } : {}),
        }));
      }
    }
  }));
  return refs.map((ref, index) => {
    if (ref?.store === 'bonarea') {
      const imageData = illustrations.get(`${ref.store}:${ref.id}`);
      if (!imageData) return null;
      const { illustrationUrl } = JSON.parse(imageData) as { illustrationUrl: string };
      return { id: ref.id, store: 'bonarea', name: items[index].productName, illustrationUrl };
    }
    const imageData = ref && illustrations.get(`${ref.store}:${ref.id}`);
    if (!ref || !imageData) return null;
    const { illustrationUrl, originalImageUrl, metaLabel } = JSON.parse(imageData) as {
      illustrationUrl: string; originalImageUrl?: string; metaLabel?: string;
    };
    return { id: ref.id, store: ref.store, name: items[index].productName, illustrationUrl,
      ...(metaLabel ? { metaLabel } : {}),
      ...(originalImageUrl ? { originalImageUrl } : {}) };
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
  const bonarea = store === 'bonarea';
  const carrefour = store === 'carrefour';
  const nameColumn = lidl ? 'master.display_name_norm'
    : language === 'ca' && !carrefour ? 'display_name_ca_norm' : 'display_name_norm';
  const illustrationColumn = lidl ? 'master.illustration_url' : 'illustration_url';
  let request = supabase.from(lidl ? 'lidl_store_products' : pantryTables[store])
    .select(lidl
      ? 'product_id, category_name, master:lidl_product_master!inner(id, display_name, display_name_norm, packaging, thumbnail, illustration_url)'
      : bonarea ? 'id, display_name, display_name_ca, category_ids, category_name, thumbnail, illustration_url'
        : carrefour ? 'id, display_name, category_ids, category_name, thumbnail, illustration_url'
        : 'id, display_name, display_name_ca, size_instructions:raw->price_instructions, category_name, thumbnail, illustration_url')
    .eq('published', true);
  if (lidl) {
    request = request.not(illustrationColumn, 'is', null).neq(illustrationColumn, '');
    request = request.eq('store_id', lidlStoreId!).eq('master.published', true);
    if (categoryIds?.length) request = request.overlaps('category_ids', [...categoryIds]);
  } else if (bonarea || carrefour) {
    request = request.not('illustration_url', 'is', null).neq('illustration_url', '')
      .eq('available', true);
    if (categoryIds?.length) request = request.overlaps('category_ids', [...categoryIds]);
    if (carrefour) {
      // Filter before pagination, including products belonging to several categories.
      request = request.not('category_name', 'in', '("Papelería","Bazar","Calzado")')
        .not('category_ids', 'ov', `{${carrefourExcludedIds.join(',')}}`);
      if (region && region !== REGION_ALL) {
        const community = REGION_MERCADONA_NAME[region];
        if (community) request = request.or(`regions.is.null,regions.eq.{},regions.cs.{"${community}"}`);
      }
    }
  } else {
    request = request.not(illustrationColumn, 'is', null).neq(illustrationColumn, '');
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
      const illustrationUrl = product?.illustration_url;
      if (!product || !isPantryImageUrl(illustrationUrl)) return [];
      return [{
        id: String(product.id), store,
        name: !lidl && language === 'ca' && product.display_name_ca ? product.display_name_ca : product.display_name,
        // Browse with the retailer photo; keep the illustration for shelf placement.
        illustrationUrl, imageUrl: product.thumbnail ?? null,
        unitPrice: null, priceLabel: '', pricePerUnit: null, pricePerUnitLabel: null,
        metaLabel: pantryPackageContents(store, product), categoryName: row.category_name ?? null,
      }];
    }),
    hasMore: rows.length > PANTRY_SEARCH_PAGE_SIZE,
  };
}
