import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodePantryLayout, encodePantryLayout, type PantryLayout } from './pantryLayout';

export const pantryStorageKey = (userId: string) => `@pantry_layout:v1:${userId}`;
// A gesture commits only once. Queues also span screen remounts so an earlier
// async write cannot overwrite a later edit or a newly restored snapshot.
const pendingWrites = new Map<string, Promise<void>>();

export async function readPantryLayout(userId: string): Promise<PantryLayout> {
  const key = pantryStorageKey(userId);
  await pendingWrites.get(key)?.catch(() => {});
  return decodePantryLayout(await AsyncStorage.getItem(key));
}

export function writePantryLayout(userId: string, layout: PantryLayout): Promise<void> {
  const key = pantryStorageKey(userId);
  const snapshot = encodePantryLayout(layout);
  const write = (pendingWrites.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => AsyncStorage.setItem(key, snapshot));
  pendingWrites.set(key, write);
  const cleanup = () => { if (pendingWrites.get(key) === write) pendingWrites.delete(key); };
  void write.then(cleanup, cleanup);
  return write;
}
