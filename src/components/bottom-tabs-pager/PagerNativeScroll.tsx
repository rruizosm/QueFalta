// Like the RN classes, these exports provide both a ref type and a component
// value so existing useRef<ScrollView>/FlatList<Item> consumers keep their types.
/* eslint-disable @typescript-eslint/no-redeclare */
import { createElement, forwardRef, isValidElement, useContext, useMemo, type ReactElement, type RefAttributes } from 'react';
import { FlatList, ScrollView, SectionList, StyleSheet, type FlatListProps, type ScrollViewProps, type SectionListProps } from 'react-native';
import Animated from 'react-native-reanimated';
import { useTabBarScroll } from '../../hooks/useTabBarScroll';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PagerGestureContext } from './PagerGestureContext';

function useScrollGesture(horizontal?: boolean | null) {
  const pager = useContext(PagerGestureContext);
  return useMemo(() => {
    if (!pager) return null;
    const native = Gesture.Native();
    // Existing horizontal carousels keep their own gesture; vertical feeds yield
    // only when the pager has positively recognized a horizontal drag.
    return horizontal ? native.blocksExternalGesture(pager) : native.requireExternalGestureToFail(pager);
  }, [pager, horizontal]);
}

type ScrollBehavior = { /** Only the main vertical content should drive the capsule. */ tabBarScroll?: boolean };
const NativeSectionList = forwardRef<SectionList<unknown>, SectionListProps<unknown>>(function NativeSectionList(props, ref) {
  return <SectionList {...props} ref={ref} />;
});
const AnimatedSectionList = Animated.createAnimatedComponent(NativeSectionList);
// Preserve custom CellRendererComponent support in the public RN wrapper contract.
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<unknown>);

function useScrollBehavior({ tabBarScroll, ...props }: ScrollViewProps & ScrollBehavior) {
  const enabled = !!tabBarScroll && !props.horizontal;
  const scroll = useTabBarScroll(enabled, props);
  const contentStyle = StyleSheet.flatten(props.contentContainerStyle);
  const paddingBottom = contentStyle?.paddingBottom ?? contentStyle?.paddingVertical ?? contentStyle?.padding ?? 0;
  const budget = typeof paddingBottom === 'number' && paddingBottom >= scroll.spacerBudget ? scroll.spacerBudget : 0;
  return {
    contentContainerStyle: budget > 0 ? [props.contentContainerStyle, { paddingBottom: (paddingBottom as number) - budget }] : props.contentContainerStyle,
    // The spacer replaces exactly the same amount of existing bottom padding.
    spacer: budget > 0 ? <Animated.View pointerEvents="none" accessible={false} style={scroll.spacerStyle} /> : null,
    onScroll: scroll.onScroll,
  };
}
function footerElement(footer: FlatListProps<unknown>['ListFooterComponent']) {
  return isValidElement(footer) ? footer : footer ? createElement(footer) : null;
}

export type PagerNativeScrollView = ScrollView;
export const PagerNativeScrollView = forwardRef<ScrollView, ScrollViewProps & ScrollBehavior>(function PagerNativeScrollView({ tabBarScroll, ...props }, ref) {
  const gesture = useScrollGesture(props.horizontal);
  const { spacer, ...behavior } = useScrollBehavior({ ...props, tabBarScroll });
  const view = <Animated.ScrollView {...props} ref={ref} {...behavior} scrollEventThrottle={16}
    scrollToOverflowEnabled={false} overScrollMode={props.overScrollMode ?? 'never'}>
    {props.children}{spacer}
  </Animated.ScrollView>;
  return gesture ? <GestureDetector gesture={gesture}>{view}</GestureDetector> : view;
});

export type PagerNativeFlatList<ItemT> = FlatList<ItemT>;
export const PagerNativeFlatList = forwardRef<FlatList, FlatListProps<unknown> & ScrollBehavior>(function PagerNativeFlatList({ tabBarScroll, ...props }, ref) {
  const gesture = useScrollGesture(props.horizontal);
  const { spacer, ...behavior } = useScrollBehavior({ ...props, tabBarScroll });
  const list = <AnimatedFlatList {...props} ref={ref} {...behavior} scrollEventThrottle={16}
    scrollToOverflowEnabled={false} overScrollMode={props.overScrollMode ?? 'never'}
    ListFooterComponent={spacer ? <>{footerElement(props.ListFooterComponent)}{spacer}</> : props.ListFooterComponent} />;
  return gesture ? <GestureDetector gesture={gesture}>{list}</GestureDetector> : list;
}) as <ItemT>(props: FlatListProps<ItemT> & ScrollBehavior & RefAttributes<FlatList<ItemT>>) => ReactElement;

export type PagerNativeSectionList<ItemT, SectionT = object> = SectionList<ItemT, SectionT>;
export const PagerNativeSectionList = forwardRef<SectionList<unknown>, SectionListProps<unknown> & ScrollBehavior>(function PagerNativeSectionList({ tabBarScroll, ...props }, ref) {
  const gesture = useScrollGesture(props.horizontal);
  const { spacer, ...behavior } = useScrollBehavior({ ...props, tabBarScroll });
  const list = <AnimatedSectionList {...props} ref={ref} {...behavior} scrollEventThrottle={16}
    scrollToOverflowEnabled={false} overScrollMode={props.overScrollMode ?? 'never'}
    ListFooterComponent={spacer ? <>{footerElement(props.ListFooterComponent)}{spacer}</> : props.ListFooterComponent} />;
  return gesture ? <GestureDetector gesture={gesture}>{list}</GestureDetector> : list;
}) as <ItemT, SectionT = object>(props: SectionListProps<ItemT, SectionT> & ScrollBehavior & RefAttributes<SectionList<ItemT, SectionT>>) => ReactElement;
