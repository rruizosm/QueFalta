import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { fetchPriceChanges, type PriceChangesPage } from '../api/catalog';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown, { type StoreSelection } from '../components/StoreDropdown';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';
import { type ViewMode } from '../components/ViewModeToggle';
import ProductFilterSheet, {
  PRICE_CHANGE_RANGES,
  type FilterGroup,
  type PriceSort,
} from '../components/ProductFilterSheet';

type Direction = 'down' | 'up';
const PRICE_CHANGES_PAGE_SIZE = 50;
const FACET_SEPARATOR = '\u001f';

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
// "−8,5 %" / "+3,2 %" (el % ya viene redondeado a 1 decimal de la BD).
const pctLabel = (n: number) =>
  `${n > 0 ? '+' : '-'}${Math.abs(n).toFixed(1).replace('.', ',')} %`;

/**
 * PriceChangesScreen — "Cambios de precios" (botón de la cabecera del Home).
 * Pestañas Bajadas/Subidas + selector de súper; cada fila muestra precio
 * anterior, actual y porcentaje, y debajo formato/cantidad y precio unitario.
 * Por defecto conserva la magnitud del cambio del servidor; el filtro permite
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
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const headerTop = useHeaderTopPadding(52);
  const { profile } = useProfile();

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
  const [direction, setDirection] = useState<Direction>('down');

  // Filtros locales sobre las páginas cargadas. Las categorías de "Todos" se
  // identifican también por súper porque dos cadenas pueden reutilizar nombres.
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState<string[]>([]);
  const [priceChangeRange, setPriceChangeRange] = useState<number | null>(null);
  const [pricePerUnitSort, setPricePerUnitSort] = useState<PriceSort | null>(null);
  const filtersActive = category.length > 0 || priceChangeRange != null || pricePerUnitSort != null;

  // View mode controlado: el toggle vive junto a las pestañas en ambos modos.
  // La altura medida solo se usa en glass para que la lista pase por debajo.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [chromeH, setChromeH] = useState(0);

  useEffect(() => {
    if (stores.length > 0 && store !== 'all' && !stores.some((s) => s.key === store)) {
      setStore('all');
    }
  }, [stores, store]);

  useEffect(() => { setCategory([]); }, [store]);

  // Caché por súper+dirección para no repetir consultas al alternar.
  const cacheKeyFor = useCallback(
    (storeKey: CatalogStore) =>
      `${storeKey}:${direction}:${pricePerUnitSort ?? 'relevance'}:${region ?? 'none'}:${postalCode ?? 'none'}:${lidlStoreId ?? 'no-lidl'}`,
    [direction, pricePerUnitSort, region, postalCode, lidlStoreId],
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

  useEffect(() => {
    const seq = ++loadSeq.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    const requestedStores = store === 'all' ? stores.map((item) => item.key) : [store];
    const missingStores = requestedStores.filter((storeKey) => !cache[cacheKeyFor(storeKey)]);
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
  }, [store, stores, direction, region, postalCode, pricePerUnitSort, lidlStoreId]);

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
    return allChanges.filter(({ product, deltaPct }) => {
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
  }, [allChanges, category, priceChangeRange, store]);

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
        {stores.length > 0 ? (
          <StoreDropdown stores={stores} value={store} onChange={setStore} includeAll labeled />
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      {glassAvailable || Platform.OS === 'android' ? (
        // Filtro independiente + pestañas deslizantes + vista en una fila.
        <View style={[styles.glassControls, Platform.OS === 'android' && styles.glassControlsAndroid]}>
          <TouchableOpacity
            style={[styles.filterBtn, filtersActive && styles.filterBtnOn]}
            onPress={() => setFilterOpen(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('priceChanges.filterA11y')}
          >
            <Ionicons name="options-outline" size={20} color={filtersActive ? colors.white : colors.inkSoft} />
          </TouchableOpacity>
          <SlidingSegments
            style={{ flex: 1 }}
            emphasized={Platform.OS === 'android'}
            transparentTrack={Platform.OS === 'android'}
            segments={[
              { key: 'down', label: t('priceChanges.down'), icon: 'arrow-down' },
              { key: 'up', label: t('priceChanges.up'), icon: 'arrow-up' },
            ]}
            value={direction}
            onChange={setDirection}
          />
          {/* Mismo toggle lista/cuadrícula que el catálogo (SlidingSegments compacto). */}
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
        </View>
      ) : (
        <View style={styles.fallbackControls}>
          <TouchableOpacity
            style={[styles.filterBtn, filtersActive && styles.filterBtnOn]}
            onPress={() => setFilterOpen(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('priceChanges.filterA11y')}
          >
            <Ionicons name="options-outline" size={20} color={filtersActive ? colors.white : colors.inkSoft} />
          </TouchableOpacity>
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, direction === 'down' && styles.tabActive]}
              onPress={() => setDirection('down')}
              activeOpacity={0.8}
            >
              <View style={styles.tabInner}>
                <Ionicons name="arrow-down" size={13} color={direction === 'down' ? colors.ink : colors.inkSoft} />
                <Text style={[styles.tabText, direction === 'down' && styles.tabTextActive]}>{t('priceChanges.down')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, direction === 'up' && styles.tabActive]}
              onPress={() => setDirection('up')}
              activeOpacity={0.8}
            >
              <View style={styles.tabInner}>
                <Ionicons name="arrow-up" size={13} color={direction === 'up' ? colors.ink : colors.inkSoft} />
                <Text style={[styles.tabText, direction === 'up' && styles.tabTextActive]}>{t('priceChanges.up')}</Text>
              </View>
            </TouchableOpacity>
          </View>
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
        </View>
      )}
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
        emptyText={filtersActive ? t('filters.noMatches') : t('priceChanges.empty')}
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
        pricePerUnitSort={pricePerUnitSort}
        onPricePerUnitSort={setPricePerUnitSort}
        priceChangeRange={priceChangeRange}
        onPriceChangeRange={setPriceChangeRange}
        appearance="plus"
        showCategoryIcons
        categoryGroups={categoryGroups}
      />

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
    width: glassAvailable ? 40 : 44, height: glassAvailable ? 40 : 44, borderRadius: 18,
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
