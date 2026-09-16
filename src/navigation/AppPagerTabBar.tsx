import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, runOnUI, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import GlassSurface from '../components/GlassSurface';
import { TAB_BAR_SCROLL as M } from '../components/bottom-tabs-pager/tabBarScrollPhysics';
import { TAB_LAYOUT as L } from '../components/bottom-tabs-pager/constants';
import type { TabAnimation } from '../components/bottom-tabs-pager/types';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme } from '../context/ThemeContext';

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

function Item({ route, index, options, selected, animation, compactProgress, onBarPress, onPress, onLongPress }: {
  route: BottomTabBarProps['state']['routes'][number]; index: number;
  options: BottomTabBarProps['descriptors'][string]['options']; selected: boolean;
  animation: TabAnimation; compactProgress: SharedValue<number>; onBarPress: () => void; onPress: () => void; onLongPress: () => void;
}) {
  const { progress } = animation;
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.62 + 0.38 * Math.max(0, 1 - Math.abs(progress.value - index)),
    transform: [{ scale: interpolate(compactProgress.value, [0, 1], [1, M.compactContentScale]) }],
  }));
  const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
  return <Pressable accessibilityRole={Platform.OS === 'ios' ? 'button' : 'tab'} accessibilityState={{ selected }}
    accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
    testID={options.tabBarButtonTestID ?? `app-tab-${route.name}`}
    onPressIn={() => runOnUI(onBarPress)()} onPress={onPress} onLongPress={onLongPress} style={styles.item}>
    <Animated.View pointerEvents="none" style={[styles.itemContent, animatedStyle]}>
      <View><Ionicons name={icons[route.name] ?? 'ellipse-outline'} size={22} color={colors.ink} />
        {options.tabBarBadge != null && <View style={[styles.badge, options.tabBarBadgeStyle]}>
          <Text style={styles.badgeLabel}>{options.tabBarBadge}</Text>
        </View>}
      </View>
      <Text numberOfLines={1} style={[styles.label, { color: colors.ink }]}>{label}</Text>
    </Animated.View>
  </Pressable>;
}

export function AppPagerTabBar({ state, navigation, descriptors, animation, compactProgress, onBarPress, width, bottom, onPressTab }: Props) {
  const { scheme } = useTheme();
  const slot = (width - L.padding * 2) / state.routes.length;
  const pillWidth = slot - 4;
  const { progress, pillLead, stretch } = animation;
  const rootStyle = useAnimatedStyle(() => ({
    height: interpolate(compactProgress.value, [0, 1], [M.fullHeight, M.compactHeight]),
    transform: [
      { translateY: interpolate(compactProgress.value, [0, 1], [0, M.compactTranslateY]) },
      { scale: interpolate(compactProgress.value, [0, 1], [1, M.compactScale]) },
    ],
    shadowRadius: interpolate(compactProgress.value, [0, 1], [18, 14]),
    elevation: interpolate(compactProgress.value, [0, 1], [6, 4]),
  }));
  const pillStyle = useAnimatedStyle(() => ({
    top: interpolate(compactProgress.value, [0, 1], [L.padding, (M.compactHeight - L.pillHeight) / 2]),
    transform: [
    { translateX: (progress.value + pillLead.value) * slot + 2 },
    { scaleX: 1 + stretch.value }, { scaleY: 1 - stretch.value * 0.16 },
  ] }));
  return <Animated.View pointerEvents="box-none" style={[styles.root, { width, bottom }, rootStyle]}
    onTouchStart={() => runOnUI(onBarPress)()}>
    <GlassSurface glassEffectStyle="clear" fallbackColor={colors.white} style={styles.bar}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, {
        backgroundColor: scheme === 'dark' ? 'rgba(24,24,26,0.45)' : 'rgba(255,255,255,0.4)',
      }]} />
      <Animated.View pointerEvents="none" style={[styles.pill, { width: pillWidth,
        backgroundColor: scheme === 'dark' ? colors.accentMid : colors.accentLight }, pillStyle]} />
      {state.routes.map((route, index) => <Item key={route.key} route={route} index={index}
        options={descriptors[route.key].options} selected={state.index === index} animation={animation} compactProgress={compactProgress} onBarPress={onBarPress}
        onPress={() => onPressTab(index)}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })} />)}
    </GlassSurface>
  </Animated.View>;
}

const styles = StyleSheet.create({
  root: { overflow: 'visible', position: 'absolute', alignSelf: 'center', height: L.height, borderRadius: L.height / 2,
    shadowColor: '#171717', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.13, shadowRadius: 18, elevation: 6 },
  bar: { flex: 1, flexDirection: 'row', paddingHorizontal: L.padding, borderRadius: L.height / 2, overflow: 'hidden' },
  pill: { position: 'absolute', left: L.padding, top: L.padding, height: L.pillHeight, borderRadius: L.pillHeight / 2, opacity: 0.8 },
  item: { minHeight: M.minTouchTarget / M.compactScale, flex: 1, justifyContent: 'center', alignItems: 'center' },
  itemContent: { alignItems: 'center', gap: 2 },
  label: { fontFamily: fonts.semibold, fontSize: 10 },
  badge: { position: 'absolute', right: -8, top: -4, minWidth: 15, height: 15, paddingHorizontal: 3,
    borderRadius: 8, backgroundColor: '#df4b2e', alignItems: 'center', justifyContent: 'center' },
  badgeLabel: { color: '#fff', fontSize: 9, fontFamily: fonts.bold },
});
