import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchDailyWord, submitWordGuess } from '../api/wordGame';
import { WordGameSession, wordDraftKey } from '../lib/wordGameSession';

export function useWordGame(userId: string | undefined, enabled = true) {
  const controller = useMemo(() => new WordGameSession({
    storageKey: wordDraftKey(userId ?? 'signed-out'),
    today: () => userId ? fetchDailyWord() : Promise.reject(new Error('WORD_AUTH_REQUIRED')),
    submit: submitWordGuess,
    readDraft: () => userId ? AsyncStorage.getItem(wordDraftKey(userId)) : Promise.resolve(null),
    writeDraft: (value) => userId ? AsyncStorage.setItem(wordDraftKey(userId), value) : Promise.resolve(),
  }), [userId]);
  const [snapshot, setSnapshot] = useState({ controller, state: controller.state });
  useEffect(() => controller.subscribe((state) => setSnapshot({ controller, state })), [controller]);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    controller.setActive(true);
    const subscription = AppState.addEventListener('change', (state) => controller.setActive(state === 'active'));
    const timer = setInterval(() => controller.tick(), 1000);
    return () => { controller.setActive(false); subscription.remove(); clearInterval(timer); };
  }, [controller, enabled]));
  // Never render the previous account's board during the subscription handover.
  const state = snapshot.controller === controller ? snapshot.state : controller.state;
  return { ...state, controller };
}
