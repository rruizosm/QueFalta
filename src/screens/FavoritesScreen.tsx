import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, TextInput,
  StyleSheet, StatusBar, Modal, Pressable, Keyboard, TouchableWithoutFeedback,
  type LayoutRectangle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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
import ActionSheet from '../components/ActionSheet';
import ActiveCartBanner from '../components/ActiveCartBanner';

/**
 * FavoritesScreen — "Ver todo" de los favoritos del Inicio. Mismo funcionamiento
 * que el catálogo (selector de súper + pestañas Categorías / Productos + buscador)
 * pero acotado a lo que el usuario ha marcado como favorito. El selector solo
 * lista los súpers que tengan alguna categoría o producto favorito.
 */
export default function FavoritesScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { categories: favCategories, products: favProducts, toggleCategoryFavorite } = useFavorites();
  const { openFavCategory } = useFavoriteCategoryOpener();
  const bottomPad = useTabBarBottomPadding(20);
  const toast = useToast();

  const [store, setStore] = useState<CatalogStore>('mercadona');
  const [tab, setTab] = useState<'categorias' | 'productos'>('productos');
  const [catSearch, setCatSearch] = useState('');
  const [sheetCat, setSheetCat] = useState<FavoriteCategory | null>(null);

  // Selector de tienda colapsado (igual que el catálogo): solo se ve la activa;
  // al tocar despliega el resto en un menú anclado.
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [selectorBox, setSelectorBox] = useState<LayoutRectangle | null>(null);

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
  // El filtro por texto de Productos lo hace StoreProductList (prop `searchable`,
  // mismo buscador que las subcategorías, junto al toggle lista/cuadrícula).
  const shownProducts = useMemo(
    () => favProducts.filter((p) => p.store === store).map(favoriteToUI),
    [favProducts, store],
  );

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

  return (
    // Al tocar fuera de los buscadores (cabecera, pestañas, lista…) se cierra el teclado.
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ActiveCartBanner topInset />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('home.yourFavorites')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Selector de súper (solo los que tengan favoritos). */}
      {favStores.length > 1 && (
        <View
          style={styles.selectorWrap}
          onLayout={(e) => setSelectorBox(e.nativeEvent.layout)}
        >
          <TouchableOpacity
            style={styles.selector}
            onPress={() => setStoreMenuOpen((o) => !o)}
            activeOpacity={0.8}
          >
            {activeStore?.icon ? (
              <Image source={activeStore.icon} style={styles.selectorIcon} resizeMode="cover" />
            ) : (
              <Ionicons name="storefront" size={18} color={colors.accent} />
            )}
            <Text style={styles.selectorName} numberOfLines={1}>{activeStore?.name}</Text>
            <Ionicons
              name={storeMenuOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={colors.inkSoft}
            />
          </TouchableOpacity>
        </View>
      )}

      {/* Tab switcher */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'productos' && styles.tabActive]}
          onPress={() => setTab('productos')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'productos' && styles.tabTextActive]}>{t('catalog.tabProducts')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'categorias' && styles.tabActive]}
          onPress={() => setTab('categorias')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'categorias' && styles.tabTextActive]}>{t('catalog.tabCategories')}</Text>
        </TouchableOpacity>
      </View>

      {tab === 'categorias' ? (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
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
          emptyText={t('favorites.noProds')}
          searchable
          pageSize={50}
        />
      )}

      {/* Menú desplegable de súpers, anclado bajo el selector. */}
      <Modal
        visible={storeMenuOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setStoreMenuOpen(false)}
      >
        <Pressable style={styles.menuBackdrop} onPress={() => setStoreMenuOpen(false)}>
          {selectorBox && (
            <View style={[styles.menu, { top: selectorBox.y + selectorBox.height + 6 }]}>
              {favStores.map((s, i) => {
                const on = s.key === store;
                const last = i === favStores.length - 1;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.menuItem, !last && styles.menuItemBorder, on && styles.menuItemActive]}
                    onPress={() => { setStore(s.key); setStoreMenuOpen(false); }}
                    activeOpacity={0.7}
                  >
                    {s.icon ? (
                      <Image source={s.icon} style={styles.selectorIcon} resizeMode="cover" />
                    ) : (
                      <Ionicons name="storefront" size={18} color={colors.inkSoft} />
                    )}
                    <Text style={[styles.menuItemName, on && styles.menuItemNameActive]} numberOfLines={1}>
                      {s.name}
                    </Text>
                    {on && <Ionicons name="checkmark" size={18} color={colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </Pressable>
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
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3, textAlign: 'center' },

  // ── Store selector + menú desplegable ─────────────────────────
  selectorWrap: { marginHorizontal: 16, marginBottom: 10 },
  selector: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
  },
  selectorIcon: { width: 20, height: 20 },
  selectorName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },

  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItemActive: { backgroundColor: colors.accentLight },
  menuItemName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  menuItemNameActive: { color: colors.accent },

  // ── Tab switcher ──────────────────────────────────────────────
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: colors.surfaceAlt,
    padding: 3, gap: 3,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  tabActive: { backgroundColor: colors.white },
  tabText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft },
  tabTextActive: { color: colors.ink },

  // ── Search ────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 11, gap: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0, fontFamily: fonts.medium },

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
});
