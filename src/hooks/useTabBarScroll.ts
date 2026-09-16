import { useContext, useLayoutEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { cancelAnimation, runOnJS, runOnUI, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewProps } from 'react-native';
import { TabBarScrollContext, TabBarScrollRouteContext } from '../context/TabBarScrollContext';
import { advanceScrollIntent, beginScrollIntent, tabBarTopReduction, type ScrollIntent } from '../components/bottom-tabs-pager/tabBarScrollPhysics';

type ScrollContext = { intent: ScrollIntent; epoch: number; maxY: number; tracking: boolean };
type Listener = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
function notify(listener: Listener, event: NativeScrollEvent) {
  listener({ nativeEvent: event } as NativeSyntheticEvent<NativeScrollEvent>);
}

/** Attach onScroll to an Animated list; no React updates on the scroll path. */
export function useTabBarScroll(enabled = true, listeners: ScrollViewProps = {}) {
  const controller = useContext(TabBarScrollContext);
  const routeKey = useContext(TabBarScrollRouteContext);
  const focused = useIsFocused();
  const eligible = useSharedValue(false);
  const { compactProgress, epoch, activeKey, reducedMotion, compactEnabled, setCompact, expandTabBar } = controller ?? {};
  const { onScroll, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd } = listeners;
  useLayoutEffect(() => {
    eligible.value = enabled && focused;
    if (enabled && focused && expandTabBar) runOnUI(expandTabBar)();
    return () => {
      eligible.value = false;
      if (enabled && focused && expandTabBar) runOnUI(expandTabBar)();
    };
  }, [enabled, focused, eligible, expandTabBar]);
  const scrollHandler = useAnimatedScrollHandler<ScrollContext>({
    onBeginDrag: (event, ctx) => {
      ctx.tracking = true;
      ctx.epoch = epoch?.value ?? -1;
      ctx.maxY = Math.max(0, event.contentSize.height - event.layoutMeasurement.height);
      ctx.intent = beginScrollIntent(Math.max(0, Math.min(ctx.maxY, event.contentOffset.y)), compactProgress?.value ?? 0);
      if (onScrollBeginDrag) runOnJS(notify)(onScrollBeginDrag, event);
    },
    onScroll: (event, ctx) => {
      if (onScroll) runOnJS(notify)(onScroll, event);
      if (!eligible.value || reducedMotion || !compactEnabled || !compactProgress || !epoch || !activeKey ||
          activeKey.value !== routeKey || !ctx.tracking || ctx.epoch !== epoch.value) return;
      const maxY = Math.max(0, event.contentSize.height - event.layoutMeasurement.height);
      const y = Math.max(0, Math.min(maxY, event.contentOffset.y));
      // Ignore bounce and offsets clamped by our shrinking footer at the bottom.
      const layoutClamp = Math.abs(maxY - ctx.maxY) > 0.1 && y >= maxY - 1 && ctx.intent.lastY >= ctx.maxY - 1;
      ctx.maxY = maxY;
      if (maxY <= 1) {
        setCompact?.(0);
        ctx.intent = beginScrollIntent(y, compactProgress.value);
        return;
      }
      if (layoutClamp) {
        ctx.intent = beginScrollIntent(y, compactProgress.value);
        return;
      }
      const next = advanceScrollIntent(ctx.intent, y, compactProgress.value);
      if (next.expand) setCompact?.(0);
      else if (next.progress > compactProgress.value) {
        cancelAnimation(compactProgress);
        compactProgress.value = next.progress;
      }
    },
    onEndDrag: (event, ctx) => {
      ctx.tracking = false;
      if (onScrollEndDrag) runOnJS(notify)(onScrollEndDrag, event);
    },
    onMomentumBegin: (event, ctx) => {
      ctx.tracking = !!ctx.intent && ctx.epoch === epoch?.value;
      if (onMomentumScrollBegin) runOnJS(notify)(onMomentumScrollBegin, event);
    },
    onMomentumEnd: (event, ctx) => {
      ctx.tracking = false;
      if (onMomentumScrollEnd) runOnJS(notify)(onMomentumScrollEnd, event);
    },
  });
  const reduction = tabBarTopReduction(1);
  const hasController = controller !== null;
  const spacerStyle = useAnimatedStyle(() => ({
    height: hasController && enabled ? reduction - tabBarTopReduction(eligible.value ? compactProgress?.value ?? 0 : 0) : 0,
  }));
  return { compactProgress, setCompact, expandTabBar, onScroll: scrollHandler, spacerStyle,
    spacerBudget: controller && enabled ? reduction : 0 };
}

/** Fixed controls can follow the same bar edge without a React render per frame. */
export function useTabBarScrollOffsetStyle() {
  const controller = useContext(TabBarScrollContext);
  const progress = controller?.compactProgress;
  return useAnimatedStyle(() => ({ transform: [{ translateY: tabBarTopReduction(progress?.value ?? 0) }] }));
}
