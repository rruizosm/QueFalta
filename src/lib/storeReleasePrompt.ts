import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CatalogStore } from '../constants/stores';

export type StoreReleasePromptStore = 'bm' | 'eljamon';
export type StoreReleaseAnswer = 'yes' | 'no';

const STORE_RELEASE_PROMPT_VERSION = '1.3.2';
const STORE_RELEASE_ANSWER_PREFIX = '@store_release_answer:';

export function storeReleaseAnswerKey(store: StoreReleasePromptStore, userId: string): string {
  return `${STORE_RELEASE_ANSWER_PREFIX}${store}:${STORE_RELEASE_PROMPT_VERSION}:${userId}`;
}

export async function readStoreReleaseAnswer(
  store: StoreReleasePromptStore,
  userId: string,
): Promise<StoreReleaseAnswer | null> {
  const answer = await AsyncStorage.getItem(storeReleaseAnswerKey(store, userId));
  return answer === 'yes' || answer === 'no' ? answer : null;
}

export async function writeStoreReleaseAnswer(
  store: StoreReleasePromptStore,
  userId: string,
  answer: StoreReleaseAnswer,
): Promise<void> {
  await AsyncStorage.setItem(storeReleaseAnswerKey(store, userId), answer);
}

export function storeReleaseCatalogKey(store: StoreReleasePromptStore): CatalogStore {
  return store;
}
