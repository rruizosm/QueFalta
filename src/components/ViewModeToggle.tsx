import { Platform, View, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { glassAvailable } from './GlassSurface';
import SlidingSegments from './SlidingSegments';

export type ViewMode = 'list' | 'grid';

/** Conmutador lista/cuadrícula para el listado de productos. Replica la
 *  pastilla redondeada y el estado activo de acento del Catálogo. */
export default function ViewModeToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();

  if (glassAvailable || Platform.OS === 'android') {
    return (
      <SlidingSegments<ViewMode>
        compact
        dense
        emphasized={Platform.OS === 'android'}
        transparentTrack={Platform.OS === 'android'}
        segments={[
          { key: 'list', icon: 'list', accessibilityLabel: t('product.viewList') },
          { key: 'grid', icon: 'grid', accessibilityLabel: t('product.viewGrid') },
        ]}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.btn, value === 'list' && styles.btnActive]}
        onPress={() => onChange('list')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('product.viewList')}
        accessibilityState={{ selected: value === 'list' }}
      >
        <Ionicons name="list" size={19} color={value === 'list' ? colors.white : colors.inkSoft} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.btn, value === 'grid' && styles.btnActive]}
        onPress={() => onChange('grid')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('product.viewGrid')}
        accessibilityState={{ selected: value === 'grid' }}
      >
        <Ionicons name="grid" size={17} color={value === 'grid' ? colors.white : colors.inkSoft} />
      </TouchableOpacity>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  wrap: {
    flexDirection: 'row', backgroundColor: colors.surfaceAlt,
    padding: 3, gap: 3, borderRadius: 12,
  },
  btn: {
    width: 32, height: 38, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  btnActive: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
});
