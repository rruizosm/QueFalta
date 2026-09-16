import { useCallback, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { TAB_LAYOUT as L } from './constants';
import { clamp } from './physics';
import { useTabAnimation } from './useTabAnimation';
import { Pager } from './Pager';
import { CustomTabBar } from './CustomTabBar';
import type { PagerTab } from './types';

export type BottomTabsPagerHandle = { goTo: (index: number) => void };
export type BottomTabsPagerProps = {
  /** Stable order/keys for this mount. Remount with a new key if the tab set changes. */
  tabs: readonly PagerTab[];
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  ref?: Ref<BottomTabsPagerHandle>;
};

export function BottomTabsPager({ tabs, initialIndex = 0, onIndexChange, ref }: BottomTabsPagerProps) {
  if (tabs.length === 0) throw new Error('BottomTabsPager requires at least one tab.');
  const initial = clamp(Number.isFinite(initialIndex) ? Math.round(initialIndex) : 0, 0, tabs.length - 1);
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(initial);
  const currentIndex = useRef(initial);
  const callback = useRef(onIndexChange);
  callback.current = onIndexChange;
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const onSettled = useCallback((index: number) => {
    if (currentIndex.current === index) return;
    currentIndex.current = index;
    setActiveIndex(index);
    callback.current?.(index);
  }, []);
  const animation = useTabAnimation({ width, count: tabs.length, initialIndex: initial, reducedMotion, onSettled });
  useImperativeHandle(ref, () => ({ goTo: animation.goTo }), [animation.goTo]);
  const bottom = Math.max(insets.bottom, 8) + L.bottomGap;
  const barWidth = Math.min(L.maxWidth, Math.max(0, width - 2 * (L.margin + Math.max(insets.left, insets.right))));

  return (
    <View style={styles.root} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width > 0 && <>
        <Pager tabs={tabs} width={width} animation={animation} activeIndex={activeIndex}
          pageContext={{ topInset: insets.top, bottomInset: bottom + L.height + 20,
            horizontalInset: Math.max(insets.left, insets.right), pagerGesture: animation.pan }} />
        <CustomTabBar tabs={tabs} width={barWidth} bottom={bottom} animation={animation} activeIndex={activeIndex} />
      </>}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: '#f6f5f2' } });
