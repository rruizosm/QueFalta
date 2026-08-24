import { supabase } from '../lib/supabase';
import { notifyCartItemAdded } from './push';
import {
  CATALOG_STORE_KEYS,
  normalizeStoreKey,
  storeOfItem,
  type CatalogStore,
  type Store,
} from '../constants/stores';

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
  /** Supermercado canónico. Nunca se deduce de la imagen en escrituras nuevas. */
  storeKey: Store;
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
  storeKey: Store;
  note: string | null;
  noteProduct: LinkedNoteProduct | null;
  /** User id of the member responsible for bringing this item (or null). */
  assignedTo: string | null;
}

/** All items of a single shopping list, oldest first. */
export async function fetchListItems(listId: string): Promise<ListItemRow[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('id, product_name, quantity, unit, in_cart, category_emoji, category_name, unit_price, image_url, mercadona_product_id, store_product_id, store_key, assigned_to, note, note_product_store, note_product_id, note_product_name, note_product_image_url, note_product_unit_price')
    .eq('list_id', listId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((it: any) => {
    const clue = {
      storeKey: normalizeStoreKey(it.store_key),
      imageUrl: it.image_url ?? null,
      mercadonaProductId: it.mercadona_product_id ?? null,
    };
    return {
      id: it.id,
      productName: it.product_name,
      quantity: Number(it.quantity),
      unit: it.unit,
      inCart: it.in_cart,
      categoryEmoji: it.category_emoji,
      categoryName: it.category_name ?? null,
      unitPrice: it.unit_price != null ? Number(it.unit_price) : null,
      imageUrl: clue.imageUrl,
      mercadonaProductId: clue.mercadonaProductId,
      storeProductId: it.store_product_id ?? null,
      storeKey: clue.storeKey ?? storeOfItem(clue),
      note: it.note ?? null,
      noteProduct: linkedNoteProductFromRow(it),
      assignedTo: it.assigned_to ?? null,
    };
  });
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
  storeKey: Store;
  note: string | null;
  noteProduct: LinkedNoteProduct | null;
  assignedTo: string | null;
}

type MergeInput = {
  id: string; productName: string; quantity: number; unit: string; inCart: boolean;
  unitPrice: number | null; imageUrl: string | null; categoryEmoji: string | null;
  mercadonaProductId: string | null; assignedTo?: string | null; categoryName?: string | null;
  storeProductId?: string | null;
  storeKey: Store;
  note?: string | null;
  noteProduct?: LinkedNoteProduct | null;
};

/**
 * Fusiona filas del mismo producto sumando unidades. La identidad siempre
 * incluye supermercado; para manuales usa nombre + imagen. Conserva el orden de
 * primera aparición. inCart = todas en cesta; assignedTo solo si coinciden todas.
 */
export function mergeCartItems(items: MergeInput[]): MergedCartItem[] {
  const map = new Map<string, MergedCartItem>();
  for (const it of items) {
    const productId = it.storeProductId || it.mercadonaProductId;
    const key = productId
      ? `${it.storeKey}:${productId}`
      : `${it.storeKey}:manual:${it.productName.trim().toLocaleLowerCase()}|${it.imageUrl ?? ''}`;
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
        storeKey: it.storeKey,
        note: it.note?.trim() || null,
        noteProduct: it.noteProduct ?? null,
        assignedTo: it.assignedTo ?? null,
      });
    }
  }
  return [...map.values()];
}

/** Marca todas las filas fusionadas en una única transacción del servidor. */
export async function setListItemsInCart(itemIds: string[], inCart: boolean): Promise<void> {
  if (itemIds.length === 0) return;
  const { data, error } = await supabase.rpc('set_list_items_in_cart', {
    p_item_ids: [...new Set(itemIds)],
    p_in_cart: inCart,
  });
  if (error) throw error;
  if (Number(data) !== new Set(itemIds).size) throw new Error('Not all list items were updated');
}

/** Sets a single row's quantity (used to add/subtract units of a product). */
export async function updateListItemQuantity(itemId: string, quantity: number): Promise<void> {
  const { error } = await supabase
    .from('list_items')
    .update({ quantity })
    .eq('id', itemId);

  if (error) throw error;
}

/** Asigna todas las filas indicadas atómicamente (o las desasigna con null). */
export async function assignListItems(itemIds: string[], assignedTo: string | null): Promise<void> {
  if (itemIds.length === 0) return;
  const ids = [...new Set(itemIds)];
  const { data, error } = await supabase.rpc('assign_list_items', {
    p_item_ids: ids,
    p_assigned_to: assignedTo,
  });
  if (error) throw error;
  if (Number(data) !== ids.length) throw new Error('Not all list items were assigned');
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
    store_key: it.storeKey,
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
