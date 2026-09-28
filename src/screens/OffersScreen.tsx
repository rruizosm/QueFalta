import { peekStoreOffers } from '../api/catalog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, LayoutAnimation, Platform, StatusBar, StyleSheet, Text,
  TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { createMultiStorePager, type MultiStorePager } from '../lib/multiStorePager';
import { relevanceScore } from '../lib/sort';
import {
  fetchStoreOffers, fetchOfferCategories, offerTypesForStore, OFFER_STORES,
  type BrowseCursor, type StoreOffer, type OfferFilters, type OfferType,
} from '../api/catalog';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, storesWithLidlSecond, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { type ViewMode } from '../components/ViewModeToggle';
import SlidingSegments from '../components/SlidingSegments';
import ProductFilterSheet, {
  PRICE_RANGES,
  type FilterGroup,
  type PriceSort,
} from '../components/ProductFilterSheet';
import { catalogStoreRequiresPlus, limitsApply } from '../constants/limits';
import { useCatalogStore } from '../context/CatalogStoreContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import PaywallModal from '../components/PaywallModal';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const FACET_SEPARATOR = '\u001f';
const facetValue = (store: CatalogStore, value: string) => `${store}${FACET_SEPARATOR}${value}`;
const facetValuesForStore = (values: string[], store: CatalogStore) =>
  values
    .filter((value) => value.startsWith(`${store}${FACET_SEPARATOR}`))
    .map((value) => value.slice(value.indexOf(FACET_SEPARATOR) + 1));
type OfferSortSegment = 'priceAsc' | 'priceDesc' | 'pricePerUnitAsc' | 'pricePerUnitDesc';

function compareOffers(sort: PriceSort | null, pricePerUnitSort: PriceSort | null, query = '') {
  return (a: StoreOffer, b: StoreOffer) => {
    const activeSort = pricePerUnitSort ?? sort;
    if (activeSort) {
      const priceA = pricePerUnitSort ? a.product.pricePerUnit : a.product.unitPrice;
      const priceB = pricePerUnitSort ? b.product.pricePerUnit : b.product.unitPrice;
      if (priceA == null && priceB != null) return 1;
      if (priceA != null && priceB == null) return -1;
      const priceDiff = (priceA ?? 0) - (priceB ?? 0);
      if (priceDiff !== 0) return activeSort === 'asc' ? priceDiff : -priceDiff;
    }
    if (!activeSort && query.trim().length >= 2) {
      const relevanceDifference = relevanceScore(b.product.name, query)
        - relevanceScore(a.product.name, query);
      if (relevanceDifference !== 0) return relevanceDifference;
    }
    const nameDiff = a.product.name.localeCompare(b.product.name, 'es', { sensitivity: 'base' });
    if (nameDiff !== 0) return nameDiff;
    const storeDiff = CATALOG_STORE_KEYS.indexOf(a.product.store)
      - CATALOG_STORE_KEYS.indexOf(b.product.store);
    return storeDiff !== 0 ? storeDiff : a.product.id.localeCompare(b.product.id);
  };
}

/**
 * OffersScreen — "Ofertas" (botón de la cabecera del Home, junto a Novedades y
 * Cambios de precios). Lista las ofertas vivas del súper: promos de lote ("3x2",
 * "2ª unidad -70%"…) y descuentos directos ("Antes X €"), en la línea secundaria
 * de cada fila. La exponen los súpers de OFFER_STORES (Carrefour vía badges de
 * promo; BonpreuEsclat vía su categoría "Ofertas"; Consum solo cuando su API
 * marca explícitamente OFFER_PRICE; DIA vía CLUB/online y precio tachado por
 * CCAA; Sorli vía sus tipos estructurados y vigencia; Plusfresc vía sus copias
 * Oferta2; HiperDino vía su precio regular tachado; Aldi vía precio tachado y
 * vigencia de Algolia; Lidl vía su feed de ofertas de tienda enlazado a
 * Product Catalog; Eroski/Caprabo vía el tile de oferta; Condis vía
 * on_sale/on_promotion; Ametller vía productPromotions; y Alcampo vía
 * promotions/promoPrice)
 * y el selector alterna entre
 * ellos; no se filtra por la preferencia de súpers del usuario porque quien solo
 * usa otro súper también puede querer ver ofertas. A diferencia de Novedades
 * (~100 filas), aquí hay miles → paginación keyset de servidor (onEndReached),
 * todas alcanzables. Requiere las migraciones carrefour_offers.sql /
 * bonpreu_offers.sql / consum_offers.sql / plusfresc_offers.sql /
 * hiperdino_offers.sql / aldi_offers.sql /
 * 20260904122841_lidl_offers.sql /
 * 20260726200544_retailer_offers_condis_ametller_alcampo_eroski_caprabo.sql /
 * 20260723204711_dia_offers.sql / 20260723212240_sorli_offers.sql
 * (sin ellas la query falla por columna inexistente).
 *
 * Bajo la cabecera va la fila de la pestaña Productos del catálogo: buscador
 * expandible, orden por precio, filtros y toggle lista/cuadrícula. La hoja solo
 * conserva las facetas (súper, tipo, categoría y rango de precio). Los
 * filtros conservan el recorrido keyset completo: cada cambio recarga la
 * primera página y nunca se limita a los productos que ya estaban visibles.
 *
 * Liquid Glass (F3): mismo patrón que Novedades/Cambios de precios — el chrome
 * entero en franja de cristal flotante y la lista refractándose por debajo.
 */
export default function OffersScreen() {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<any>();
  const { t, lang } = useTranslation();
  const headerTop = useHeaderTopPadding(52);
  const { profile, isPremium, loading: profileLoading } = useProfile();
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const lidlStoreId = profile?.lidlStoreId ?? null;

  const preferredStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const allowedStores = useMemo(() => {
    const enabledInRegion = preferredStores.filter((store) => storeInRegion(store, region, postalCode));
    return enabledInRegion.length > 0 ? enabledInRegion : storesForRegion(region, postalCode);
  }, [preferredStores, region, postalCode]);
  const storeOptions = useMemo(
    () => storesWithLidlSecond(CATALOG_STORES.filter((s) => allowedStores.includes(s.key)
      && (s.key !== 'lidl' || lidlStoreId != null))),
    [allowedStores, lidlStoreId],
  );
  const stores = useMemo(
    () => storeOptions.filter((option) => !catalogStoreRequiresPlus(option.key, isPremium)),
    [isPremium, storeOptions],
  );
  const { store, setStore } = useCatalogStore();

  const [items, setItems] = useState<StoreOffer[]>([]);
  const [cursor, setCursor] = useState<BrowseCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  // Descarta respuestas de una carga anterior (cambio de súper/filtros o desmontaje).
  const loadSeq = useRef(0);
  const allOffersPager = useRef<MultiStorePager<StoreOffer> | null>(null);

  // Búsqueda FTS/trigram y filtros server-side (ver OfferFilters). La búsqueda
  // se debouncea para no lanzar una query por tecla.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState<string[]>([]); // multi; [] = todas
  const [selectedOfferTypes, setSelectedOfferTypes] = useState<string[]>([]); // multi; [] = todos
  const [filterStores, setFilterStores] = useState<CatalogStore[]>([]); // [] = todos
  const [priceRange, setPriceRange] = useState<number | null>(null); // índice en PRICE_RANGES
  const [sort, setSort] = useState<PriceSort | null>('asc');
  const [pricePerUnitSort, setPricePerUnitSort] = useState<PriceSort | null>(null);
  const [productSearchExpanded, setProductSearchExpanded] = useState(false);
  const [queryInHeader, setQueryInHeader] = useState(false);
  const [sortPaywallVisible, setSortPaywallVisible] = useState(false);
  const sheetFiltersActive = category.length > 0 || selectedOfferTypes.length > 0
    || priceRange != null
    || (store === 'all' && filterStores.length > 0);
  const resultFiltersActive = sheetFiltersActive;
  const unitPriceSortLocked = !profileLoading && limitsApply(isPremium);
  const activeSortSegment: OfferSortSegment | null = pricePerUnitSort
    ? `pricePerUnit${pricePerUnitSort === 'asc' ? 'Asc' : 'Desc'}`
    : sort
      ? `price${sort === 'asc' ? 'Asc' : 'Desc'}`
      : null;

  useEffect(() => {
    if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
  }, []);

  const setProductSearchFocus = (expanded: boolean) => {
    const hidesHeaderQuery = expanded && queryInHeader;
    if (expanded === productSearchExpanded && !hidesHeaderQuery) return;
    if (!reducedMotion) {
      LayoutAnimation.configureNext({
        duration: 360,
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
    }
    if (expanded) setQueryInHeader(false);
    setProductSearchExpanded(expanded);
  };

  const selectSortSegment = (segment: OfferSortSegment) => {
    if (segment === 'priceAsc' || segment === 'priceDesc') {
      const next = segment === 'priceAsc' ? 'asc' : 'desc';
      setSort(next);
      setPricePerUnitSort(null);
      return;
    }
    if (profileLoading) return;
    if (unitPriceSortLocked) {
      setSortPaywallVisible(true);
      return;
    }
    const next = segment === 'pricePerUnitAsc' ? 'asc' : 'desc';
    setPricePerUnitSort(next);
    setSort(null);
  };

  useEffect(() => {
    if (unitPriceSortLocked && pricePerUnitSort != null) {
      setPricePerUnitSort(null);
      setSort('asc');
    }
  }, [pricePerUnitSort, unitPriceSortLocked]);

  const queryReveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const target = queryInHeader && query.trim().length > 0 ? 1 : 0;
    if (reducedMotion) {
      queryReveal.setValue(target);
      return;
    }
    const animation = Animated.timing(queryReveal, {
      toValue: target,
      duration: target === 1 ? 420 : 360,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [query, queryInHeader, queryReveal, reducedMotion]);

  const handleProductScrollBegin = () => {
    const shouldShowHeaderQuery = query.trim().length > 0;
    if (!productSearchExpanded && queryInHeader === shouldShowHeaderQuery) return;
    if (!reducedMotion) {
      LayoutAnimation.configureNext({
        duration: 360,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
    }
    setProductSearchExpanded(false);
    setQueryInHeader(shouldShowHeaderQuery);
  };

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Categorías y tipos disponibles dependen de cada súper → se limpian al cambiar.
  useEffect(() => {
    setCategory([]);
    setSelectedOfferTypes([]);
  }, [store]);

  const filters: OfferFilters = useMemo(() => ({
    search: debouncedQuery,
    categories: store === 'all' ? [] : category,
    offerTypes: store === 'all' ? [] : selectedOfferTypes as OfferType[],
    priceMin: priceRange != null ? PRICE_RANGES[priceRange].min : null,
    priceMax: priceRange != null ? PRICE_RANGES[priceRange].max : null,
    sort,
    pricePerUnitSort,
  }), [store, debouncedQuery, category, selectedOfferTypes, priceRange, sort, pricePerUnitSort]);

  const availableStoreKeys = useMemo(() => stores.map((option) => option.key), [stores]);
  const offerStores = useMemo(
    () => stores.filter((option) => OFFER_STORES.includes(option.key)),
    [stores],
  );
  const offerStoreKeys = useMemo(() => offerStores.map((option) => option.key), [offerStores]);
  useEffect(() => {
    if (store !== 'all' && !availableStoreKeys.includes(store)) {
      setStore(stores[0]?.key ?? 'all');
    }
  }, [store, stores, availableStoreKeys, setStore]);
  const filteredOfferStores = useMemo(() => {
    let filtered = store === 'all' && filterStores.length > 0
      ? offerStoreKeys.filter((key) => filterStores.includes(key))
      : offerStoreKeys;
    if (store === 'all' && category.length > 0) {
      const categoryStores = new Set(category.map((value) => value.split(FACET_SEPARATOR)[0]));
      filtered = filtered.filter((key) => categoryStores.has(key));
    }
    if (store === 'all' && selectedOfferTypes.length > 0) {
      const typeStores = new Set(selectedOfferTypes.map((value) => value.split(FACET_SEPARATOR)[0]));
      filtered = filtered.filter((key) => typeStores.has(key));
    }
    return filtered;
  }, [store, filterStores, offerStoreKeys, category, selectedOfferTypes]);
  const filtersForStore = useCallback((selectedStore: CatalogStore): OfferFilters => ({
    ...filters,
    categories: store === 'all' ? facetValuesForStore(category, selectedStore) : category,
    offerTypes: store === 'all'
      ? facetValuesForStore(selectedOfferTypes, selectedStore) as OfferType[]
      : selectedOfferTypes as OfferType[],
  }), [filters, store, category, selectedOfferTypes]);

  const offerTypeLabels = useMemo<Record<OfferType, string>>(() => ({
    discount: t('offers.typeDiscount'),
    second_unit: t('offers.typeSecondUnit'),
    multibuy: t('offers.typeMultibuy'),
    club: t('offers.typeClub'),
    shipping: t('offers.typeShipping'),
    other: t('offers.typeOther'),
  }), [t]);
  const offerTypeOptions = useMemo(() => {
    return store === 'all' || !OFFER_STORES.includes(store)
      ? []
      : offerTypesForStore(store).map((value) => ({ value, label: offerTypeLabels[value] }));
  }, [store, offerTypeLabels]);

  // Categorías con oferta viva del súper activo (para la hoja de filtros),
  // cacheadas por súper para no repetir el agregado al alternar en el selector.
  const [categoriesCache, setCategoriesCache] = useState<Record<string, string[]>>({});
  const [categoriesLoading, setCategoriesLoading] = useState<Record<string, boolean>>({});
  const categoriesKeyForStore = useCallback(
    (selectedStore: CatalogStore) =>
      `${selectedStore}:${region ?? 'none'}:${postalCode ?? 'none'}:${lidlStoreId ?? 'no-lidl'}`,
    [region, postalCode, lidlStoreId],
  );
  const categoriesKey = store === 'all' || !OFFER_STORES.includes(store)
    ? null
    : categoriesKeyForStore(store);
  useEffect(() => {
    if (store === 'all' || categoriesKey == null || categoriesCache[categoriesKey]) return;
    const selectedStore: CatalogStore = store;
    let cancelled = false;
    fetchOfferCategories(selectedStore, region, postalCode, lidlStoreId)
      .then((cats) => { if (!cancelled) setCategoriesCache((c) => ({ ...c, [categoriesKey]: cats })); })
      .catch(() => {});
    return () => { cancelled = true; };
    // cache a propósito fuera de deps: solo dispara al cambiar de súper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, region, postalCode, lidlStoreId, categoriesKey]);

  const ensureOfferCategories = useCallback((selectedStore: CatalogStore) => {
    const key = categoriesKeyForStore(selectedStore);
    if (categoriesCache[key] || categoriesLoading[key]) return;
    setCategoriesLoading((current) => ({ ...current, [key]: true }));
    fetchOfferCategories(selectedStore, region, postalCode, lidlStoreId)
      .then((cats) => setCategoriesCache((current) => ({ ...current, [key]: cats })))
      .catch(() => setCategoriesCache((current) => ({ ...current, [key]: [] })))
      .finally(() => setCategoriesLoading((current) => ({ ...current, [key]: false })));
  }, [categoriesCache, categoriesLoading, categoriesKeyForStore, region, postalCode, lidlStoreId]);

  const categoryGroups = useMemo<FilterGroup[]>(() => offerStores.map((option) => {
    const key = categoriesKeyForStore(option.key);
    return {
      key: option.key,
      label: option.name,
      loading: !!categoriesLoading[key] || categoriesCache[key] == null,
      options: (categoriesCache[key] ?? []).map((categoryName) => ({
        value: facetValue(option.key, categoryName),
        label: categoryName,
      })),
    };
  }), [offerStores, categoriesCache, categoriesLoading, categoriesKeyForStore]);

  const offerTypeGroups = useMemo<FilterGroup[]>(() => offerStores.map((option) => ({
    key: option.key,
    label: option.name,
    options: offerTypesForStore(option.key).map((value) => ({
      value: facetValue(option.key, value),
      label: offerTypeLabels[value],
    })),
  })), [offerStores, offerTypeLabels]);

  // Solo en glass: view mode controlado (el toggle vive en el chrome de cristal)
  // y alto medido del chrome para que la lista pase por debajo.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [chromeH, setChromeH] = useState(0);

  // Primera página: recarga al cambiar de súper Y al cambiar cualquier filtro
  // (el keyset arranca de cero con las nuevas condiciones).
  useLayoutEffect(() => {
    const seq = ++loadSeq.current;
    setItems([]);
    setCursor(null);
    setLoading(true);
    setError(false);
    if (store === 'all') {
      const pager = createMultiStorePager({
        stores: filteredOfferStores,
        loadPage: (selectedStore, pageCursor, limit) =>
          fetchStoreOffers(
            selectedStore,
            pageCursor,
            region,
            postalCode,
            limit,
            filtersForStore(selectedStore),
            lidlStoreId,
          ),
        compare: compareOffers(sort, pricePerUnitSort, debouncedQuery),
      });
      allOffersPager.current = pager;
      pager.nextPage(50)
        .then((pageItems) => {
          if (loadSeq.current !== seq) return;
          setItems(pageItems);
          setCursor(pager.hasMore() ? { name: 0, id: 'all' } : null);
        })
        .catch(() => { if (loadSeq.current === seq) setError(true); })
        .finally(() => { if (loadSeq.current === seq) setLoading(false); });
      return;
    }

    allOffersPager.current = null;
    if (!OFFER_STORES.includes(store)) {
      setLoading(false);
      return;
    }
    const cached = peekStoreOffers(store, null, region, postalCode, 50, filtersForStore(store), lidlStoreId);
    if (cached) {
      setItems(cached.items);
      setCursor(cached.nextCursor);
      setLoading(false);
      return;
    }
    fetchStoreOffers(store, null, region, postalCode, 50, filtersForStore(store), lidlStoreId)
      .then((page) => {
        if (loadSeq.current !== seq) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch(() => { if (loadSeq.current === seq) setError(true); })
      .finally(() => { if (loadSeq.current === seq) setLoading(false); });
  }, [
    store,
    filtersForStore,
    lang,
    region,
    postalCode,
    lidlStoreId,
    sort,
    pricePerUnitSort,
    debouncedQuery,
    filteredOfferStores,
  ]);

  // Páginas siguientes al llegar al final (cursor null = no hay más).
  const loadMore = useCallback(() => {
    if (!cursor || loading || loadingMore) return;
    const seq = loadSeq.current;
    setLoadingMore(true);
    if (store === 'all') {
      const pager = allOffersPager.current;
      if (!pager) {
        setLoadingMore(false);
        return;
      }
      pager.nextPage(50)
        .then((pageItems) => {
          if (loadSeq.current !== seq) return;
          setItems((prev) => [...prev, ...pageItems]);
          setCursor(pager.hasMore() ? { name: 0, id: 'all' } : null);
        })
        .catch(() => {})
        .finally(() => { if (loadSeq.current === seq) setLoadingMore(false); });
      return;
    }
    fetchStoreOffers(store, cursor, region, postalCode, 50, filtersForStore(store), lidlStoreId)
      .then((page) => {
        if (loadSeq.current !== seq) return;
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch(() => {}) // fallo de red al paginar: se reintenta al volver a llegar al final
      .finally(() => { if (loadSeq.current === seq) setLoadingMore(false); });
  }, [store, filtersForStore, region, postalCode, lidlStoreId, cursor, loading, loadingMore]);

  // El TIPO de oferta ("3x2", "2ª ud. -70%"…) se resalta en rojo ARRIBA del
  // nombre. La línea secundaria conserva formato y precio unitario como en
  // Novedades; si existe precio anterior se añade después sin ocultarlos.
  const products: UIProduct[] = useMemo(
    () => items.map((o) => {
      const secondaryLabels = [
        o.product.metaLabel,
        o.product.pricePerUnitLabel,
        o.prevPrice != null && o.promotionKinds?.includes('discount') !== false
          ? t('offers.before', { price: euro(o.prevPrice) }) : null,
        o.promotionCount && o.promotionCount > 1
          ? t(o.promotionCount === 2 ? 'offers.oneMorePromotion' : 'offers.morePromotions',
            { count: o.promotionCount - 1 }) : null,
      ].filter((label): label is string => Boolean(label));
      return {
        ...o.product,
        offerTag: o.promoName || null,
        metaLabel: secondaryLabels.length > 0 ? secondaryLabels.join('  ·  ') : null,
        pricePerUnitLabel: null,
      };
    }),
    [items, t],
  );

  const lockedUnitPriceSortButton = (direction: PriceSort) => (
    <TouchableOpacity
      key={direction}
      style={[
        styles.prodUnitSortLockedBtn,
        glassAvailable ? styles.prodUnitSortLockedBtnGlass : styles.prodUnitSortLockedBtnFallback,
        direction === 'asc' ? styles.prodUnitSortLockedBtnFirst : styles.prodUnitSortLockedBtnLast,
      ]}
      onPress={() => selectSortSegment(direction === 'asc' ? 'pricePerUnitAsc' : 'pricePerUnitDesc')}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t(direction === 'asc'
        ? 'catalog.sortPricePerUnitAsc'
        : 'catalog.sortPricePerUnitDesc')}
      accessibilityHint={t('paywall.benefits.unitPriceText')}
    >
      <Text style={styles.prodUnitSortLockedText}>{direction === 'asc' ? '€/u↑' : '€/u↓'}</Text>
    </TouchableOpacity>
  );

  const lockedUnitPriceSortGroup = (
    <View style={[
      glassAvailable
        ? styles.prodUnitSortLockedBackgroundGlass
        : styles.prodUnitSortLockedBackgroundFallback,
      Platform.OS === 'android' && styles.prodUnitSortLockedBackgroundAndroid,
      glassAvailable && (scheme === 'dark'
        ? styles.prodUnitSortLockedBackgroundGlassDark
        : styles.prodUnitSortLockedBackgroundGlassLight),
    ]}>
      {glassAvailable && <View pointerEvents="none" style={styles.prodUnitSortLockedHighlight} />}
      <View style={[
        styles.prodUnitSortLockedButtons,
        glassAvailable
          ? styles.prodUnitSortLockedButtonsGlass
          : styles.prodUnitSortLockedButtonsFallback,
      ]}>
        {lockedUnitPriceSortButton('asc')}
        {lockedUnitPriceSortButton('desc')}
      </View>
    </View>
  );

  const fallbackSortSegments = (includeUnitPrice: boolean) => (
    <View style={[styles.viewToggle, styles.prodToggleDense]}>
      <TouchableOpacity
        style={[styles.viewBtn, styles.prodViewBtn, activeSortSegment === 'priceAsc' && styles.viewBtnOn]}
        onPress={() => selectSortSegment('priceAsc')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('catalog.sortPriceAsc')}
      >
        <Ionicons name="arrow-up" size={18} color={activeSortSegment === 'priceAsc' ? colors.white : colors.inkSoft} />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.viewBtn, styles.prodViewBtn, activeSortSegment === 'priceDesc' && styles.viewBtnOn]}
        onPress={() => selectSortSegment('priceDesc')}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={t('catalog.sortPriceDesc')}
      >
        <Ionicons name="arrow-down" size={18} color={activeSortSegment === 'priceDesc' ? colors.white : colors.inkSoft} />
      </TouchableOpacity>
      {includeUnitPrice ? (
        <>
          <TouchableOpacity
            style={[styles.viewBtn, styles.prodViewBtn, activeSortSegment === 'pricePerUnitAsc' && styles.viewBtnOn]}
            onPress={() => selectSortSegment('pricePerUnitAsc')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('catalog.sortPricePerUnitAsc')}
          >
            <Text style={[styles.prodUnitSortText, { color: activeSortSegment === 'pricePerUnitAsc' ? colors.white : colors.inkSoft }]}>€/u↑</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewBtn, styles.prodViewBtn, activeSortSegment === 'pricePerUnitDesc' && styles.viewBtnOn]}
            onPress={() => selectSortSegment('pricePerUnitDesc')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('catalog.sortPricePerUnitDesc')}
          >
            <Text style={[styles.prodUnitSortText, { color: activeSortSegment === 'pricePerUnitDesc' ? colors.white : colors.inkSoft }]}>€/u↓</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );

  // Chrome de la pantalla (cabecera + selector + fila de búsqueda),
  // idéntico en ambos modos salvo el back sin caja sobre el cristal y el toggle
  // (SlidingSegments en glass / pastilla estática en fallback, como el catálogo).
  const chrome = (
    <>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{t('offers.title')}</Text>
        {/* Siempre visible (aunque haya un solo súper con ofertas): es lo que dice
            de qué súper son las ofertas que se están viendo. */}
        <StoreDropdown stores={storeOptions} value={store} onChange={setStore} includeAll labeled />
      </View>

      {/* Misma fila de Productos del catálogo: búsqueda, orden, filtros y vista. */}
      <View style={styles.prodSearchBlock}>
        <View style={styles.prodSearchRow}>
          <View style={[
            styles.searchBar,
            styles.prodSearchBox,
            glassAvailable ? styles.prodSearchBoxGlass : styles.prodSearchBoxFallback,
            productSearchExpanded ? styles.prodSearchBoxExpanded : styles.prodSearchBoxCollapsed,
          ]}>
            <Ionicons name="search-outline" size={20} color={colors.inkSoft} />
            {productSearchExpanded ? (
              <>
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('catalog.searchProducts')}
                  placeholderTextColor={colors.inkFaint}
                  value={query}
                  onChangeText={setQuery}
                  onFocus={() => setProductSearchFocus(true)}
                  onBlur={() => setProductSearchFocus(false)}
                  returnKeyType="search"
                  autoCorrect={false}
                  autoFocus
                />
                {query.length > 0 && (
                  <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
                    <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <TouchableOpacity
                style={styles.prodSearchActivator}
                onPress={() => setProductSearchFocus(true)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('catalog.searchProducts')}
              />
            )}
          </View>

          {!productSearchExpanded && (
            <>
              <View style={styles.prodSortGroup}>
              {unitPriceSortLocked ? (
                <>
                  {glassAvailable || Platform.OS === 'android' ? (
                    <SlidingSegments
                      compact dense emphasized
                      transparentTrack={Platform.OS === 'android'}
                      segments={[
                        { key: 'priceAsc', icon: 'arrow-up', accessibilityLabel: t('catalog.sortPriceAsc') },
                        { key: 'priceDesc', icon: 'arrow-down', accessibilityLabel: t('catalog.sortPriceDesc') },
                      ]}
                      value={activeSortSegment}
                      onChange={selectSortSegment}
                    />
                  ) : fallbackSortSegments(false)}
                  {lockedUnitPriceSortGroup}
                </>
              ) : glassAvailable || Platform.OS === 'android' ? (
                <SlidingSegments
                  compact dense emphasized
                  transparentTrack={Platform.OS === 'android'}
                  segments={[
                    { key: 'priceAsc', icon: 'arrow-up', accessibilityLabel: t('catalog.sortPriceAsc') },
                    { key: 'priceDesc', icon: 'arrow-down', accessibilityLabel: t('catalog.sortPriceDesc') },
                    { key: 'pricePerUnitAsc', label: '€/u↑', accessibilityLabel: t('catalog.sortPricePerUnitAsc') },
                    { key: 'pricePerUnitDesc', label: '€/u↓', accessibilityLabel: t('catalog.sortPricePerUnitDesc') },
                  ]}
                  value={activeSortSegment}
                  onChange={selectSortSegment}
                />
              ) : fallbackSortSegments(true)}
              </View>

              {glassAvailable || Platform.OS === 'android' ? (
                <SlidingSegments
                  compact dense emphasized allowReselect
                  transparentTrack={Platform.OS === 'android'}
                  segments={[
                    { key: 'filters', icon: 'options-outline', accessibilityLabel: t('filters.a11yOpen') },
                  ]}
                  value={sheetFiltersActive ? 'filters' : null}
                  onChange={() => setFilterOpen(true)}
                />
              ) : (
                <TouchableOpacity
                  style={[styles.filterBtn, sheetFiltersActive && styles.filterBtnOn]}
                  onPress={() => setFilterOpen(true)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('filters.a11yOpen')}
                >
                  <Ionicons name="options-outline" size={20} color={sheetFiltersActive ? colors.white : colors.inkSoft} />
                </TouchableOpacity>
              )}

              <View style={styles.prodViewGroup}>
              {glassAvailable || Platform.OS === 'android' ? (
                <SlidingSegments
                  compact dense emphasized
                  transparentTrack={Platform.OS === 'android'}
                  segments={[
                    { key: 'list', icon: 'list', accessibilityLabel: t('product.viewList') },
                    { key: 'grid', icon: 'grid', accessibilityLabel: t('product.viewGrid') },
                  ]}
                  value={viewMode}
                  onChange={(value) => setViewMode(value as ViewMode)}
                />
              ) : (
                <View style={[styles.viewToggle, styles.prodToggleDense]}>
                  <TouchableOpacity style={[styles.viewBtn, styles.prodViewBtn, viewMode === 'list' && styles.viewBtnOn]} onPress={() => setViewMode('list')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('product.viewList')} accessibilityState={{ selected: viewMode === 'list' }}>
                    <Ionicons name="list" size={19} color={viewMode === 'list' ? colors.white : colors.inkSoft} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.viewBtn, styles.prodViewBtn, viewMode === 'grid' && styles.viewBtnOn]} onPress={() => setViewMode('grid')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('product.viewGrid')} accessibilityState={{ selected: viewMode === 'grid' }}>
                    <Ionicons name="grid" size={17} color={viewMode === 'grid' ? colors.white : colors.inkSoft} />
                  </TouchableOpacity>
                </View>
              )}
              </View>
            </>
          )}
        </View>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden={!queryInHeader}
          importantForAccessibility={queryInHeader ? 'auto' : 'no-hide-descendants'}
          style={[
            styles.prodSearchQueryClip,
            {
              height: queryReveal.interpolate({ inputRange: [0, 1], outputRange: [0, 28] }),
              opacity: queryReveal,
              transform: [{ translateY: queryReveal.interpolate({ inputRange: [0, 1], outputRange: [-3, 0] }) }],
            },
          ]}
        >
          <Text style={styles.prodSearchQuery} numberOfLines={1}>{query.trim()}</Text>
        </Animated.View>
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && chrome}

      <StoreProductList
        products={products}
        loading={loading}
        error={error}
        emptyText={resultFiltersActive || query.trim().length > 0 ? t('filters.noMatches') : t('offers.empty')}
        errorText={t('offers.error')}
        keepOrder
        onEndReached={loadMore}
        loadingMore={loadingMore}
        topInset={glassAvailable ? chromeH : 0}
        hideToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        roundedCards
        showStoreLogo={store === 'all'}
        onScrollBeginDrag={handleProductScrollBegin}
      />

      {/* Hoja de facetas: súper, tipo, categoría y rango de precio. */}
      <ProductFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categoriesKey ? categoriesCache[categoriesKey] ?? [] : []}
        category={category}
        onCategory={setCategory}
        categoryGroups={store === 'all' ? categoryGroups : []}
        onCategoryGroupOpen={(key) => ensureOfferCategories(key as CatalogStore)}
        offerTypes={offerTypeOptions}
        offerTypeGroups={store === 'all' ? offerTypeGroups : []}
        selectedOfferTypes={selectedOfferTypes}
        onOfferTypes={setSelectedOfferTypes}
        stores={store === 'all'
          ? offerStores.map((option) => ({ value: option.key, label: option.name }))
          : []}
        selectedStores={filterStores}
        onStores={(values) => setFilterStores(values as CatalogStore[])}
        priceRange={priceRange}
        onPriceRange={setPriceRange}
        sort={sort}
        onSort={(value) => {
          setSort(value);
          if (value) setPricePerUnitSort(null);
        }}
        pricePerUnitSort={pricePerUnitSort}
        onPricePerUnitSort={(value) => {
          setPricePerUnitSort(value);
          if (value) setSort(null);
        }}
        appearance="plus"
        showCategoryIcons
        showSortControls={false}
      />

      <PaywallModal
        visible={sortPaywallVisible}
        onClose={() => setSortPaywallVisible(false)}
      />

      {/* Chrome de cristal: al FINAL del árbol para pintarse encima; la lista
          se refracta al pasar por debajo. El StoreDropdown puede seguir dentro
          (el cristal arranca en y=0 → su onLayout sigue dando coords de pantalla). */}
      {glassAvailable && (
        <View style={styles.chrome} onLayout={(e) => setChromeH(e.nativeEvent.layout.height)}>
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {chrome}
          </GlassSurface>
        </View>
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header (mismo patrón que Novedades/Cambios de precios) ─────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  // Sobre el cristal, sin caja (evita glass anidado; como en Cambios de precios).
  backBtnGlass: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    flex: 1, minWidth: 0, fontSize: 20, fontFamily: fonts.bold,
    color: colors.ink, letterSpacing: -0.3,
  },

  // ── Fila de productos (mismo diseño que Catálogo) ─────────────
  filterBtn: {
    width: 44, height: 44, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  filterBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 16, gap: 11,
    borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  searchInput: {
    flex: 1, fontSize: 14, color: colors.ink, padding: 0,
    fontFamily: fonts.medium,
  },
  // Toggle lista/cuadrícula en fallback (misma pastilla que el catálogo).
  viewToggle: {
    flexDirection: 'row', gap: 5,
    backgroundColor: colors.surfaceAlt,
    padding: 5, borderRadius: 14,
  },
  viewBtn: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  viewBtnOn: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  prodSearchBlock: { marginHorizontal: 16, marginBottom: 8 },
  prodSearchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  prodSearchQueryClip: { overflow: 'hidden' },
  prodSearchQuery: {
    marginTop: 4, fontSize: 13, lineHeight: 20,
    fontFamily: fonts.medium, fontStyle: 'italic', color: colors.inkSoft,
  },
  prodSearchBox: {
    marginHorizontal: 0, marginBottom: 0, minWidth: 0,
    paddingVertical: 0, borderRadius: 999,
  },
  prodSearchBoxExpanded: { flex: 1 },
  prodSearchBoxCollapsed: {
    width: 40, height: 40, paddingHorizontal: 0, gap: 0, justifyContent: 'center',
  },
  prodSearchBoxGlass: { height: 40 },
  prodSearchBoxFallback: { height: 44 },
  prodSearchActivator: { ...StyleSheet.absoluteFill },
  prodSortGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prodViewGroup: { alignItems: 'center', justifyContent: 'center' },
  prodToggleDense: { padding: 3, gap: 3, borderRadius: 12 },
  prodViewBtn: { width: 32, height: 38, borderRadius: 9 },
  prodUnitSortText: { fontSize: 10, fontFamily: fonts.bold },
  prodUnitSortLockedBackgroundGlass: {
    width: 72, height: 40, borderRadius: 20, borderWidth: 1,
    shadowColor: '#000', shadowOpacity: 0.11, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  prodUnitSortLockedBackgroundGlassLight: {
    backgroundColor: 'rgba(255,255,255,0.38)', borderColor: 'rgba(43,37,33,0.10)',
  },
  prodUnitSortLockedBackgroundGlassDark: {
    backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.20)',
  },
  prodUnitSortLockedHighlight: {
    position: 'absolute', top: 1, left: 10, right: 10, height: 1, borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  prodUnitSortLockedBackgroundFallback: {
    width: 73, height: 44, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  prodUnitSortLockedBackgroundAndroid: { borderWidth: 0, backgroundColor: 'transparent' },
  prodUnitSortLockedButtons: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  prodUnitSortLockedButtonsGlass: { padding: 3 },
  prodUnitSortLockedButtonsFallback: { padding: 3, gap: 3 },
  prodUnitSortLockedBtn: { width: 32, alignItems: 'center', justifyContent: 'center' },
  prodUnitSortLockedBtnGlass: { height: 32 },
  prodUnitSortLockedBtnFallback: { height: 38, borderRadius: 9 },
  prodUnitSortLockedBtnFirst: { borderTopLeftRadius: 17, borderBottomLeftRadius: 17 },
  prodUnitSortLockedBtnLast: { borderTopRightRadius: 17, borderBottomRightRadius: 17 },
  prodUnitSortLockedText: {
    fontSize: 10, lineHeight: 12, fontFamily: fonts.bold,
    color: colors.accent, textAlign: 'center', includeFontPadding: false,
  },

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
