import AsyncStorage from '@react-native-async-storage/async-storage';
import { CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';

const FAVORITE_STORE_KEY = '@catalog_favorite_store';

export const catalogFavoriteStoreKey = (userId: string) => `${FAVORITE_STORE_KEY}:${userId}`;

export function normalizeCatalogFavoriteStore(value: unknown): CatalogStore | null {
  return typeof value === 'string' && CATALOG_STORE_KEYS.includes(value as CatalogStore)
    ? value as CatalogStore
    : null;
}

export async function readCatalogFavoriteStore(userId: string): Promise<CatalogStore | null> {
  const value = await AsyncStorage.getItem(catalogFavoriteStoreKey(userId));
  return normalizeCatalogFavoriteStore(value);
}

export async function writeCatalogFavoriteStore(
  userId: string,
  store: CatalogStore | null,
): Promise<void> {
  const key = catalogFavoriteStoreKey(userId);
  if (store) {
    await AsyncStorage.setItem(key, store);
    return;
  }
  await AsyncStorage.removeItem(key);
}
