import { supabase } from '../lib/supabase';

export interface Purchase {
  id: string;
  groupId: string;
  groupName: string | null;
  total: number;
  itemCount: number;
  completedAt: string;
}

/** Archives a completed shopping trip. */
export async function recordPurchase(
  groupId: string,
  total: number,
  itemCount: number,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from('purchases').insert({
    group_id: groupId,
    total,
    item_count: itemCount,
    completed_by: userId,
  });
  if (error) throw error;
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
