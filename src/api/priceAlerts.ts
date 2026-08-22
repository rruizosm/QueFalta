import { supabase } from '../lib/supabase';
import type { CatalogStore } from '../constants/stores';
import {
  consumZoneFromPostalCode,
  plusfrescCenterFromPostalCode,
} from '../constants/retailerZones';
import { getSubcategoryEmoji } from '../constants/subcategoryEmojis';

export type PriceAlertKind = 'exact' | 'keyword' | 'new_arrival';

export interface PriceAlertRule {
  id: string;
  userId: string;
  kind: PriceAlertKind;
  emoji: string;
  label: string;
  query: string | null;
  exactStore: CatalogStore | null;
  exactProductId: string | null;
  stores: CatalogStore[];
  locationIds: Partial<Record<CatalogStore, string>>;
  notifyPriceDrop: boolean;
  notifyNewOffer: boolean;
  minDropPct: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PriceAlertPreviewItem {
  store: CatalogStore;
  productId: string;
  displayName: string;
  thumbnail: string | null;
  categoryName: string | null;
  unitPrice: number | null;
  promoName: string | null;
  totalCount: number;
}

export type PriceAlertResultEventType = 'price_drop' | 'new_offer' | 'new_arrival';

export interface PriceAlertResultProduct {
  store: CatalogStore;
  productId: string;
  displayName: string;
  thumbnail: string | null;
  categoryName: string | null;
  previousPrice: number | null;
  currentPrice: number | null;
  priceDeltaPct: number | null;
  promoName: string | null;
  promoPrice: number | null;
  eventType: PriceAlertResultEventType;
  detectedAt: string;
}

export interface SavePriceAlertInput {
  id?: string;
  userId: string;
  kind: PriceAlertKind;
  emoji?: string;
  label: string;
  query?: string | null;
  exactStore?: CatalogStore | null;
  exactProductId?: string | null;
  stores: CatalogStore[];
  locationIds?: Partial<Record<CatalogStore, string>>;
  notifyPriceDrop: boolean;
  notifyNewOffer: boolean;
  minDropPct: number;
  active?: boolean;
}

export interface PreviewPriceAlertInput {
  kind: PriceAlertKind;
  query?: string | null;
  stores: CatalogStore[];
  exactStore?: CatalogStore | null;
  exactProductId?: string | null;
  region?: string | null;
  locationIds?: Partial<Record<CatalogStore, string>>;
  limit?: number;
}

export function priceAlertEmoji(
  label: string,
  query?: string | null,
  categoryName?: string | null,
): string {
  return getSubcategoryEmoji(
    [query, categoryName, label].filter(Boolean).join(' '),
    '🛒',
  );
}

function mapRule(row: any): PriceAlertRule {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind === 'exact'
      ? 'exact'
      : row.kind === 'new_arrival' ? 'new_arrival' : 'keyword',
    emoji: row.emoji ?? priceAlertEmoji(row.label, row.query),
    label: row.label,
    query: row.query ?? null,
    exactStore: row.exact_store ?? null,
    exactProductId: row.exact_product_id ?? null,
    stores: row.stores ?? [],
    locationIds: row.location_ids ?? {},
    notifyPriceDrop: row.notify_price_drop !== false,
    notifyNewOffer: row.notify_new_offer === true,
    minDropPct: Number(row.min_drop_pct ?? 5),
    active: row.active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function alertLocationIds(postalCode: string | null | undefined): Partial<Record<CatalogStore, string>> {
  const result: Partial<Record<CatalogStore, string>> = {};
  const consum = consumZoneFromPostalCode(postalCode);
  const plusfresc = plusfrescCenterFromPostalCode(postalCode);
  if (consum) result.consum = consum;
  if (plusfresc) result.plusfresc = plusfresc;
  return result;
}

export async function fetchPriceAlerts(userId: string): Promise<PriceAlertRule[]> {
  const { data, error } = await supabase
    .from('price_alert_rules')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapRule);
}

export async function savePriceAlert(input: SavePriceAlertInput): Promise<PriceAlertRule> {
  const isNewArrival = input.kind === 'new_arrival';
  const payload = {
    user_id: input.userId,
    kind: input.kind,
    emoji: input.emoji ?? priceAlertEmoji(input.label, input.query),
    label: input.label.trim(),
    query: input.kind === 'keyword' ? input.query?.trim() || null : null,
    exact_store: input.kind === 'exact' ? input.exactStore : null,
    exact_product_id: input.kind === 'exact' ? input.exactProductId : null,
    stores: input.stores,
    location_ids: input.locationIds ?? {},
    notify_price_drop: isNewArrival ? false : input.notifyPriceDrop,
    notify_new_offer: isNewArrival ? false : input.notifyNewOffer,
    min_drop_pct: isNewArrival ? 0 : input.minDropPct,
    active: input.active ?? true,
  };
  let targetId = input.id;
  if (!targetId && input.kind === 'exact' && input.exactStore && input.exactProductId) {
    const { data: existing, error: existingError } = await supabase
      .from('price_alert_rules')
      .select('id')
      .eq('user_id', input.userId)
      .eq('kind', 'exact')
      .eq('exact_store', input.exactStore)
      .eq('exact_product_id', input.exactProductId)
      .maybeSingle();
    if (existingError) throw existingError;
    targetId = existing?.id;
  }
  const query = targetId
    ? supabase.from('price_alert_rules').update(payload).eq('id', targetId).eq('user_id', input.userId)
    : supabase.from('price_alert_rules').insert(payload);
  const { data, error } = await query.select('*').single();
  if (error) throw error;
  return mapRule(data);
}

export async function setPriceAlertActive(
  userId: string,
  id: string,
  active: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('price_alert_rules')
    .update({ active })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function deletePriceAlert(userId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from('price_alert_rules')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function previewPriceAlert(
  input: PreviewPriceAlertInput,
): Promise<PriceAlertPreviewItem[]> {
  const { data, error } = await supabase.rpc('preview_price_alert', {
    p_kind: input.kind,
    p_query: input.query?.trim() || null,
    p_stores: input.stores,
    p_exact_store: input.exactStore ?? null,
    p_exact_product_id: input.exactProductId ?? null,
    p_region: input.region ?? null,
    p_location_ids: input.locationIds ?? {},
    p_limit: input.limit ?? 12,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    store: row.store,
    productId: row.product_id,
    displayName: row.display_name,
    thumbnail: row.thumbnail ?? null,
    categoryName: row.category_name ?? null,
    unitPrice: row.unit_price == null ? null : Number(row.unit_price),
    promoName: row.promo_name ?? null,
    totalCount: Number(row.total_count ?? 0),
  }));
}

/** Productos deduplicados que originaron una entrada concreta de la bandeja.
 *  La RPC valida en servidor que la notificación pertenece a la sesión. */
export async function fetchPriceAlertNotificationProducts(
  notificationId: string,
): Promise<PriceAlertResultProduct[]> {
  const { data, error } = await supabase.rpc('get_price_alert_notification_products', {
    p_notification_id: notificationId,
  });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    store: row.store,
    productId: row.product_id,
    displayName: row.display_name,
    thumbnail: row.thumbnail ?? null,
    categoryName: row.category_name ?? null,
    previousPrice: row.previous_price == null ? null : Number(row.previous_price),
    currentPrice: row.current_price == null ? null : Number(row.current_price),
    priceDeltaPct: row.price_delta_pct == null ? null : Number(row.price_delta_pct),
    promoName: row.promo_name ?? null,
    promoPrice: row.promo_price == null ? null : Number(row.promo_price),
    eventType: row.event_type,
    detectedAt: row.detected_at,
  }));
}
