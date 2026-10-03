import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchSponsorCampaigns } from '../api/sponsorCampaigns';
import { CAMPAIGN_CACHE_TTL, selectCampaign, type CampaignSnapshot } from '../lib/sponsorCampaign';
import { peekStartupCache, readStartupCache, startupKeys, writeStartupCache } from '../lib/startupCache';

export function useSponsorCampaign(userId: string | null) {
  const key = userId ? startupKeys.sponsorCampaigns(userId) : null;
  const currentKey = useRef(key);
  currentKey.current = key;
  const [snapshot, setSnapshot] = useState<{ key: string; value: CampaignSnapshot } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const request = useRef(0);

  const refresh = useCallback(async () => {
    if (!key) return;
    const id = ++request.current;
    try {
      const cached = await readStartupCache<CampaignSnapshot>(key);
      if (currentKey.current !== key || request.current !== id) return;
      if (cached) setSnapshot({ key, value: cached });
      const value = await fetchSponsorCampaigns();
      if (currentKey.current !== key || request.current !== id) return;
      writeStartupCache(key, value); // Empty results also replace a withdrawn campaign.
      setSnapshot({ key, value });
    } catch { /* Keep a still-valid cache; never resurrect an expired sponsor. */ }
    finally { if (currentKey.current === key) setNow(Date.now()); }
  }, [key]);

  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    void refresh();
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') { setNow(Date.now()); void refresh(); }
    });
    // Revalidate while Inicio remains open; no Realtime subscription needed.
    const interval = setInterval(() => { void refresh(); }, 5 * 60 * 1000);
    return () => { subscription.remove(); clearInterval(interval); request.current += 1; };
  }, [refresh]));

  const value = key ? (snapshot?.key === key ? snapshot.value : peekStartupCache<CampaignSnapshot>(key)) : null;
  const campaign = selectCampaign(value, Platform.OS, now);
  useEffect(() => {
    if (!value || !campaign) return;
    const deadline = Math.min(value.fetchedAt + CAMPAIGN_CACHE_TTL, campaign.ends_at ? Date.parse(campaign.ends_at) : Infinity);
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, deadline - Date.now()) + 1);
    return () => clearTimeout(timer);
  }, [value, campaign]);
  return { campaign, refresh };
}
