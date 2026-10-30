import { supabase } from '../lib/supabase';
import { decodePantryLayout, encodePantryLayout, type PantryLayout, type PantrySection } from '../lib/pantryLayout';

export interface GroupPantrySnapshot { layout: PantryLayout; revision: number }

export async function fetchGroupPantry(groupId: string, section: PantrySection): Promise<GroupPantrySnapshot> {
  // Explicit membership check also distinguishes an empty inventory from revoked access.
  const { data: member, error: memberError } = await supabase.from('groups').select('id').eq('id', groupId).single();
  if (memberError || !member) throw memberError ?? new Error('Group unavailable');
  const { data, error } = await supabase.from('group_pantry').select('layout, revision')
    .eq('group_id', groupId).eq('section', section).maybeSingle();
  if (error) throw error;
  return { layout: decodePantryLayout(data ? JSON.stringify(data.layout) : null), revision: data?.revision ?? 0 };
}

/** null is a revision conflict: re-read and rebase before trying again. */
export async function compareAndSetGroupPantry(groupId: string, section: PantrySection,
  revision: number, layout: PantryLayout): Promise<number | null> {
  const { data, error } = await supabase.rpc('save_group_pantry', {
    p_group_id: groupId, p_section: section, p_revision: revision, p_layout: JSON.parse(encodePantryLayout(layout)),
  });
  if (error) throw error;
  return data as number | null;
}

export function subscribeGroupPantry(groupId: string, section: PantrySection, refresh: () => void): () => void {
  const channel = supabase.channel(`pantry:${groupId}:${section}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'group_pantry', filter: `group_id=eq.${groupId}` }, refresh)
    .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
  return () => { void supabase.removeChannel(channel); };
}
