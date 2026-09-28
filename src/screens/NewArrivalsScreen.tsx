import { peekWeeklyNewProducts } from '../api/catalog';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, LayoutAnimation, Platform, StatusBar, StyleSheet, Text,
  TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import {
  fetchWeeklyNewProducts,
  type NewProductFilters,
  type WeeklyNewProductsPage,
} from '../api/catalog';
import { CATALOG_STORES, CATALOG_STORE_KEYS, storesWithLidlSecond, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { type ViewMode } from '../components/ViewModeToggle';
import SlidingSegments from '../components/SlidingSegments';
import ProductFilterSheet, { PRICE_RANGES, type FilterGroup, type PriceSort } from '../components/ProductFilterSheet';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { sortByRelevance } from '../lib/sort';
import { catalogStoreRequiresPlus, limitsApply } from '../constants/limits';
import { useCatalogStore } from '../context/CatalogStoreContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import PaywallModal from '../components/PaywallModal';

type ProductSortSegment = 'priceAsc' | 'priceDesc' | 'pricePerUnitAsc' | 'pricePerUnitDesc';

// Misma normalización que la búsqueda del catálogo (insensible a acentos/mayúsculas).
const stripAccents = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const NEW_ARRIVALS_PAGE_SIZE = 50;
const FACET_SEPARATOR = '\u001f';
const facetValuesForStore = (values: string[], store: CatalogStore) =>
  values
    .filter((value) => value.startsWith(`${store}${FACET_SEPARATOR}`))
    .map((value) => value.slice(value.indexOf(FACET_SEPARATOR) + 1));

/**
 * NewArrivalsScreen — "Novedades" (botón de la cabecera del Home).
 * Selector de súper (los del usuario) + lista de productos nuevos con el mismo
 * añadir-a-la-cesta de siempre (StoreProductList). Mercadona sale de su
 * endpoint oficial de novedades (en vivo); el resto, de first_seen_at del
 * espejo (productos que aparecieron en el último sync semanal). Ver
 * supabase/migrations/catalog_first_seen.sql.
 *
 * Bajo la cabecera va la misma fila compacta de Productos del catálogo:
 * buscador expandible, orden por precio, filtros y toggle lista/cuadrícula.
 * La hoja inferior conserva supermercado, categoría y rango de precio.
 * Sin texto se conserva el feed ligero; al buscar, filtros y orden se aplican
 * antes de paginar para no limitarse a las novedades ya descargadas.
 *
 * Liquid Glass (F3, solo `glassAvailable`): mismo patrón que Cambios de precios
 * — todo el chrome (cabecera, selector de súper y fila de
 * búsqueda) vive en una franja de cristal flotante (absolute, al final del
 * árbol) y la lista pasa por debajo refractándose (topInset = alto medido del
 * chrome; hideToolbar + viewMode controlado). En fallback, el árbol y los
 * estilos son EXACTAMENTE los de siempre.
 */
export default function NewArrivalsScreen() {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<any>();
  const { t, lang } = useTranslation();
  const { profile, isPremium, loading: profileLoading } = useProfile();
  const headerTop = useHeaderTopPadding(56);

  // Solo los súpers activados en el perfil (misma regla que el catálogo).
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const lidlStoreId = profile?.lidlStoreId ?? null;
  const preferredStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const allowedStores = useMemo(() => {
    const enabledKeys = preferredStores.filter((store) => storeInRegion(store, region, postalCode));
    return enabledKeys.length > 0 ? enabledKeys : storesForRegion(region, postalCode);
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

  // Si la preferencia cambia y la tienda activa deja de estar, salta a la primera.
  useEffect(() => {
    if (stores.length > 0 && store !== 'all' && !stores.some((s) => s.key === store)) {
      setStore(stores[0].key);
    }
  }, [setStore, stores, store]);

  // Caché por súper para no repetir la consulta al alternar en el selector.
  const [cache, setCache] = useState<Record<string, WeeklyNewProductsPage>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [visibleCount, setVisibleCount] = useState(NEW_ARRIVALS_PAGE_SIZE);
  const loadSeq = useRef(0);
  const searchSeq = useRef(0);
  const [searchCache, setSearchCache] = useState<Record<string, WeeklyNewProductsPage>>({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchLoadingMore, setSearchLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState(false);

  // El feed normal conserva filtros locales; con al menos dos letras se activa
  // el motor de búsqueda paginado en servidor.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState<string[]>([]); // multi; [] = todas
  const [filterStores, setFilterStores] = useState<CatalogStore[]>([]);
  const [priceRange, setPriceRange] = useState<number | null>(null); // índice en PRICE_RANGES
  const [sort, setSort] = useState<PriceSort | null>('asc');
  const [pricePerUnitSort, setPricePerUnitSort] = useState<PriceSort | null>(null);
  const [productSearchExpanded, setProductSearchExpanded] = useState(false);
  const [queryInHeader, setQueryInHeader] = useState(false);
  const [sortPaywallVisible, setSortPaywallVisible] = useState(false);
  const sheetFiltersActive = category.length > 0 || filterStores.length > 0 || priceRange != null;
  const unitPriceSortLocked = !profileLoading && limitsApply(isPremium);
  const activeSortSegment: ProductSortSegment = pricePerUnitSort
    ? `pricePerUnit${pricePerUnitSort === 'asc' ? 'Asc' : 'Desc'}`
    : `price${sort === 'desc' ? 'Desc' : 'Asc'}`;

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

  const selectSortSegment = (segment: ProductSortSegment) => {
    if (segment === 'priceAsc' || segment === 'priceDesc') {
      setSort(segment === 'priceAsc' ? 'asc' : 'desc');
      setPricePerUnitSort(null);
      return;
    }
    if (profileLoading) return;
    if (unitPriceSortLocked) {
      setSortPaywallVisible(true);
      return;
    }
    setPricePerUnitSort(segment === 'pricePerUnitAsc' ? 'asc' : 'desc');
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

  // Las categorías son de CADA súper → al cambiar de súper el filtro deja de
  // tener sentido y se limpia (precio/orden sí sobreviven, son universales).
  useEffect(() => { setCategory([]); }, [store]);

  // View mode controlado: el toggle vive en la fila de búsqueda (ambos modos).
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [chromeH, setChromeH] = useState(0);

  const cacheKeyFor = useCallback(
    (storeKey: CatalogStore) => `${lang}:${storeKey}:${region ?? 'none'}:${postalCode ?? 'none'}:${lidlStoreId ?? 'no-lidl'}`,
    [lang, region, postalCode, lidlStoreId],
  );
  useLayoutEffect(() => {
    const seq = ++loadSeq.current;
    setVisibleCount(NEW_ARRIVALS_PAGE_SIZE);
    const requestedStores = store === 'all' ? stores.map((item) => item.key) : [store];
    const shared: Record<string, WeeklyNewProductsPage> = {};
    for (const storeKey of requestedStores) {
      const page = peekWeeklyNewProducts(storeKey, region, postalCode, NEW_ARRIVALS_PAGE_SIZE, 0, undefined, lidlStoreId);
      if (page) shared[cacheKeyFor(storeKey)] = page;
    }
    if (Object.keys(shared).length) setCache((current) => ({ ...current, ...shared }));
    const missingStores = requestedStores.filter((storeKey) => !shared[cacheKeyFor(storeKey)]);
    if (missingStores.length === 0) { setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all(missingStores.map(async (storeKey) => ({
      storeKey,
      page: await fetchWeeklyNewProducts(storeKey, region, postalCode, NEW_ARRIVALS_PAGE_SIZE, 0, undefined, lidlStoreId),
    })))
      .then((results) => {
        if (!cancelled && loadSeq.current === seq) setCache((current) => ({
          ...current,
          ...Object.fromEntries(results.map(({ storeKey, page }) => [cacheKeyFor(storeKey), page])),
        }));
      })
      .catch(() => { if (!cancelled && loadSeq.current === seq) setError(true); })
      .finally(() => { if (!cancelled && loadSeq.current === seq) setLoading(false); });
    return () => { cancelled = true; };
    // cache a propósito fuera de deps: solo dispara al cambiar de súper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, stores, lang, region, postalCode, lidlStoreId]);

  const searchActive = debouncedQuery.trim().length >= 2;
  const newFiltersForStore = useCallback((selectedStore: CatalogStore): NewProductFilters => ({
    search: debouncedQuery,
    categories: store === 'all' ? facetValuesForStore(category, selectedStore) : category,
    priceMin: priceRange != null ? PRICE_RANGES[priceRange].min : null,
    priceMax: priceRange != null ? PRICE_RANGES[priceRange].max : null,
    sort,
    pricePerUnitSort,
  }), [debouncedQuery, store, category, priceRange, sort, pricePerUnitSort]);
  const requestedSearchStores = useMemo(() => {
    let available = store === 'all' ? stores.map((item) => item.key) : [store];
    if (store === 'all' && filterStores.length > 0) {
      available = available.filter((key) => filterStores.includes(key));
    }
    if (store === 'all' && category.length > 0) {
      const categoryStores = new Set(category.map((value) => value.split(FACET_SEPARATOR)[0]));
      available = available.filter((key) => categoryStores.has(key));
    }
    return available;
  }, [store, stores, filterStores, category]);
  const searchCacheKeyFor = useCallback((storeKey: CatalogStore) => {
    const filters = newFiltersForStore(storeKey);
    return `${cacheKeyFor(storeKey)}:${JSON.stringify(filters)}`;
  }, [cacheKeyFor, newFiltersForStore]);

  useEffect(() => {
    if (!searchActive) {
      setSearchLoading(false);
      setSearchError(false);
      return;
    }
    const seq = ++searchSeq.current;
    setVisibleCount(NEW_ARRIVALS_PAGE_SIZE);
    const missingStores = requestedSearchStores.filter((storeKey) => !searchCache[searchCacheKeyFor(storeKey)]);
    if (missingStores.length === 0) {
      setSearchLoading(false);
      setSearchError(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    setSearchError(false);
    Promise.all(missingStores.map(async (storeKey) => ({
      storeKey,
      page: await fetchWeeklyNewProducts(
        storeKey,
        region,
        postalCode,
        NEW_ARRIVALS_PAGE_SIZE,
        0,
        newFiltersForStore(storeKey),
        lidlStoreId,
      ),
    })))
      .then((results) => {
        if (cancelled || searchSeq.current !== seq) return;
        setSearchCache((current) => {
          const loaded = new Map(results.map(({ storeKey, page }) => [searchCacheKeyFor(storeKey), page]));
          return Object.fromEntries(requestedSearchStores.flatMap((storeKey) => {
            const key = searchCacheKeyFor(storeKey);
            const page = loaded.get(key) ?? current[key];
            return page ? [[key, page]] : [];
          }));
        });
      })
      .catch(() => { if (!cancelled && searchSeq.current === seq) setSearchError(true); })
      .finally(() => { if (!cancelled && searchSeq.current === seq) setSearchLoading(false); });
    return () => { cancelled = true; };
  }, [
    searchActive,
    requestedSearchStores,
    searchCache,
    searchCacheKeyFor,
    newFiltersForStore,
    region,
    postalCode,
    lidlStoreId,
  ]);

  const base = useMemo(() => {
    if (store !== 'all') return cache[cacheKeyFor(store)]?.items ?? [];
    return stores.flatMap((item) => cache[cacheKeyFor(item.key)]?.items ?? []);
  }, [store, stores, cache, cacheKeyFor]);

  const searchBase = useMemo(() => requestedSearchStores.flatMap((storeKey) => (
    searchCache[searchCacheKeyFor(storeKey)]?.items ?? []
  )), [requestedSearchStores, searchCache, searchCacheKeyFor]);

  // Categorías disponibles en las novedades del súper activo (únicas, ordenadas).
  const categories = useMemo(() => {
    const set = new Set<string>();
    base.forEach((p) => { if (p.categoryName) set.add(p.categoryName); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [base]);

  const categoryGroups = useMemo<FilterGroup[]>(() => {
    if (store !== 'all') return [];
    return stores.map((item) => {
      const values = new Set<string>();
      (cache[cacheKeyFor(item.key)]?.items ?? []).forEach((product) => {
        if (product.categoryName) values.add(product.categoryName);
      });
      return {
        key: item.key,
        label: item.name,
        options: [...values].sort((a, b) => a.localeCompare(b, 'es')).map((value) => ({
          value: `${item.key}\u001f${value}`,
          label: value,
        })),
      };
    }).filter((group) => group.options.length > 0);
  }, [store, stores, cache, cacheKeyFor]);

  // Búsqueda + filtros + orden. Sin orden elegido se respeta el orden en que
  // llegan (curado en Mercadona); los productos sin el precio elegido van al final.
  const filteredProducts = useMemo(() => {
    if (searchActive) {
      const activeSort = pricePerUnitSort ?? sort;
      if (!activeSort) {
        return sortByRelevance(searchBase, (product) => product.name, debouncedQuery);
      }
      return [...searchBase].sort((a, b) => {
        const priceA = pricePerUnitSort ? a.pricePerUnit : a.unitPrice;
        const priceB = pricePerUnitSort ? b.pricePerUnit : b.unitPrice;
        if (priceA == null && priceB != null) return 1;
        if (priceA != null && priceB == null) return -1;
        const difference = (priceA ?? 0) - (priceB ?? 0);
        if (difference !== 0) return activeSort === 'asc' ? difference : -difference;
        return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
      });
    }
    const words = stripAccents(query).trim().split(/\s+/).filter((w) => w.length >= 2);
    const range = priceRange != null ? PRICE_RANGES[priceRange] : null;
    const categoryStores = new Set(category.map((value) => value.split('\u001f')[0] as CatalogStore));
    const selectedStoreSet = new Set(filterStores);
    let out = base.filter((p) => {
      const productStore = p.store as CatalogStore;
      if (store === 'all' && selectedStoreSet.size > 0 && !selectedStoreSet.has(productStore)) return false;
      if (category.length > 0) {
        if (store === 'all') {
          if (!categoryStores.has(productStore) || !category.includes(`${productStore}\u001f${p.categoryName ?? ''}`)) return false;
        } else if (p.categoryName == null || !category.includes(p.categoryName)) return false;
      }
      if (range) {
        if (p.unitPrice == null) return false;
        if (p.unitPrice <= range.min) return false;
        if (range.max != null && p.unitPrice > range.max) return false;
      }
      if (words.length > 0) {
        const name = stripAccents(p.name);
        if (!words.every((w) => name.includes(w))) return false;
      }
      return true;
    });
    const activeSort = pricePerUnitSort ?? sort;
    if (activeSort) {
      out = [...out].sort((a, b) => {
        const pa = pricePerUnitSort ? (a.pricePerUnit ?? Infinity) : (a.unitPrice ?? Infinity);
        const pb = pricePerUnitSort ? (b.pricePerUnit ?? Infinity) : (b.unitPrice ?? Infinity);
        if (pa === pb) return 0;
        if (pa === Infinity) return 1;
        if (pb === Infinity) return -1;
        return activeSort === 'asc' ? pa - pb : pb - pa;
      });
    }
    return out;
  }, [
    base, query, category, filterStores, priceRange, sort, pricePerUnitSort, store,
    searchActive, searchBase, debouncedQuery,
  ]);

  const products = useMemo(
    () => filteredProducts.slice(0, visibleCount),
    [filteredProducts, visibleCount],
  );

  const loadMore = useCallback(() => {
    if (searchActive ? (searchLoading || searchLoadingMore) : (loading || loadingMore)) return;
    if (visibleCount < filteredProducts.length) {
      setVisibleCount((count) => count + NEW_ARRIVALS_PAGE_SIZE);
      return;
    }

    if (searchActive) {
      const storesWithMore = requestedSearchStores.filter((storeKey) =>
        searchCache[searchCacheKeyFor(storeKey)]?.nextOffset != null,
      );
      if (storesWithMore.length === 0) return;
      const seq = searchSeq.current;
      setSearchLoadingMore(true);
      Promise.all(storesWithMore.map(async (storeKey) => {
        const key = searchCacheKeyFor(storeKey);
        const previous = searchCache[key]!;
        const page = await fetchWeeklyNewProducts(
          storeKey,
          region,
          postalCode,
          NEW_ARRIVALS_PAGE_SIZE,
          previous.nextOffset!,
          newFiltersForStore(storeKey),
          lidlStoreId,
        );
        return { key, previous, page };
      }))
        .then((results) => {
          if (searchSeq.current !== seq) return;
          setSearchCache((current) => ({
            ...current,
            ...Object.fromEntries(results.map(({ key, previous, page }) => [key, {
              items: [...previous.items, ...page.items],
              nextOffset: page.nextOffset,
            }])),
          }));
          setVisibleCount((count) => count + NEW_ARRIVALS_PAGE_SIZE);
        })
        .catch(() => {})
        .finally(() => { if (searchSeq.current === seq) setSearchLoadingMore(false); });
      return;
    }

    const requestedStores = store === 'all' ? stores.map((item) => item.key) : [store];
    const storesWithMore = requestedStores.filter((storeKey) =>
      cache[cacheKeyFor(storeKey)]?.nextOffset != null,
    );
    if (storesWithMore.length === 0) return;

    const seq = loadSeq.current;
    setLoadingMore(true);
    Promise.all(storesWithMore.map(async (storeKey) => {
      const previous = cache[cacheKeyFor(storeKey)]!;
      const page = await fetchWeeklyNewProducts(
        storeKey, region, postalCode, NEW_ARRIVALS_PAGE_SIZE, previous.nextOffset!, undefined, lidlStoreId,
      );
      return { storeKey, previous, page };
    }))
      .then((results) => {
        if (loadSeq.current !== seq) return;
        setCache((current) => ({
          ...current,
          ...Object.fromEntries(results.map(({ storeKey, previous, page }) => [cacheKeyFor(storeKey), {
            items: [...previous.items, ...page.items],
            nextOffset: page.nextOffset,
          }])),
        }));
        setVisibleCount((count) => count + NEW_ARRIVALS_PAGE_SIZE);
      })
      .catch(() => {})
      .finally(() => { if (loadSeq.current === seq) setLoadingMore(false); });
  }, [
    cache, cacheKeyFor, filteredProducts.length, loading, loadingMore, postalCode,
    region, store, stores, visibleCount, searchActive, searchLoading,
    searchLoadingMore, requestedSearchStores, searchCache, searchCacheKeyFor,
    newFiltersForStore, lidlStoreId,
  ]);

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
      accessibilityLabel={t(direction === 'asc' ? 'catalog.sortPricePerUnitAsc' : 'catalog.sortPricePerUnitDesc')}
      accessibilityHint={t('paywall.benefits.unitPriceText')}
    >
      <Text style={styles.prodUnitSortLockedText}>{direction === 'asc' ? '€/u↑' : '€/u↓'}</Text>
    </TouchableOpacity>
  );

  const lockedUnitPriceSortGroup = (
    <View style={[
      glassAvailable ? styles.prodUnitSortLockedBackgroundGlass : styles.prodUnitSortLockedBackgroundFallback,
      Platform.OS === 'android' && styles.prodUnitSortLockedBackgroundAndroid,
      glassAvailable && (scheme === 'dark'
        ? styles.prodUnitSortLockedBackgroundGlassDark
        : styles.prodUnitSortLockedBackgroundGlassLight),
    ]}>
      {glassAvailable && <View pointerEvents="none" style={styles.prodUnitSortLockedHighlight} />}
      <View style={[
        styles.prodUnitSortLockedButtons,
        glassAvailable ? styles.prodUnitSortLockedButtonsGlass : styles.prodUnitSortLockedButtonsFallback,
      ]}>
        {lockedUnitPriceSortButton('asc')}
        {lockedUnitPriceSortButton('desc')}
      </View>
    </View>
  );

  const fallbackSortSegments = (includeUnitPrice: boolean) => (
    <View style={[styles.viewToggle, styles.prodToggleDense]}>
      {(['priceAsc', 'priceDesc'] as const).map((segment) => (
        <TouchableOpacity
          key={segment}
          style={[styles.viewBtn, styles.prodViewBtn, activeSortSegment === segment && styles.viewBtnOn]}
          onPress={() => selectSortSegment(segment)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t(segment === 'priceAsc' ? 'catalog.sortPriceAsc' : 'catalog.sortPriceDesc')}
        >
          <Ionicons name={segment === 'priceAsc' ? 'arrow-up' : 'arrow-down'} size={18} color={activeSortSegment === segment ? colors.white : colors.inkSoft} />
        </TouchableOpacity>
      ))}
      {includeUnitPrice && (['pricePerUnitAsc', 'pricePerUnitDesc'] as const).map((segment) => (
        <TouchableOpacity
          key={segment}
          style={[styles.viewBtn, styles.prodViewBtn, activeSortSegment === segment && styles.viewBtnOn]}
          onPress={() => selectSortSegment(segment)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t(segment === 'pricePerUnitAsc' ? 'catalog.sortPricePerUnitAsc' : 'catalog.sortPricePerUnitDesc')}
        >
          <Text style={[styles.prodUnitSortText, { color: activeSortSegment === segment ? colors.white : colors.inkSoft }]}>
            {segment === 'pricePerUnitAsc' ? '€/u↑' : '€/u↓'}
          </Text>
        </TouchableOpacity>
      ))}
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
        <Text style={styles.title} numberOfLines={1}>{t('newArrivals.title')}</Text>
        {storeOptions.length > 0 ? (
          <StoreDropdown stores={storeOptions} value={store} onChange={setStore} includeAll labeled />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

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
              <TouchableOpacity style={styles.prodSearchActivator} onPress={() => setProductSearchFocus(true)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('catalog.searchProducts')} />
            )}
          </View>

          {!productSearchExpanded && (
            <>
              <View style={styles.prodSortGroup}>
                {unitPriceSortLocked ? (
                  <>
                    {glassAvailable || Platform.OS === 'android' ? (
                      <SlidingSegments
                        compact dense emphasized transparentTrack={Platform.OS === 'android'}
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
                    compact dense emphasized transparentTrack={Platform.OS === 'android'}
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
                  compact dense emphasized allowReselect transparentTrack={Platform.OS === 'android'}
                  segments={[{ key: 'filters', icon: 'options-outline', accessibilityLabel: t('filters.a11yOpen') }]}
                  value={sheetFiltersActive ? 'filters' : null}
                  onChange={() => setFilterOpen(true)}
                />
              ) : (
                <TouchableOpacity style={[styles.filterBtn, sheetFiltersActive && styles.filterBtnOn]} onPress={() => setFilterOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('filters.a11yOpen')}>
                  <Ionicons name="options-outline" size={20} color={sheetFiltersActive ? colors.white : colors.inkSoft} />
                </TouchableOpacity>
              )}

              <View style={styles.prodViewGroup}>
                {glassAvailable || Platform.OS === 'android' ? (
                  <SlidingSegments
                    compact dense emphasized transparentTrack={Platform.OS === 'android'}
                    segments={[
                      { key: 'list', icon: 'list', accessibilityLabel: t('product.viewList') },
                      { key: 'grid', icon: 'grid', accessibilityLabel: t('product.viewGrid') },
                    ]}
                    value={viewMode}
                    onChange={(value) => setViewMode(value as ViewMode)}
                  />
                ) : (
                  <View style={[styles.viewToggle, styles.prodToggleDense]}>
                    <TouchableOpacity style={[styles.viewBtn, styles.prodViewBtn, viewMode === 'list' && styles.viewBtnOn]} onPress={() => setViewMode('list')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('product.viewList')}>
                      <Ionicons name="list" size={19} color={viewMode === 'list' ? colors.white : colors.inkSoft} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.viewBtn, styles.prodViewBtn, viewMode === 'grid' && styles.viewBtnOn]} onPress={() => setViewMode('grid')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={t('product.viewGrid')}>
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
        loading={searchActive ? searchLoading : loading}
        error={searchActive ? searchError : error}
        emptyText={sheetFiltersActive || query.trim().length > 0 ? t('filters.noMatches') : t('newArrivals.empty')}
        errorText={t('newArrivals.error')}
        keepOrder
        onEndReached={loadMore}
        loadingMore={searchActive ? searchLoadingMore : loadingMore}
        topInset={glassAvailable ? chromeH : 0}
        hideToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        roundedCards
        showStoreLogo={store === 'all'}
        badgeLabel={t('newArrivals.badge')}
        onScrollBeginDrag={handleProductScrollBegin}
      />

      {/* Hoja de filtros: categoría / precio / orden, aplica en vivo. */}
      <ProductFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categories}
        category={category}
        onCategory={setCategory}
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
        stores={store === 'all' ? stores.map((item) => ({ value: item.key, label: item.name })) : []}
        selectedStores={filterStores}
        onStores={(values) => setFilterStores(values as CatalogStore[])}
        categoryGroups={categoryGroups}
      />

      <PaywallModal visible={sortPaywallVisible} onClose={() => setSortPaywallVisible(false)} />

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

  // ── Header (Catálogo + flecha de volver) ──────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
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
  headerSpacer: { width: 38, height: 38 },

  // ── Fila de productos (mismo diseño que Catálogo/Ofertas) ─────
  filterBtn: {
    width: 44, height: 44, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  filterBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 16, gap: 11, borderRadius: 16,
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
  prodSearchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  prodSearchQueryClip: { overflow: 'hidden' },
  prodSearchQuery: {
    marginTop: 4, fontSize: 13, lineHeight: 20,
    fontFamily: fonts.medium, fontStyle: 'italic', color: colors.inkSoft,
  },
  prodSearchBox: { marginHorizontal: 0, marginBottom: 0, minWidth: 0, paddingVertical: 0, borderRadius: 999 },
  prodSearchBoxExpanded: { flex: 1 },
  prodSearchBoxCollapsed: { width: 40, height: 40, paddingHorizontal: 0, gap: 0, justifyContent: 'center' },
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
  prodUnitSortLockedBackgroundGlassLight: { backgroundColor: 'rgba(255,255,255,0.38)', borderColor: 'rgba(43,37,33,0.10)' },
  prodUnitSortLockedBackgroundGlassDark: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.20)' },
  prodUnitSortLockedHighlight: {
    position: 'absolute', top: 1, left: 10, right: 10, height: 1, borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  prodUnitSortLockedBackgroundFallback: {
    width: 73, height: 44, borderRadius: 12, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surfaceAlt,
  },
  prodUnitSortLockedBackgroundAndroid: { borderWidth: 0, backgroundColor: 'transparent' },
  prodUnitSortLockedButtons: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
