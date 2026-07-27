import { useState } from 'react';
import { ScrollView, View, Text, Image, Modal, Pressable, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { CATALOG_STORES } from '../constants/stores';

export type PriceSort = 'asc' | 'desc';
export interface FilterOption { value: string; label: string }
export interface FilterGroup {
  key: string;
  label: string;
  options: FilterOption[];
  loading?: boolean;
}

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
  /** Facetas de tipo de oferta (solo se pasan desde OffersScreen). */
  offerTypes?: { value: string; label: string }[];
  selectedOfferTypes?: string[];
  onOfferTypes?: (types: string[]) => void;
  /** Selector de supermercados (vacÃ­o = todos). */
  stores?: FilterOption[];
  selectedStores?: string[];
  onStores?: (stores: string[]) => void;
  /** Facetas agrupadas: primero se elige el sÃºper y despuÃ©s sus opciones. */
  categoryGroups?: FilterGroup[];
  offerTypeGroups?: FilterGroup[];
  onCategoryGroupOpen?: (store: string) => void;
}

/**
 * Hoja inferior de filtros para listados de producto (Novedades/Ofertas):
 * categorías, tipo de oferta opcional, rango de precio y orden por precio.
 * Cada selección aplica al instante; los chips son des-seleccionables.
 * "Todas"/vacío = sin filtro para esa faceta.
 */
export default function ProductFilterSheet({
  visible, onClose,
  categories, category, onCategory,
  priceRange, onPriceRange,
  sort, onSort,
  offerTypes = [], selectedOfferTypes = [], onOfferTypes,
  stores = [], selectedStores = [], onStores,
  categoryGroups = [], offerTypeGroups = [], onCategoryGroupOpen,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [categoryGroupOpen, setCategoryGroupOpen] = useState<string | null>(null);
  const [offerTypeGroupOpen, setOfferTypeGroupOpen] = useState<string | null>(null);
  const hasFilters = category.length > 0 || priceRange != null || sort != null
    || selectedOfferTypes.length > 0 || selectedStores.length > 0;
  const clearAll = () => {
    onCategory([]);
    onPriceRange(null);
    onSort(null);
    onOfferTypes?.([]);
    onStores?.([]);
  };

  // Multiselección: tocar un chip lo añade/quita del conjunto.
  const toggleCategory = (c: string) =>
    onCategory(category.includes(c) ? category.filter((x) => x !== c) : [...category, c]);
  const toggleOfferType = (value: string) =>
    onOfferTypes?.(
      selectedOfferTypes.includes(value)
        ? selectedOfferTypes.filter((x) => x !== value)
        : [...selectedOfferTypes, value],
    );
  const toggleStore = (value: string) =>
    onStores?.(
      selectedStores.includes(value)
        ? selectedStores.filter((x) => x !== value)
        : [...selectedStores, value],
    );

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

  const storeIcon = (key: string) => CATALOG_STORES.find((store) => store.key === key)?.icon ?? null;
  const storeChip = (value: string, label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={value}
      style={[styles.chip, styles.storeChip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {storeIcon(value) ? <Image source={storeIcon(value) as number} style={styles.chipStoreLogo} resizeMode="contain" /> : null}
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  const groupedSection = (
    title: string,
    groups: FilterGroup[],
    selected: string[],
    activeGroup: string | null,
    setActiveGroup: (key: string | null) => void,
    onToggle: (value: string) => void,
    onSelectionChange: (values: string[]) => void,
    onOpen?: (key: string) => void,
  ) => {
    if (groups.length === 0) return null;
    return (
      <>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.groupList}>
          {groups.map((group) => {
            const count = group.options.filter((option) => selected.includes(option.value)).length;
            const expanded = activeGroup === group.key;
            return (
              <View key={group.key} style={styles.groupBlock}>
                <TouchableOpacity
                  style={styles.groupRow}
                  onPress={() => {
                    setActiveGroup(expanded ? null : group.key);
                    if (!expanded) onOpen?.(group.key);
                  }}
                  activeOpacity={0.8}
                >
                  {storeIcon(group.key) ? <Image source={storeIcon(group.key) as number} style={styles.groupStoreLogo} resizeMode="contain" /> : null}
                  <Text style={styles.groupName}>{group.label}</Text>
                  {count > 0 && <Text style={styles.groupCount}>{count}</Text>}
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-forward'} size={18} color={colors.inkSoft} />
                </TouchableOpacity>
                {expanded && (
                  <View style={styles.groupExpanded}>
                    {group.loading ? (
                      <Text style={styles.groupLoading}>{t('common.loading')}</Text>
                    ) : (
                      <View style={styles.chipWrap}>
                        {chip(t('filters.all'), group.options.every((o) => !selected.includes(o.value)), () => {
                          const values = new Set(group.options.map((o) => o.value));
                          onSelectionChange(selected.filter((value) => !values.has(value)));
                        })}
                        {group.options.map((option) =>
                          chip(option.label, selected.includes(option.value), () => onToggle(option.value)),
                        )}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </>
    );
  };

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
          {stores.length > 1 && onStores && (
            <>
              <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>{t('filters.supermarket')}</Text>
              <View style={styles.chipWrap}>
                {chip(t('common.all'), selectedStores.length === 0, () => onStores([]))}
                {stores.map((option) =>
                  storeChip(option.value, option.label, selectedStores.includes(option.value), () => toggleStore(option.value)),
                )}
              </View>
            </>
          )}
          {/* Orden por precio (primero) */}
          <Text style={[styles.sectionTitle, stores.length > 1 ? undefined : styles.sectionTitleFirst]}>{t('filters.sort')}</Text>
          <View style={styles.chipWrap}>
            {chip(t('filters.priceAsc'), sort === 'asc', () => onSort(sort === 'asc' ? null : 'asc'))}
            {chip(t('filters.priceDesc'), sort === 'desc', () => onSort(sort === 'desc' ? null : 'desc'))}
          </View>

          {/* Tipo de oferta (solo en OffersScreen y si el súper distingue varios). */}
          {offerTypeGroups.length > 0 && onOfferTypes && groupedSection(
            t('filters.offerType'),
            offerTypeGroups,
            selectedOfferTypes,
            offerTypeGroupOpen,
            setOfferTypeGroupOpen,
            toggleOfferType,
            onOfferTypes,
          )}
          {offerTypeGroups.length === 0 && offerTypes.length > 1 && onOfferTypes && (
            <>
              <Text style={styles.sectionTitle}>{t('filters.offerType')}</Text>
              <View style={styles.chipWrap}>
                {chip(t('filters.all'), selectedOfferTypes.length === 0, () => onOfferTypes([]))}
                {offerTypes.map((option) =>
                  chip(
                    option.label,
                    selectedOfferTypes.includes(option.value),
                    () => toggleOfferType(option.value),
                  ),
                )}
              </View>
            </>
          )}

          {/* Categoría (solo si la lista distingue más de una) */}
          {categoryGroups.length > 0 && groupedSection(
            t('filters.category'),
            categoryGroups,
            category,
            categoryGroupOpen,
            setCategoryGroupOpen,
            toggleCategory,
            onCategory,
            onCategoryGroupOpen,
          )}
          {categoryGroups.length === 0 && categories.length > 1 && (
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
  groupList: { gap: 8 },
  groupBlock: {
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  groupRow: {
    minHeight: 48,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14,
  },
  groupExpanded: { paddingHorizontal: 14, paddingBottom: 14 },
  groupStoreLogo: { width: 30, height: 30, flexShrink: 0 },
  groupName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  groupCount: {
    minWidth: 24, height: 24, borderRadius: 12,
    textAlign: 'center', textAlignVertical: 'center',
    fontSize: 12, fontFamily: fonts.bold, color: colors.white,
    backgroundColor: colors.accent,
  },
  groupBack: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginBottom: 10,
  },
  groupBackText: { fontSize: 15, fontFamily: fonts.bold, color: colors.accent },
  groupLoading: {
    paddingVertical: 12,
    fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft,
  },
  storeChip: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  chipStoreLogo: { width: 22, height: 22 },

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
