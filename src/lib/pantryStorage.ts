import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodePantryLayout, encodePantryLayout, type PantryLayout, type PantrySection } from './pantryLayout';

// Keep the existing cupboard key byte-for-byte; never copy it into the fridge.
export const pantryStorageKey = (userId: string, section: PantrySection = 'pantry') =>
  `@${section === 'fridge' ? 'fridge' : 'pantry'}_layout:v1:${userId}`;
// A gesture commits only once. Queues also span screen remounts so an earlier
// async write cannot overwrite a later edit or a newly restored snapshot.
const pendingWrites = new Map<string, Promise<void>>();

export async function readPantryLayout(userId: string, section: PantrySection = 'pantry'): Promise<PantryLayout> {
  const key = pantryStorageKey(userId, section);
  await pendingWrites.get(key)?.catch(() => {});
  return decodePantryLayout(await AsyncStorage.getItem(key));
}

export function writePantryLayout(userId: string, layout: PantryLayout, section: PantrySection = 'pantry'): Promise<void> {
  const key = pantryStorageKey(userId, section);
  const snapshot = encodePantryLayout(layout);
  const write = (pendingWrites.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(() => AsyncStorage.setItem(key, snapshot));
  pendingWrites.set(key, write);
  const cleanup = () => { if (pendingWrites.get(key) === write) pendingWrites.delete(key); };
  void write.then(cleanup, cleanup);
  return write;
}
