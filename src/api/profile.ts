import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
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
  /** Cuándo completó el alta inicial (asistente de bienvenida). NULL = aún no
   *  lo ha hecho → la app muestra el onboarding. Ver profile_onboarding.sql. */
  onboardedAt: string | null;
  /** Cuenta verificada (insignia dorada). Marca manual desde Supabase.
   *  Ver profile_verified.sql. */
  verified: boolean;
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
    .select('id, name, initials, color, username, avatar_url, discoverable, catalog_stores, premium_until, onboarded_at, verified')
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
    onboardedAt: data.onboarded_at ?? null,
    verified: data.verified ?? false,
  };
}

export async function updateProfile(
  userId: string,
  fields: {
    name?: string;
    initials?: string;
    username?: string | null;
    avatarUrl?: string | null;
    discoverable?: boolean;
    catalogStores?: CatalogStore[];
  },
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.initials !== undefined) updates.initials = fields.initials;
  if (fields.username !== undefined) updates.username = fields.username;
  if (fields.avatarUrl !== undefined) updates.avatar_url = fields.avatarUrl;
  if (fields.discoverable !== undefined) updates.discoverable = fields.discoverable;
  if (fields.catalogStores !== undefined) updates.catalog_stores = fields.catalogStores;

  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
}

/** Marca el alta inicial como completada (sella onboarded_at = ahora). A partir
 *  de aquí el gate de navegación deja de mostrar el onboarding. Devuelve el ISO
 *  guardado para refrescar la caché del ProfileContext sin re-fetch. */
export async function completeOnboarding(userId: string): Promise<string> {
  const onboardedAt = new Date().toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({ onboarded_at: onboardedAt })
    .eq('id', userId);
  if (error) throw error;
  return onboardedAt;
}

/** Returns true if the username is free (or belongs to this user).
 *  Vía RPC SECURITY DEFINER (username_available.sql): con el modelo de
 *  visibilidad restringido de profiles, un SELECT directo no vería a usuarios
 *  ocultos y daría falsos "disponible". La RPC comprueba la unicidad real
 *  saltándose RLS y solo devuelve un booleano. Excluye tu propia fila por
 *  auth.uid(), así que no hace falta pasar el userId. */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('username_available', { uname: username });
  if (error) throw error;
  return data === true;
}

export async function uploadAvatar(userId: string, uri: string): Promise<string> {
  // Redimensiona a máx. 512px de ancho y recomprime a JPEG ANTES de subir: una
  // foto de móvil (1–3 MB) baja a ~50–100 KB, sin pérdida visible en un avatar
  // pequeño. Reduce ~20× el coste de storage y egress en Supabase. El picker ya
  // recorta a 1:1, así que basta fijar el ancho (la altura mantiene la proporción).
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 512 });
  const rendered = await context.renderAsync();
  const { uri: resizedUri } = await rendered.saveAsync({
    compress: 0.8,
    format: SaveFormat.JPEG,
  });

  // Salida siempre JPEG → ruta y contentType fijos. El 1er segmento debe ser el
  // UID del usuario para que cuadre con la policy RLS del bucket.
  const path = `${userId}/avatar.jpg`;

  // ArrayBuffer is more reliable than Blob in React Native.
  const response = await fetch(resizedUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage.from('avatars').upload(path, arrayBuffer, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) throw error;

  // La ruta es fija (avatar.jpg) → la URL pública no cambia entre subidas. Sin
  // cache-busting, el CDN y la caché de Image mostrarían la foto anterior al
  // cambiarla; el ?v= fuerza recargar la nueva.
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}
