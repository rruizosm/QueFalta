import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import GlassSurface from './GlassSurface';

/** The card owns the accessible action and passes its press state to this control. */
export default function ProductSelectionIndicator({ pressed, selected, compact = false }: {
  pressed: boolean;
  selected: boolean;
  compact?: boolean;
}) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    const animation = Animated.timing(scale, {
      toValue: pressed ? 0.9 : 1,
      duration: pressed ? 90 : 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [pressed, reducedMotion, scale]);

  return <Animated.View pointerEvents="none" accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" testID="product-selection-indicator"
    style={[styles.frame, compact && styles.compact, { opacity: pressed ? 0.78 : 1, transform: [{ scale }] }]}>
    <GlassSurface interactive tintColor={colors.accentLight} fallbackColor={colors.accentLight}
      style={[styles.surface, compact && styles.compact]}>
      <Ionicons name={selected ? 'checkmark' : 'add'} size={compact ? 16 : 18} color={colors.accent} />
    </GlassSurface>
  </Animated.View>;
}

const themedStyles = () => StyleSheet.create({
  frame: {
    width: 34, height: 34, borderRadius: 17,
    shadowColor: colors.ink, shadowOpacity: 0.12, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  surface: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accentMid,
  },
  compact: { width: 26, height: 26, borderRadius: 13 },
});
