import { useCallback, useEffect, useRef } from 'react';
import { AppState, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { recordSponsorEvent } from '../api/sponsorMetrics';
import { createBannerDwell, sponsorEventId, visibleBannerFraction } from '../lib/sponsorMetrics';

export function useSponsorMetrics(userId: string | null, campaignId: string | null,
  blocked: boolean, top: number, bottomInset: number) {
  const bannerRef = useRef<View>(null);
  const dimensions = useWindowDimensions();
  const state = useRef({ userId, campaignId, blocked, top, bottomInset, ...dimensions });
  state.current = { userId, campaignId, blocked, top, bottomInset, ...dimensions };
  const loaded = useRef(false);
  const dwell = useRef(createBannerDwell());
  const visit = useRef<string | null>(null);
  const counted = useRef(new Set<string>());
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; dwell.current.reset(); }, []);
  const onImageReady = useCallback((ready: boolean) => { loaded.current=ready; invalidate(); }, [invalidate]);
  useEffect(invalidate, [blocked, campaignId, top, bottomInset, dimensions.width, dimensions.height, invalidate]);

  useFocusEffect(useCallback(() => {
    if (!userId) { visit.current=null; invalidate(); return; }
    visit.current=sponsorEventId(); counted.current.clear(); invalidate();
    let active=true;
    const subscription=AppState.addEventListener('change', invalidate);
    const timer=setInterval(() => {
      const s=state.current;
      if (!active || AppState.currentState!=='active' || s.blocked || !loaded.current || !s.userId || !s.campaignId) {
        invalidate(); return;
      }
      if (counted.current.has(s.campaignId)) return;
      const token=generation.current;
      const currentVisit=visit.current;
      bannerRef.current?.measureInWindow((x,y,w,h) => {
        if (!active || token!==generation.current || s.campaignId!==state.current.campaignId ||
          state.current.blocked || !loaded.current || AppState.currentState!=='active' ||
          (s.campaignId && counted.current.has(s.campaignId))) return;
        const fraction=visibleBannerFraction(x,y,w,h,s.width,s.top,s.height-s.bottomInset);
        if (dwell.current.sample(fraction, performance.now()) && currentVisit && s.userId && s.campaignId) {
          counted.current.add(s.campaignId);
          void recordSponsorEvent(s.userId,s.campaignId,currentVisit,'impression');
        }
      });
    },200);
    return () => { active=false; visit.current=null; invalidate(); clearInterval(timer); subscription.remove(); };
  }, [userId, invalidate]));

  const onClick=useCallback(() => {
    const s=state.current;
    if (visit.current && s.userId && s.campaignId && !s.blocked && AppState.currentState==='active') {
      void recordSponsorEvent(s.userId,s.campaignId,visit.current,'click');
    }
  }, []);
  return { bannerRef, onImageReady, onClick, onScroll: invalidate };
}
