import { TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export type ViewMode = 'list' | 'grid';

/** Muestra la vista actual y alterna lista/cuadrícula al pulsar. */
export default function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const next = value === 'list' ? 'grid' : 'list';

  return (
    <TouchableOpacity
      style={styles.button}
      onPress={() => onChange(next)}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={t(value === 'list' ? 'product.viewList' : 'product.viewGrid')}
      accessibilityHint={t(next === 'list' ? 'product.switchToList' : 'product.switchToGrid')}
    >
      <Ionicons name={value === 'list' ? 'list' : 'grid'} size={value === 'list' ? 22 : 20} color={colors.accent} />
    </TouchableOpacity>
  );
}

const themedStyles = () => StyleSheet.create({
  button: {
    width: 44, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
});
