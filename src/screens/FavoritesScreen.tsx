import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Modal, Pressable, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useFavoriteCategoryOpener } from '../hooks/useFavoriteCategoryOpener';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { favoriteToUI } from '../lib/productAdapters';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import type { FavoriteCategory } from '../types';
import StoreProductList from '../components/StoreProductList';
import { type ViewMode } from '../components/ViewModeToggle';
import ActionSheet from '../components/ActionSheet';
import ActiveCartBanner from '../components/ActiveCartBanner';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';

// Misma normalización que la búsqueda del catálogo (el buscador de productos
// ahora vive en el chrome y filtra aquí, no en StoreProductList).
const stripAccents = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * FavoritesScreen — "Ver todo" de los favoritos del Inicio. MISMO diseño que el
 * catálogo: fila de pestañas Productos/Categorías + selector de súper como chip
 * redondo aparte (abre la rejilla de súpers a pantalla completa en 2 columnas),
 * buscador redondeado en el chrome (el de productos con el toggle
 * lista/cuadrícula al lado), y en iOS 26 (glass) todo el chrome vive en una
 * franja de cristal flotante bajo la que se refracta la lista (topInset).
 * El selector solo lista los súpers que tengan algún favorito.
 */
export default function FavoritesScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { categories: favCategories, products: favProducts, toggleCategoryFavorite } = useFavorites();
  const { openFavCategory } = useFavoriteCategoryOpener();
  const bottomPad = useTabBarBottomPadding(20);
  const toast = useToast();

  const [store, setStore] = useState<CatalogStore>('mercadona');
  const [tab, setTab] = useState<'categorias' | 'productos'>('productos');
  const [catSearch, setCatSearch] = useState('');
  const [prodSearch, setProdSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sheetCat, setSheetCat] = useState<FavoriteCategory | null>(null);

  // Selector de súper: chip redondo con el logo → panel a pantalla completa
  // (rejilla en 2 columnas, mismo diseño que el catálogo).
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);

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
  const activeStore = CATALOG_STORES.find((s) => s.key === store) ?? favStores[0];

  // Si la tienda activa deja de tener favoritos, salta a la primera disponible.
  useEffect(() => {
    if (favStoreKeys.length > 0 && !favStoreKeys.includes(store)) {
      setStore(favStoreKeys[0]);
    }
  }, [favStoreKeys, store]);

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
    if (words.length === 0) return base;
    return base.filter((p) => {
      const name = stripAccents(p.name);
      return words.every((w) => name.includes(w));
    });
  }, [favProducts, store, prodSearch]);
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

  // Fila de búsqueda de productos: barra (flex) + toggle lista/cuadrícula, igual
  // que el catálogo (SlidingSegments compacto en glass; pastilla estática en fallback).
  const productSearchRow = (
    <View style={styles.prodSearchRow}>
      <View style={[styles.searchBar, styles.prodSearchBox]}>
        <Ionicons name="search-outline" size={18} color={colors.inkSoft} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('catalog.searchProducts')}
          placeholderTextColor={colors.inkFaint}
          value={prodSearch}
          onChangeText={setProdSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {prodSearch.length > 0 && (
          <TouchableOpacity onPress={() => setProdSearch('')}>
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
  const storeSelectorBlock = favStores.length > 1 && (
    <TouchableOpacity
      style={styles.selector}
      onPress={() => setStoreMenuOpen((o) => !o)}
      activeOpacity={0.8}
    >
      {activeStore?.icon ? (
        <Image source={activeStore.icon} style={styles.selectorLogo} resizeMode="cover" />
      ) : (
        <Ionicons name="storefront" size={22} color={colors.accent} />
      )}
    </TouchableOpacity>
  );

  // Chrome de la pantalla (banner + cabecera + pestañas/selector + buscador),
  // idéntico en ambos modos; en glass va dentro de la franja de cristal.
  const chrome = (
    <>
      <ActiveCartBanner topInset />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('home.yourFavorites')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Fila única: pestañas Productos/Categorías (flex) + selector de súper
          como bloque aparte a la derecha (mismo patrón que el catálogo). */}
      <View style={styles.controlsRow}>
        {glassAvailable ? (
          <SlidingSegments
            style={{ flex: 1 }}
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
        {storeSelectorBlock}
      </View>

      {/* Buscador de la pestaña activa. */}
      {tab === 'categorias'
        ? searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)
        : productSearchRow}
    </>
  );

  return (
    // Al tocar fuera de los buscadores (cabecera, pestañas, lista…) se cierra el teclado.
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
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
          searchQuery={prodSearch}
          hideToolbar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          pageSize={50}
          topInset={glassInset}
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

      {/* Panel de tiendas: rejilla a pantalla completa en DOS COLUMNAS, mismo
          diseño que el catálogo (solo súpers con favoritos). */}
      <Modal
        visible={storeMenuOpen}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setStoreMenuOpen(false)}
      >
        <View style={[styles.storeSheet, { paddingTop: insets.top }]}>
          <View style={styles.storeSheetHeader}>
            <Text style={styles.storeSheetTitle}>{t('storePicker.title')}</Text>
            <TouchableOpacity style={styles.storeCloseBtn} onPress={() => setStoreMenuOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={favStores}
            keyExtractor={(s) => s.key}
            numColumns={2}
            extraData={store}
            columnWrapperStyle={styles.storeGridRow}
            contentContainerStyle={[styles.storeGrid, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const on = item.key === store;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.storeCard,
                    on && styles.storeCardActive,
                    pressed && styles.storeCardPressed,
                  ]}
                  onPress={() => { setStore(item.key); setStoreMenuOpen(false); }}
                >
                  {on && (
                    <View style={styles.storeCardCheck}>
                      <Ionicons name="checkmark" size={14} color={colors.white} />
                    </View>
                  )}
                  <View style={styles.storeCardLogoWrap}>
                    {item.icon ? (
                      <Image source={item.icon} style={styles.storeCardLogo} resizeMode="cover" />
                    ) : (
                      <Ionicons name="storefront" size={30} color={colors.accent} />
                    )}
                  </View>
                  <Text style={[styles.storeCardName, on && styles.storeCardNameActive]} numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>
              );
            }}
          />
        </View>
      </Modal>

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
    </TouchableWithoutFeedback>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header ────────────────────────────────────────────────────
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
  // Sobre el cristal, sin caja (evita glass anidado; como Cambios de precios).
  backBtnGlass: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3, textAlign: 'center' },

  // ── Fila de pestañas + selector de súper (un bloque aparte) ───
  controlsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
  },

  // ── Segmentado Productos/Categorías (pastilla blanca, Claude Design) ─
  seg: {
    flex: 1, flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: 16, padding: 5, gap: 6,
  },
  segBtn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: 12,
  },
  segBtnOn: {
    backgroundColor: colors.white,
    shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTxt: { fontSize: 14 },
  segTxtOn: { fontFamily: fonts.bold, color: colors.accent },
  segTxtOff: { fontFamily: fonts.semibold, color: colors.inkSoft },

  // ── Store selector (avatar redondo con logo, sin anillo) ───────
  selector: {
    width: 48, height: 48, borderRadius: 24, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  selectorLogo: { width: '100%', height: '100%' },

  // ── Panel de tiendas: rejilla a pantalla completa (2 columnas) ─
  storeSheet: { flex: 1, backgroundColor: colors.paper },
  storeSheetHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  storeSheetTitle: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  storeCloseBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  storeGrid: { padding: 16 },
  storeGridRow: { gap: 12, marginBottom: 12 },
  storeCard: {
    flex: 1, aspectRatio: 1,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingHorizontal: 10,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  storeCardActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  storeCardPressed: { transform: [{ scale: 0.96 }], opacity: 0.9 },
  storeCardCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  storeCardLogoWrap: {
    width: 56, height: 56, borderRadius: 28, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
  storeCardLogo: { width: '100%', height: '100%' },
  storeCardName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.ink, textAlign: 'center' },
  storeCardNameActive: { color: colors.accent },

  // ── Toggle lista/cuadrícula (pastilla redondeada, Claude Design) ─
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

  // ── Search (redondeado, con sombra suave — Claude Design) ─────
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 16, paddingVertical: 13,
    gap: 11,
    borderRadius: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0, fontFamily: fonts.medium },
  // Fila de búsqueda de productos: barra (flex) + toggle lista/cuadrícula.
  prodSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8,
  },
  // La barra dentro de la fila no lleva márgenes propios (los pone la fila).
  prodSearchBox: { flex: 1, marginHorizontal: 0, marginBottom: 0 },

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
  chromeGlass: { paddingBottom: 2 },
});
