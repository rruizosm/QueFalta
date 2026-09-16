import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import type { PagerTab, TabAnimation } from './types';

export function TabIcon({ tab, index, active, animation }: {
  tab: PagerTab; index: number; active: boolean; animation: TabAnimation;
}) {
  const { progress, goTo } = animation;
  const style = useAnimatedStyle(() => ({
    opacity: 0.58 + 0.42 * Math.max(0, 1 - Math.abs(progress.value - index)),
  }));
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }} onPress={() => goTo(index)}
      testID={`pager-tab-${tab.key}`} style={styles.button}>
      <Animated.View style={style} pointerEvents="none">
        <Feather name={tab.icon} size={23} color="#1b242c" />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({ button: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center' } });
