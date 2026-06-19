import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export type ViewMode = 'list' | 'grid';

/** Conmutador lista/cuadrícula para el listado de productos. Mismo estilo de
 *  segmentado (fondo gris, activo en blanco) que las pestañas del catálogo. */
export default function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, value === 'list' && styles.btnActive]}
        onPress={() => onChange('list')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('product.viewList')}
      >
        <Ionicons name="list" size={18} color={value === 'list' ? colors.accent : colors.inkSoft} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, value === 'grid' && styles.btnActive]}
        onPress={() => onChange('grid')}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('product.viewGrid')}
      >
        <Ionicons name="grid" size={16} color={value === 'grid' ? colors.accent : colors.inkSoft} />
      </TouchableOpacity>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, padding: 3, gap: 3 },
  btn: { width: 34, height: 32, alignItems: 'center', justifyContent: 'center' },
  btnActive: { backgroundColor: colors.white },
});
