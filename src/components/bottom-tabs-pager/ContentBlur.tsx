import type { ComponentType } from 'react';
import { Platform, StyleSheet, type ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';
import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';

type NativeBlurProps = ViewProps & { sigma?: number };
// Old binaries and Expo Go keep working. The demo explicitly reports this fallback.
const hasIOSBlur = Platform.OS === 'ios' && requireOptionalNativeModule('PagerBlur') !== null;
const NativeBlur = hasIOSBlur
  ? Animated.createAnimatedComponent(requireNativeView('PagerBlur') as ComponentType<NativeBlurProps>)
  : null;

export const contentBlurAvailable = Platform.OS === 'ios'
  ? hasIOSBlur : Platform.OS === 'web' || (Platform.OS === 'android' && Number(Platform.Version) >= 31);
export const gaussianFilterAvailable = Platform.OS === 'web'
  || (Platform.OS === 'android' && Number(Platform.Version) >= 31);

/** The backdrop is restricted to the pager viewport. The tab bar is a later sibling. */
export function ContentBlur({ sigma }: { sigma: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => ({ sigma: sigma.value }));
  return NativeBlur ? <NativeBlur pointerEvents="none" style={StyleSheet.absoluteFill} animatedProps={animatedProps} /> : null;
}

/** Optional native glass background for the bar; no extra blur library required. */
export function TabBarBackdrop() {
  return NativeBlur ? <NativeBlur pointerEvents="none" sigma={8} style={StyleSheet.absoluteFill} /> : null;
}
