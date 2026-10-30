import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';

/** Keep the floating panel mounted so closing and reversing do not cut its animation. */
export default function PantryPendingPopover({ open, testID, style, children }: {
  open: boolean;
  testID: string;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const [rendered, setRendered] = useState(open);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) setRendered(true);
    if (reducedMotion) {
      progress.stopAnimation();
      progress.setValue(open ? 1 : 0);
      if (!open) setRendered(false);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: open ? 1 : 0,
      duration: open ? 280 : 200,
      easing: open ? Easing.bezier(0.16, 1, 0.3, 1) : Easing.bezier(0.4, 0, 1, 1),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished && !open) setRendered(false);
    });
    return () => animation.stop();
  }, [open, progress, reducedMotion]);

  if (!open && !rendered) return null;
  return <Animated.View testID={testID} pointerEvents={open ? 'auto' : 'none'}
    accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    style={[style, {
      opacity: progress,
      transformOrigin: 'left bottom',
      transform: [
        { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
        { scaleX: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        { scaleY: progress.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] }) },
      ],
    }]}>
    {children}
  </Animated.View>;
}
