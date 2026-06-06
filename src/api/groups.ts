import { supabase } from '../lib/supabase';
import type { GroupMember } from '../types';

/** Base pública de la web (Universal Links). Ver quefalta-web/. */
const WEB_BASE_URL = 'https://quefalta.es';

export interface GroupSummary {
  id: string;
  name: string;
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
  unitPrice: number | null;
  imageUrl: string | null;
  mercadonaProductId: string | null;
}

/** Groups the current user belongs to, with their member profiles. */
export async function fetchMyGroups(): Promise<GroupSummary[]> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, created_by, owner_id, created_at, group_members(profiles(id, name, initials, color))')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((g: any) => ({
    id: g.id,
    name: g.name,
    createdBy: g.created_by,
    ownerId: g.owner_id ?? null,
    createdAt: g.created_at,
    members: (g.group_members ?? [])
      .map((m: any) => m.profiles)
      .filter(Boolean) as GroupMember[],
  }));
}

/** Creates a group and adds the creator as its first member. Returns the new group id. */
export async function createGroup(name: string, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('groups')
    .insert({ name: name.trim(), created_by: userId, owner_id: userId })
    .select('id')
    .single();

  if (error) throw error;

  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: data.id, user_id: userId });

  if (memberError) throw memberError;

  return data.id;
}

/** Full detail for a single group: name, creator and member profiles. */
export async function fetchGroupDetail(groupId: string): Promise<GroupSummary> {
  const { data, error } = await supabase
    .from('groups')
    .select('id, name, created_by, owner_id, created_at, group_members(profiles(id, name, initials, color))')
    .eq('id', groupId)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    createdBy: data.created_by,
    ownerId: (data as any).owner_id ?? null,
    createdAt: data.created_at,
    members: ((data as any).group_members ?? [])
      .map((m: any) => m.profiles)
      .filter(Boolean) as GroupMember[],
  };
}

/** All items in the group's shared shopping lists. */
export async function fetchGroupItems(groupId: string): Promise<GroupItem[]> {
  const { data, error } = await supabase
    .from('list_items')
    .select('id, product_name, quantity, unit, in_cart, category_emoji, unit_price, image_url, mercadona_product_id, shopping_lists!inner(group_id)')
    .eq('shopping_lists.group_id', groupId)
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
  }));
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

/** Just the member profiles of a group (lighter than fetchGroupDetail). */
export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('profiles(id, name, initials, color)')
    .eq('group_id', groupId);

  if (error) throw error;
  return (data ?? []).map((m: any) => m.profiles).filter(Boolean) as GroupMember[];
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
