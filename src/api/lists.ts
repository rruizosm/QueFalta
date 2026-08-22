import { supabase } from '../lib/supabase';
import { notifyCartItemAdded } from './push';
import { CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';

export interface LinkedNoteProduct {
  store: CatalogStore;
  id: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number | null;
}

const catalogStoreSet = new Set<string>(CATALOG_STORE_KEYS);

export function linkedNoteProductFromRow(row: any): LinkedNoteProduct | null {
  if (
    !catalogStoreSet.has(row?.note_product_store)
    || typeof row?.note_product_id !== 'string'
    || typeof row?.note_product_name !== 'string'
  ) return null;

  return {
    store: row.note_product_store as CatalogStore,
    id: row.note_product_id,
    name: row.note_product_name,
    imageUrl: typeof row.note_product_image_url === 'string' ? row.note_product_image_url : null,
    unitPrice: row.note_product_unit_price != null ? Number(row.note_product_unit_price) : null,
  };
}

export function linkedNoteProductToRow(product: LinkedNoteProduct | null) {
  return {
    note_product_store: product?.store ?? null,
    note_product_id: product?.id ?? null,
    note_product_name: product?.name.trim() || null,
    note_product_image_url: product?.imageUrl ?? null,
    note_product_unit_price: product?.unitPrice ?? null,
  };
}

export interface NewListItem {
  productName: string;
  quantity: number;
  unit?: string;
  note?: string | null;
  noteProduct?: LinkedNoteProduct | null;
  categoryEmoji?: string | null;
  /** Categoría del retailer al añadir (N1 si se navegó; hoja si vino de búsqueda).
   *  La lista la mapea a una zona canónica (constants/zones.ts). null → "Otros". */
  categoryName?: string | null;
  mercadonaProductId?: string | null;
  /** Id del producto en su propio súper (Bonpreu/Carrefour/bonÀrea/Consum/Dia),
   *  para poder abrir su ficha desde la cesta. Mercadona usa mercadonaProductId. */
  storeProductId?: string | null;
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
  categoryName: string | null;
  unitPrice: number | null;
  imageUrl: string | null;
  mercadonaProductId: string | null;
  storeProductId: string | null;
  note: string | null;
  noteProduct: LinkedNoteProduct | null;
  /** User id of the member responsible for bringing this item (or null). */
  assignedTo: string | null;
}

/** All items of a single shopping list, oldest first. */
export async function fetchListItems(listId: string): Promise<ListItemRow[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('id, product_name, quantity, unit, in_cart, category_emoji, category_name, unit_price, image_url, mercadona_product_id, store_product_id, assigned_to, note, note_product_store, note_product_id, note_product_name, note_product_image_url, note_product_unit_price')
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
    categoryName: it.category_name ?? null,
    unitPrice: it.unit_price != null ? Number(it.unit_price) : null,
    imageUrl: it.image_url ?? null,
    mercadonaProductId: it.mercadona_product_id ?? null,
    storeProductId: it.store_product_id ?? null,
    note: it.note ?? null,
    noteProduct: linkedNoteProductFromRow(it),
    assignedTo: it.assigned_to ?? null,
  }));
}

/** Un artículo de la cesta tras fusionar duplicados del mismo producto. */
export interface MergedCartItem {
  /** Ids de las filas list_items subyacentes (para togglear/asignar todas). */
  ids: string[];
  productName: string;
  quantity: number;
  unit: string;
  inCart: boolean;
  unitPrice: number | null;
  imageUrl: string | null;
  categoryEmoji: string | null;
  categoryName: string | null;
  mercadonaProductId: string | null;
  storeProductId: string | null;
  note: string | null;
  noteProduct: LinkedNoteProduct | null;
  assignedTo: string | null;
}

type MergeInput = {
  id: string; productName: string; quantity: number; unit: string; inCart: boolean;
  unitPrice: number | null; imageUrl: string | null; categoryEmoji: string | null;
  mercadonaProductId: string | null; assignedTo?: string | null; categoryName?: string | null;
  storeProductId?: string | null;
  note?: string | null;
  noteProduct?: LinkedNoteProduct | null;
};

/**
 * Fusiona filas del mismo producto sumando unidades. Identidad: id de Mercadona
 * si existe; si no (Bonpreu/manual), nombre + imagen. Conserva el orden de
 * primera aparición. inCart = todas en cesta; assignedTo solo si coinciden todas.
 */
export function mergeCartItems(items: MergeInput[]): MergedCartItem[] {
  const map = new Map<string, MergedCartItem>();
  for (const it of items) {
    const key = it.mercadonaProductId
      ? `m:${it.mercadonaProductId}`
      : `n:${it.productName}|${it.imageUrl ?? ''}`;
    const ex = map.get(key);
    if (ex) {
      ex.ids.push(it.id);
      ex.quantity += it.quantity;
      ex.inCart = ex.inCart && it.inCart;
      if (ex.assignedTo !== (it.assignedTo ?? null)) ex.assignedTo = null;
      if (!ex.categoryName && it.categoryName) ex.categoryName = it.categoryName;
      if (!ex.storeProductId && it.storeProductId) ex.storeProductId = it.storeProductId;
      if (!ex.note && it.note?.trim()) ex.note = it.note.trim();
      if (!ex.noteProduct && it.noteProduct) ex.noteProduct = it.noteProduct;
    } else {
      map.set(key, {
        ids: [it.id],
        productName: it.productName,
        quantity: it.quantity,
        unit: it.unit,
        inCart: it.inCart,
        unitPrice: it.unitPrice,
        imageUrl: it.imageUrl,
        categoryEmoji: it.categoryEmoji,
        categoryName: it.categoryName ?? null,
        mercadonaProductId: it.mercadonaProductId,
        storeProductId: it.storeProductId ?? null,
        note: it.note?.trim() || null,
        noteProduct: it.noteProduct ?? null,
        assignedTo: it.assignedTo ?? null,
      });
    }
  }
  return [...map.values()];
}

/** Marks a single item as in the cart (or not). */
export async function setItemInCart(itemId: string, inCart: boolean): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ in_cart: inCart })
    .eq('id', itemId);

  if (error) throw error;
}

/** Sets a single row's quantity (used to add/subtract units of a product). */
export async function updateListItemQuantity(itemId: string, quantity: number): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ quantity })
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

/** Updates the shared comment and its optional product on every merged row. */
export async function updateListItemsComment(
  itemIds: string[],
  note: string | null,
  noteProduct: LinkedNoteProduct | null,
): Promise<void> {
  if (itemIds.length === 0) return;
  const normalized = note?.trim() || null;
  const { data, error } = await supabase
    .from('list_items')
    .update({ note: normalized, ...linkedNoteProductToRow(noteProduct) })
    .in('id', itemIds)
    .select('id');

  if (error) throw error;
  if ((data?.length ?? 0) !== itemIds.length) {
    throw new Error('Not all list item notes were updated');
  }
}

/** Deletes specific list rows (a merged cart item can span several). */
export async function deleteListItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await supabase.from('list_items').delete().in('id', itemIds);
  if (error) throw error;
}

/** Removes all items from a list (used when finishing a shopping trip). */
export async function clearListItems(listId: string): Promise<void> {
  const { error } = await supabase.from('list_items').delete().eq('list_id', listId);
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
    note: it.note?.trim() || null,
    ...linkedNoteProductToRow(it.noteProduct ?? null),
    category_emoji: it.categoryEmoji ?? null,
    category_name: it.categoryName ?? null,
    mercadona_product_id: it.mercadonaProductId ?? null,
    store_product_id: it.storeProductId ?? null,
    unit_price: it.unitPrice ?? null,
    image_url: it.imageUrl ?? null,
    added_by: userId,
  }));

  const { error } = await supabase.from('list_items').insert(rows);
  if (error) throw error;

  // Avisa a los demás miembros del grupo (no-op si la lista es personal). El
  // texto y los destinatarios los resuelve la Edge Function en servidor.
  notifyCartItemAdded(listId, items[0].productName, items.length);
}
