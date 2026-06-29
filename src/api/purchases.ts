import { supabase } from '../lib/supabase';
import type { NewListItem } from './lists';

export interface Purchase {
  id: string;
  groupId: string;
  groupName: string | null;
  total: number;
  itemCount: number;
  completedAt: string;
}

/** Archives a completed shopping trip, with its item detail (for "repeat"). */
export async function recordPurchase(
  groupId: string,
  total: number,
  items: NewListItem[],
  userId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from('purchases')
    .insert({ group_id: groupId, total, item_count: items.length, completed_by: userId })
    .select('id')
    .single();
  if (error) throw error;

  if (items.length > 0) {
    const rows = items.map((it) => ({
      purchase_id: data.id,
      product_name: it.productName,
      quantity: it.quantity,
      unit: it.unit ?? 'ud',
      category_emoji: it.categoryEmoji ?? null,
      category_name: it.categoryName ?? null,
      mercadona_product_id: it.mercadonaProductId ?? null,
      store_product_id: it.storeProductId ?? null,
      unit_price: it.unitPrice ?? null,
      image_url: it.imageUrl ?? null,
    }));
    const { error: itemsError } = await supabase.from('purchase_items').insert(rows);
    if (itemsError) throw itemsError;
  }
}

/** The products of an archived purchase, shaped for re-adding to a cart. */
export async function fetchPurchaseItems(purchaseId: string): Promise<NewListItem[]> {
  const { data, error } = await supabase
    .from('purchase_items')
    .select('product_name, quantity, unit, category_emoji, category_name, mercadona_product_id, store_product_id, unit_price, image_url')
    .eq('purchase_id', purchaseId);

  if (error) throw error;

  return (data ?? []).map((it: any) => ({
    productName: it.product_name,
    quantity: Number(it.quantity),
    unit: it.unit ?? 'ud',
    categoryEmoji: it.category_emoji ?? null,
    categoryName: it.category_name ?? null,
    mercadonaProductId: it.mercadona_product_id ?? null,
    storeProductId: it.store_product_id ?? null,
    unitPrice: it.unit_price != null ? Number(it.unit_price) : null,
    imageUrl: it.image_url ?? null,
  }));
}

/** All purchases of the user's groups, newest first (RLS limits to member groups). */
export async function fetchPurchases(): Promise<Purchase[]> {
  const { data, error } = await supabase
    .from('purchases')
    .select('id, total, item_count, completed_at, group_id, groups(name)')
    .order('completed_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((p: any) => ({
    id: p.id,
    groupId: p.group_id,
    groupName: p.groups?.name ?? null,
    total: Number(p.total),
    itemCount: p.item_count,
    completedAt: p.completed_at,
  }));
}
