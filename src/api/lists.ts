import { supabase } from '../lib/supabase';

export interface NewListItem {
  productName: string;
  quantity: number;
  unit?: string;
  categoryEmoji?: string | null;
  mercadonaProductId?: string | null;
  unitPrice?: number | null;
  imageUrl?: string | null;
}

/**
 * Returns the id of the group's shared shopping list, creating one if it
 * doesn't exist yet. A group has a single shared cart.
 */
export async function getOrCreateGroupList(
  groupId: string,
  groupName: string,
  userId: string,
): Promise<string> {
  const { data: existing, error: selErr } = await supabase
    .from('shopping_lists')
    .select('id')
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (selErr) throw selErr;
  if (existing) return existing.id;

  const { data, error } = await supabase
    .from('shopping_lists')
    .insert({ name: `Cesta de ${groupName}`, group_id: groupId, created_by: userId })
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

export interface ListItemRow {
  id: string;
  productName: string;
  quantity: number;
  unit: string;
  inCart: boolean;
  categoryEmoji: string | null;
  unitPrice: number | null;
  imageUrl: string | null;
  mercadonaProductId: string | null;
  /** User id of the member responsible for bringing this item (or null). */
  assignedTo: string | null;
}

/** All items of a single shopping list, oldest first. */
export async function fetchListItems(listId: string): Promise<ListItemRow[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('id, product_name, quantity, unit, in_cart, category_emoji, unit_price, image_url, mercadona_product_id, assigned_to')
    .eq('list_id', listId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((it: any) => ({
    id: it.id,
    productName: it.product_name,
    quantity: Number(it.quantity),
    unit: it.unit,
    inCart: it.in_cart,
    categoryEmoji: it.category_emoji,
    unitPrice: it.unit_price != null ? Number(it.unit_price) : null,
    imageUrl: it.image_url ?? null,
    mercadonaProductId: it.mercadona_product_id ?? null,
    assignedTo: it.assigned_to ?? null,
  }));
}

/** Marks a single item as in the cart (or not). */
export async function setItemInCart(itemId: string, inCart: boolean): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ in_cart: inCart })
    .eq('id', itemId);

  if (error) throw error;
}

/** Assigns a list item to a group member (or clears it with null). */
export async function assignListItem(itemId: string, assignedTo: string | null): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ assigned_to: assignedTo })
    .eq('id', itemId);

  if (error) throw error;
}

/** Inserts one or more items into a shopping list. */
export async function addItemsToList(
  listId: string,
  items: NewListItem[],
  userId: string,
): Promise<void> {
  if (items.length === 0) return;

  const rows = items.map((it) => ({
    list_id: listId,
    product_name: it.productName,
    quantity: it.quantity,
    unit: it.unit ?? 'ud',
    category_emoji: it.categoryEmoji ?? null,
    mercadona_product_id: it.mercadonaProductId ?? null,
    unit_price: it.unitPrice ?? null,
    image_url: it.imageUrl ?? null,
    added_by: userId,
  }));

  const { error } = await supabase.from('list_items').insert(rows);
  if (error) throw error;
}
