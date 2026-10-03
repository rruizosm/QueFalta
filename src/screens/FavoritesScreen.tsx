import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, FlatList, LayoutAnimation, Platform, StatusBar, StyleSheet,
  Text, TextInput, TouchableOpacity, UIManager, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useFavoriteCategoryOpener } from '../hooks/useFavoriteCategoryOpener';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { favoriteToUI } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import type { FavoriteCategory } from '../types';
import StoreProductList from '../components/StoreProductList';
import StoreDropdown from '../components/StoreDropdown';
import { type ViewMode } from '../components/ViewModeToggle';
import ActionSheet from '../components/ActionSheet';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';
import { useProfile } from '../context/ProfileContext';
import { limitsApply } from '../constants/limits';
import { useReducedMotion } from '../hooks/useReducedMotion';
import PaywallModal from '../components/PaywallModal';
import { useCatalogStore } from '../context/CatalogStoreContext';

type PriceSort = 'asc' | 'desc';
type ProductSortSegment = 'priceAsc' | 'priceDesc' | 'pricePerUnitAsc' | 'pricePerUnitDesc';

// Misma normalización que la búsqueda del catálogo (el buscador de productos
// ahora vive en el chrome y filtra aquí, no en StoreProductList).
const stripAccents = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * FavoritesScreen — destino del botón Favoritos de Inicio. MISMO diseño que el
 * catálogo: fila de pestañas Productos/Categorías + selector de súper como chip
 * redondo aparte (abre la rejilla de súpers a pantalla completa en 2 columnas),
 * buscador redondeado en el chrome (el de productos con el toggle
 * lista/cuadrícula al lado), y en iOS 26 (glass) todo el chrome vive en una
 * franja de cristal flotante bajo la que se refracta la lista (topInset).
 * El selector solo lista los súpers que tengan algún favorito.
 */
export default function FavoritesScreen() {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const headerTop = useHeaderTopPadding(52);
  const { categories: favCategories, products: favProducts, toggleCategoryFavorite } = useFavorites();
  const { openFavCategory } = useFavoriteCategoryOpener();
  const bottomPad = useTabBarBottomPadding(20);
  const toast = useToast();
  const { isPremium, loading: profileLoading } = useProfile();
  const { favoriteStore } = useCatalogStore();

  const [store, setStore] = useState<CatalogStore>('mercadona');
  const favoriteDefaultApplied = useRef(false);
  const [tab, setTab] = useState<'categorias' | 'productos'>('productos');
  const [catSearch, setCatSearch] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sheetCat, setSheetCat] = useState<FavoriteCategory | null>(null);
  const [sort, setSort] = useState<PriceSort>('asc');
  const [pricePerUnitSort, setPricePerUnitSort] = useState<PriceSort | null>(null);
  const [productSearchExpanded, setProductSearchExpanded] = useState(false);
  const [queryInHeader, setQueryInHeader] = useState(false);
  const [sortPaywallVisible, setSortPaywallVisible] = useState(false);
  const unitPriceSortLocked = !profileLoading && limitsApply(isPremium);
  const activeSortSegment: ProductSortSegment = pricePerUnitSort
    ? `pricePerUnit${pricePerUnitSort === 'asc' ? 'Asc' : 'Desc'}`
    : `price${sort === 'asc' ? 'Asc' : 'Desc'}`;

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
  };

  useEffect(() => {
    if (unitPriceSortLocked && pricePerUnitSort != null) {
      setPricePerUnitSort(null);
      setSort('asc');
    }
  }, [pricePerUnitSort, unitPriceSortLocked]);

  const queryReveal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const target = queryInHeader && prodSearch.trim().length > 0 ? 1 : 0;
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
  }, [prodSearch, queryInHeader, queryReveal, reducedMotion]);

  const handleProductScrollBegin = () => {
    const shouldShowHeaderQuery = prodSearch.trim().length > 0;
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

  // Selector de súper: chip redondo con el logo → panel a pantalla completa
  // (rejilla en 2 columnas, mismo diseño que el catálogo).

  // Liquid Glass (F3): chrome en franja de cristal flotante; la lista pasa por
  // debajo con topInset = altura medida. En fallback, chrome en flujo normal.
  const [chromeH, setChromeH] = useState(0);
  const glassInset = glassAvailable ? chromeH : 0;

  // Súpers con al menos un favorito (categoría o producto), en orden canónico.
  const favStoreKeys = useMemo(() => {
    const set = new Set<CatalogStore>();
    favCategories.forEach((c) => set.add(c.store));
    favProducts.forEach((p) => set.add(p.store));
    return CATALOG_STORE_KEYS.filter((k) => set.has(k));
  }, [favCategories, favProducts]);
  const favStores = useMemo(
    () => CATALOG_STORES.filter((s) => favStoreKeys.includes(s.key)),
    [favStoreKeys],
  );

  // Al entrar, prioriza el súper favorito si tiene contenido guardado. Si la
  // tienda activa deja de tener favoritos, salta a la primera disponible.
  useEffect(() => {
    if (!favoriteDefaultApplied.current
      && favoriteStore && favStoreKeys.includes(favoriteStore)) {
      favoriteDefaultApplied.current = true;
      setStore(favoriteStore);
      return;
    }
    if (favStoreKeys.length > 0 && !favStoreKeys.includes(store)) {
      setStore(favStoreKeys[0]);
    }
  }, [favoriteStore, favStoreKeys, store]);

  // Favoritos de la tienda activa, filtrados por el buscador de cada pestaña.
  const shownCategories = useMemo(
    () => favCategories.filter(
      (c) => c.store === store && c.name.toLowerCase().includes(catSearch.trim().toLowerCase()),
    ),
    [favCategories, store, catSearch],
  );
  // Productos: el buscador vive en el chrome (como el catálogo) → se filtra aquí
  // (todas las palabras ≥2 letras, sin acentos); StoreProductList recibe la
  // consulta solo para ordenar por relevancia.
  const shownProducts = useMemo(() => {
    const base = favProducts.filter((p) => p.store === store).map(favoriteToUI);
    const words = stripAccents(prodSearch).trim().split(/\s+/).filter((w) => w.length >= 2);
    const filtered = words.length === 0 ? base : base.filter((p) => {
      const name = stripAccents(p.name);
      return words.every((w) => name.includes(w));
    });
    const activeSort = pricePerUnitSort ?? sort;
    return [...filtered].sort((a, b) => {
      const priceA = pricePerUnitSort ? a.pricePerUnit : a.unitPrice;
      const priceB = pricePerUnitSort ? b.pricePerUnit : b.unitPrice;
      if (priceA == null && priceB != null) return 1;
      if (priceA != null && priceB == null) return -1;
      const difference = (priceA ?? 0) - (priceB ?? 0);
      if (difference !== 0) return activeSort === 'asc' ? difference : -difference;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }, [favProducts, store, prodSearch, pricePerUnitSort, sort]);
  const prodSearching = prodSearch.trim().length >= 2;

  const handleRemoveCategory = async (c: FavoriteCategory) => {
    setSheetCat(null);
    try {
      await toggleCategoryFavorite(c);
      toast.show(t('catalog.favRemoved', { name: c.name }));
    } catch {
      toast.show(t('catalog.favError'), 'error');
    }
  };

  const searchBar = (placeholder: string, value: string, onChange: (s: string) => void) => (
    <View style={styles.searchBar}>
      <Ionicons name="search-outline" size={18} color={colors.inkSoft} />
      <TextInput
        style={styles.searchInput}
        placeholder={placeholder}
        placeholderTextColor={colors.inkFaint}
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
        </TouchableOpacity>
      )}
    </View>
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

  const productSearchRow = (
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
                value={prodSearch}
                onChangeText={setProdSearch}
                onFocus={() => setProductSearchFocus(true)}
                onBlur={() => setProductSearchFocus(false)}
                returnKeyType="search"
                autoCorrect={false}
                autoFocus
              />
              {prodSearch.length > 0 && (
                <TouchableOpacity onPress={() => setProdSearch('')} accessibilityRole="button" accessibilityLabel={t('common.clear')}>
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
        <Text style={styles.prodSearchQuery} numberOfLines={1}>{prodSearch.trim()}</Text>
      </Animated.View>
    </View>
  );

  const renderCategory = ({ item }: { item: FavoriteCategory }) => (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowBody} onPress={() => openFavCategory(item)} activeOpacity={0.8}>
        <View style={[styles.thumbnail, { backgroundColor: item.color + '1e' }]}>
          <Text style={styles.thumbnailEmoji}>{item.emoji}</Text>
        </View>
        <Text style={styles.rowName} numberOfLines={2}>{item.name}</Text>
      </TouchableOpacity>
      <Ionicons name="star" size={15} color={colors.accent} style={styles.favStar} />
      <TouchableOpacity onPress={() => setSheetCat(item)} hitSlop={8} style={styles.moreBtn} activeOpacity={0.7}>
        <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkSoft} />
      </TouchableOpacity>
    </View>
  );

  const catSearching = catSearch.trim().length > 0;

  // Selector de súper compacto: chip redondo con solo el logo del súper activo,
  // como bloque aparte en la fila de pestañas (igual que el catálogo).
  // Chrome de la pantalla (cabecera + pestañas/selector + buscador),
  // idéntico en ambos modos; en glass va dentro de la franja de cristal.
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
        <Text style={styles.title} numberOfLines={1}>{t('home.yourFavorites')}</Text>
        {favStores.length > 0 ? (
          <StoreDropdown stores={favStores} value={store} onChange={setStore} labeled />
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      {/* Fila única: pestañas Productos/Categorías (flex) + selector de súper
          como bloque aparte a la derecha (mismo patrón que el catálogo). */}
      <View style={styles.controlsRow}>
        {glassAvailable || Platform.OS === 'android' ? (
          <SlidingSegments
            style={{ flex: 1 }}
            emphasized={Platform.OS === 'android'}
            transparentTrack={Platform.OS === 'android'}
            segments={[
              { key: 'productos', label: t('catalog.tabProducts'), icon: 'cube-outline' },
              { key: 'categorias', label: t('catalog.tabCategories'), icon: 'grid-outline' },
            ]}
            value={tab}
            onChange={setTab}
          />
        ) : (
          <View style={styles.seg}>
            <TouchableOpacity
              style={[styles.segBtn, tab === 'productos' && styles.segBtnOn]}
              onPress={() => setTab('productos')}
              activeOpacity={0.85}
            >
              <Ionicons name="cube-outline" size={16} color={tab === 'productos' ? colors.accent : colors.inkSoft} />
              <Text style={[styles.segTxt, tab === 'productos' ? styles.segTxtOn : styles.segTxtOff]}>{t('catalog.tabProducts')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segBtn, tab === 'categorias' && styles.segBtnOn]}
              onPress={() => setTab('categorias')}
              activeOpacity={0.85}
            >
              <Ionicons name="grid-outline" size={16} color={tab === 'categorias' ? colors.accent : colors.inkSoft} />
              <Text style={[styles.segTxt, tab === 'categorias' ? styles.segTxtOn : styles.segTxtOff]}>{t('catalog.tabCategories')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Buscador de la pestaña activa. */}
      {tab === 'categorias'
        ? searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)
        : productSearchRow}
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && chrome}

      {tab === 'categorias' ? (
        <>
          {shownCategories.length === 0 ? (
            <View style={styles.centerBox}>
              <Ionicons name={catSearching ? 'search' : 'star-outline'} size={36} color={colors.inkFaint} />
              <Text style={styles.emptyText}>
                {catSearching ? t('catalog.noResults') : t('favorites.noCats')}
              </Text>
              {!catSearching && <Text style={styles.emptyHint}>{t('favorites.markHint')}</Text>}
            </View>
          ) : (
            <FlatList
              data={shownCategories}
              keyExtractor={(item) => `${item.store}:${item.refId}`}
              renderItem={renderCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      ) : (
        <StoreProductList
          products={shownProducts}
          emptyText={prodSearching ? t('catalog.noResults') : t('favorites.noProds')}
          keepOrder
          hideToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          pageSize={50}
          topInset={glassInset}
          roundedCards
          onScrollBeginDrag={handleProductScrollBegin}
        />
      )}

      {/* Chrome de cristal: al FINAL del árbol para pintarse encima; la lista
          se refracta al pasar por debajo (topInset = altura medida). */}
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

      <PaywallModal visible={sortPaywallVisible} onClose={() => setSortPaywallVisible(false)} />

      {/* Panel de tiendas: rejilla a pantalla completa en DOS COLUMNAS, mismo
          diseño que el catálogo (solo súpers con favoritos). */}
      {sheetCat && (
        <ActionSheet
          visible
          onClose={() => setSheetCat(null)}
          leading={{ type: 'emoji', emoji: sheetCat.emoji, color: sheetCat.color }}
          title={sheetCat.name}
          actions={[
            { icon: 'list-outline', label: t('catalog.seeSubcategories'), onPress: () => { const c = sheetCat; setSheetCat(null); openFavCategory(c); } },
            { icon: 'star', label: t('catalog.removeFavorite'), tint: colors.accent, onPress: () => handleRemoveCategory(sheetCat) },
          ]}
        />
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  // Sobre el cristal, sin caja (evita glass anidado; como Cambios de precios).
  backBtnGlass: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, minWidth: 0, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  headerSpacer: { width: 38, height: 38 },

  // ── Fila de pestañas + selector de súper (un bloque aparte) ───
  controlsRow: {
    // Android puede medir esta fila como 0 durante el primer layout si su
    // único hijo es flex. Reservamos explícitamente la altura del segmentado
    // para que el buscador de abajo nunca se pinte encima.
    flexDirection: 'row', alignItems: 'center',
    minHeight: 44,
    marginHorizontal: 16, marginBottom: 8,
  },

  // ── Segmentado Productos/Categorías (pastilla blanca, Claude Design) ─
  seg: {
    flex: 1, flexDirection: 'row',
    minHeight: 44,
    backgroundColor: colors.surfaceAlt, borderRadius: 18, padding: 4, gap: 3,
  },
  segBtn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    height: 36, borderRadius: 14,
  },
  segBtnOn: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTxt: { fontSize: 14 },
  segTxtOn: { fontFamily: fonts.bold, color: colors.white },
  segTxtOff: { fontFamily: fonts.semibold, color: colors.inkSoft },

  // ── Store selector (avatar redondo con logo, sin anillo) ───────
  // ── Panel de tiendas: rejilla a pantalla completa (2 columnas) ─
  // ── Toggle lista/cuadrícula (pastilla redondeada, Claude Design) ─
  viewToggle: {
    flexDirection: 'row', gap: 5,
    backgroundColor: colors.surfaceAlt, padding: 5, borderRadius: 14,
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

  // ── Search (redondeado, con sombra suave — Claude Design) ─────
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16, marginBottom: 8,
    height: glassAvailable ? 40 : 44, paddingHorizontal: 16,
    gap: 11,
    borderRadius: 18,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0, fontFamily: fonts.medium },
  prodSearchBlock: { marginHorizontal: 16, marginBottom: 8 },
  prodSearchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
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

  // ── Category rows ─────────────────────────────────────────────
  list: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    padding: 11, gap: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreBtn: { padding: 2 },
  thumbnail: {
    width: 42, height: 42,
    alignItems: 'center', justifyContent: 'center',
  },
  thumbnailEmoji: { fontSize: 21 },
  rowName: { flex: 1, fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  favStar: { marginRight: 4 },

  // ── Empty state ───────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.inkSoft, textAlign: 'center' },
  emptyHint: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkFaint, textAlign: 'center' },

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0 },
  chromeGlass: { paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
