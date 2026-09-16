/* SharedValue writes occur in worklets/effects, never in React render. */
/* eslint-disable react-hooks/immutability */
import { createContext, useCallback, useLayoutEffect, useMemo } from 'react';
import { cancelAnimation, runOnUI, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { TAB_BAR_SCROLL as M } from '../components/bottom-tabs-pager/tabBarScrollPhysics';

export type TabBarScrollController = {
  compactProgress: SharedValue<number>;
  epoch: SharedValue<number>;
  activeKey: SharedValue<string>;
  reducedMotion: boolean;
  compactEnabled: boolean;
  setCompact: (progress: number) => void;
  expandTabBar: () => void;
};
export const TabBarScrollContext = createContext<TabBarScrollController | null>(null);
export const TabBarScrollRouteContext = createContext('');

export function useTabBarScrollController(routeKey: string, reducedMotion: boolean, compactEnabled = true): TabBarScrollController {
  const compactProgress = useSharedValue(0);
  const epoch = useSharedValue(0);
  const activeKey = useSharedValue(routeKey);
  const setCompact = useCallback((amount: number) => {
    'worklet';
    cancelAnimation(compactProgress);
    const target = reducedMotion || !compactEnabled ? 0 : Math.max(0, Math.min(1, amount));
    if (compactProgress.value === target) return;
    compactProgress.value = reducedMotion
      ? withTiming(target, { duration: M.reducedMotionMs })
      : withSpring(target, M.spring);
  }, [compactProgress, reducedMotion, compactEnabled]);
  const expandTabBar = useCallback(() => {
    'worklet';
    // Ignore the old drag/momentum until the user starts a new content gesture.
    epoch.value += 1;
    setCompact(0);
  }, [epoch, setCompact]);
  useLayoutEffect(() => {
    runOnUI(() => {
      'worklet';
      activeKey.value = routeKey;
      expandTabBar();
    })();
  }, [routeKey, reducedMotion, activeKey, expandTabBar]);
  return useMemo(() => ({ compactProgress, epoch, activeKey, reducedMotion, compactEnabled, setCompact, expandTabBar }),
    [compactProgress, epoch, activeKey, reducedMotion, compactEnabled, setCompact, expandTabBar]);
}
