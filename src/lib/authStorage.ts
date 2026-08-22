/**
 * Almacenamiento seguro de la sesión de Supabase.
 *
 * Por defecto Supabase guarda los tokens (access + refresh JWT) en AsyncStorage,
 * que en Android es texto plano en el sandbox de la app (extraíble en un
 * dispositivo rooteado o por backup adb). Este adaptador los mueve al
 * almacén cifrado del sistema (Keychain iOS / Keystore Android) vía
 * expo-secure-store.
 *
 * Tres detalles que resuelve:
 *  1. Límite de tamaño: SecureStore avisa/limita ~2 KB por clave y la sesión
 *     de Supabase suele superarlo → se trocea en chunks (`<key>.0`, `<key>.1`…)
 *     con un contador en `<key>.cnt`.
 *  2. Web: SecureStore no existe en navegador → se delega en AsyncStorage
 *     (que en web usa localStorage). Igual que hace el flujo OAuth web.
 *  3. Migración: usuarios que ya tenían sesión en AsyncStorage no deben
 *     desloguearse. En el primer getItem que falle en SecureStore se lee de
 *     AsyncStorage, se migra al almacén seguro y se borra el rastro antiguo.
 *
 * IMPORTANTE (despliegue): expo-secure-store es un módulo NATIVO. Una OTA
 * (`eas update`) sobre un build que no lo incluya crashearía → este cambio
 * requiere un BUILD nuevo + submit, no solo update. Ver eas-testflight memo.
 */
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// require en try/catch: si por lo que sea el módulo nativo no está presente
// (p. ej. un build viejo), caemos a AsyncStorage en vez de romper el login.
let SecureStore: typeof import('expo-secure-store') | null = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  SecureStore = null;
}

interface SupabaseAuthStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

// SecureStore avisa por encima de 2048 bytes; troceamos con margen.
const CHUNK_SIZE = 2000;
const countKey = (key: string) => `${key}.cnt`;
const chunkKey = (key: string, i: number) => `${key}.${i}`;

/** ¿Debemos usar SecureStore? Solo en nativo y si el módulo cargó. */
const useSecureStore = Platform.OS !== 'web' && SecureStore != null;

async function readLegacyValue(key: string): Promise<string | null> {
  return AsyncStorage.getItem(key).catch(() => null);
}

/** Borra todas las claves-chunk de `key` (hasta `count`, o sondeando). */
async function clearChunks(key: string, count: number): Promise<void> {
  if (!SecureStore) return;
  const tasks: Promise<void>[] = [SecureStore.deleteItemAsync(countKey(key))];
  for (let i = 0; i < count; i++) tasks.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  await Promise.all(tasks).catch(() => {});
}

const secureAdapter: SupabaseAuthStorage = {
  async getItem(key) {
    if (!SecureStore) return AsyncStorage.getItem(key);

    let countRaw: string | null;
    try {
      countRaw = await SecureStore.getItemAsync(countKey(key));
    } catch {
      // El llavero puede conservar una entrada inaccesible tras reinstalar la
      // app o no estar autorizado en un build de simulador sin firma. Para una
      // lectura, equivale a no tener sesión; no debe alimentar el auto-refresh
      // de Supabase con un rechazo cada 30 segundos.
      return readLegacyValue(key);
    }

    // Sin datos en SecureStore: intentar migrar desde AsyncStorage (sesión previa).
    if (countRaw == null) {
      const legacy = await readLegacyValue(key);
      if (legacy != null) {
        await secureAdapter.setItem(key, legacy);
        await AsyncStorage.removeItem(key).catch(() => {});
        return legacy;
      }
      return null;
    }

    const count = parseInt(countRaw, 10);
    if (!Number.isFinite(count) || count < 0) {
      await clearChunks(key, 0);
      return null;
    }

    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      let part: string | null;
      try {
        part = await SecureStore.getItemAsync(chunkKey(key, i));
      } catch {
        await clearChunks(key, count);
        return readLegacyValue(key);
      }
      if (part == null) {
        // Chunk perdido → valor corrupto: limpiar y tratar como ausente.
        await clearChunks(key, count);
        return null;
      }
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key, value) {
    if (!SecureStore) return AsyncStorage.setItem(key, value);

    // Limpiar chunks previos (puede que antes hubiera más que ahora).
    const prevRaw = await SecureStore.getItemAsync(countKey(key));
    const prev = prevRaw ? parseInt(prevRaw, 10) : 0;
    if (Number.isFinite(prev) && prev > 0) await clearChunks(key, prev);

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    await SecureStore.setItemAsync(countKey(key), String(chunks.length));
    for (let i = 0; i < chunks.length; i++) {
      await SecureStore.setItemAsync(chunkKey(key, i), chunks[i]);
    }
  },

  async removeItem(key) {
    if (!SecureStore) return AsyncStorage.removeItem(key);

    const countRaw = await SecureStore.getItemAsync(countKey(key)).catch(() => null);
    const count = countRaw ? parseInt(countRaw, 10) : 0;
    await clearChunks(key, Number.isFinite(count) ? count : 0);
    // Por si quedó algo del esquema antiguo (sin chunks) en AsyncStorage.
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};

/** Adaptador de storage para el cliente Supabase.
 *  Web → AsyncStorage (localStorage). Nativo → SecureStore troceado. */
export const authStorage: SupabaseAuthStorage = useSecureStore ? secureAdapter : AsyncStorage;
