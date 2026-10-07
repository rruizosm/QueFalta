import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useMemo } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, runOnUI, useAnimatedStyle, useDerivedValue, type SharedValue } from 'react-native-reanimated';
import GlassSurface from '../components/GlassSurface';
import { TAB_BAR_SCROLL as M } from '../components/bottom-tabs-pager/tabBarScrollPhysics';
import { TAB_LAYOUT as L } from '../components/bottom-tabs-pager/constants';
import type { TabAnimation } from '../components/bottom-tabs-pager/types';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme } from '../context/ThemeContext';
import { getAppTabBarPageIndices, pagerToTabBarProgress } from './appPagerRoutes';

const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline', Catalog: 'library-outline', QueCocino: 'restaurant-outline',
  List: 'basket-outline', Groups: 'people-outline',
};

type Props = BottomTabBarProps & {
  animation: TabAnimation;
  compactProgress: SharedValue<number>;
  onBarPress: () => void;
  width: number;
  bottom: number;
  onPressTab: (index: number) => void;
};

function Item({ route, index, options, selected, progress, onBarPress, onPress, onLongPress }: {
  route: BottomTabBarProps['state']['routes'][number]; index: number;
  options: BottomTabBarProps['descriptors'][string]['options']; selected: boolean;
  progress: SharedValue<number>; onBarPress: () => void; onPress: () => void; onLongPress: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.62 + 0.38 * Math.max(0, 1 - Math.abs(progress.value - index)),
  }));
  const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
  return <Pressable accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'} accessibilityState={{ selected }}
    accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
    testID={options.tabBarButtonTestID ?? `app-tab-${route.name}`}
    onPressIn={() => runOnUI(onBarPress)()} onPress={onPress} onLongPress={onLongPress} style={styles.item}>
    <Animated.View pointerEvents="none" style={[styles.itemContent, animatedStyle]}>
      <View><Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={28} color={colors.ink} />
        {options.tabBarBadge != null && <View style={[styles.badge, options.tabBarBadgeStyle]}>
          <Text style={styles.badgeLabel}>{options.tabBarBadge}</Text>
        </View>}
      </View>
    </Animated.View>
  </Pressable>;
}

export function AppPagerTabBar({ state, navigation, descriptors, animation, compactProgress, onBarPress, width, bottom, onPressTab }: Props) {
  const { scheme } = useTheme();
  const pageIndices = useMemo(() => getAppTabBarPageIndices(state.routes), [state.routes]);
  const slot = (width - L.padding * 2) / pageIndices.length;
  const pillWidth = slot - 4;
  const { progress, pillLead, stretch } = animation;
  const tabProgress = useDerivedValue(() => pagerToTabBarProgress(progress.value, pageIndices));
  const selectedIndex = pagerToTabBarProgress(state.index, pageIndices);
  const shellStyle = useAnimatedStyle(() => ({
    height: interpolate(compactProgress.value, [0, 1], [M.fullHeight, M.compactHeight]),
    transform: [
      { translateY: interpolate(compactProgress.value, [0, 1], [0, M.compactTranslateY]) },
      { scale: interpolate(compactProgress.value, [0, 1], [1, M.compactScale]) },
    ],
    shadowRadius: interpolate(compactProgress.value, [0, 1], [18, 14]),
    elevation: interpolate(compactProgress.value, [0, 1], [6, 4]),
  }));
  // Keep Ionicons outside the scaled shell: scaling their rendered layer makes
  // the glyphs look soft. Layout values still track the shell exactly.
  const itemsStyle = useAnimatedStyle(() => ({
    bottom: interpolate(compactProgress.value, [0, 1], [0, -(M.fullHeight - M.compactHeight) / 2 - M.compactTranslateY]),
    left: interpolate(compactProgress.value, [0, 1], [0, width * (1 - M.compactScale) / 2]),
    width: interpolate(compactProgress.value, [0, 1], [width, width * M.compactScale]),
    paddingHorizontal: interpolate(compactProgress.value, [0, 1], [L.padding, L.padding * M.compactScale]),
  }));
  const pillStyle = useAnimatedStyle(() => {
    // The Pantry/Home swipe changes no bottom destination, so its pill stays
    // still. All other pages retain the existing lead/stretch animation.
    const insideHome = progress.value <= pageIndices[0];
    const pillStretch = insideHome ? 0 : stretch.value;
    const pillPosition = insideHome ? 0 : pagerToTabBarProgress(progress.value + pillLead.value, pageIndices);
    return {
      top: interpolate(compactProgress.value, [0, 1], [L.padding, (M.compactHeight - L.pillHeight) / 2]),
      transform: [
        { translateX: pillPosition * slot + 2 },
        { scaleX: 1 + pillStretch }, { scaleY: 1 - pillStretch * 0.16 },
      ],
    };
  });
  return <View pointerEvents="box-none" style={[styles.root, { width, bottom }]}
    onTouchStart={() => runOnUI(onBarPress)()}>
    <Animated.View pointerEvents="none" style={[styles.barShell, shellStyle]}>
      <GlassSurface glassEffectStyle="clear" fallbackColor={colors.white} style={styles.bar}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
          backgroundColor: scheme === 'dark' ? 'rgba(24,24,26,0.45)' : 'rgba(255,255,255,0.4)',
        }]} />
        <Animated.View pointerEvents="none" style={[styles.pill, { width: pillWidth,
          backgroundColor: scheme === 'dark' ? colors.accentMid : colors.accentLight }, pillStyle]} />
      </GlassSurface>
    </Animated.View>
    <Animated.View pointerEvents="box-none" style={[styles.items, itemsStyle]}>
      {pageIndices.map((pageIndex, index) => {
        const route = state.routes[pageIndex];
        return <Item key={route.key} route={route} index={index}
          options={descriptors[route.key].options} selected={selectedIndex === index} progress={tabProgress} onBarPress={onBarPress}
          onPress={() => onPressTab(pageIndex)}
          onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })} />;
      })}
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  root: { overflow: 'visible', position: 'absolute', alignSelf: 'center', height: L.height },
  barShell: { position: 'absolute', left: 0, right: 0, bottom: 0, height: L.height, borderRadius: L.height / 2,
    shadowColor: '#171717', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 18, elevation: 6 },
  bar: { flex: 1, borderRadius: L.height / 2, overflow: 'hidden' },
  items: { position: 'absolute', height: L.height, flexDirection: 'row' },
  pill: { position: 'absolute', left: L.padding, top: L.padding, height: L.pillHeight, borderRadius: L.pillHeight / 2, opacity: 0.8 },
  item: { minHeight: M.minTouchTarget / M.compactScale, flex: 1, justifyContent: 'center', alignItems: 'center' },
  itemContent: { alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -8, top: -4, minWidth: 15, height: 15, paddingHorizontal: 3,
    borderRadius: 8, backgroundColor: '#df4b2e', alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { color: '#fff', fontSize: 9, fontFamily: fonts.bold },
});
