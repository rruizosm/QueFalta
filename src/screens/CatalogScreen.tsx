import React, { useEffect, useState } from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { getMeta } from '../constants/categoryMeta';
import {
  fetchCategories,
  fetchCategoryDetail,
  flattenProducts,
  formatPrice,
  type N1Category,
  type MercadonaProduct,
} from '../api/mercadona';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import ActionSheet from '../components/ActionSheet';
import ProductDetailModal from '../components/ProductDetailModal';

const STORES = [
  { key: 'mercadona', name: 'Mercadona',     icon: require('../../assets/stores/mercadona.png') },
  { key: 'esclat',    name: 'BonpreuEsclat', icon: require('../../assets/stores/bonpreuesclat.png') },
] as const;

type StoreKey = (typeof STORES)[number]['key'];

export default function CatalogScreen() {
  const navigation = useNavigation<any>();
  const { isCategoryFavorite, toggleCategoryFavorite } = useFavorites();
  const toast = useToast();
  const [sheetCat, setSheetCat] = useState<N1Category | null>(null);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('mercadona');
  const [tab, setTab] = useState<'categorias' | 'productos'>('categorias');

  const [categories, setCategories] = useState<N1Category[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [catError, setCatError] = useState(false);
  const [catSearch, setCatSearch] = useState('');

  const [prodSearch, setProdSearch] = useState('');
  const [allProducts, setAllProducts] = useState<MercadonaProduct[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodLoaded, setProdLoaded] = useState(false);
  const [prodError, setProdError] = useState(false);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCatError(true))
      .finally(() => setCatLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'productos' || prodLoaded || prodLoading || categories.length === 0) return;
    setProdLoading(true);
    const n2Ids = categories.flatMap((cat) => cat.categories.map((sub) => sub.id));
    Promise.all(n2Ids.map((id) => fetchCategoryDetail(id).then(flattenProducts)))
      .then((results) => { setAllProducts(results.flat()); setProdLoaded(true); })
      .catch(() => setProdError(true))
      .finally(() => setProdLoading(false));
  }, [tab, categories]);

  const filteredCats = categories.filter((c) =>
    c.name.toLowerCase().includes(catSearch.toLowerCase())
  );
  const filteredProducts = allProducts.filter((p) =>
    p.display_name.toLowerCase().includes(prodSearch.toLowerCase())
  );

  const goToSubcategories = (cat: N1Category) => {
    setSheetCat(null);
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.categories,
    });
  };

  const handleToggleCategory = async (cat: N1Category) => {
    setSheetCat(null);
    const { emoji, color } = getMeta(cat.name);
    try {
      const added = await toggleCategoryFavorite({ refId: String(cat.id), name: cat.name, emoji, color });
      toast.show(added ? `${cat.name} en favoritos` : `${cat.name} quitada de favoritos`);
    } catch {
      toast.show('No se pudo actualizar el favorito.', 'error');
    }
  };

  const renderCategory = ({ item }: { item: N1Category }) => {
    const { emoji, color } = getMeta(item.name);
    const fav = isCategoryFavorite(String(item.id));
    return (
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.rowBody}
          onPress={() => goToSubcategories(item)}
          activeOpacity={0.8}
        >
          <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
            <Text style={styles.thumbnailEmoji}>{emoji}</Text>
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowName}>{item.name}</Text>
            <Text style={styles.rowSub}>{item.categories.length} subcategorías</Text>
          </View>
        </TouchableOpacity>
        {fav && <Ionicons name="star" size={15} color={colors.accent} style={styles.favStar} />}
        <TouchableOpacity onPress={() => setSheetCat(item)} hitSlop={8} style={styles.moreBtn} activeOpacity={0.7}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkSoft} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderProduct = ({ item }: { item: MercadonaProduct }) => (
    <TouchableOpacity style={styles.productRow} activeOpacity={0.7} onPress={() => setDetailProductId(item.id)}>
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.display_name}</Text>
        <Text style={styles.productSub}>{item.packaging}</Text>
      </View>
      <Text style={styles.productPrice}>{formatPrice(item as any)}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      <View style={styles.headerArea}>
        <Text style={styles.title}>Catálogo</Text>
      </View>

      {/* Store switcher */}
      <View style={styles.stores}>
        {STORES.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.storeBtn, store === s.key && styles.storeBtnActive]}
            onPress={() => setStore(s.key)}
            activeOpacity={0.8}
          >
            <Image source={s.icon} style={styles.storeIcon} resizeMode="cover" />
            <Text style={[styles.storeText, store === s.key && styles.storeTextActive]}>
              {s.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {store === 'esclat' ? (
        <View style={styles.comingSoon}>
          <Image
            source={require('../../assets/stores/bonpreuesclat.png')}
            style={styles.comingSoonImage}
            resizeMode="contain"
          />
          <Text style={styles.comingSoonTitle}>BonpreuEsclat — Próximamente</Text>
          <Text style={styles.comingSoonText}>
            Estamos trabajando para traerte el catálogo de BonpreuEsclat. De momento puedes
            comprar con el catálogo de Mercadona.
          </Text>
        </View>
      ) : tab === 'categorias' ? (
        <>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar categorías..."
              placeholderTextColor={colors.inkFaint}
              value={catSearch}
              onChangeText={setCatSearch}
              returnKeyType="search"
            />
            {catSearch.length > 0 && (
              <TouchableOpacity onPress={() => setCatSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
              </TouchableOpacity>
            )}
          </View>
          {catLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : catError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>No se pudo cargar el catálogo.</Text>
              <TouchableOpacity onPress={() => {
                setCatError(false); setCatLoading(true);
                fetchCategories().then(setCategories).catch(() => setCatError(true)).finally(() => setCatLoading(false));
              }}>
                <Text style={styles.retryText}>Reintentar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={filteredCats}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderCategory}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      ) : (
        <>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color={colors.inkSoft} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar productos..."
              placeholderTextColor={colors.inkFaint}
              value={prodSearch}
              onChangeText={setProdSearch}
              returnKeyType="search"
              autoFocus
            />
            {prodSearch.length > 0 && (
              <TouchableOpacity onPress={() => setProdSearch('')}>
                <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
              </TouchableOpacity>
            )}
          </View>
          {prodLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : prodError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>Error al buscar productos.</Text>
            </View>
          ) : filteredProducts.length === 0 ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>
                {prodSearch.trim() ? 'Sin resultados.' : 'Cargando productos...'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredProducts}
              keyExtractor={(item) => item.id}
              renderItem={renderProduct}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {sheetCat && (
        <ActionSheet
          visible
          onClose={() => setSheetCat(null)}
          leading={{ type: 'emoji', ...getMeta(sheetCat.name) }}
          title={sheetCat.name}
          subtitle={`${sheetCat.categories.length} subcategorías`}
          actions={[
            { icon: 'list-outline', label: 'Ver subcategorías', onPress: () => goToSubcategories(sheetCat) },
            isCategoryFavorite(String(sheetCat.id))
              ? { icon: 'star', label: 'Quitar de favoritos', tint: colors.accent, onPress: () => handleToggleCategory(sheetCat) }
              : { icon: 'star-outline', label: 'Marcar como favorita', tint: colors.accent, onPress: () => handleToggleCategory(sheetCat) },
          ]}
        />
      )}

      <ProductDetailModal productId={detailProductId} onClose={() => setDetailProductId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  headerArea: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10 },
  title: {
    fontSize: 28, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3,
  },

  // ── Store switcher ────────────────────────────────────────────
  stores: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  storeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  storeBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  storeIcon: { width: 20, height: 20 },
  storeText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.inkSoft },
  storeTextActive: { color: colors.accent },

  // ── Coming soon (Esclat) ──────────────────────────────────────
  comingSoon: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  comingSoonImage: { width: 64, height: 64 },
  comingSoonTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  comingSoonText: {
    fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft,
    textAlign: 'center', lineHeight: 20,
  },

  // ── Tab switcher ──────────────────────────────────────────────
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: colors.surfaceAlt,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1, paddingVertical: 8, alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.white },
  tabText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft },
  tabTextActive: { color: colors.ink },

  // ── Search ────────────────────────────────────────────────────
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    marginHorizontal: 16, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 11,
    gap: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: {
    flex: 1, fontSize: 14, color: colors.ink, padding: 0,
    fontFamily: fonts.medium,
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
  rowContent: { flex: 1 },
  rowName: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  rowSub: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },

  // ── Product rows ──────────────────────────────────────────────
  productRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    padding: 11, gap: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  productInfo: { flex: 1 },
  productName: { fontSize: 13, fontFamily: fonts.semibold, color: colors.ink },
  productSub: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  productPrice: { fontSize: 13, fontFamily: fonts.bold, color: colors.accent },
  favStar: { marginRight: 4 },

  // ── States ────────────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
});
