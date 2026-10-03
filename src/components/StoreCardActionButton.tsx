import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Pressable, StyleSheet, type StyleProp, type ViewStyle,
} from 'react-native';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import GlassSurface, { glassAvailable } from './GlassSurface';

interface Props {
  icon: ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  accessibilityLabel: string;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Superficie compartida para las acciones superpuestas en las tarjetas de súper. */
export default function StoreCardActionButton({
  icon, onPress, accessibilityLabel, selected, style,
}: Props) {
  const styles = useThemedStyles(themedStyles);

  return (
    <Pressable
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selected == null ? undefined : { selected }}
    >
      <GlassSurface
        style={[styles.surface, !glassAvailable && styles.surfaceFallback]}
        tintColor={colors.accentLight}
        fallbackColor={colors.accentLight}
        interactive
      >
        <Ionicons name={icon} size={glassAvailable ? 17 : 20} color={colors.accent} />
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
});
