import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import {
  fetchWeeklyNewProducts,
  type NewProductFilters,
  type WeeklyNewProductsPage,
} from '../api/catalog';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown, { type StoreSelection } from '../components/StoreDropdown';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { type ViewMode } from '../components/ViewModeToggle';
import SlidingSegments from '../components/SlidingSegments';
import ProductFilterSheet, { PRICE_RANGES, type FilterGroup, type PriceSort } from '../components/ProductFilterSheet';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { sortByRelevance } from '../lib/sort';

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
 * Bajo la cabecera va la fila buscador + filtros (mismo diseño que la pestaña
 * Productos del catálogo): búsqueda FTS/trigram en servidor, botón de filtros (categoría
 * de las disponibles, rango de precio y orden por precio, en hoja inferior
 * ProductFilterSheet, incluido precio unitario) y toggle lista/cuadrícula.
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
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { profile } = useProfile();
  const headerTop = useHeaderTopPadding(56);

  // Solo los súpers activados en el perfil (misma regla que el catálogo).
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const lidlStoreId = profile?.lidlStoreId ?? null;
  const preferredStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const allowedStores = useMemo(() => {
    const enabledKeys = preferredStores.filter((store) => storeInRegion(store, region));
    return enabledKeys.length > 0 ? enabledKeys : storesForRegion(region);
  }, [preferredStores, region]);
  const stores = useMemo(
    () => CATALOG_STORES.filter((s) => allowedStores.includes(s.key)
      && (s.key !== 'lidl' || lidlStoreId != null)),
    [allowedStores, lidlStoreId],
  );
  const [store, setStore] = useState<StoreSelection>(stores[0]?.key ?? 'all');

  // Si la preferencia cambia y la tienda activa deja de estar, salta a la primera.
  useEffect(() => {
    if (stores.length > 0 && store !== 'all' && !stores.some((s) => s.key === store)) {
      setStore('all');
    }
  }, [stores, store]);

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
  const [sort, setSort] = useState<PriceSort | null>(null);
  const [pricePerUnitSort, setPricePerUnitSort] = useState<PriceSort | null>(null);
  const filtersActive = category.length > 0 || filterStores.length > 0
    || priceRange != null || sort != null || pricePerUnitSort != null;

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
    (storeKey: CatalogStore) => `${storeKey}:${region ?? 'none'}:${postalCode ?? 'none'}:${lidlStoreId ?? 'no-lidl'}`,
    [region, postalCode, lidlStoreId],
  );
  useEffect(() => {
    const seq = ++loadSeq.current;
    setVisibleCount(NEW_ARRIVALS_PAGE_SIZE);
    const requestedStores = store === 'all' ? stores.map((item) => item.key) : [store];
    const missingStores = requestedStores.filter((storeKey) => !cache[cacheKeyFor(storeKey)]);
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
  }, [store, stores, region, postalCode, lidlStoreId]);

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
        {stores.length > 0 ? (
          <StoreDropdown stores={stores} value={store} onChange={setStore} includeAll labeled />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Fila buscador + filtros + toggle (mismo diseño que el catálogo). */}
      <View style={styles.searchRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filtersActive && styles.filterBtnOn]}
          onPress={() => setFilterOpen(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('filters.a11yOpen')}
        >
          <Ionicons name="options-outline" size={20} color={filtersActive ? colors.white : colors.inkSoft} />
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={colors.inkSoft} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('catalog.searchProducts')}
            placeholderTextColor={colors.inkFaint}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
            </TouchableOpacity>
          )}
        </View>
        {glassAvailable || Platform.OS === 'android' ? (
          <SlidingSegments
            compact
            dense={Platform.OS === 'android'}
            emphasized={Platform.OS === 'android'}
            transparentTrack={Platform.OS === 'android'}
            segments={[
              { key: 'list', icon: 'list' },
              { key: 'grid', icon: 'grid' },
            ]}
            value={viewMode}
            onChange={setViewMode}
          />
        ) : (
          <View style={styles.viewToggle}>
            <TouchableOpacity
              style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnOn]}
              onPress={() => setViewMode('list')}
              activeOpacity={0.85}
            >
              <Ionicons name="list" size={19} color={viewMode === 'list' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnOn]}
              onPress={() => setViewMode('grid')}
              activeOpacity={0.85}
            >
              <Ionicons name="grid" size={17} color={viewMode === 'grid' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
          </View>
        )}
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
        emptyText={filtersActive || query.trim().length > 0 ? t('filters.noMatches') : t('newArrivals.empty')}
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
        stores={store === 'all' ? stores.map((item) => ({ value: item.key, label: item.name })) : []}
        selectedStores={filterStores}
        onStores={(values) => setFilterStores(values as CatalogStore[])}
        categoryGroups={categoryGroups}
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

  // ── Fila buscador + filtro + vista (diseño del catálogo) ──────
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8,
  },
  filterBtn: {
    width: glassAvailable ? 40 : 44, height: glassAvailable ? 40 : 44, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  filterBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    height: glassAvailable ? 40 : 44, paddingHorizontal: 16,
    gap: 11,
    borderRadius: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: colors.ink, padding: 0,
    fontFamily: fonts.medium,
  },
  // Toggle lista/cuadrícula en fallback (misma pastilla que el catálogo).
  viewToggle: {
    flexDirection: 'row', gap: 3,
    backgroundColor: colors.surfaceAlt,
    padding: 4, borderRadius: 18,
  },
  viewBtn: {
    width: 36, height: 36, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  viewBtnOn: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: {
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
