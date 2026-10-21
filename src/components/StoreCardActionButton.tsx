import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Animated, Easing, Pressable, StyleSheet, type StyleProp, type ViewStyle,
} from 'react-native';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import GlassSurface, { glassAvailable } from './GlassSurface';

interface Props {
  icon?: ComponentProps<typeof Ionicons>['name'];
  iconElement?: ReactNode;
  /** Activa una transición conjunta de icono, fondo y borde según selected. */
  selectedIconElement?: ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  selected?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  surfaceStyle?: StyleProp<ViewStyle>;
}

/** Superficie compartida para las acciones superpuestas en las tarjetas de súper. */
export default function StoreCardActionButton({
  icon, iconElement, selectedIconElement, onPress, accessibilityLabel, accessibilityHint,
  selected, testID, style, surfaceStyle,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const selectionProgress = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const hasSelectionAppearance = selectedIconElement != null;

  useEffect(() => {
    if (!hasSelectionAppearance) return;
    if (reducedMotion) {
      selectionProgress.setValue(selected ? 1 : 0);
      return;
    }
    const animation = Animated.timing(selectionProgress, {
      toValue: selected ? 1 : 0,
      duration: 180,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    // Una pulsación rápida invierte la transición desde su valor actual.
    return () => animation.stop();
  }, [hasSelectionAppearance, reducedMotion, selected, selectionProgress]);

  const defaultIcon = iconElement ?? (icon
    ? <Ionicons name={icon} size={glassAvailable ? 17 : 20} color={colors.accent} />
    : null);

  return (
    <Pressable
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={selected == null ? undefined : { selected }}
      testID={testID}
    >
      <GlassSurface
        style={[styles.surface, !glassAvailable && styles.surfaceFallback, surfaceStyle,
          hasSelectionAppearance && styles.selectionSurface]}
        tintColor={hasSelectionAppearance ? 'transparent' : colors.accentLight}
        fallbackColor={hasSelectionAppearance ? colors.white : colors.accentLight}
        interactive
      >
        {hasSelectionAppearance ? (
          <>
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.selectionLayer, styles.selectionOff, {
                opacity: selectionProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              }]}
            >
              {defaultIcon}
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[styles.selectionLayer, styles.selectionOn, { opacity: selectionProgress }]}
            >
              {selectedIconElement}
            </Animated.View>
          </>
        ) : defaultIcon}
      </GlassSurface>
    </Pressable>
  );
}

const themedStyles = () => StyleSheet.create({
  button: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.84 },
  surface: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  surfaceFallback: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 0,
  },
  selectionSurface: { borderWidth: 0 },
  selectionLayer: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  selectionOff: { borderColor: colors.border },
  selectionOn: { borderColor: colors.accent, backgroundColor: colors.accentLight },
});
