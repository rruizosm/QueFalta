import { useMemo } from 'react';
import { ScrollView, StyleSheet, View, type ScrollViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { ContentBlur, gaussianFilterAvailable } from './ContentBlur';
import type { PageContext, PagerTab, TabAnimation } from './types';

/** Use this for vertical pages so the horizontal pan wins only after its X threshold. */
export function PagerScrollView({ pagerGesture, ...props }: ScrollViewProps & Pick<PageContext, 'pagerGesture'>) {
  const nativeScroll = useMemo(() => Gesture.Native().requireExternalGestureToFail(pagerGesture), [pagerGesture]);
  return (
    <GestureDetector gesture={nativeScroll}>
      <ScrollView directionalLockEnabled nestedScrollEnabled {...props} />
    </GestureDetector>
  );
}

export function Pager({ tabs, width, animation, activeIndex, pageContext, handleGesture = true }: {
  tabs: readonly PagerTab[];
  width: number;
  animation: TabAnimation;
  activeIndex: number;
  pageContext: PageContext;
  handleGesture?: boolean;
}) {
  const { scrollX, blurSigma, pan } = animation;
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ translateX: -scrollX.value }] }));
  const contentStyle = useAnimatedStyle(() => gaussianFilterAvailable
    ? { filter: blurSigma.value > 0.01 ? [{ blur: blurSigma.value }] : [] }
    : {});

  const content = (
      <View style={styles.viewport} collapsable={false}>
        {/* Filter only a viewport-sized surface, never the full five-screen strip. */}
        <Animated.View style={[styles.viewport, contentStyle]}>
          <Animated.View style={[styles.track, { width: width * tabs.length }, trackStyle]}>
            {tabs.map((tab, index) => (
              <View key={tab.key} style={{ width, flex: 1 }}
                accessibilityElementsHidden={index !== activeIndex}
                importantForAccessibility={index === activeIndex ? 'auto' : 'no-hide-descendants'}>
                {tab.renderPage(pageContext)}
              </View>
            ))}
          </Animated.View>
        </Animated.View>
        <ContentBlur sigma={blurSigma} />
      </View>
  );
  return handleGesture ? <GestureDetector gesture={pan}>{content}</GestureDetector> : content;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, overflow: 'hidden' },
  track: { flex: 1, flexDirection: 'row' },
});
