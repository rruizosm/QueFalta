import { useEffect, useRef, useState, type RefObject } from 'react';
import { Keyboard, View, useWindowDimensions } from 'react-native';
import {
  cancelAnimation, Easing, interpolate, interpolateColor, runOnJS,
  useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { colors } from '../constants/colors';
import { useReducedMotion } from './useReducedMotion';

type Bounds = { x: number; y: number; width: number; height: number };

/** Keeps the creator mounted until it has returned to the actual trigger. */
export function useRecipeCreatorTransition(
  sourceRef: RefObject<View | null>,
  onClose: () => void,
) {
  const window = useWindowDimensions();
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [closing, setClosing] = useState(false);
  const rootRef = useRef<View>(null);
  const closingRef = useRef(false);
  const mounted = useRef(true);
  const progress = useSharedValue(0);
  const source = useSharedValue<Bounds | null>(null);
  const reducedMotion = useReducedMotion();
  const accent = colors.accent;
  const paper = colors.paper;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimation(progress);
    };
  }, [progress]);

  const measureSource = (done: () => void) => {
    const button = sourceRef.current;
    const root = rootRef.current;
    if (!button || !root) { done(); return; }
    root.measureInWindow((rootX, rootY) => {
      if (!mounted.current) return;
      button.measureInWindow((x, y, width, height) => {
        if (!mounted.current) return;
        source.set(width > 0 && height > 0
          ? { x: x - rootX, y: y - rootY, width, height }
          : null);
        done();
      });
    });
  };

  const open = () => {
    closingRef.current = false;
    setClosing(false);
    progress.set(0);
    measureSource(() => {
      if (closingRef.current) return;
      progress.set(withTiming(1, {
        duration: reducedMotion ? 0 : 420,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
      }));
    });
  };

  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    Keyboard.dismiss();
    // Remeasure on return so rotation / resized windows use the current button.
    measureSource(() => {
      progress.set(withTiming(0, {
        duration: reducedMotion ? 0 : 340,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
      }, (finished) => {
        if (finished) runOnJS(onClose)();
      }));
    });
  };

  const surfaceStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const bounds = source.value;
    if (reducedMotion || !bounds) {
      return { left: 0, top: 0, width: size.width, height: size.height,
        borderRadius: 0, backgroundColor: paper, opacity: p };
    }
    return {
      left: bounds.x * (1 - p), top: bounds.y * (1 - p),
      width: bounds.width + (size.width - bounds.width) * p,
      height: bounds.height + (size.height - bounds.height) * p,
      borderRadius: Math.min(22, bounds.height / 2) * (1 - p),
      backgroundColor: interpolateColor(p, [0, 0.45, 1], [accent, paper, paper]),
      opacity: 1,
    };
  });
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2, 0.65, 1], [0, 0, 1, 1], 'clamp'),
  }));
  const buttonStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion ? 0 : interpolate(progress.value, [0, 0.18, 1], [1, 0, 0], 'clamp'),
  }));

  return { rootRef, size, setSize, closing, open, close, surfaceStyle, contentStyle, buttonStyle };
}
