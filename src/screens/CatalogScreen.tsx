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
import {
  searchProducts, searchBonpreuProducts, fetchBonpreuCategoryTree,
  searchCarrefourProducts, fetchCarrefourCategoryTree,
  searchBonareaProducts, fetchBonareaCategoryTree,
  searchConsumProducts, fetchConsumCategoryTree,
  searchDiaProducts, fetchDiaCategoryTree,
  type BonpreuProduct, type BonpreuCategory,
  type CarrefourProduct, type CarrefourCategory,
  type BonareaProduct, type BonareaCategory,
  type ConsumProduct, type ConsumCategory,
  type DiaProduct, type DiaCategory,
} from '../api/catalog';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import ActionSheet from '../components/ActionSheet';
import ProductImage from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import BonpreuProductModal from '../components/BonpreuProductModal';
import CarrefourProductModal from '../components/CarrefourProductModal';
import BonareaProductModal from '../components/BonareaProductModal';
import ConsumProductModal from '../components/ConsumProductModal';
import DiaProductModal from '../components/DiaProductModal';

// Las tiendas y sus metadatos viven en constants/stores.ts (fuente única
// compartida con la preferencia de perfil "Supermercados").
type StoreKey = CatalogStore;

/** Parte un array en grupos de tamaño n (rejilla de tiendas en filas de 2). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function CatalogScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { isCategoryFavorite, toggleCategoryFavorite } = useFavorites();
  const toast = useToast();
  const [sheetCat, setSheetCat] = useState<N1Category | null>(null);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [store, setStore] = useState<StoreKey>('mercadona');
  const [tab, setTab] = useState<'categorias' | 'productos'>('categorias');

  // Solo se muestran los supermercados elegidos en el perfil. Sin preferencia
  // (usuario antiguo / perfil aún cargando) → todos.
  const { profile } = useProfile();
  const enabledStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const visibleStores = CATALOG_STORES.filter((s) => enabledStores.includes(s.key));

  // Si la tienda activa deja de estar permitida, salta a la primera visible.
  useEffect(() => {
    if (enabledStores.length > 0 && !enabledStores.includes(store)) {
      setStore(enabledStores[0]);
    }
  }, [enabledStores, store]);

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

  // Categorías BonpreuEsclat (espejo)
  const [bpCats, setBpCats] = useState<BonpreuCategory[]>([]);
  const [bpCatsLoading, setBpCatsLoading] = useState(false);
  const [bpCatsError, setBpCatsError] = useState(false);

  // Búsqueda de productos Carrefour (espejo)
  const [cfSearch, setCfSearch] = useState('');
  const [cfResults, setCfResults] = useState<CarrefourProduct[]>([]);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState(false);
  const [cfDetail, setCfDetail] = useState<CarrefourProduct | null>(null);

  // Categorías Carrefour (espejo)
  const [cfCats, setCfCats] = useState<CarrefourCategory[]>([]);
  const [cfCatsLoading, setCfCatsLoading] = useState(false);
  const [cfCatsError, setCfCatsError] = useState(false);

  // Búsqueda de productos bonÀrea (espejo)
  const [baSearch, setBaSearch] = useState('');
  const [baResults, setBaResults] = useState<BonareaProduct[]>([]);
  const [baLoading, setBaLoading] = useState(false);
  const [baError, setBaError] = useState(false);
  const [baDetail, setBaDetail] = useState<BonareaProduct | null>(null);

  // Categorías bonÀrea (espejo)
  const [baCats, setBaCats] = useState<BonareaCategory[]>([]);
  const [baCatsLoading, setBaCatsLoading] = useState(false);
  const [baCatsError, setBaCatsError] = useState(false);

  // Búsqueda de productos Consum (espejo)
  const [csSearch, setCsSearch] = useState('');
  const [csResults, setCsResults] = useState<ConsumProduct[]>([]);
  const [csLoading, setCsLoading] = useState(false);
  const [csError, setCsError] = useState(false);
  const [csDetail, setCsDetail] = useState<ConsumProduct | null>(null);

  // Categorías Consum (espejo)
  const [csCats, setCsCats] = useState<ConsumCategory[]>([]);
  const [csCatsLoading, setCsCatsLoading] = useState(false);
  const [csCatsError, setCsCatsError] = useState(false);

  // Búsqueda de productos Dia (espejo)
  const [ddSearch, setDdSearch] = useState('');
  const [ddResults, setDdResults] = useState<DiaProduct[]>([]);
  const [ddLoading, setDdLoading] = useState(false);
  const [ddError, setDdError] = useState(false);
  const [ddDetail, setDdDetail] = useState<DiaProduct | null>(null);

  // Categorías Dia (espejo)
  const [ddCats, setDdCats] = useState<DiaCategory[]>([]);
  const [ddCatsLoading, setDdCatsLoading] = useState(false);
  const [ddCatsError, setDdCatsError] = useState(false);

  useEffect(() => {
    fetchCategories()
      .then(setCategories)
      .catch(() => setCatError(true))
      .finally(() => setCatLoading(false));
  }, []);

  // Carga perezosa de categorías Bonpreu la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'esclat' || bpCats.length > 0 || bpCatsLoading) return;
    setBpCatsLoading(true); setBpCatsError(false);
    fetchBonpreuCategoryTree()
      .then(setBpCats)
      .catch(() => setBpCatsError(true))
      .finally(() => setBpCatsLoading(false));
  }, [store]);

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

  // Carga perezosa de categorías Carrefour la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'carrefour' || cfCats.length > 0 || cfCatsLoading) return;
    setCfCatsLoading(true); setCfCatsError(false);
    fetchCarrefourCategoryTree()
      .then(setCfCats)
      .catch(() => setCfCatsError(true))
      .finally(() => setCfCatsLoading(false));
  }, [store]);

  // Carrefour: búsqueda server-side con debounce.
  useEffect(() => {
    const q = cfSearch.trim();
    if (q.length < 2) { setCfResults([]); setCfError(false); setCfLoading(false); return; }
    setCfLoading(true); setCfError(false);
    const handle = setTimeout(() => {
      searchCarrefourProducts(q).then(setCfResults).catch(() => setCfError(true)).finally(() => setCfLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [cfSearch]);

  // Carga perezosa de categorías bonÀrea la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'bonarea' || baCats.length > 0 || baCatsLoading) return;
    setBaCatsLoading(true); setBaCatsError(false);
    fetchBonareaCategoryTree()
      .then(setBaCats)
      .catch(() => setBaCatsError(true))
      .finally(() => setBaCatsLoading(false));
  }, [store]);

  // bonÀrea: búsqueda server-side con debounce.
  useEffect(() => {
    const q = baSearch.trim();
    if (q.length < 2) { setBaResults([]); setBaError(false); setBaLoading(false); return; }
    setBaLoading(true); setBaError(false);
    const handle = setTimeout(() => {
      searchBonareaProducts(q).then(setBaResults).catch(() => setBaError(true)).finally(() => setBaLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [baSearch]);

  // Carga perezosa de categorías Consum la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'consum' || csCats.length > 0 || csCatsLoading) return;
    setCsCatsLoading(true); setCsCatsError(false);
    fetchConsumCategoryTree()
      .then(setCsCats)
      .catch(() => setCsCatsError(true))
      .finally(() => setCsCatsLoading(false));
  }, [store]);

  // Consum: búsqueda server-side con debounce.
  useEffect(() => {
    const q = csSearch.trim();
    if (q.length < 2) { setCsResults([]); setCsError(false); setCsLoading(false); return; }
    setCsLoading(true); setCsError(false);
    const handle = setTimeout(() => {
      searchConsumProducts(q).then(setCsResults).catch(() => setCsError(true)).finally(() => setCsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [csSearch]);

  // Carga perezosa de categorías Dia la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'dia' || ddCats.length > 0 || ddCatsLoading) return;
    setDdCatsLoading(true); setDdCatsError(false);
    fetchDiaCategoryTree()
      .then(setDdCats)
      .catch(() => setDdCatsError(true))
      .finally(() => setDdCatsLoading(false));
  }, [store]);

  // Dia: búsqueda server-side con debounce.
  useEffect(() => {
    const q = ddSearch.trim();
    if (q.length < 2) { setDdResults([]); setDdError(false); setDdLoading(false); return; }
    setDdLoading(true); setDdError(false);
    const handle = setTimeout(() => {
      searchDiaProducts(q).then(setDdResults).catch(() => setDdError(true)).finally(() => setDdLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [ddSearch]);

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

  const goToBonpreuSubcategories = (cat: BonpreuCategory) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.children,
      retailer: 'esclat',
    });
  };

  const goToCarrefourSubcategories = (cat: CarrefourCategory) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.children,
      retailer: 'carrefour',
    });
  };

  const goToBonareaSubcategories = (cat: BonareaCategory) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.children,
      retailer: 'bonarea',
    });
  };

  const goToConsumSubcategories = (cat: ConsumCategory) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.children,
      retailer: 'consum',
    });
  };

  const goToDiaSubcategories = (cat: DiaCategory) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.children,
      retailer: 'dia',
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
        <ProductImage uri={item.thumbnail} style={styles.bpThumb} />
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

  const renderBpCategory = ({ item }: { item: BonpreuCategory }) => {
    const { emoji, color } = getMeta(item.name);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => goToBonpreuSubcategories(item)}>
        <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
          <Text style={styles.thumbnailEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowSub}>{item.children.length} subcategorías</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  };

  const renderCfProduct = ({ item }: { item: CarrefourProduct }) => {
    const price = item.priceFormat
      ?? (item.unitPrice != null ? `${item.unitPrice.toFixed(2).replace('.', ',')} €` : '');
    return (
      <TouchableOpacity style={styles.productRow} activeOpacity={0.7} onPress={() => setCfDetail(item)}>
        {item.thumbnail ? (
          <ProductImage uri={item.thumbnail} style={styles.bpThumb} />
        ) : (
          <View style={[styles.bpThumb, styles.bpThumbEmpty]}>
            <Ionicons name="image-outline" size={18} color={colors.inkFaint} />
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.displayName}</Text>
          <Text style={styles.productSub}>{item.pricePerUnit ?? ''}</Text>
        </View>
        <Text style={styles.productPrice}>{price}</Text>
      </TouchableOpacity>
    );
  };

  const renderCfCategory = ({ item }: { item: CarrefourCategory }) => {
    const { emoji, color } = getMeta(item.name);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => goToCarrefourSubcategories(item)}>
        <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
          <Text style={styles.thumbnailEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowSub}>{item.children.length} subcategorías</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  };

  const renderBaProduct = ({ item }: { item: BonareaProduct }) => {
    const price = item.priceFormat
      ?? (item.unitPrice != null ? `${item.unitPrice.toFixed(2).replace('.', ',')} €` : '');
    return (
      <TouchableOpacity style={styles.productRow} activeOpacity={0.7} onPress={() => setBaDetail(item)}>
        {item.thumbnail ? (
          <ProductImage uri={item.thumbnail} style={styles.bpThumb} />
        ) : (
          <View style={[styles.bpThumb, styles.bpThumbEmpty]}>
            <Ionicons name="image-outline" size={18} color={colors.inkFaint} />
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.displayName}</Text>
          <Text style={styles.productSub}>{item.pricePerUnit ?? ''}</Text>
        </View>
        <Text style={styles.productPrice}>{price}</Text>
      </TouchableOpacity>
    );
  };

  const renderBaCategory = ({ item }: { item: BonareaCategory }) => {
    const { emoji, color } = getMeta(item.name);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => goToBonareaSubcategories(item)}>
        <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
          <Text style={styles.thumbnailEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowSub}>{item.children.length} subcategorías</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  };

  const renderCsProduct = ({ item }: { item: ConsumProduct }) => {
    const price = item.priceFormat
      ?? (item.unitPrice != null ? `${item.unitPrice.toFixed(2).replace('.', ',')} €` : '');
    return (
      <TouchableOpacity style={styles.productRow} activeOpacity={0.7} onPress={() => setCsDetail(item)}>
        {item.thumbnail ? (
          <ProductImage uri={item.thumbnail} style={styles.bpThumb} />
        ) : (
          <View style={[styles.bpThumb, styles.bpThumbEmpty]}>
            <Ionicons name="image-outline" size={18} color={colors.inkFaint} />
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.displayName}</Text>
          <Text style={styles.productSub}>{item.pricePerUnit ?? item.packaging ?? ''}</Text>
        </View>
        <Text style={styles.productPrice}>{price}</Text>
      </TouchableOpacity>
    );
  };

  const renderCsCategory = ({ item }: { item: ConsumCategory }) => {
    const { emoji, color } = getMeta(item.name);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => goToConsumSubcategories(item)}>
        <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
          <Text style={styles.thumbnailEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowSub}>{item.children.length} subcategorías</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  };

  const renderDdProduct = ({ item }: { item: DiaProduct }) => {
    const price = item.priceFormat
      ?? (item.unitPrice != null ? `${item.unitPrice.toFixed(2).replace('.', ',')} €` : '');
    return (
      <TouchableOpacity style={styles.productRow} activeOpacity={0.7} onPress={() => setDdDetail(item)}>
        {item.thumbnail ? (
          <ProductImage uri={item.thumbnail} style={styles.bpThumb} />
        ) : (
          <View style={[styles.bpThumb, styles.bpThumbEmpty]}>
            <Ionicons name="image-outline" size={18} color={colors.inkFaint} />
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.displayName}</Text>
          <Text style={styles.productSub}>{item.pricePerUnit ?? ''}</Text>
        </View>
        <Text style={styles.productPrice}>{price}</Text>
      </TouchableOpacity>
    );
  };

  const renderDdCategory = ({ item }: { item: DiaCategory }) => {
    const { emoji, color } = getMeta(item.name);
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={() => goToDiaSubcategories(item)}>
        <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
          <Text style={styles.thumbnailEmoji}>{emoji}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName}>{item.name}</Text>
          <Text style={styles.rowSub}>{item.children.length} subcategorías</Text>
        </View>
        <Ionicons name="chevron-forward" size={17} color={colors.inkFaint} />
      </TouchableOpacity>
    );
  };

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

      {/* Store switcher en rejilla de 2 columnas (oculto si solo hay un super).
          La última fila impar lleva un único botón a ancho completo (flex: 1). */}
      {visibleStores.length > 1 && (
        <View style={styles.stores}>
          {chunk(visibleStores, 2).map((rowStores) => (
            <View key={rowStores[0].key} style={styles.storeRow}>
              {rowStores.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.storeBtn, store === s.key && styles.storeBtnActive]}
                  onPress={() => setStore(s.key)}
                  activeOpacity={0.8}
                >
                  {s.icon ? (
                    <Image source={s.icon} style={styles.storeIcon} resizeMode="cover" />
                  ) : (
                    <Ionicons name="storefront" size={18} color={store === s.key ? colors.accent : colors.inkSoft} />
                  )}
                  <Text
                    style={[styles.storeText, store === s.key && styles.storeTextActive]}
                    numberOfLines={1}
                  >
                    {s.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      )}

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
        bpCatsLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
        ) : bpCatsError ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>No se pudo cargar el catálogo de BonpreuEsclat.</Text>
            <TouchableOpacity onPress={() => {
              setBpCatsError(false); setBpCatsLoading(true);
              fetchBonpreuCategoryTree().then(setBpCats).catch(() => setBpCatsError(true)).finally(() => setBpCatsLoading(false));
            }}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={bpCats}
            keyExtractor={(item) => item.id}
            renderItem={renderBpCategory}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )
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

      {/* ── Carrefour ───────────────────────────────────────────── */}
      {store === 'carrefour' && tab === 'categorias' && (
        cfCatsLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
        ) : cfCatsError ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>No se pudo cargar el catálogo de Carrefour.</Text>
            <TouchableOpacity onPress={() => {
              setCfCatsError(false); setCfCatsLoading(true);
              fetchCarrefourCategoryTree().then(setCfCats).catch(() => setCfCatsError(true)).finally(() => setCfCatsLoading(false));
            }}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={cfCats}
            keyExtractor={(item) => item.id}
            renderItem={renderCfCategory}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )
      )}

      {store === 'carrefour' && tab === 'productos' && (
        <>
          {searchBar('Buscar productos...', cfSearch, setCfSearch)}
          {renderSearchStates(
            cfSearch, cfLoading, cfError, cfResults.length === 0,
            <FlatList
              data={cfResults}
              keyExtractor={(item) => item.id}
              renderItem={renderCfProduct}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              keyboardShouldPersistTaps="handled"
            />,
          )}
        </>
      )}

      {/* ── bonÀrea ──────────────────────────────────────────────── */}
      {store === 'bonarea' && tab === 'categorias' && (
        baCatsLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
        ) : baCatsError ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>No se pudo cargar el catálogo de bonÀrea.</Text>
            <TouchableOpacity onPress={() => {
              setBaCatsError(false); setBaCatsLoading(true);
              fetchBonareaCategoryTree().then(setBaCats).catch(() => setBaCatsError(true)).finally(() => setBaCatsLoading(false));
            }}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={baCats}
            keyExtractor={(item) => item.id}
            renderItem={renderBaCategory}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )
      )}

      {store === 'bonarea' && tab === 'productos' && (
        <>
          {searchBar('Buscar productos...', baSearch, setBaSearch)}
          {renderSearchStates(
            baSearch, baLoading, baError, baResults.length === 0,
            <FlatList
              data={baResults}
              keyExtractor={(item) => item.id}
              renderItem={renderBaProduct}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              keyboardShouldPersistTaps="handled"
            />,
          )}
        </>
      )}

      {/* ── Consum ───────────────────────────────────────────────── */}
      {store === 'consum' && tab === 'categorias' && (
        csCatsLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
        ) : csCatsError ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>No se pudo cargar el catálogo de Consum.</Text>
            <TouchableOpacity onPress={() => {
              setCsCatsError(false); setCsCatsLoading(true);
              fetchConsumCategoryTree().then(setCsCats).catch(() => setCsCatsError(true)).finally(() => setCsCatsLoading(false));
            }}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={csCats}
            keyExtractor={(item) => item.id}
            renderItem={renderCsCategory}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )
      )}

      {store === 'consum' && tab === 'productos' && (
        <>
          {searchBar('Buscar productos...', csSearch, setCsSearch)}
          {renderSearchStates(
            csSearch, csLoading, csError, csResults.length === 0,
            <FlatList
              data={csResults}
              keyExtractor={(item) => item.id}
              renderItem={renderCsProduct}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
              keyboardShouldPersistTaps="handled"
            />,
          )}
        </>
      )}

      {/* ── Dia ──────────────────────────────────────────────────── */}
      {store === 'dia' && tab === 'categorias' && (
        ddCatsLoading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
        ) : ddCatsError ? (
          <View style={styles.centerBox}>
            <Text style={styles.errorText}>No se pudo cargar el catálogo de Dia.</Text>
            <TouchableOpacity onPress={() => {
              setDdCatsError(false); setDdCatsLoading(true);
              fetchDiaCategoryTree().then(setDdCats).catch(() => setDdCatsError(true)).finally(() => setDdCatsLoading(false));
            }}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={ddCats}
            keyExtractor={(item) => item.id}
            renderItem={renderDdCategory}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          />
        )
      )}

      {store === 'dia' && tab === 'productos' && (
        <>
          {searchBar('Buscar productos...', ddSearch, setDdSearch)}
          {renderSearchStates(
            ddSearch, ddLoading, ddError, ddResults.length === 0,
            <FlatList
              data={ddResults}
              keyExtractor={(item) => item.id}
              renderItem={renderDdProduct}
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
      <CarrefourProductModal product={cfDetail} onClose={() => setCfDetail(null)} />
      <BonareaProductModal product={baDetail} onClose={() => setBaDetail(null)} />
      <ConsumProductModal product={csDetail} onClose={() => setCsDetail(null)} />
      <DiaProductModal product={ddDetail} onClose={() => setDdDetail(null)} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  headerArea: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 10 },
  title: {
    fontSize: 28, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3,
  },

  // ── Store switcher ────────────────────────────────────────────
  stores: {
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 8,
  },
  storeRow: {
    flexDirection: 'row',
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
