import { useState } from 'react';
import { Platform, ScrollView, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { catalogBrowserStyles } from './catalogBrowserStyles';
import CatalogFilterSheet from './CatalogFilterSheet';
import CatalogSearchField from './CatalogSearchField';
import { glassAvailable } from './GlassSurface';
import PaywallModal from './PaywallModal';
import SlidingSegments, { type Segment } from './SlidingSegments';
import type { ViewMode } from './ViewModeToggle';

export type CategoryProductSort = 'relevance' | 'priceAsc' | 'priceDesc' | 'pricePerUnitAsc' | 'pricePerUnitDesc';

interface Props {
  query: string;
  onQueryChange: (query: string) => void;
  sort: CategoryProductSort;
  onSortChange: (sort: CategoryProductSort) => void;
  viewMode: ViewMode;
  onViewModeChange: (viewMode: ViewMode) => void;
  unitPriceSortLocked: boolean;
  profileLoading: boolean;
  glutenOnly?: boolean;
  onGlutenOnlyChange?: (value: boolean) => void;
}

export default function CategoryProductToolbar({ query, onQueryChange, sort, onSortChange,
  viewMode, onViewModeChange, unitPriceSortLocked, profileLoading,
  glutenOnly, onGlutenOnlyChange }: Props) {
  const styles = useThemedStyles(catalogBrowserStyles);
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const searching = query.trim().length >= 2;
  const glutenFilterEnabled = glutenOnly != null && onGlutenOnlyChange != null;

  const selectSort = (next: CategoryProductSort) => {
    if (next === 'pricePerUnitAsc' || next === 'pricePerUnitDesc') {
      if (profileLoading) return;
      if (unitPriceSortLocked) {
        setPaywallVisible(true);
        return;
      }
    }
    onSortChange(next);
  };

  const sortSegments: Segment<CategoryProductSort>[] = [
    ...(searching ? [{ key: 'relevance' as const, icon: 'bulb-outline' as const, accessibilityLabel: t('catalog.sortRelevance') }] : []),
    { key: 'priceAsc', icon: 'arrow-up', accessibilityLabel: t('catalog.sortPriceAsc') },
    { key: 'priceDesc', icon: 'arrow-down', accessibilityLabel: t('catalog.sortPriceDesc') },
    ...(!unitPriceSortLocked ? [
      { key: 'pricePerUnitAsc' as const, label: '€/u↑', accessibilityLabel: t('catalog.sortPricePerUnitAsc') },
      { key: 'pricePerUnitDesc' as const, label: '€/u↓', accessibilityLabel: t('catalog.sortPricePerUnitDesc') },
    ] : []),
  ];
  const viewSegments: Segment<ViewMode>[] = [
    { key: 'list', icon: 'list', accessibilityLabel: t('product.viewList') },
    { key: 'grid', icon: 'grid', accessibilityLabel: t('product.viewGrid') },
  ];
  const segmentControl = <K extends string,>(segments: Segment<K>[], value: K, onChange: (key: K) => void) =>
    glassAvailable || Platform.OS === 'android'
      ? <SlidingSegments compact dense emphasized transparentTrack={Platform.OS === 'android'}
          segments={segments} value={value} onChange={onChange} />
      : <View style={[styles.viewToggle, styles.prodToggleDense]}>{segments.map((segment) => {
          const active = value === segment.key;
          return <TouchableOpacity key={segment.key}
            style={[styles.viewBtn, styles.prodViewBtn, active && styles.viewBtnOn]}
            onPress={() => onChange(segment.key)} activeOpacity={0.85}
            accessibilityRole="button" accessibilityLabel={segment.accessibilityLabel}
            accessibilityState={{ selected: active }}>
            {segment.icon
              ? <Ionicons name={segment.icon} size={segment.icon === 'bulb-outline' ? 17 : 18}
                  color={active ? colors.white : colors.inkSoft} />
              : <Text style={[styles.prodUnitSortText, { color: active ? colors.white : colors.inkSoft }]}>{segment.label}</Text>}
          </TouchableOpacity>;
        })}</View>;

  const lockedUnitSort = (
    <View style={[
      glassAvailable ? styles.prodUnitSortLockedBackgroundGlass : styles.prodUnitSortLockedBackgroundFallback,
      Platform.OS === 'android' && styles.prodUnitSortLockedBackgroundAndroid,
      glassAvailable && (scheme === 'dark'
        ? styles.prodUnitSortLockedBackgroundGlassDark
        : styles.prodUnitSortLockedBackgroundGlassLight),
    ]}>
      {glassAvailable && scheme !== 'dark' && <View pointerEvents="none" style={styles.prodUnitSortLockedHighlight} />}
      <View style={[styles.prodUnitSortLockedButtons,
        glassAvailable ? styles.prodUnitSortLockedButtonsGlass : styles.prodUnitSortLockedButtonsFallback]}>
        {(['pricePerUnitAsc', 'pricePerUnitDesc'] as const).map((segment, index) => (
          <TouchableOpacity key={segment}
            style={[styles.prodUnitSortLockedBtn,
              glassAvailable ? styles.prodUnitSortLockedBtnGlass : styles.prodUnitSortLockedBtnFallback,
              index === 0 ? styles.prodUnitSortLockedBtnFirst : styles.prodUnitSortLockedBtnLast]}
            onPress={() => selectSort(segment)} activeOpacity={0.8} accessibilityRole="button"
            accessibilityLabel={t(segment === 'pricePerUnitAsc' ? 'catalog.sortPricePerUnitAsc' : 'catalog.sortPricePerUnitDesc')}
            accessibilityHint={t('paywall.benefits.unitPriceText')}>
            <Text style={styles.prodUnitSortLockedText}>{segment === 'pricePerUnitAsc' ? '€/u↑' : '€/u↓'}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const controls = <>
    <View style={[styles.prodSortGroup, windowWidth < 340 && { gap: 0 }]}>
      {segmentControl(sortSegments, sort, selectSort)}
      {unitPriceSortLocked && lockedUnitSort}
    </View>
    {glutenFilterEnabled && (glassAvailable || Platform.OS === 'android'
      ? <SlidingSegments compact dense emphasized allowReselect transparentTrack={Platform.OS === 'android'}
          segments={[{ key: 'filters', icon: 'options-outline', accessibilityLabel: t('product.filterA11y') }]}
          value={glutenOnly ? 'filters' : null} onChange={() => setFilterOpen(true)} />
      : <TouchableOpacity style={[styles.filterBtn, glutenOnly && styles.filterBtnOn]}
          onPress={() => setFilterOpen(true)} activeOpacity={0.8}
          accessibilityRole="button" accessibilityLabel={t('product.filterA11y')}
          accessibilityState={{ selected: glutenOnly }}>
          <Ionicons name="options-outline" size={20} color={glutenOnly ? colors.white : colors.inkSoft} />
        </TouchableOpacity>)}
    <View style={styles.prodViewGroup}>{segmentControl(viewSegments, viewMode, onViewModeChange)}</View>
  </>;

  return <>
    <View style={[styles.prodSearchBlock, windowWidth < 340 && { marginHorizontal: 12 }]}>
      <View style={styles.prodSearchRow}>
        <CatalogSearchField product expanded={searchExpanded}
          placeholder={t('product.searchPlaceholder')} value={query} onChange={onQueryChange}
          onFocus={() => setSearchExpanded(true)} onBlur={() => setSearchExpanded(false)} />
        {!searchExpanded && (windowWidth < 340 && (searching || (!glassAvailable && Platform.OS !== 'android'))
          ? <ScrollView horizontal style={{ flex: 1 }}
              contentContainerStyle={{ alignItems: 'center', gap: 8, paddingLeft: 8 }}
              showsHorizontalScrollIndicator={false}>{controls}</ScrollView>
          : controls)}
      </View>
      {!searchExpanded && !!query.trim() && <Text style={styles.prodSearchQuery} numberOfLines={1}>{query.trim()}</Text>}
    </View>
    {glutenFilterEnabled && <CatalogFilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)}
      glutenOnly={glutenOnly} onGlutenOnlyChange={onGlutenOnlyChange} />}
    <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
  </>;
}
