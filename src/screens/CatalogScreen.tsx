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
  formatPrice,
  type N1Category,
  type MercadonaProduct,
} from '../api/mercadona';
import { searchProducts, searchBonpreuProducts, type BonpreuProduct } from '../api/catalog';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import ActionSheet from '../components/ActionSheet';
import ProductDetailModal from '../components/ProductDetailModal';
import BonpreuProductModal from '../components/BonpreuProductModal';

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

  // Búsqueda de productos Mercadona (espejo)
  const [prodSearch, setProdSearch] = useState('');
  const [prodResults, setProdResults] = useState<MercadonaProduct[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState(false);

  // Búsqueda de productos BonpreuEsclat (espejo)
  const [bpSearch, setBpSearch] = useState('');
  const [bpResults, setBpResults] = useState<BonpreuProduct[]>([]);
  const [bpLoading, setBpLoading] = useState(false);
  const [bpError, setBpError] = useState(false);
  const [bpDetail, setBpDetail] = useState<BonpreuProduct | null>(null);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCatError(true))
      .finally(() => setCatLoading(false));
  }, []);

  // Mercadona: búsqueda server-side con debounce (antes barría ~100 subcategorías).
  useEffect(() => {
    const q = prodSearch.trim();
    if (q.length < 2) { setProdResults([]); setProdError(false); setProdLoading(false); return; }
    setProdLoading(true); setProdError(false);
    const handle = setTimeout(() => {
      searchProducts(q).then(setProdResults).catch(() => setProdError(true)).finally(() => setProdLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [prodSearch]);

  // BonpreuEsclat: búsqueda server-side con debounce.
  useEffect(() => {
    const q = bpSearch.trim();
    if (q.length < 2) { setBpResults([]); setBpError(false); setBpLoading(false); return; }
    setBpLoading(true); setBpError(false);
    const handle = setTimeout(() => {
      searchBonpreuProducts(q).then(setBpResults).catch(() => setBpError(true)).finally(() => setBpLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [bpSearch]);

  const filteredCats = categories.filter((c) =>
    c.name.toLowerCase().includes(catSearch.toLowerCase())
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

  const renderBpProduct = ({ item }: { item: BonpreuProduct }) => (
    <TouchableOpacity style={styles.productRow} activeOpacity={0.7} onPress={() => setBpDetail(item)}>
      {item.thumbnail ? (
        <Image source={{ uri: item.thumbnail }} style={styles.bpThumb} resizeMode="contain" />
      ) : (
        <View style={[styles.bpThumb, styles.bpThumbEmpty]}>
          <Ionicons name="image-outline" size={18} color={colors.inkFaint} />
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>{item.displayName}</Text>
        <Text style={styles.productSub}>{item.priceFormat ?? item.packaging ?? ''}</Text>
      </View>
      <Text style={styles.productPrice}>
        {item.unitPrice != null ? `${item.unitPrice.toFixed(2).replace('.', ',')} €` : ''}
      </Text>
    </TouchableOpacity>
  );

  // Estados de un listado de búsqueda de productos (compartido).
  const renderSearchStates = (search: string, loading: boolean, error: boolean, empty: boolean, list: React.ReactNode) => {
    if (search.trim().length < 2)
      return <View style={styles.centerBox}><Text style={styles.errorText}>Escribe al menos 2 letras para buscar.</Text></View>;
    if (loading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />;
    if (error) return <View style={styles.centerBox}><Text style={styles.errorText}>Error al buscar productos.</Text></View>;
    if (empty) return <View style={styles.centerBox}><Text style={styles.errorText}>Sin resultados.</Text></View>;
    return list;
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
        autoFocus
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={() => onChange('')}>
          <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
        </TouchableOpacity>
      )}
    </View>
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

      {/* Tab switcher */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'categorias' && styles.tabActive]}
          onPress={() => setTab('categorias')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'categorias' && styles.tabTextActive]}>Categorías</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === 'productos' && styles.tabActive]}
          onPress={() => setTab('productos')}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, tab === 'productos' && styles.tabTextActive]}>Productos</Text>
        </TouchableOpacity>
      </View>

      {/* ── Mercadona ───────────────────────────────────────────── */}
      {store === 'mercadona' && tab === 'categorias' && (
        <>
          {searchBar('Buscar categorías...', catSearch, setCatSearch)}
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
      )}

      {store === 'mercadona' && tab === 'productos' && (
        <>
          {searchBar('Buscar productos...', prodSearch, setProdSearch)}
          {renderSearchStates(
            prodSearch, prodLoading, prodError, prodResults.length === 0,
            <FlatList
              data={prodResults}
              keyExtractor={(item) => item.id}
              renderItem={renderProduct}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              keyboardShouldPersistTaps="handled"
            />,
          )}
        </>
      )}

      {/* ── BonpreuEsclat ───────────────────────────────────────── */}
      {store === 'esclat' && tab === 'categorias' && (
        <View style={styles.comingSoon}>
          <Image
            source={require('../../assets/stores/bonpreuesclat.png')}
            style={styles.comingSoonImage}
            resizeMode="contain"
          />
          <Text style={styles.comingSoonTitle}>Categorías — próximamente</Text>
          <Text style={styles.comingSoonText}>
            Por ahora puedes buscar productos de BonpreuEsclat en la pestaña «Productos».
          </Text>
        </View>
      )}

      {store === 'esclat' && tab === 'productos' && (
        <>
          {searchBar('Buscar productos...', bpSearch, setBpSearch)}
          {renderSearchStates(
            bpSearch, bpLoading, bpError, bpResults.length === 0,
            <FlatList
              data={bpResults}
              keyExtractor={(item) => item.id}
              renderItem={renderBpProduct}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              keyboardShouldPersistTaps="handled"
            />,
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
      <BonpreuProductModal product={bpDetail} onClose={() => setBpDetail(null)} />
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

  // ── Coming soon (Esclat categorías) ───────────────────────────
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
  bpThumb: { width: 42, height: 42, backgroundColor: colors.white },
  bpThumbEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },

  // ── States ────────────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
});
