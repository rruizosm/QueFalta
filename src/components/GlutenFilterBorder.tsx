import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors } from '../constants/colors';
import { useReducedMotion } from '../hooks/useReducedMotion';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const BORDER_WIDTH = 1.25;
const RADIUS = 16;

/** El borde seleccionado sustituye progresivamente al borde neutro, desde arriba. */
export default function GlutenFilterBorder({ selected, onComplete }: {
  selected: boolean;
  onComplete?: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(selected ? 1 : 0);
  const previousSelected = useRef(selected);
  const completion = useRef(onComplete);
  useEffect(() => { completion.current = onComplete; }, [onComplete]);
  const finish = useCallback(() => completion.current?.(), []);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const changed = previousSelected.current !== selected;
    previousSelected.current = selected;
    progress.set(withTiming(selected ? 1 : 0, {
      duration: reducedMotion ? 0 : 650,
      easing: Easing.linear,
    }, finished => {
      if (finished && changed) runOnJS(finish)();
    }));
    return () => cancelAnimation(progress);
  }, [selected, reducedMotion, progress, finish]);

  const inset = BORDER_WIDTH / 2;
  const width = Math.max(0, size.width - BORDER_WIDTH);
  const height = Math.max(0, size.height - BORDER_WIDTH);
  const radius = Math.min(RADIUS - inset, width / 2, height / 2);
  const length = 2 * (width + height - 4 * radius) + 2 * Math.PI * radius;
  const right = inset + width;
  const bottom = inset + height;
  const middle = inset + width / 2;
  const path = `M ${middle} ${inset} H ${right - radius} A ${radius} ${radius} 0 0 1 ${right} ${inset + radius} V ${bottom - radius} A ${radius} ${radius} 0 0 1 ${right - radius} ${bottom} H ${inset + radius} A ${radius} ${radius} 0 0 1 ${inset} ${bottom - radius} V ${inset + radius} A ${radius} ${radius} 0 0 1 ${inset + radius} ${inset} H ${middle}`;
  const animatedProps = useAnimatedProps(() => ({
    // Al desactivar, el borde también se retira en sentido horario.
    strokeDashoffset: (selected ? 1 : -1) * length * (1 - progress.value),
    strokeOpacity: progress.value === 0 ? 0 : 1,
  }));

  return <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFill}
    onLayout={({ nativeEvent: { layout } }) => setSize(previous =>
      previous.width === layout.width && previous.height === layout.height
        ? previous : { width: layout.width, height: layout.height })}>
    {width > 0 && height > 0 && <Svg width={size.width} height={size.height}>
      <Path d={path} fill="none" stroke={colors.border} strokeWidth={BORDER_WIDTH} />
      <AnimatedPath d={path} fill="none" stroke={colors.accentMid} strokeWidth={BORDER_WIDTH}
        strokeDasharray={[length, length]} animatedProps={animatedProps} />
    </Svg>}
  </View>;
}
