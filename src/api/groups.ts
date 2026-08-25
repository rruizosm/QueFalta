import { supabase } from '../lib/supabase';
import { notifyGroupInvite } from './push';
import type { GroupMember } from '../types';
import { linkedNoteProductFromRow, type LinkedNoteProduct } from './lists';
import { normalizeStoreKey, storeOfItem, type Store } from '../constants/stores';

/** Base pública de la web (Universal Links). Ver quefalta-web/. */
const WEB_BASE_URL = 'https://quefalta.es';

/** Columnas de perfil que necesita cualquier avatar de miembro. */
const MEMBER_COLS = 'id, name, username, initials, color, avatar_url, verified';

/** Fila cruda de profiles → GroupMember (avatar_url → avatarUrl). */
const toMember = (p: any): GroupMember => ({
  id: p.id,
  name: p.name,
  username: p.username ?? null,
  initials: p.initials,
  color: p.color,
  avatarUrl: p.avatar_url ?? null,
  verified: p.verified ?? false,
});

export interface GroupSummary {
  id: string;
  name: string;
  iconEmoji: string | null;
  /** Who created the group (immutable). */
  createdBy: string | null;
  /** Current admin/owner (changes on transfer). */
  ownerId: string | null;
  createdAt: string;
  members: GroupMember[];
}

export interface GroupItem {
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
}

/** Groups the current user belongs to, with their member profiles. */
const groupsRequests = new Map<string, Promise<GroupSummary[]>>();

async function requestMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select(`id, name, icon_emoji, created_by, owner_id, created_at, group_members(profiles(${MEMBER_COLS}))`)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((g: any) => ({
    id: g.id,
    name: g.name,
    iconEmoji: g.icon_emoji ?? null,
    createdBy: g.created_by,
    ownerId: g.owner_id ?? null,
    createdAt: g.created_at,
    members: (g.group_members ?? [])
      .map((m: any) => m.profiles)
      .filter(Boolean)
      .map(toMember),
  }));
}

export function fetchMyGroups(userId?: string): Promise<GroupSummary[]> {
  // CartContext, Home y Grupos pueden revalidar a la vez durante el arranque.
  // Comparten la misma petición en vuelo para no triplicar el SELECT pesado.
  const requestKey = userId ?? '__current_session__';
  const pending = groupsRequests.get(requestKey);
  if (pending) return pending;
  const request = requestMyGroups().finally(() => {
    if (groupsRequests.get(requestKey) === request) groupsRequests.delete(requestKey);
  });
  groupsRequests.set(requestKey, request);
  return request;
}

/** Clave estable durante un intento de UI; permite reintentar sin duplicar. */
export function createGroupRequestKey(userId: string): string {
  return `${userId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

/** Crea grupo y membresía inicial en una única transacción del servidor. */
export async function createGroup(
  name: string,
  userId: string,
  requestKey = createGroupRequestKey(userId),
): Promise<string> {
  const { data, error } = await supabase.rpc('create_group_with_owner', {
    group_name: name.trim(),
    request_key: requestKey,
  });

  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid group creation response');
  return data;
}

/** Full detail for a single group: name, creator and member profiles. */
export async function fetchGroupDetail(groupId: string): Promise<GroupSummary> {
  const { data, error } = await supabase
    .from('groups')
    .select(`id, name, icon_emoji, created_by, owner_id, created_at, group_members(profiles(${MEMBER_COLS}))`)
    .eq('id', groupId)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    iconEmoji: (data as any).icon_emoji ?? null,
    createdBy: data.created_by,
    ownerId: (data as any).owner_id ?? null,
    createdAt: data.created_at,
    members: ((data as any).group_members ?? [])
      .map((m: any) => m.profiles)
      .filter(Boolean)
      .map(toMember),
  };
}

/** All items in the group's shared shopping lists. */
export async function fetchGroupItems(groupId: string): Promise<GroupItem[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('id, product_name, quantity, unit, in_cart, category_emoji, category_name, unit_price, image_url, mercadona_product_id, store_product_id, store_key, note, note_product_store, note_product_id, note_product_name, note_product_image_url, note_product_unit_price, shopping_lists!inner(group_id)')
    .eq('shopping_lists.group_id', groupId)
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
    };
  });
}

/** Adds the current user to a group (used by invite links). Idempotent.
 *  Returns true if the user was newly added, false if already a member. */
export async function joinGroup(groupId: string, userId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return false;

  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId });

  if (error) throw error;
  return true;
}

export interface SearchedUser {
  id: string;
  name: string;
  username: string | null;
  initials: string;
  color: string;
  avatarUrl: string | null;
  verified: boolean;
}

/** Searches discoverable users by @username prefix (for adding to a group).
 *  `signal` lets typeahead consumers cancel an obsolete request immediately. */
export async function searchUsersByUsername(
  query: string,
  signal?: AbortSignal,
): Promise<SearchedUser[]> {
  const q = query.trim().toLowerCase().replace(/^@/, '');
  if (q.length < 2) return [];

  let request = supabase
    .from('profiles')
    .select('id, name, username, initials, color, avatar_url, verified')
    .eq('discoverable', true)
    .ilike('username', `${q}%`)
    .limit(15);
  if (signal) request = request.abortSignal(signal);

  const { data, error } = await request;

  if (error) throw error;
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    username: p.username ?? null,
    initials: p.initials,
    color: p.color,
    avatarUrl: p.avatar_url ?? null,
    verified: p.verified ?? false,
  }));
}

/** Admin adds another user to the group. Idempotent. */
export async function addMemberToGroup(groupId: string, userId: string): Promise<void> {
  const { data: existing } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) return;

  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, user_id: userId });
  if (error) throw error;

  // Avisa al nuevo miembro ("X te añadió al grupo Y").
  notifyGroupInvite(groupId, userId);
}

/** Just the member profiles of a group (lighter than fetchGroupDetail). */
export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select(`profiles(${MEMBER_COLS})`)
    .eq('group_id', groupId);

  if (error) throw error;
  return (data ?? []).map((m: any) => m.profiles).filter(Boolean).map(toMember);
}

/** Renombra el grupo. Solo el admin (la policy UPDATE de groups exige owner_id). */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ name: name.trim() })
    .eq('id', groupId);

  if (error) throw error;
}

/** Cambia el icono compartido del grupo. Solo el admin puede actualizar groups. */
export async function updateGroupIcon(groupId: string, iconEmoji: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ icon_emoji: iconEmoji })
    .eq('id', groupId);

  if (error) throw error;
}

/** Transfers group admin to another member (sets groups.owner_id). Admin only (RLS).
 *  created_by stays as the original creator. */
export async function transferGroupAdmin(groupId: string, newAdminId: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .update({ owner_id: newAdminId })
    .eq('id', groupId);

  if (error) throw error;
}

/** Borra el grupo entero (solo el admin, por RLS). Los FK con ON DELETE CASCADE
 *  (group_delete_cascade.sql) arrastran miembros, listas, ítems y compras. */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', groupId);

  if (error) throw error;
}

/** Removes a member from a group. Used for both "leave" (self) and admin removal.
 *  RLS decides who is allowed: the member themselves, or the group admin. */
export async function removeGroupMember(groupId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', memberId);

  if (error) throw error;
}

/** Shareable https link (Universal Link) that lets another user join the group. */
export function getInviteLink(groupId: string): string {
  return `${WEB_BASE_URL}/join/${groupId}`;
}
