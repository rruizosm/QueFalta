import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Caché de arranque por usuario. La copia en memoria permite que las pestañas
 * lazy lean el snapshot de forma síncrona; AsyncStorage conserva ese snapshot
 * entre aperturas. La red siempre revalida después (stale-while-revalidate).
 */
const memory = new Map<string, unknown>();

const key = (userId: string, resource: string) => `@startup:v1:${userId}:${resource}`;

export const startupKeys = {
  profile: (userId: string) => key(userId, 'profile'),
  groups: (userId: string) => key(userId, 'groups'),
  lastPurchase: (userId: string) => key(userId, 'lastPurchase'),
  listItems: (userId: string, listId: string) => key(userId, `listItems:${listId}`),
  groupMembers: (userId: string, groupId: string) => key(userId, `groupMembers:${groupId}`),
};

export function peekStartupCache<T>(cacheKey: string): T | null {
  return (memory.get(cacheKey) as T | undefined) ?? null;
}

/** Distingue "snapshot conocido cuyo valor es null" de "sin snapshot". */
export function hasStartupCache(cacheKey: string): boolean {
  return memory.has(cacheKey);
}

export async function readStartupCache<T>(cacheKey: string): Promise<T | null> {
  if (memory.has(cacheKey)) return peekStartupCache<T>(cacheKey);
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as T;
    memory.set(cacheKey, value);
    return value;
  } catch {
    return null;
  }
}

export function writeStartupCache<T>(cacheKey: string, value: T): void {
  memory.set(cacheKey, value);
  AsyncStorage.setItem(cacheKey, JSON.stringify(value)).catch(() => {});
}

/** Precarga en paralelo los snapshots que consumirán las pestañas lazy. */
export async function primeTabCaches(
  userId: string,
  activeCart: { groupId: string; listId: string } | null,
): Promise<void> {
  const keys = [startupKeys.groups(userId), startupKeys.lastPurchase(userId)];
  if (activeCart) {
    keys.push(
      startupKeys.listItems(userId, activeCart.listId),
      startupKeys.groupMembers(userId, activeCart.groupId),
    );
  }
  await Promise.all(keys.map((cacheKey) => readStartupCache(cacheKey)));
}
