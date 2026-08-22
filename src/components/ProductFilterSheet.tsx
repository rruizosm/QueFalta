import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  PanResponder, ScrollView, View, Text, Image, Modal, Pressable,
  TouchableOpacity, StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import { CATALOG_STORES } from '../constants/stores';
import { getSubcategoryEmoji } from '../constants/subcategoryEmojis';
import { limitsApply } from '../constants/limits';
import HardShadow from './HardShadow';
import PaywallModal from './PaywallModal';
import { useReducedMotion } from '../hooks/useReducedMotion';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

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

/** Rangos por magnitud del cambio porcentual (min exclusivo, max inclusivo). */
export const PRICE_CHANGE_RANGES: { min: number; max: number | null }[] = [
  { min: 0, max: 5 },
  { min: 5, max: 10 },
  { min: 10, max: 20 },
  { min: 20, max: null },
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
  /** Oculta precio y orden cuando la pantalla solo necesita otras facetas. */
  showPriceControls?: boolean;
  /** Índice en PRICE_CHANGE_RANGES, o null = cualquier magnitud. */
  priceChangeRange?: number | null;
  onPriceChangeRange?: (i: number | null) => void;
  /** Orden por precio unitario canónico (€/kg, €/l o €/ud). */
  pricePerUnitSort?: PriceSort | null;
  onPricePerUnitSort?: (s: PriceSort | null) => void;
  /** Variante visual de Novedades, alineada con el modal de QuéFalta Plus. */
  appearance?: 'standard' | 'plus';
  showCategoryIcons?: boolean;
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
 * categorías, tipo de oferta opcional, rango de precio y órdenes por precio.
 * Novedades puede activar la variante visual Plus y el orden por precio unitario.
 * Cada selección aplica al instante; los chips son des-seleccionables.
 * "Todas"/vacío = sin filtro para esa faceta.
 */
export default function ProductFilterSheet({
  visible, onClose,
  categories, category, onCategory,
  priceRange, onPriceRange,
  sort, onSort,
  showPriceControls = true,
  priceChangeRange = null, onPriceChangeRange,
  pricePerUnitSort = null, onPricePerUnitSort,
  appearance = 'standard', showCategoryIcons = false,
  offerTypes = [], selectedOfferTypes = [], onOfferTypes,
  stores = [], selectedStores = [], onStores,
  categoryGroups = [], offerTypeGroups = [], onCategoryGroupOpen,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { isPremium, loading: profileLoading } = useProfile();
  const reducedMotion = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [categoryGroupOpen, setCategoryGroupOpen] = useState<string | null>(null);
  const [offerTypeGroupOpen, setOfferTypeGroupOpen] = useState<string | null>(null);
  const [sortPaywallVisible, setSortPaywallVisible] = useState(false);
  const plusAppearance = appearance === 'plus';
  const unitPriceSortLocked = !profileLoading && limitsApply(isPremium);
  const closingRef = useRef(false);
  const closeRef = useRef<() => void>(() => {});

  // El cierre cambia el estado inmediatamente y deja toda la transición al
  // Modal nativo. Así nunca hay dos animaciones ni un callback tardío capaz de
  // volver a mostrar la hoja.
  closeRef.current = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onCloseRef.current();
  };

  useEffect(() => {
    if (visible) closingRef.current = false;
  }, [visible]);

  // El orden unitario es una función Plus. Las pantallas que pasan este control
  // comparten el gate; si la suscripción caduca mientras estaba activo, se
  // elimina antes de que pueda seguir afectando a los resultados.
  useEffect(() => {
    if (unitPriceSortLocked && pricePerUnitSort != null) {
      onPricePerUnitSort?.(null);
    }
  }, [onPricePerUnitSort, pricePerUnitSort, unitPriceSortLocked]);

  const dragResponder = useRef(PanResponder.create({
    // El tirador adquiere el gesto desde el primer toque. Confiar solo en
    // onMoveShouldSetPanResponder hacía que algunos árboles nativos no llegaran
    // a entregarle el desplazamiento.
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    // En cuanto se reconoce un desplazamiento vertical hacia abajo desde el
    // tirador, el cierre queda comprometido y continúa solo hasta el final.
    // No sigue al dedo, no espera a que se suelte y nunca rebota hacia arriba.
    onPanResponderMove: (_, gesture) => {
      if (gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx)) {
        closeRef.current();
      }
    },
    onPanResponderTerminationRequest: () => false,
  })).current;
  const hasFilters = category.length > 0 || priceRange != null || sort != null || priceChangeRange != null
    || pricePerUnitSort != null || selectedOfferTypes.length > 0 || selectedStores.length > 0;
  const clearAll = () => {
    onCategory([]);
    onPriceRange(null);
    onSort(null);
    onPriceChangeRange?.(null);
    onPricePerUnitSort?.(null);
    onOfferTypes?.([]);
    onStores?.([]);
  };

  const selectPricePerUnitSort = (value: PriceSort) => {
    if (profileLoading || !onPricePerUnitSort) return;
    if (unitPriceSortLocked) {
      setSortPaywallVisible(true);
      return;
    }
    onPricePerUnitSort(pricePerUnitSort === value ? null : value);
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

  const changeRangeLabel = (r: { min: number; max: number | null }) =>
    r.max == null
      ? t('filters.changeOver', { n: r.min })
      : r.min === 0
        ? t('filters.changeUpTo', { n: r.max })
        : t('filters.changeBetween', { a: r.min, b: r.max });

  const chip = (label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  const lockedUnitPriceChip = (label: string, value: PriceSort) => (
    <View
      key={value}
      style={styles.lockedUnitPriceButtonBackground}
    >
      <TouchableOpacity
        style={[styles.chip, styles.lockedUnitPriceChip]}
        onPress={() => selectPricePerUnitSort(value)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label}, Plus`}
        accessibilityHint={t('paywall.benefits.unitPriceText')}
      >
        <Ionicons name="lock-closed" size={12} color={colors.accent} />
        <Text style={[styles.chipText, styles.lockedUnitPriceChipText]} numberOfLines={1}>
          {label}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const categoryChip = (value: string, label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={value}
      style={[styles.chip, showCategoryIcons && styles.categoryChip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
    >
      {showCategoryIcons ? (
        <View style={[styles.categoryIcon, on && styles.categoryIconOn]}>
          <Text style={styles.categoryEmoji}>{getSubcategoryEmoji(label, '🛒')}</Text>
        </View>
      ) : null}
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

  const categoryAllChip = (on: boolean, onPress: () => void) => (
    <TouchableOpacity
      key="category-all"
      style={[styles.chip, styles.categoryAllChip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{t('filters.all')}</Text>
    </TouchableOpacity>
  );

  const sectionHeading = (label: string, icon: IoniconName | 'unitPrice', first = false) => plusAppearance ? (
    <View style={[styles.visualSectionHeading, first && styles.visualSectionHeadingFirst]}>
      <View style={styles.visualSectionIcon}>
        {icon === 'unitPrice' ? (
          <Text style={styles.unitPriceIcon}>€/kg</Text>
        ) : (
          <Ionicons name={icon} size={17} color={colors.accent} />
        )}
      </View>
      <Text style={styles.visualSectionTitle}>{label}</Text>
    </View>
  ) : (
    <Text style={[styles.sectionTitle, first && styles.sectionTitleFirst]}>{label}</Text>
  );

  const storeIcon = (key: string) => CATALOG_STORES.find((store) => store.key === key)?.icon ?? null;
  const storeChip = (value: string, label: string, on: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={value}
      style={[styles.chip, styles.storeChip, on && styles.chipOn]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
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
    categoryIcons = false,
  ) => {
    if (groups.length === 0) return null;
    return (
      <>
        {sectionHeading(title, categoryIcons ? 'grid-outline' : 'pricetag-outline')}
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
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
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
                        {categoryIcons
                          ? categoryAllChip(group.options.every((o) => !selected.includes(o.value)), () => {
                            const values = new Set(group.options.map((o) => o.value));
                            onSelectionChange(selected.filter((value) => !values.has(value)));
                          })
                          : chip(t('filters.all'), group.options.every((o) => !selected.includes(o.value)), () => {
                          const values = new Set(group.options.map((o) => o.value));
                          onSelectionChange(selected.filter((value) => !values.has(value)));
                          })}
                        {group.options.map((option) => categoryIcons
                          ? categoryChip(option.value, option.label, selected.includes(option.value), () => onToggle(option.value))
                          : chip(option.label, selected.includes(option.value), () => onToggle(option.value)))}
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
    <>
      <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      statusBarTranslucent
      onRequestClose={() => closeRef.current()}
    >
      <Pressable
        style={[styles.backdrop, plusAppearance && styles.backdropPlus]}
        onPress={() => closeRef.current()}
        accessible={false}
      />
      <View
        style={[styles.sheet, plusAppearance && styles.sheetPlus, { paddingBottom: insets.bottom + 12 }]}
        accessibilityViewIsModal
      >
        {plusAppearance ? (
          <View style={styles.dragHandleArea} {...dragResponder.panHandlers}>
            <View style={styles.grabber} />
          </View>
        ) : (
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('filters.title')}</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => closeRef.current()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
        )}

        <ScrollView style={[styles.scroll, plusAppearance && styles.scrollPlus]} showsVerticalScrollIndicator={false}>
          {stores.length > 1 && onStores && (
            <>
              {sectionHeading(t('filters.supermarket'), 'storefront-outline', true)}
              <View style={styles.chipWrap}>
                {chip(t('common.all'), selectedStores.length === 0, () => onStores([]))}
                {stores.map((option) =>
                  storeChip(option.value, option.label, selectedStores.includes(option.value), () => toggleStore(option.value)),
                )}
              </View>
            </>
          )}
          {/* Orden por precio (primero en los listados que lo admiten). */}
          {showPriceControls ? (
            <>
              {sectionHeading(t('filters.sort'), 'swap-vertical-outline', stores.length <= 1)}
              <View style={styles.chipWrap}>
                {chip(t('filters.priceAsc'), sort === 'asc', () => onSort(sort === 'asc' ? null : 'asc'))}
                {chip(t('filters.priceDesc'), sort === 'desc', () => onSort(sort === 'desc' ? null : 'desc'))}
              </View>
            </>
          ) : null}

          {onPricePerUnitSort ? (
            <>
              {sectionHeading(t('filters.unitPriceSort'), 'unitPrice', !showPriceControls && stores.length <= 1)}
              {unitPriceSortLocked ? (
                <View style={styles.chipWrap}>
                  {lockedUnitPriceChip(t('filters.priceAsc'), 'asc')}
                  {lockedUnitPriceChip(t('filters.priceDesc'), 'desc')}
                </View>
              ) : (
                <View style={styles.chipWrap}>
                  {chip(t('filters.priceAsc'), pricePerUnitSort === 'asc', () => selectPricePerUnitSort('asc'))}
                  {chip(t('filters.priceDesc'), pricePerUnitSort === 'desc', () => selectPricePerUnitSort('desc'))}
                </View>
              )}
            </>
          ) : null}

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
              {sectionHeading(t('filters.offerType'), 'pricetag-outline')}
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
            true,
          )}
          {categoryGroups.length === 0 && categories.length > 1 && (
            <>
              {sectionHeading(t('filters.category'), 'grid-outline')}
              <View style={styles.chipWrap}>
                {categoryAllChip(category.length === 0, () => onCategory([]))}
                {categories.map((c) =>
                  categoryChip(c, c, category.includes(c), () => toggleCategory(c)),
                )}
              </View>
            </>
          )}

          {onPriceChangeRange ? (
            <>
              {sectionHeading(t('filters.priceChange'), 'trending-up-outline', !showPriceControls && categories.length <= 1 && categoryGroups.length === 0)}
              <View style={styles.chipWrap}>
                {PRICE_CHANGE_RANGES.map((r, i) =>
                  chip(
                    changeRangeLabel(r),
                    priceChangeRange === i,
                    () => onPriceChangeRange(priceChangeRange === i ? null : i),
                  ),
                )}
              </View>
            </>
          ) : null}

          {/* Precio */}
          {showPriceControls ? (
            <>
              {sectionHeading(t('filters.price'), 'wallet-outline')}
              <View style={styles.chipWrap}>
                {PRICE_RANGES.map((r, i) =>
                  chip(rangeLabel(r), priceRange === i, () => onPriceRange(priceRange === i ? null : i)),
                )}
              </View>
            </>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          {hasFilters ? (
            <TouchableOpacity onPress={clearAll} hitSlop={8} accessibilityRole="button">
              <Text style={styles.clearText}>{t('filters.clear')}</Text>
            </TouchableOpacity>
          ) : <View />}
          <TouchableOpacity
            style={plusAppearance ? styles.doneWrap : styles.doneBtn}
            onPress={() => closeRef.current()}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            {plusAppearance ? (
              <HardShadow style={styles.doneBtnPlus}>
                <Ionicons name="checkmark" size={17} color={colors.white} />
                <Text style={styles.doneText}>{t('filters.done')}</Text>
              </HardShadow>
            ) : (
              <Text style={styles.doneText}>{t('filters.done')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
      </Modal>
      <PaywallModal
        visible={sortPaywallVisible}
        onClose={() => setSortPaywallVisible(false)}
      />
    </>
  );
}

const themedStyles = () => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  backdropPlus: { backgroundColor: 'rgba(18, 24, 29, 0.58)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 6,
    maxHeight: '80%',
  },
  sheetPlus: {
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    paddingTop: 0, maxHeight: '94%', overflow: 'hidden',
  },
  dragHandleArea: {
    height: 44, alignItems: 'center', justifyContent: 'center',
  },
  grabber: {
    width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.inkFaint, opacity: 0.55,
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
  scrollPlus: { paddingHorizontal: 14 },
  sectionTitle: {
    fontSize: 13, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.4,
    marginTop: 14, marginBottom: 10,
  },
  sectionTitleFirst: { marginTop: 4 },
  visualSectionHeading: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    marginTop: 17, marginBottom: 10,
  },
  visualSectionHeadingFirst: { marginTop: 9 },
  visualSectionIcon: {
    width: 32, height: 32, borderRadius: 11,
    backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center',
  },
  unitPriceIcon: {
    fontSize: 11.5, lineHeight: 14, letterSpacing: -0.45,
    fontFamily: fonts.bold, color: colors.accent,
  },
  visualSectionTitle: {
    flex: 1, fontSize: 14, fontFamily: fonts.bold, color: colors.ink,
    letterSpacing: -0.15,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9,
    minHeight: 44, borderRadius: 22, maxWidth: '100%',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { flexShrink: 1, fontSize: 13, fontFamily: fonts.semibold, color: colors.ink },
  chipTextOn: { color: colors.white },
  lockedUnitPriceButtonBackground: {
    alignSelf: 'flex-start', height: 44, borderRadius: 22,
  },
  lockedUnitPriceChip: {
    flexDirection: 'row', gap: 6,
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
  },
  lockedUnitPriceChipText: { color: colors.accent },
  categoryChip: {
    minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingLeft: 7, paddingRight: 12, paddingVertical: 6,
  },
  categoryAllChip: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12,
  },
  categoryIcon: {
    width: 34, height: 34, borderRadius: 11,
    backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center',
  },
  categoryIconOn: { backgroundColor: 'rgba(255,255,255,0.22)' },
  categoryEmoji: { fontSize: 18 },
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
    minHeight: 44, borderRadius: 16,
  },
  doneWrap: { minWidth: 150 },
  doneBtnPlus: {
    minHeight: 46, paddingHorizontal: 20, borderRadius: 16,
    backgroundColor: colors.accent,
    borderWidth: 0, borderColor: 'transparent',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
  },
  doneText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
});
