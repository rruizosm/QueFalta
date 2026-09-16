import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { TAB_LAYOUT as L } from './constants';
import { TabBarBackdrop } from './ContentBlur';
import { TabIcon } from './TabIcon';
import type { PagerTab, TabAnimation } from './types';

export function CustomTabBar({ tabs, animation, activeIndex, width, bottom }: {
  tabs: readonly PagerTab[]; animation: TabAnimation; activeIndex: number; width: number; bottom: number;
}) {
  const slot = (width - L.padding * 2) / tabs.length;
  const pillWidth = Math.min(L.pillMaxWidth, slot - 4);
  const { progress, stretch, pillLead } = animation;
  const pillStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (progress.value + pillLead.value) * slot + (slot - pillWidth) / 2 },
      { scaleX: 1 + stretch.value },
      { scaleY: 1 - stretch.value * 0.16 },
    ],
  }));
  return (
    <View style={[styles.shadow, { width, bottom }]}>
      <View style={styles.glass}>
        <TabBarBackdrop />
        <View pointerEvents="none" style={styles.rim} />
        <Animated.View pointerEvents="none" style={[styles.pill, { width: pillWidth }, pillStyle]} />
        {tabs.map((tab, index) => <TabIcon key={tab.key} tab={tab} index={index}
          active={activeIndex === index} animation={animation} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute', alignSelf: 'center', height: L.height, borderRadius: L.height / 2,
    shadowColor: '#182733', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.14, shadowRadius: 20,
    elevation: 8, backgroundColor: 'rgba(244,247,250,0.90)',
  },
  glass: {
    flex: 1, flexDirection: 'row', padding: L.padding, overflow: 'hidden', borderRadius: L.height / 2,
  },
  rim: { ...StyleSheet.absoluteFill, borderRadius: L.height / 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.85)' },
  pill: {
    position: 'absolute', left: L.padding, top: L.padding, height: L.pillHeight,
    borderRadius: L.pillHeight / 2, backgroundColor: 'rgba(123,143,160,0.23)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)',
  },
});
