import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchWeeklyNewProducts } from '../api/catalog';
import type { UIProduct } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion } from '../constants/regions';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import ActiveCartBanner from '../components/ActiveCartBanner';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { type ViewMode } from '../components/ViewModeToggle';
import SlidingSegments from '../components/SlidingSegments';
import ProductFilterSheet, { PRICE_RANGES, type PriceSort } from '../components/ProductFilterSheet';

// Misma normalización que la búsqueda del catálogo (insensible a acentos/mayúsculas).
const stripAccents = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * NewArrivalsScreen — "Novedades de la semana" (botón de la cabecera del Home).
 * Selector de súper (los del usuario) + lista de productos nuevos con el mismo
 * añadir-a-la-cesta de siempre (StoreProductList). Mercadona sale de su
 * endpoint oficial de novedades (en vivo); el resto, de first_seen_at del
 * espejo (productos que aparecieron en el último sync semanal). Ver
 * supabase/migrations/catalog_first_seen.sql.
 *
 * Bajo la cabecera va la fila buscador + filtros (mismo diseño que la pestaña
 * Productos del catálogo): botón de filtros a la IZQUIERDA (categoría de las
 * disponibles, rango de precio y orden por precio, en hoja inferior
 * ProductFilterSheet), barra de búsqueda local y el toggle lista/cuadrícula.
 * Todo filtra en cliente: las novedades son ~100 filas ya cargadas en memoria.
 *
 * Liquid Glass (F3, solo `glassAvailable`): mismo patrón que Cambios de precios
 * — todo el chrome (banner de carrito, cabecera, selector de súper y fila de
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

  // Solo los súpers activados en el perfil (misma regla que el catálogo).
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const preferredStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const enabledKeys = preferredStores.filter((store) => storeInRegion(store, region));
  const allowedStores = enabledKeys.length > 0 ? enabledKeys : storesForRegion(region);
  const stores = useMemo(
    () => CATALOG_STORES.filter((s) => allowedStores.includes(s.key)),
    [allowedStores],
  );
  const [store, setStore] = useState<CatalogStore>(stores[0]?.key ?? 'mercadona');

  // Si la preferencia cambia y la tienda activa deja de estar, salta a la primera.
  useEffect(() => {
    if (stores.length > 0 && !stores.some((s) => s.key === store)) {
      setStore(stores[0].key);
    }
  }, [stores, store]);

  // Caché por súper para no repetir la consulta al alternar en el selector.
  const [cache, setCache] = useState<Record<string, UIProduct[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Búsqueda y filtros (locales: las novedades ya están enteras en memoria).
  const [query, setQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState<string[]>([]); // multi; [] = todas
  const [priceRange, setPriceRange] = useState<number | null>(null); // índice en PRICE_RANGES
  const [sort, setSort] = useState<PriceSort | null>(null);
  const filtersActive = category.length > 0 || priceRange != null || sort != null;

  // Las categorías son de CADA súper → al cambiar de súper el filtro deja de
  // tener sentido y se limpia (precio/orden sí sobreviven, son universales).
  useEffect(() => { setCategory([]); }, [store]);

  // View mode controlado: el toggle vive en la fila de búsqueda (ambos modos).
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [chromeH, setChromeH] = useState(0);

  const cacheKey = `${store}:${region ?? 'none'}:${postalCode ?? 'none'}`;
  useEffect(() => {
    if (cache[cacheKey]) { setLoading(false); setError(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchWeeklyNewProducts(store, region, postalCode)
      .then((items) => { if (!cancelled) setCache((c) => ({ ...c, [cacheKey]: items })); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // cache a propósito fuera de deps: solo dispara al cambiar de súper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, region, postalCode, cacheKey]);

  const base = cache[cacheKey] ?? [];

  // Categorías disponibles en las novedades del súper activo (únicas, ordenadas).
  const categories = useMemo(() => {
    const set = new Set<string>();
    base.forEach((p) => { if (p.categoryName) set.add(p.categoryName); });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }, [base]);

  // Búsqueda + filtros + orden. Sin orden elegido se respeta el orden en que
  // llegan (curado en Mercadona); con orden por precio, los sin precio al final.
  const products = useMemo(() => {
    const words = stripAccents(query).trim().split(/\s+/).filter((w) => w.length >= 2);
    const range = priceRange != null ? PRICE_RANGES[priceRange] : null;
    let out = base.filter((p) => {
      if (category.length > 0 && (p.categoryName == null || !category.includes(p.categoryName))) return false;
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
    if (sort) {
      out = [...out].sort((a, b) => {
        const pa = a.unitPrice ?? Infinity;
        const pb = b.unitPrice ?? Infinity;
        if (pa === pb) return 0;
        if (pa === Infinity) return 1;
        if (pb === Infinity) return -1;
        return sort === 'asc' ? pa - pb : pb - pa;
      });
    }
    return out;
  }, [base, query, category, priceRange, sort]);

  // Chrome de la pantalla (banner + cabecera + selector + fila de búsqueda),
  // idéntico en ambos modos salvo el back sin caja sobre el cristal y el toggle
  // (SlidingSegments en glass / pastilla estática en fallback, como el catálogo).
  const chrome = (
    <>
      <ActiveCartBanner topInset nameOnly />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('newArrivals.title')}</Text>
        {stores.length > 1 ? (
          <StoreDropdown stores={stores} value={store} onChange={setStore} />
        ) : (
          <View style={{ width: 38 }} />
        )}
      </View>

      {/* Fila filtros + buscador + toggle (mismo diseño que el catálogo). */}
      <View style={styles.searchRow}>
        <TouchableOpacity
          style={[styles.filterBtn, filtersActive && styles.filterBtnOn]}
          onPress={() => setFilterOpen(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('filters.a11yOpen')}
        >
          <Ionicons name="options-outline" size={20} color={filtersActive ? colors.white : colors.ink} />
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
        {glassAvailable ? (
          <SlidingSegments
            compact
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
        loading={loading}
        error={error}
        emptyText={filtersActive || query.trim().length > 0 ? t('filters.noMatches') : t('newArrivals.empty')}
        errorText={t('newArrivals.error')}
        keepOrder
        topInset={glassAvailable ? chromeH : 0}
        hideToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
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
        onSort={setSort}
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

  // ── Header (mismo patrón que Favoritos) ───────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10, gap: 12,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  // Sobre el cristal, sin caja (evita glass anidado; como en Cambios de precios).
  backBtnGlass: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3, textAlign: 'center' },

  // ── Fila filtros + buscador (diseño del catálogo) ─────────────
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8,
  },
  filterBtn: {
    width: 46, height: 46, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  filterBtnOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 16, paddingVertical: 13,
    gap: 11,
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

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0 },
  chromeGlass: { paddingBottom: 10 },
});
