import { supabase } from '../lib/supabase';
import { notifyFriendRequest } from './push';

export interface FriendProfile {
  friendshipId: string;
  id: string;
  name: string;
  username: string | null;
  initials: string;
  color: string;
  avatarUrl: string | null;
  verified: boolean;
}

const COLS = 'id, name, username, initials, color, avatar_url, verified';

/** Fila cruda de profiles → FriendProfile (sin friendshipId). */
const toProfile = (p: any) => ({
  id: p.id,
  name: p.name,
  username: p.username ?? null,
  initials: p.initials,
  color: p.color,
  avatarUrl: p.avatar_url ?? null,
  verified: p.verified ?? false,
});

export async function sendFriendRequest(addresseeId: string, requesterId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: requesterId, addressee_id: addresseeId });
  if (error) throw error;
  notifyFriendRequest(addresseeId);
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (error) throw error;
}

/** Rejects, cancels or unfriends — deletes the friendship row. */
export async function removeFriendship(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

/** Accepted friends (the other person in each relationship). */
export async function fetchFriends(userId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`id, requester_id, addressee_id, requester:profiles!requester_id(${COLS}), addressee:profiles!addressee_id(${COLS})`)
    .eq('status', 'accepted');
  if (error) throw error;
  return (data ?? [])
    .map((f: any) => {
      const other = f.requester_id === userId ? f.addressee : f.requester;
      return other ? { friendshipId: f.id, ...toProfile(other) } : null;
    })
    .filter(Boolean) as FriendProfile[];
}

/** Pending requests I've received. */
export async function fetchIncomingRequests(userId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`id, requester:profiles!requester_id(${COLS})`)
    .eq('status', 'pending')
    .eq('addressee_id', userId);
  if (error) throw error;
  return (data ?? [])
    .map((f: any) => (f.requester ? { friendshipId: f.id, ...toProfile(f.requester) } : null))
    .filter(Boolean) as FriendProfile[];
}

/** Nº de solicitudes pendientes recibidas (para el badge de Perfil → Social).
 *  head:true → solo el count, sin traer filas. */
export async function fetchIncomingRequestCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('friendships')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('addressee_id', userId);
  if (error) throw error;
  return count ?? 0;
}

/** Pending requests I've sent. */
export async function fetchOutgoingRequests(userId: string): Promise<FriendProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`id, addressee:profiles!addressee_id(${COLS})`)
    .eq('status', 'pending')
    .eq('requester_id', userId);
  if (error) throw error;
  return (data ?? [])
    .map((f: any) => (f.addressee ? { friendshipId: f.id, ...toProfile(f.addressee) } : null))
    .filter(Boolean) as FriendProfile[];
}
