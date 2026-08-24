import { supabase } from '../lib/supabase';
import {
  linkedNoteProductFromRow,
  type NewListItem,
} from './lists';
import { normalizeStoreKey, storeOfItem } from '../constants/stores';

export interface Purchase {
  id: string;
  groupId: string;
  groupName: string | null;
  groupIcon: string | null;
  total: number;
  itemCount: number;
  completedAt: string;
}

export interface PurchaseStatisticItem {
  key?: string;
  label?: string;
  imageUrl?: string;
  icon?: string;
  quantity: number;
  purchases: number;
}

export interface PurchaseStatistics {
  purchaseCount: number;
  stores: PurchaseStatisticItem[];
  categories: PurchaseStatisticItem[];
  products: PurchaseStatisticItem[];
}

export interface GeneralStorePreference {
  key: string;
  users: number;
}

export interface GeneralProductStatistic {
  key: string;
  label: string;
  storeKey: string;
  imageUrl?: string;
  quantity: number;
}

export interface GeneralStoreStatistic {
  key: string;
  quantity: number;
}

export interface GeneralPurchaseStatistics {
  preferenceUserCount: number;
  preferredStores: GeneralStorePreference[];
  topProducts: GeneralProductStatistic[];
  addedStores: GeneralStoreStatistic[];
}

const statisticItems = (rows: unknown): PurchaseStatisticItem[] =>
  Array.isArray(rows)
    ? rows.map((row: any) => ({
      key: typeof row?.key === 'string' ? row.key : undefined,
      label: typeof row?.label === 'string' ? row.label : undefined,
      imageUrl: typeof row?.image_url === 'string' ? row.image_url : undefined,
      icon: typeof row?.icon === 'string' ? row.icon : undefined,
      quantity: Number(row?.quantity ?? 0),
      purchases: Number(row?.purchases ?? 0),
    }))
    : [];

/** Archiva y vacía una lista en una única transacción del servidor. */
export async function finishPurchase(listId: string): Promise<string> {
  const { data, error } = await supabase.rpc('finish_list_purchase', { p_list_id: listId });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid finish purchase response');
  return data;
}

/** Personal purchase trends. The database function restricts results to auth.uid(). */
export async function fetchPurchaseStatistics(): Promise<PurchaseStatistics> {
  const { data, error } = await supabase.rpc('my_purchase_statistics_visuals');
  if (error) throw error;

  const raw = (data ?? {}) as any;
  return {
    purchaseCount: Number(raw.purchase_count ?? 0),
    stores: statisticItems(raw.stores),
    categories: statisticItems(raw.categories),
    products: statisticItems(raw.products),
  };
}

/** Community-wide aggregates. The RPC never returns user, group or list ids. */
export async function fetchGeneralPurchaseStatistics(): Promise<GeneralPurchaseStatistics> {
  const { data, error } = await supabase.rpc('general_purchase_statistics');
  if (error) throw error;

  const raw = (data ?? {}) as any;
  return {
    preferenceUserCount: Number(raw.preference_user_count ?? 0),
    preferredStores: Array.isArray(raw.preferred_stores)
      ? raw.preferred_stores.map((row: any) => ({
        key: String(row?.key ?? ''),
        users: Number(row?.users ?? 0),
      })).filter((row: GeneralStorePreference) => row.key.length > 0)
      : [],
    topProducts: Array.isArray(raw.top_products)
      ? raw.top_products.map((row: any) => ({
        key: String(row?.key ?? ''),
        label: String(row?.label ?? ''),
        storeKey: String(row?.store_key ?? ''),
        imageUrl: typeof row?.image_url === 'string' ? row.image_url : undefined,
        quantity: Number(row?.quantity ?? 0),
      })).filter((row: GeneralProductStatistic) => row.key.length > 0 && row.label.length > 0)
      : [],
    addedStores: Array.isArray(raw.added_stores)
      ? raw.added_stores.map((row: any) => ({
        key: String(row?.key ?? ''),
        quantity: Number(row?.quantity ?? 0),
      })).filter((row: GeneralStoreStatistic) => row.key.length > 0)
      : [],
  };
}

/** The products of an archived purchase, shaped for re-adding to a cart. */
export async function fetchPurchaseItems(purchaseId: string): Promise<NewListItem[]> {
  const { data, error } = await supabase
    .from('purchase_items')
    .select('product_name, quantity, unit, category_emoji, category_name, mercadona_product_id, store_product_id, store_key, unit_price, image_url, note, note_product_store, note_product_id, note_product_name, note_product_image_url, note_product_unit_price')
    .eq('purchase_id', purchaseId);

  if (error) throw error;

  return (data ?? []).map((it: any) => {
    const clue = {
      storeKey: normalizeStoreKey(it.store_key),
      imageUrl: it.image_url ?? null,
      mercadonaProductId: it.mercadona_product_id ?? null,
    };
    return {
      storeKey: clue.storeKey ?? storeOfItem(clue),
      productName: it.product_name,
      quantity: Number(it.quantity),
      unit: it.unit ?? 'ud',
      note: it.note ?? null,
      noteProduct: linkedNoteProductFromRow(it),
      categoryEmoji: it.category_emoji ?? null,
      categoryName: it.category_name ?? null,
      mercadonaProductId: clue.mercadonaProductId,
      storeProductId: it.store_product_id ?? null,
      unitPrice: it.unit_price != null ? Number(it.unit_price) : null,
      imageUrl: clue.imageUrl,
    };
  });
}

/** All purchases of the user's groups, newest first (RLS limits to member groups). */
export async function fetchPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('id, total, item_count, completed_at, group_id, groups(name, icon_emoji)')
    .order('completed_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((p: any) => ({
    id: p.id,
    groupId: p.group_id,
    groupName: p.groups?.name ?? null,
    groupIcon: p.groups?.icon_emoji ?? null,
    total: Number(p.total),
    itemCount: p.item_count,
    completedAt: p.completed_at,
  }));
}
