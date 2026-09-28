import { peekPriceChanges } from '../api/catalog';
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
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { fetchPriceChanges, type PriceChangesPage } from '../api/catalog';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, storesWithLidlSecond, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';
import { type ViewMode } from '../components/ViewModeToggle';
import ProductFilterSheet, {
  PRICE_CHANGE_RANGES,
  type FilterGroup,
  type PriceSort,
} from '../components/ProductFilterSheet';
import { catalogStoreRequiresPlus, limitsApply } from '../constants/limits';
import { useCatalogStore } from '../context/CatalogStoreContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import PaywallModal from '../components/PaywallModal';

type Direction = 'down' | 'up';
type ChangeSortSegment = Direction | 'pricePerUnitAsc' | 'pricePerUnitDesc';
const PRICE_CHANGES_PAGE_SIZE = 50;
const FACET_SEPARATOR = '\u001f';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
// "−8,5 %" / "+3,2 %" (el % ya viene redondeado a 1 decimal de la BD).
const pctLabel = (n: number) =>
  `${n > 0 ? '+' : '-'}${Math.abs(n).toFixed(1).replace('.', ',')} %`;
const stripAccents = (value: string) =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * PriceChangesScreen — "Cambios de precios" (botón de la cabecera del Home).
 * Buscador, orden Bajadas/Subidas y selector de súper; cada fila muestra precio
 * anterior, actual y porcentaje, y debajo formato/cantidad y precio unitario.
 * Por defecto conserva la magnitud del cambio del servidor; la cabecera permite
 * sustituirla por orden unitario ascendente o descendente. Los datos los deja
 * el trigger del sync semanal: ver supabase/migrations/catalog_price_changes.sql
 * (sin ejecutarla no hay datos y se muestra el vacío).
 *
 * Liquid Glass (F3 piloto, solo `glassAvailable`): TODO el chrome —cabecera,
 * selector de súper y pestañas— vive en una franja de
 * cristal flotante (absolute, al final del árbol como NotificationsSheet) y la
 * lista pasa por debajo y se refracta (topInset de StoreProductList = altura
 * medida del chrome). Las pestañas usan la píldora deslizante de acento
 * (SlidingSegments, lenguaje F1b) y el toggle lista/cuadrícula sube al chrome
 * (hideToolbar + viewMode controlado). En fallback (Android / iOS ≤ 18) el
 * árbol y los estilos son EXACTAMENTE los de siempre.
 */
export default function PriceChangesScreen() {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<any>();
  const { t, lang } = useTranslation();
  const headerTop = useHeaderTopPadding(52);
  const { profile, isPremium, loading: profileLoading } = useProfile();

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
  const [direction, setDirection] = useState<Direction>('down');

  // Filtros locales sobre las páginas cargadas. Las categorías de "Todos" se
  // identifican también por súper porque dos cadenas pueden reutilizar nombres.
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState<string[]>([]);
  const [priceChangeRange, setPriceChangeRange] = useState<number | null>(null);
  const [pricePerUnitSort, setPricePerUnitSort] = useState<PriceSort | null>(null);
  const [query, setQuery] = useState('');
  const [productSearchExpanded, setProductSearchExpanded] = useState(false);
  const [queryInHeader, setQueryInHeader] = useState(false);
  const [sortPaywallVisible, setSortPaywallVisible] = useState(false);
  const sheetFiltersActive = category.length > 0 || priceChangeRange != null;
  const unitPriceSortLocked = !profileLoading && limitsApply(isPremium);
  const activeSortSegment: ChangeSortSegment = pricePerUnitSort
    ? `pricePerUnit${pricePerUnitSort === 'asc' ? 'Asc' : 'Desc'}`
    : direction;

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

  const selectSortSegment = (segment: ChangeSortSegment) => {
    if (segment === 'down' || segment === 'up') {
      setDirection(segment);
      setPricePerUnitSort(null);
      return;
    }
    if (profileLoading) return;
    if (unitPriceSortLocked) {
      setSortPaywallVisible(true);
      return;
    }
    setPricePerUnitSort(segment === 'pricePerUnitAsc' ? 'asc' : 'desc');
  };

  useEffect(() => {
    if (unitPriceSortLocked && pricePerUnitSort != null) {
      setPricePerUnitSort(null);
      setDirection('down');
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
      toValue: target, duration: target === 1 ? 420 : 360,
      easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false,
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

  // View mode controlado: el toggle vive junto a las pestañas en ambos modos.
  // La altura medida solo se usa en glass para que la lista pase por debajo.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [chromeH, setChromeH] = useState(0);

  useEffect(() => {
    if (stores.length > 0 && store !== 'all' && !stores.some((s) => s.key === store)) {
      setStore(stores[0].key);
    }
  }, [setStore, stores, store]);

  useEffect(() => { setCategory([]); }, [store]);

  // Caché por súper+dirección para no repetir consultas al alternar.
  const cacheKeyFor = useCallback(
    (storeKey: CatalogStore) =>
      `${lang}:${storeKey}:${direction}:${pricePerUnitSort ?? 'relevance'}:${region ?? 'none'}:${postalCode ?? 'none'}:${lidlStoreId ?? 'no-lidl'}`,
    [lang, direction, pricePerUnitSort, region, postalCode, lidlStoreId],
  );
  const [cache, setCache] = useState<Record<string, PriceChangesPage>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  // Igual que Catálogo/Novedades: FlatList puede disparar onEndReached más de
  // una vez antes de que React pinte loadingMore. El ref cierra esa ventana y
  // loadSeq evita que una respuesta de una pestaña anterior altere la actual.
  const loadingMoreRef = useRef(false);
  const loadSeq = useRef(0);

  useLayoutEffect(() => {
    const seq = ++loadSeq.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    const requestedStores = store === 'all' ? stores.map((item) => item.key) : [store];
    const shared: Record<string, PriceChangesPage> = {};
    for (const storeKey of requestedStores) {
      const page = peekPriceChanges(storeKey, direction, region, postalCode, PRICE_CHANGES_PAGE_SIZE, 0, pricePerUnitSort, lidlStoreId);
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
      page: await fetchPriceChanges(
        storeKey, direction, region, postalCode, PRICE_CHANGES_PAGE_SIZE, 0, pricePerUnitSort, lidlStoreId,
      ),
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
    // cache a propósito fuera de deps: solo dispara al cambiar súper/dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, stores, lang, direction, region, postalCode, pricePerUnitSort, lidlStoreId]);

  const allChanges = useMemo(() => {
    const changes = store === 'all'
      ? stores.flatMap((item) => cache[cacheKeyFor(item.key)]?.items ?? [])
      : cache[cacheKeyFor(store)]?.items ?? [];
    if (store !== 'all') return changes;
    return [...changes].sort((a, b) => {
      if (pricePerUnitSort) {
        const priceA = a.product.pricePerUnit;
        const priceB = b.product.pricePerUnit;
        if (priceA == null && priceB != null) return 1;
        if (priceA != null && priceB == null) return -1;
        const priceDiff = (priceA ?? 0) - (priceB ?? 0);
        if (priceDiff !== 0) return pricePerUnitSort === 'asc' ? priceDiff : -priceDiff;
      } else {
        const deltaDiff = direction === 'down'
          ? a.deltaPct - b.deltaPct
          : b.deltaPct - a.deltaPct;
        if (deltaDiff !== 0) return deltaDiff;
      }
      return a.product.name.localeCompare(b.product.name);
    });
  }, [cache, store, stores, direction, pricePerUnitSort, cacheKeyFor]);

  const categories = useMemo(() => {
    const values = new Set<string>();
    allChanges.forEach(({ product }) => {
      if (product.categoryName) values.add(product.categoryName);
    });
    return [...values].sort((a, b) => a.localeCompare(b, 'es'));
  }, [allChanges]);

  const categoryGroups = useMemo<FilterGroup[]>(() => {
    if (store !== 'all') return [];
    return stores.map((item) => {
      const values = new Set<string>();
      (cache[cacheKeyFor(item.key)]?.items ?? []).forEach(({ product }) => {
        if (product.categoryName) values.add(product.categoryName);
      });
      return {
        key: item.key,
        label: item.name,
        options: [...values].sort((a, b) => a.localeCompare(b, 'es')).map((value) => ({
          value: `${item.key}${FACET_SEPARATOR}${value}`,
          label: value,
        })),
      };
    }).filter((group) => group.options.length > 0);
  }, [store, stores, cache, cacheKeyFor]);

  const filteredChanges = useMemo(() => {
    const range = priceChangeRange != null ? PRICE_CHANGE_RANGES[priceChangeRange] : null;
    const words = stripAccents(query).trim().split(/\s+/).filter((word) => word.length >= 2);
    return allChanges.filter(({ product, deltaPct }) => {
      if (words.length > 0) {
        const name = stripAccents(product.name);
        if (!words.every((word) => name.includes(word))) return false;
      }
      if (category.length > 0) {
        const categoryKey = store === 'all'
          ? `${product.store}${FACET_SEPARATOR}${product.categoryName ?? ''}`
          : product.categoryName;
        if (categoryKey == null || !category.includes(categoryKey)) return false;
      }
      if (range) {
        const magnitude = Math.abs(deltaPct);
        if (magnitude <= range.min) return false;
        if (range.max != null && magnitude > range.max) return false;
      }
      return true;
    });
  }, [allChanges, category, priceChangeRange, query, store]);

  const loadMore = useCallback(() => {
    if (loading || loadingMoreRef.current) return;
    const requestedStores = store === 'all' ? stores.map((item) => item.key) : [store];
    const storesWithMore = requestedStores.filter((storeKey) =>
      cache[cacheKeyFor(storeKey)]?.nextOffset != null,
    );
    if (storesWithMore.length === 0) return;
    const seq = loadSeq.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    Promise.all(storesWithMore.map(async (storeKey) => {
      const previous = cache[cacheKeyFor(storeKey)]!;
      const page = await fetchPriceChanges(
        storeKey, direction, region, postalCode, PRICE_CHANGES_PAGE_SIZE,
        previous.nextOffset!, pricePerUnitSort,
        lidlStoreId,
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
      })
      .catch(() => {})
      .finally(() => {
        if (loadSeq.current !== seq) return;
        loadingMoreRef.current = false;
        setLoadingMore(false);
      });
  }, [cache, cacheKeyFor, direction, loading, postalCode, pricePerUnitSort, region, store, stores, lidlStoreId]);

  // La búsqueda es local porque el historial no expone FTS. Mientras haya una
  // consulta válida, completa las páginas pendientes para no limitar los
  // resultados a los primeros 50 cambios cargados.
  useEffect(() => {
    const searching = stripAccents(query).trim().split(/\s+/).some((word) => word.length >= 2);
    if (!searching || loading || loadingMore) return;
    const requestedStores = store === 'all' ? stores.map((item) => item.key) : [store];
    if (requestedStores.some((storeKey) => cache[cacheKeyFor(storeKey)]?.nextOffset != null)) {
      loadMore();
    }
  }, [cache, cacheKeyFor, loadMore, loading, loadingMore, query, store, stores]);

  // La línea de precio de la fila pasa a "anterior tachado · actual en
  // verde/rojo · (%)" vía priceChange (lo pinta StoreProductList) →
  // StoreProductList se reutiliza tal cual, con stepper/cesta/favoritos/ficha.
  const products: UIProduct[] = useMemo(
    () => {
      return filteredChanges.map((c) => ({
      ...c.product,
      priceChange: {
        prevLabel: euro(c.prevPrice),
        pctLabel: pctLabel(c.deltaPct),
        direction,
      },
      }));
    },
    [filteredChanges, direction],
  );

  const lockedUnitPriceSortButton = (sortDirection: PriceSort) => (
    <TouchableOpacity
      key={sortDirection}
      style={[
        styles.prodUnitSortLockedBtn,
        glassAvailable ? styles.prodUnitSortLockedBtnGlass : styles.prodUnitSortLockedBtnFallback,
        sortDirection === 'asc' ? styles.prodUnitSortLockedBtnFirst : styles.prodUnitSortLockedBtnLast,
      ]}
      onPress={() => selectSortSegment(sortDirection === 'asc' ? 'pricePerUnitAsc' : 'pricePerUnitDesc')}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t(sortDirection === 'asc' ? 'catalog.sortPricePerUnitAsc' : 'catalog.sortPricePerUnitDesc')}
      accessibilityHint={t('paywall.benefits.unitPriceText')}
    >
      <Text style={styles.prodUnitSortLockedText}>{sortDirection === 'asc' ? '€/u↑' : '€/u↓'}</Text>
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
      {(['down', 'up'] as const).map((segment) => (
        <TouchableOpacity
          key={segment}
          style={[styles.viewBtn, styles.prodViewBtn, activeSortSegment === segment && styles.viewBtnOn]}
          onPress={() => selectSortSegment(segment)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t(segment === 'down' ? 'priceChanges.down' : 'priceChanges.up')}
        >
          <Ionicons name={segment === 'down' ? 'arrow-down' : 'arrow-up'} size={18} color={activeSortSegment === segment ? colors.white : colors.inkSoft} />
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

  // Chrome de la pantalla (cabecera + selector + pestañas), idéntico
  // en ambos modos salvo: back sin caja sobre el cristal (como el cerrar de
  // NotificationsSheet) y pestañas con píldora deslizante + toggle en línea.
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
        <Text style={styles.title} numberOfLines={1}>{t('priceChanges.title')}</Text>
        {storeOptions.length > 0 ? (
          <StoreDropdown stores={storeOptions} value={store} onChange={setStore} includeAll labeled />
        ) : (
          <View style={{ width: 38 }} />
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
                          { key: 'down', icon: 'arrow-down', accessibilityLabel: t('priceChanges.down') },
                          { key: 'up', icon: 'arrow-up', accessibilityLabel: t('priceChanges.up') },
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
                      { key: 'down', icon: 'arrow-down', accessibilityLabel: t('priceChanges.down') },
                      { key: 'up', icon: 'arrow-up', accessibilityLabel: t('priceChanges.up') },
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
                  segments={[{ key: 'filters', icon: 'options-outline', accessibilityLabel: t('priceChanges.filterA11y') }]}
                  value={sheetFiltersActive ? 'filters' : null}
                  onChange={() => setFilterOpen(true)}
                />
              ) : (
                <TouchableOpacity style={[styles.filterBtn, sheetFiltersActive && styles.filterBtnOn]} onPress={() => setFilterOpen(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('priceChanges.filterA11y')}>
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
        loading={loading}
        error={error}
        emptyText={sheetFiltersActive || query.trim().length > 0 ? t('filters.noMatches') : t('priceChanges.empty')}
        errorText={t('priceChanges.error')}
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

      <ProductFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        categories={categories}
        category={category}
        onCategory={setCategory}
        priceRange={null}
        onPriceRange={() => {}}
        sort={null}
        onSort={() => {}}
        showPriceControls={false}
        showSortControls={false}
        pricePerUnitSort={pricePerUnitSort}
        onPricePerUnitSort={setPricePerUnitSort}
        priceChangeRange={priceChangeRange}
        onPriceChangeRange={setPriceChangeRange}
        appearance="plus"
        showCategoryIcons
        categoryGroups={categoryGroups}
      />

      <PaywallModal visible={sortPaywallVisible} onClose={() => setSortPaywallVisible(false)} />

      {/* Chrome de cristal: al FINAL del árbol para pintarse encima; la lista
          se refracta al pasar por debajo. El StoreDropdown puede seguir dentro:
          el cristal arranca en y=0, así que el onLayout con el que ancla su
          menú sigue dando coordenadas de pantalla. */}
      {glassAvailable && (
        <View
          style={styles.chrome}
          onLayout={(e) => setChromeH(e.nativeEvent.layout.height)}
        >
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

  // ── Header (mismo patrón que Favoritos) ───────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  // Sobre el cristal, sin caja (evita glass anidado; como NotificationsSheet).
  backBtnGlass: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    flex: 1, minWidth: 0, fontSize: 20, fontFamily: fonts.bold,
    color: colors.ink, letterSpacing: -0.3,
  },

  filterBtn: {
    width: 44, height: 44, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1, borderColor: 'transparent',
  },
  filterBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },

  // ── Tab switcher (Bajadas / Subidas), SOLO fallback ───────────
  tabs: {
    flex: 1, flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    padding: 3, gap: 3, borderRadius: 18,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 15 },
  tabActive: {
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentMid,
  },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tabText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft },
  tabTextActive: { color: colors.ink },
  fallbackControls: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
  },
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
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white,
    paddingHorizontal: 16, gap: 11, borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0, fontFamily: fonts.medium },
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
  glassControls: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16,
  },
  glassControlsAndroid: { marginBottom: 10 },
});
