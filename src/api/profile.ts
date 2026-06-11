import { supabase } from '../lib/supabase';
import { CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';

export interface UserProfile {
  id: string;
  name: string;
  initials: string;
  color: string;
  username: string | null;
  avatarUrl: string | null;
  /** Si otros usuarios pueden encontrarte por @usuario (privacidad de descubrimiento). */
  discoverable: boolean;
  /** Supermercados que se muestran en el catálogo. Vacío/null en BD = todos. */
  catalogStores: CatalogStore[];
  /** Fin de la suscripción QuéFalta Plus (ISO). NULL o pasado = plan free.
   *  Solo la escribe el servidor (trigger en profile_premium.sql). */
  premiumUntil: string | null;
}

/** Normaliza la columna catalog_stores: filtra claves desconocidas y, si queda
 *  vacía (usuario antiguo sin preferencia), cae a "todos los supermercados". */
function normalizeCatalogStores(value: unknown): CatalogStore[] {
  const valid = Array.isArray(value)
    ? CATALOG_STORE_KEYS.filter((k) => (value as unknown[]).includes(k))
    : [];
  return valid.length ? valid : [...CATALOG_STORE_KEYS];
}

export async function fetchProfile(userId: string): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, initials, color, username, avatar_url, discoverable, catalog_stores, premium_until')
    .eq('id', userId)
    .single();

  if (error) throw error;

  return {
    id: data.id,
    name: data.name,
    initials: data.initials,
    color: data.color,
    username: data.username ?? null,
    avatarUrl: data.avatar_url ?? null,
    discoverable: data.discoverable ?? true,
    catalogStores: normalizeCatalogStores(data.catalog_stores),
    premiumUntil: data.premium_until ?? null,
  };
}

export async function updateProfile(
  userId: string,
  fields: {
    name?: string;
    username?: string | null;
    avatarUrl?: string | null;
    discoverable?: boolean;
    catalogStores?: CatalogStore[];
  },
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.username !== undefined) updates.username = fields.username;
  if (fields.avatarUrl !== undefined) updates.avatar_url = fields.avatarUrl;
  if (fields.discoverable !== undefined) updates.discoverable = fields.discoverable;
  if (fields.catalogStores !== undefined) updates.catalog_stores = fields.catalogStores;

  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
}

/** Returns true if the username is free (or belongs to this user). */
export async function isUsernameAvailable(
  username: string,
  currentUserId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .neq('id', currentUserId)
    .maybeSingle();

  if (error) throw error;
  return data === null;
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  // Strip query params before extracting extension (expo-image-picker can append them).
  const cleanUri = uri.split('?')[0];
  const rawExt = cleanUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(rawExt) ? rawExt : 'jpg';
  const mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  // Path: {userId}/avatar.{ext} — first segment must equal the user's UID for the RLS policy.
  const path = `${userId}/avatar.${ext}`;

  // ArrayBuffer is more reliable than Blob in React Native.
  const response = await fetch(uri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
    upsert: true,
    contentType: mimeType,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}
