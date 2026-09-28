import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchWordRanking, type RankingPeriod, type WordRankingWindow } from '../api/wordGame';
import { WordRankingCache } from '../lib/wordRankingCache';

export function useWordRanking({ userId, day, revision, groupId, groupReady, tab, period, offset }: {
  userId?: string; day?: string; revision: string; groupId?: string; groupReady: boolean;
  tab: 'play' | 'ranking' | 'group'; period: RankingPeriod; offset: number;
}) {
  // Never reuse profiles or an in-flight reply after account/day/group/result changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- These dependencies define the cache ownership and invalidation boundary.
  const cache = useMemo(() => new WordRankingCache<WordRankingWindow>(), [userId, day, groupId, revision]);
  const [result, setResult] = useState<{ cache: typeof cache; key: string; value: WordRankingWindow } | null>(null);
  const [error, setError] = useState<{ cache: typeof cache; key: string } | null>(null);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [focused, setFocused] = useState(false);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    const sub = AppState.addEventListener('change', (state) => {
      setForeground(state === 'active');
    });
    return () => { setFocused(false); sub.remove(); };
  }, []));
  useEffect(() => () => cache.clear(), [cache]);

  const key = `${tab}:${period}:${offset}`;
  const enabled = !!userId && !!day && focused && foreground;
  const request = useCallback((scope: 'ranking' | 'group', selected: RankingPeriod, history: number) =>
    cache.get(`${scope}:${selected}:${history}`, (signal) => fetchWordRanking(selected, history, scope === 'group' ? groupId : undefined, signal)), [cache, groupId]);

  // Only preload the selected current period, sequentially. No five-period fan-out or polling.
  useEffect(() => {
    if (!enabled || tab !== 'play') return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try { await request('ranking', period, 0); } catch { /* Retry on explicit opening. */ }
        if (!cancelled && groupReady && groupId) {
          try { await request('group', period, 0); } catch { /* Retry on explicit opening. */ }
        }
      })();
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, tab, period, groupReady, groupId, request]);

  useEffect(() => {
    if (!enabled || tab === 'play' || (tab === 'group' && (!groupReady || !groupId))) return;
    let cancelled = false;
    setError(null);
    void request(tab, period, offset).then((value) => {
      if (!cancelled) setResult({ cache, key, value });
    }, (failure) => { if (!cancelled && failure?.message !== 'WORD_CACHE_INVALIDATED') setError({ cache, key }); });
    return () => { cancelled = true; };
  }, [enabled, tab, period, offset, groupReady, groupId, request, cache, key]);

  const refresh = useCallback(() => {
    cache.clear();
    setError(null);
    if (!enabled || tab === 'play' || (tab === 'group' && (!groupReady || !groupId))) return;
    void request(tab, period, offset).then((value) => { setError(null); setResult({ cache, key, value }); },
      (failure) => { if (failure?.message !== 'WORD_CACHE_INVALIDATED') setError({ cache, key }); });
  }, [cache, enabled, tab, groupReady, groupId, request, period, offset, key]);
  return { ranking: cache.peek(key, true) ?? (result?.cache === cache && result.key === key ? result.value : null),
    error: error?.cache === cache && error.key === key, refresh };
}
