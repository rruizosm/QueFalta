import { runOnUI, useAnimatedReaction } from 'react-native-reanimated';
import { TabBarScrollContext, TabBarScrollRouteContext, useTabBarScrollController } from '../context/TabBarScrollContext';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  CommonActions, createNavigatorFactory, getFocusedRouteNameFromRoute, TabRouter, useNavigationBuilder,
  type NavigatorTypeBagBase, type ParamListBase, type StaticConfig, type TabActionHelpers,
  type TabNavigationState, type TabRouterOptions, type TypedNavigator,
} from '@react-navigation/native';
import {
  BottomTabBarHeightContext, type BottomTabBarProps, type BottomTabNavigationEventMap,
  type BottomTabNavigationOptions, type BottomTabNavigationProp, type BottomTabNavigatorProps,
} from '@react-navigation/bottom-tabs';
import { SafeAreaProviderCompat, Screen } from '@react-navigation/elements';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Pager } from '../components/bottom-tabs-pager/Pager';
import { useTabAnimation } from '../components/bottom-tabs-pager/useTabAnimation';
import { TAB_BAR_SCROLL as SCROLL } from '../components/bottom-tabs-pager/tabBarScrollPhysics';
import { TAB_LAYOUT as L } from '../components/bottom-tabs-pager/constants';
import { FloatingPagerContext, PagerMotionContext } from '../components/bottom-tabs-pager/PagerGestureContext';
import { PagerGestureBoundary } from '../components/bottom-tabs-pager/PagerGestureBoundary';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';
import { AppPagerTabBar } from './AppPagerTabBar';

function AppPagerView({ state, navigation, descriptors }: Omit<BottomTabBarProps, 'insets'>) {
  useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const [loaded, setLoaded] = useState(() => new Set([state.routes[state.index].key]));
  const reducedMotion = useReducedMotion();
  const live = useRef({ state, navigation });
  live.current = { state, navigation };
  const pendingTap = useRef<string | null>(null);
  const controls = useRef<{ goTo: (index: number) => void } | null>(null);
  const activeRoute = state.routes[state.index];
  const barWidth = Math.min(L.maxWidth, Math.max(0, width - 2 * (L.margin + Math.max(insets.left, insets.right))));
  const compactEnabled = (barWidth - 2 * L.padding) / state.routes.length * SCROLL.compactScale >= SCROLL.minTouchTarget;
  const scrollController = useTabBarScrollController(activeRoute.key, reducedMotion, compactEnabled);
  const { compactProgress, expandTabBar } = scrollController;
  const hidden = activeRoute.name === 'Home' && getFocusedRouteNameFromRoute(activeRoute) === 'DailyWord';
  // The native back gesture owns nested stacks; tabs can still be changed by tapping.
  const swipeEnabled = !hidden && (activeRoute.state?.index ?? 0) === 0;
  const onSettled = useCallback((index: number) => {
    const { state: current, navigation: nav } = live.current;
    const route = current.routes[index];
    if (!route || index === current.index) { pendingTap.current = null; return; }
    const wasTapped = pendingTap.current === route.key;
    pendingTap.current = null;
    const event = wasTapped ? null : nav.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event?.defaultPrevented) { controls.current?.goTo(current.index); return; }
    nav.dispatch({ ...CommonActions.navigate(route), target: current.key });
  }, []);
  const animation = useTabAnimation({ width, count: state.routes.length, initialIndex: state.index,
    reducedMotion, onSettled, swipeEnabled });
  controls.current = animation;
  const { goTo, progress: pagerProgress } = animation;
  useAnimatedReaction(() => Math.abs(pagerProgress.value - Math.round(pagerProgress.value)) > 0.001,
    (moving, wasMoving) => { if (moving && !wasMoving) expandTabBar(); });

  // Navigation from Home buttons, notifications, deep links and Android Back uses
  // exactly the same pager. The TabRouter remains the source of truth for routes.
  useEffect(() => { goTo(state.index); }, [state.index, goTo]);

  // Warm neighboring pages after the initial screen gets its first paint. Focus
  // effects still run only on the selected route. Visited stacks stay mounted.
  useEffect(() => {
    const task = requestIdleCallback(() => setLoaded((previous) => {
      const next = new Set(previous);
      for (let i = Math.max(0, state.index - 1); i <= Math.min(state.routes.length - 1, state.index + 1); i++) {
        next.add(state.routes[i].key);
      }
      state.preloadedRouteKeys.forEach((key) => next.add(key));
      return next.size === previous.size ? previous : next;
    }));
    return () => cancelIdleCallback(task);
  }, [state.index, state.routes, state.preloadedRouteKeys]);

  const onPressTab = (index: number) => {
    runOnUI(expandTabBar)();
    const route = state.routes[index];
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (event.defaultPrevented) return;
    pendingTap.current = route.key;
    // A distant tap reveals intermediate pages, too; prepare that path once.
    setLoaded((previous) => new Set([...previous, ...state.routes
      .slice(Math.min(index, state.index), Math.max(index, state.index) + 1).map((item) => item.key)]));
    if (index !== state.index) void Haptics.selectionAsync().catch(() => {});
    goTo(index);
  };
  const bottom = Math.max(insets.bottom, 8) + L.bottomGap;
  const barHeight = hidden ? 0 : bottom + L.height;
  const tabs = state.routes.map((route, index) => ({
    key: route.key, label: descriptors[route.key].options.title ?? route.name, icon: 'circle' as const,
    renderPage: () => <TabBarScrollRouteContext.Provider value={route.key}><BottomTabBarHeightContext.Provider value={barHeight}>
      <PagerMotionContext.Provider value={{ createPan: animation.createPan, enabled: swipeEnabled && index === state.index }}>
        <Screen focused={state.index === index} route={route} navigation={descriptors[route.key].navigation}
          headerShown={false} header={null}>
          {loaded.has(route.key) || index === state.index || descriptors[route.key].options.lazy === false
            ? (route.name === 'List' || route.name === 'QueCocino'
              ? <PagerGestureBoundary>{descriptors[route.key].render()}</PagerGestureBoundary>
              : descriptors[route.key].render())
            : <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>}
        </Screen>
      </PagerMotionContext.Provider>
    </BottomTabBarHeightContext.Provider></TabBarScrollRouteContext.Provider>,
  }));

  return <TabBarScrollContext.Provider value={scrollController}><FloatingPagerContext.Provider value>
    <View style={[styles.root, { backgroundColor: colors.paper }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <>
        <Pager tabs={tabs} width={width} animation={animation} activeIndex={state.index} handleGesture={false}
          pageContext={{ topInset: insets.top, bottomInset: barHeight, horizontalInset: 0, pagerGesture: animation.pan }} />
        {!hidden && <AppPagerTabBar state={state} descriptors={descriptors} navigation={navigation}
          compactProgress={compactProgress} onBarPress={expandTabBar}
          insets={insets} animation={animation} width={barWidth} bottom={bottom} onPressTab={onPressTab} />}
      </>}
    </View>
  </FloatingPagerContext.Provider></TabBarScrollContext.Provider>;
}

function AppPagerNavigator({ id, initialRouteName, backBehavior, UNSTABLE_routeNamesChangeBehavior,
  children, layout, screenListeners, screenOptions, screenLayout, UNSTABLE_router }: BottomTabNavigatorProps) {
  const { state, descriptors, navigation, NavigationContent } = useNavigationBuilder<
    TabNavigationState<ParamListBase>, TabRouterOptions, TabActionHelpers<ParamListBase>,
    BottomTabNavigationOptions, BottomTabNavigationEventMap
  >(TabRouter, { id, initialRouteName, backBehavior, UNSTABLE_routeNamesChangeBehavior,
    children, layout, screenListeners, screenOptions, screenLayout, UNSTABLE_router });
  return <NavigationContent><SafeAreaProviderCompat>
    <AppPagerView state={state} descriptors={descriptors} navigation={navigation} />
  </SafeAreaProviderCompat></NavigationContent>;
}

// Same route/options contract as bottom-tabs; only its view is replaced.
export function createAppPagerNavigator<
  const ParamList extends ParamListBase,
  const NavigatorID extends string | undefined = string | undefined,
  const TypeBag extends NavigatorTypeBagBase = {
    ParamList: ParamList; NavigatorID: NavigatorID; State: TabNavigationState<ParamList>;
    ScreenOptions: BottomTabNavigationOptions; EventMap: BottomTabNavigationEventMap;
    NavigationList: { [RouteName in keyof ParamList]: BottomTabNavigationProp<ParamList, RouteName, NavigatorID> };
    Navigator: typeof AppPagerNavigator;
  },
  const Config extends StaticConfig<TypeBag> = StaticConfig<TypeBag>,
>(config?: Config): TypedNavigator<TypeBag, Config> {
  return createNavigatorFactory(AppPagerNavigator)(config);
}

const styles = StyleSheet.create({ root: { flex: 1 }, loading: { flex: 1, justifyContent: 'center', alignItems: 'center' } });
