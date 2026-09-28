import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';

/** Keep the hit target fixed while the key surface compresses under the finger. */
export default function WordKeyboardKey({ children, disabled, reducedMotion, label, style, onPress, onPressIn }: {
  children: ReactNode;
  disabled: boolean;
  reducedMotion: boolean;
  label: string;
  style: StyleProp<ViewStyle>;
  onPress: () => void;
  onPressIn: () => void;
}) {
  const themedStyles = useThemedStyles(makeThemedStyles);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(0);
    return () => progress.stopAnimation();
  }, [disabled, reducedMotion, progress]);

  const press = (down: boolean) => {
    if (disabled) return;
    if (reducedMotion) {
      if (down) {
        progress.stopAnimation();
        progress.setValue(1);
      } else {
        Animated.timing(progress, { toValue: 0, duration: 130, useNativeDriver: true, isInteraction: false }).start();
      }
      return;
    }
    // A new press retargets from the current value, even during release.
    Animated.spring(progress, {
      toValue: down ? 1 : 0,
      stiffness: down ? 1000 : 550,
      damping: down ? 55 : 35,
      mass: 0.6,
      overshootClamping: true,
      useNativeDriver: true,
      isInteraction: false,
    }).start();
  };

  return <Pressable disabled={disabled} onPress={onPress}
    onPressIn={() => { press(true); onPressIn(); }} onPressOut={() => press(false)}
    style={styles.target} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }}>
    <Animated.View pointerEvents="none" style={[style, styles.surface, {
      transform: [{ scale: reducedMotion ? 1 : progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }],
    }]}>
      <Animated.View style={[StyleSheet.absoluteFill, themedStyles.accentFlash, {
        opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.65] }),
      }]} />
      {children}
    </Animated.View>
  </Pressable>;
}

const styles = StyleSheet.create({
  target: { flex: 1, minHeight: 56, maxWidth: 52 },
  surface: { flex: 1 },
});

const makeThemedStyles = () => StyleSheet.create({
  accentFlash: { backgroundColor: colors.accent, borderRadius: 8 },
});
