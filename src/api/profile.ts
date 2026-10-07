import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';
import { CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import type { RegionValue } from '../constants/regions';

const PROFILE_COLUMNS = 'id, created_at, name, initials, color, username, avatar_url, discoverable, avatar_friends_only, catalog_stores, region, postal_code, lidl_store_id, premium_until, word_game_blocked_until, onboarded_at, onboarding_step, verified';
const PRIVATE_AVATAR_PREFIX = 'private:';

export function privateAvatarPath(avatarUrl: string | null): string | null {
  if (!avatarUrl?.startsWith(PRIVATE_AVATAR_PREFIX)) return null;
  const path = avatarUrl.slice(PRIVATE_AVATAR_PREFIX.length).split('?')[0];
  return /^[0-9a-f-]{36}\/avatar\.jpg$/i.test(path) ? path : null;
}

function publicAvatarUrl(userId: string): string {
  const path = `${userId}/avatar.jpg`;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

function privateAvatarUrl(userId: string): string {
  return `${PRIVATE_AVATAR_PREFIX}${userId}/avatar.jpg?v=${Date.now()}`;
}

async function readAvatarBytes(bucket: 'avatars' | 'avatars-private', path: string): Promise<ArrayBuffer> {
  let url: string;
  if (bucket === 'avatars') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    url = `${data.publicUrl}?v=${Date.now()}`;
  } else {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
    if (error || !data) throw error ?? new Error('Private avatar unavailable');
    url = data.signedUrl;
  }
  // React Native Blob no implementa siempre arrayBuffer(). Response sí lo
  // implementa y es la misma vía usada arriba al subir una foto local.
  const response = await fetch(url);
  if (!response.ok) throw new Error('Avatar download failed');
  return response.arrayBuffer();
}

/** Compatibilidad durante el despliegue escalonado del catálogo Lidl. Solo
 * reintentamos ante la ausencia inequívoca de la columna; permisos, red y
 * cualquier otro error continúan fallando de forma visible. */
function isMissingLidlStoreColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return ['42703', 'PGRST204'].includes(code) && message.includes('lidl_store_id');
}

function isMissingAvatarVisibilityColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return ['42703', 'PGRST204'].includes(code) && message.includes('avatar_friends_only');
}

export interface UserProfile {
  id: string;
  /** Fecha de creación del perfil, usada para mensajes ligados a releases. */
  createdAt: string;
  name: string;
  initials: string;
  color: string;
  username: string | null;
  avatarUrl: string | null;
  /** Si otros usuarios pueden encontrarte por @usuario (privacidad de descubrimiento). */
  discoverable: boolean;
  /** Si la foto solo se muestra a amistades aceptadas. */
  avatarFriendsOnly: boolean;
  /** Supermercados que se muestran en el catálogo. Vacío/null en BD = todos. */
  catalogStores: CatalogStore[];
  /** Comunidad autónoma (ISO 3166-2:ES) para filtrar los súpers del catálogo.
   *  Derivada del código postal. NULL = sin responder → la app la pide
   *  (onboarding o gate); 'ES' = toda España (sin filtro).
   *  Ver profile_region.sql y constants/regions.ts. */
  region: RegionValue | null;
  /** Código postal (5 dígitos) del que se derivó `region`. NULL si eligió
   *  "toda España". Hoy solo se guarda; habilita futuras features de zona
   *  exacta (precios regionales por almacén/centro). NO mostrarlo en vistas
   *  públicas de perfil. */
  postalCode: string | null;
  /** Tienda Lidl confirmada; resuelve precio, promociones y surtido locales. */
  lidlStoreId: string | null;
  /** Fin de la suscripción QuéFalta Plus (ISO). NULL o pasado = plan free.
   *  Solo la escribe el servidor (trigger en profile_premium.sql). */
  premiumUntil: string | null;
  /** Fin de la suspensión de Palabra de hoy (ISO). NULL o pasado = acceso.
   *  Solo puede modificarlo el servidor. */
  wordGameBlockedUntil: string | null;
  /** Cuándo completó el alta inicial (asistente de bienvenida). NULL = aún no
   *  lo ha hecho → la app muestra el onboarding. Ver profile_onboarding.sql. */
  onboardedAt: string | null;
  /** Siguiente paso del asistente que debe mostrarse (0–5). */
  onboardingStep: number;
  /** Reflejo público de Plus para la insignia dorada. La autorización usa
   *  premiumUntil; el servidor sincroniza este booleano. */
  verified: boolean;
}

/** Normaliza la columna catalog_stores: filtra claves desconocidas y, si queda
 *  vacía (usuario antiguo sin preferencia), cae al conjunto histórico. Las
 *  cadenas añadidas después requieren una decisión explícita y nunca se
 *  activan de forma silenciosa. */
function normalizeCatalogStores(value: unknown): CatalogStore[] {
  const valid = Array.isArray(value)
    ? CATALOG_STORE_KEYS.filter((k) => (value as unknown[]).includes(k))
    : [];
  const historicalStores = CATALOG_STORE_KEYS.filter((key) => key !== 'lidl' && key !== 'bm' && key !== 'eljamon');
  return valid.length ? valid : historicalStores;
}

export async function fetchProfile(userId: string): Promise<UserProfile> {
  let columns = PROFILE_COLUMNS;
  let data: any;
  let error: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await supabase
      .from('profiles')
      .select(columns)
      .eq('id', userId)
      .single();
    data = result.data;
    error = result.error;
    if (!error) break;
    if (isMissingAvatarVisibilityColumn(error)) {
      columns = columns.replace('avatar_friends_only, ', '');
    } else if (isMissingLidlStoreColumn(error)) {
      columns = columns.replace('lidl_store_id, ', '');
    } else {
      throw error;
    }
  }
  if (error) throw error;

  return {
    id: data.id,
    createdAt: data.created_at,
    name: data.name,
    initials: data.initials,
    color: data.color,
    username: data.username ?? null,
    avatarUrl: data.avatar_url ?? null,
    discoverable: data.discoverable ?? true,
    avatarFriendsOnly: data.avatar_friends_only ?? false,
    catalogStores: normalizeCatalogStores(data.catalog_stores),
    region: (data.region as RegionValue) ?? null,
    postalCode: data.postal_code ?? null,
    lidlStoreId: data.lidl_store_id ?? null,
    premiumUntil: data.premium_until ?? null,
    wordGameBlockedUntil: data.word_game_blocked_until ?? null,
    onboardedAt: data.onboarded_at ?? null,
    onboardingStep: data.onboarding_step ?? 0,
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
    avatarFriendsOnly?: boolean;
    catalogStores?: CatalogStore[];
    region?: RegionValue | null;
    postalCode?: string | null;
    lidlStoreId?: string | null;
    onboardingStep?: number;
  },
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (fields.name !== undefined) updates.name = fields.name;
  if (fields.initials !== undefined) updates.initials = fields.initials;
  if (fields.username !== undefined) updates.username = fields.username;
  if (fields.avatarUrl !== undefined) updates.avatar_url = fields.avatarUrl;
  if (fields.discoverable !== undefined) updates.discoverable = fields.discoverable;
  if (fields.avatarFriendsOnly !== undefined) updates.avatar_friends_only = fields.avatarFriendsOnly;
  if (fields.catalogStores !== undefined) updates.catalog_stores = fields.catalogStores;
  if (fields.region !== undefined) updates.region = fields.region;
  if (fields.postalCode !== undefined) updates.postal_code = fields.postalCode;
  if (fields.lidlStoreId !== undefined) updates.lidl_store_id = fields.lidlStoreId;
  if (fields.onboardingStep !== undefined) updates.onboarding_step = fields.onboardingStep;

  const current = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .select('id')
    .single();
  let error = current.error;
  if (fields.avatarFriendsOnly !== undefined && isMissingAvatarVisibilityColumn(error)) {
    // No simular que la preferencia se ha guardado durante un despliegue
    // escalonado: la pantalla la revierte y comunica el fallo.
    throw error;
  }
  if (fields.lidlStoreId !== undefined && isMissingLidlStoreColumn(error)) {
    // El CP y la comunidad deben seguir guardándose aunque el backend aún no
    // haya recibido la migración multitienda. La tienda se podrá confirmar al
    // completar el despliegue y aparecer el selector con candidatos reales.
    delete updates.lidl_store_id;
    if (Object.keys(updates).length === 0) return;
    const legacy = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('id')
      .single();
    error = legacy.error;
  }
  if (error) throw error;
}

/** Marca el alta inicial como completada (sella onboarded_at = ahora). A partir
 *  de aquí el gate de navegación deja de mostrar el onboarding. Devuelve el ISO
 *  guardado para refrescar la caché del ProfileContext sin re-fetch. */
export async function completeOnboarding(): Promise<string> {
  const { data, error } = await supabase.rpc('complete_onboarding');
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('Invalid onboarding completion response');
  return data;
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

export async function uploadAvatar(userId: string, uri: string, friendsOnly = false): Promise<string> {
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

  const { error } = await supabase.storage.from(friendsOnly ? 'avatars-private' : 'avatars').upload(path, arrayBuffer, {
    upsert: true,
    contentType: 'image/jpeg',
  });
  if (error) throw error;

  // Los clientes ya publicados necesitan la URL pública habitual mientras el
  // usuario no restrinja la foto. La ruta privada es un marcador, nunca una URL
  // descargable: UserAvatar solicita una URL firmada con RLS.
  return friendsOnly ? privateAvatarUrl(userId) : publicAvatarUrl(userId);
}

/** Traslada una foto entre buckets al cambiar la preferencia. La copia pública
 * se elimina antes de confirmar el modo privado; si falla, el toggle se revierte. */
export async function setAvatarFriendsOnly(profile: UserProfile, friendsOnly: boolean): Promise<string | null> {
  const { id, avatarUrl } = profile;
  if (profile.avatarFriendsOnly === friendsOnly) return avatarUrl;
  const path = `${id}/avatar.jpg`;
  const publicStorage = supabase.storage.from('avatars');
  const privateStorage = supabase.storage.from('avatars-private');

  if (friendsOnly) {
    let bytes: ArrayBuffer | null = null;
    if (avatarUrl) {
      bytes = await readAvatarBytes('avatars', path);
      const copied = await privateStorage.upload(path, bytes, { upsert: true, contentType: 'image/jpeg' });
      if (copied.error) throw copied.error;
      const privateList = await privateStorage.list(id, { search: 'avatar.jpg', limit: 10 });
      if (privateList.error || !privateList.data?.some((file) => file.name === 'avatar.jpg')) {
        throw privateList.error ?? new Error('Private avatar copy missing');
      }
    }
    try {
      const removed = await publicStorage.remove([path]);
      if (removed.error) throw removed.error;
      const listed = await publicStorage.list(id, { search: 'avatar.jpg', limit: 10 });
      if (listed.error || listed.data?.some((file) => file.name === 'avatar.jpg')) {
        throw listed.error ?? new Error('Public avatar still exists');
      }
      const nextUrl = avatarUrl ? privateAvatarUrl(id) : null;
      await updateProfile(id, { avatarFriendsOnly: true, avatarUrl: nextUrl });
      return nextUrl;
    } catch (error) {
      // La fila sigue en modo público; restaurar la foto si falla el traslado.
      if (bytes) await publicStorage.upload(path, bytes, { upsert: true, contentType: 'image/jpeg' });
      throw error;
    }
  }

  const isPrivate = privateAvatarPath(avatarUrl);
  if (!isPrivate) {
    await updateProfile(id, { avatarFriendsOnly: false });
    return avatarUrl;
  }
  const bytes = await readAvatarBytes('avatars-private', path);
  const nextUrl = publicAvatarUrl(id);
  await updateProfile(id, { avatarFriendsOnly: false, avatarUrl: nextUrl });
  const copied = await publicStorage.upload(path, bytes, { upsert: true, contentType: 'image/jpeg' });
  const publicList = copied.error
    ? null
    : await publicStorage.list(id, { search: 'avatar.jpg', limit: 10 });
  if (copied.error || publicList?.error || !publicList?.data?.some((file) => file.name === 'avatar.jpg')) {
    await updateProfile(id, { avatarFriendsOnly: true, avatarUrl });
    throw copied.error ?? publicList?.error ?? new Error('Public avatar copy missing');
  }
  // Una copia privada sobrante no expone la foto a desconocidos. No fallar la
  // preferencia ya guardada si la limpieza de esa copia falla.
  await privateStorage.remove([path]);
  return nextUrl;
}

export async function removeAvatar(userId: string, avatarUrl: string): Promise<void> {
  const bucket = privateAvatarPath(avatarUrl) ? 'avatars-private' : 'avatars';
  const storage = supabase.storage.from(bucket);
  const { error } = await storage.remove([`${userId}/avatar.jpg`]);
  if (error) throw error;
  const listed = await storage.list(userId, { search: 'avatar.jpg', limit: 10 });
  if (listed.error || listed.data?.some((file) => file.name === 'avatar.jpg')) {
    throw listed.error ?? new Error('Avatar still exists');
  }
}
