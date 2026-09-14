import { useCallback, useSyncExternalStore } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { recipeFeed } from '../lib/recipeFeed';

export function useRecipeFeed(userId: string) {
  const subscribe = useCallback((listener: () => void) => recipeFeed.subscribe(userId, listener), [userId]);
  const getSnapshot = useCallback(() => recipeFeed.snapshot(userId), [userId]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useFocusEffect(useCallback(() => { void recipeFeed.refresh(userId); }, [userId]));
  return snapshot;
}
