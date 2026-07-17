import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import {
  fetchStoreOffers, fetchOfferCategories, OFFER_STORES,
  type BrowseCursor, type StoreOffer, type OfferFilters,
} from '../api/catalog';
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

const euro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

/**
 * OffersScreen — "Ofertas" (botón de la cabecera del Home, junto a Novedades y
 * Cambios de precios). Lista las ofertas vivas del súper: promos de lote ("3x2",
 * "2ª unidad -70%"…) y descuentos directos ("Antes X €"), en la línea secundaria
 * de cada fila. La exponen los súpers de OFFER_STORES (Carrefour vía badges de
 * promo; BonpreuEsclat vía su categoría "Ofertas"; Consum solo cuando su API
 * marca explícitamente OFFER_PRICE; Plusfresc vía sus copias Oferta2; HiperDino
 * vía su precio regular tachado; Aldi vía precio tachado y vigencia de Algolia)
 * y el selector alterna entre
 * ellos; no se filtra por la preferencia de súpers del usuario porque quien solo
 * usa otro súper también puede querer ver ofertas. A diferencia de Novedades
 * (~100 filas), aquí hay miles → paginación keyset de servidor (onEndReached),
 * todas alcanzables. Requiere las migraciones carrefour_offers.sql /
 * bonpreu_offers.sql / consum_offers.sql / plusfresc_offers.sql /
 * hiperdino_offers.sql / aldi_offers.sql (sin ellas la query falla por columna
 * inexistente).
 *
 * Bajo la cabecera va la fila buscador + filtros (mismo diseño que Novedades y
 * la pestaña Productos del catálogo): botón de filtros a la IZQUIERDA
 * (categorías con oferta viva, rango de precio y orden por precio, en
 * ProductFilterSheet), búsqueda por nombre y toggle lista/cuadrícula. Aquí los
 * filtros van EN LA QUERY (OfferFilters): filtrar solo lo ya paginado enseñaría
 * resultados a medias, así que cada cambio recarga la primera página.
 *
 * Liquid Glass (F3): mismo patrón que Novedades/Cambios de precios — el chrome
 * entero en franja de cristal flotante y la lista refractándose por debajo.
 */
export default function OffersScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { profile } = useProfile();
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;

  const preferredStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const enabledInRegion = preferredStores.filter((store) => storeInRegion(store, region));
  const allowedStores = enabledInRegion.length > 0 ? enabledInRegion : storesForRegion(region);
  const stores = useMemo(
    () => CATALOG_STORES.filter((s) => OFFER_STORES.includes(s.key) && allowedStores.includes(s.key)),
    [allowedStores],
  );
  const [store, setStore] = useState<CatalogStore>(stores[0]?.key ?? 'carrefour');

  const [items, setItems] = useState<StoreOffer[]>([]);
  const [cursor, setCursor] = useState<BrowseCursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  // Descarta respuestas de una carga anterior (cambio de súper/filtros o desmontaje).
  const loadSeq = useRef(0);

  // Búsqueda y filtros (server-side; ver OfferFilters). La búsqueda se debouncea
  // para no lanzar una query por tecla.
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [category, setCategory] = useState<string[]>([]); // multi; [] = todas
  const [priceRange, setPriceRange] = useState<number | null>(null); // índice en PRICE_RANGES
  const [sort, setSort] = useState<PriceSort | null>(null);
  const filtersActive = category.length > 0 || priceRange != null || sort != null;

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  // Las categorías son de CADA súper → se limpian al cambiar (precio/orden no).
  useEffect(() => { setCategory([]); }, [store]);

  const filters: OfferFilters = useMemo(() => ({
    search: debouncedQuery,
    categories: category,
    priceMin: priceRange != null ? PRICE_RANGES[priceRange].min : null,
    priceMax: priceRange != null ? PRICE_RANGES[priceRange].max : null,
    sort,
  }), [debouncedQuery, category, priceRange, sort]);

  // Categorías con oferta viva del súper activo (para la hoja de filtros),
  // cacheadas por súper para no repetir el agregado al alternar en el selector.
  const [categoriesCache, setCategoriesCache] = useState<Record<string, string[]>>({});
  const categoriesKey = `${store}:${region ?? 'none'}:${postalCode ?? 'none'}`;
  useEffect(() => {
    if (categoriesCache[categoriesKey]) return;
    let cancelled = false;
    fetchOfferCategories(store, region, postalCode)
      .then((cats) => { if (!cancelled) setCategoriesCache((c) => ({ ...c, [categoriesKey]: cats })); })
      .catch(() => {});
    return () => { cancelled = true; };
    // cache a propósito fuera de deps: solo dispara al cambiar de súper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, region, postalCode, categoriesKey]);

  // Solo en glass: view mode controlado (el toggle vive en el chrome de cristal)
  // y alto medido del chrome para que la lista pase por debajo.
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [chromeH, setChromeH] = useState(0);

  // Primera página: recarga al cambiar de súper Y al cambiar cualquier filtro
  // (el keyset arranca de cero con las nuevas condiciones).
  useEffect(() => {
    const seq = ++loadSeq.current;
    setItems([]);
    setCursor(null);
    setLoading(true);
    setError(false);
    fetchStoreOffers(store, null, region, postalCode, 50, filters)
      .then((page) => {
        if (loadSeq.current !== seq) return;
        setItems(page.items);
        setCursor(page.nextCursor);
      })
      .catch(() => { if (loadSeq.current === seq) setError(true); })
      .finally(() => { if (loadSeq.current === seq) setLoading(false); });
  }, [store, filters, region, postalCode]);

  // Páginas siguientes al llegar al final (cursor null = no hay más).
  const loadMore = useCallback(() => {
    if (!cursor || loading || loadingMore) return;
    const seq = loadSeq.current;
    setLoadingMore(true);
    fetchStoreOffers(store, cursor, region, postalCode, 50, filters)
      .then((page) => {
        if (loadSeq.current !== seq) return;
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      })
      .catch(() => {}) // fallo de red al paginar: se reintenta al volver a llegar al final
      .finally(() => { if (loadSeq.current === seq) setLoadingMore(false); });
  }, [store, filters, region, postalCode, cursor, loading, loadingMore]);

  // El TIPO de oferta ("3x2", "2ª ud. -70%"…) se resalta en rojo ARRIBA del
  // nombre (offerTag); el precio anterior ("Antes 2,95 €") va en la línea gris.
  // El €/unidad se omite para dejarle todo el ancho (igual que Cambios de precios).
  const products: UIProduct[] = useMemo(
    () => items.map((o) => ({
      ...o.product,
      offerTag: o.promoName || null,
      metaLabel: o.prevPrice != null ? t('offers.before', { price: euro(o.prevPrice) }) : null,
      pricePerUnitLabel: null,
    })),
    [items, t],
  );

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
        <Text style={styles.title}>{t('offers.title')}</Text>
        {/* Siempre visible (aunque haya un solo súper con ofertas): es lo que dice
            de qué súper son las ofertas que se están viendo. */}
        <StoreDropdown stores={stores} value={store} onChange={setStore} />
      </View>

      {/* Fila filtros + buscador + toggle (mismo diseño que Novedades/catálogo). */}
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
        emptyText={filtersActive || query.trim().length > 0 ? t('filters.noMatches') : t('offers.empty')}
        errorText={t('offers.error')}
        keepOrder
        onEndReached={loadMore}
        loadingMore={loadingMore}
        topInset={glassAvailable ? chromeH : 0}
        hideToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {/* Hoja de filtros: categorías / precio / orden, recarga la query en vivo. */}
      <ProductFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
          categories={categoriesCache[categoriesKey] ?? []}
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

  // ── Header (mismo patrón que Novedades/Cambios de precios) ─────
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
