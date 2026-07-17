import { ScrollView, View, Text, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

export type PriceSort = 'asc' | 'desc';

/** Rangos de precio ofrecidos (min exclusivo, max inclusivo; max null = sin tope).
 *  El filtrado con ellos lo hace la pantalla; aquí solo se pintan/seleccionan. */
export const PRICE_RANGES: { min: number; max: number | null }[] = [
  { min: 0, max: 1 },
  { min: 1, max: 3 },
  { min: 3, max: 5 },
  { min: 5, max: 10 },
  { min: 10, max: null },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Categorías disponibles en la lista actual (únicas, ya ordenadas). */
  categories: string[];
  /** Categorías seleccionadas (multi); [] = todas. */
  category: string[];
  onCategory: (c: string[]) => void;
  /** Índice en PRICE_RANGES, o null = cualquier precio. */
  priceRange: number | null;
  onPriceRange: (i: number | null) => void;
  sort: PriceSort | null;
  onSort: (s: PriceSort | null) => void;
}

/**
 * Hoja inferior de filtros para listados de producto (Novedades…): categorías
 * (multiselección de las presentes en la lista), rango de precio y orden por
 * precio. Cada selección aplica al instante (la lista de fondo se actualiza en
 * vivo); los chips son des-seleccionables tocándolos de nuevo. "Todas"/vacío =
 * sin filtro de categoría.
 */
export default function ProductFilterSheet({
  visible, onClose,
  categories, category, onCategory,
  priceRange, onPriceRange,
  sort, onSort,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const hasFilters = category.length > 0 || priceRange != null || sort != null;
  const clearAll = () => { onCategory([]); onPriceRange(null); onSort(null); };

  // Multiselección: tocar un chip lo añade/quita del conjunto.
  const toggleCategory = (c: string) =>
    onCategory(category.includes(c) ? category.filter((x) => x !== c) : [...category, c]);

  const rangeLabel = (r: { min: number; max: number | null }) =>
    r.max == null
      ? t('filters.over', { n: r.min })
      : r.min === 0
        ? t('filters.upTo', { n: r.max })
        : t('filters.between', { a: r.min, b: r.max });

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('filters.title')}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Orden por precio (primero) */}
          <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>{t('filters.sort')}</Text>
          <View style={styles.chipWrap}>
            {chip(t('filters.priceAsc'), sort === 'asc', () => onSort(sort === 'asc' ? null : 'asc'))}
            {chip(t('filters.priceDesc'), sort === 'desc', () => onSort(sort === 'desc' ? null : 'desc'))}
          </View>

          {/* Categoría (solo si la lista distingue más de una) */}
          {categories.length > 1 && (
            <>
              <Text style={styles.sectionTitle}>{t('filters.category')}</Text>
              <View style={styles.chipWrap}>
                {chip(t('filters.all'), category.length === 0, () => onCategory([]))}
                {categories.map((c) =>
                  chip(c, category.includes(c), () => toggleCategory(c)),
                )}
              </View>
            </>
          )}

          {/* Precio */}
          <Text style={styles.sectionTitle}>{t('filters.price')}</Text>
          <View style={styles.chipWrap}>
            {PRICE_RANGES.map((r, i) =>
              chip(rangeLabel(r), priceRange === i, () => onPriceRange(priceRange === i ? null : i)),
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          {hasFilters ? (
            <TouchableOpacity onPress={clearAll} hitSlop={8}>
              <Text style={styles.clearText}>{t('filters.clear')}</Text>
            </TouchableOpacity>
          ) : <View />}
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.doneText}>{t('filters.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 6,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  sheetTitle: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  closeBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  scroll: { paddingHorizontal: 16 },
  sectionTitle: {
    fontSize: 13, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginTop: 14, marginBottom: 10,
  },
  sectionTitleFirst: { marginTop: 4 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 18, maxWidth: '100%',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.ink },
  chipTextOn: { color: colors.white },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 14, marginTop: 6,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  clearText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.inkSoft },
  doneBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24, paddingVertical: 12,
    borderRadius: 16,
  },
  doneText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
});
