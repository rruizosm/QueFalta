import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';

export default function CatalogFilterButton({ active, onPress, accessibilityLabel }: {
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const styles = useThemedStyles(themedStyles);

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
    >
      <Ionicons name="options-outline" size={22} color={colors.accent} />
      {active && <View pointerEvents="none" style={styles.indicator} />}
    </TouchableOpacity>
  );
}

const themedStyles = () => StyleSheet.create({
  button: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  indicator: {
    position: 'absolute', top: 6, right: 6,
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: colors.accent,
  },
});
