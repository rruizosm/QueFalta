import React, { useEffect, useRef, useState } from 'react';
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
  Modal,
  Pressable,
  Animated,
  Easing,
  type LayoutRectangle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { getMeta } from '../constants/categoryMeta';
import {
  fetchCategories,
  type N1Category,
  type MercadonaProduct,
} from '../api/mercadona';
import {
  searchProducts, searchBonpreuProducts, fetchBonpreuCategoryTree,
  searchCarrefourProducts, fetchCarrefourCategoryTree,
  searchBonareaProducts, fetchBonareaCategoryTree,
  searchConsumProducts, fetchConsumCategoryTree,
  searchDiaProducts, fetchDiaCategoryTree,
  searchSorliProducts, fetchSorliCategoryTree,
  browseProducts, browseBonpreuProducts, browseCarrefourProducts,
  browseBonareaProducts, browseConsumProducts, browseDiaProducts, browseSorliProducts,
  type BonpreuProduct, type BonpreuCategory,
  type CarrefourProduct, type CarrefourCategory,
  type BonareaProduct, type BonareaCategory,
  type ConsumProduct, type ConsumCategory,
  type DiaProduct, type DiaCategory,
  type SorliProduct, type SorliCategory,
  type BrowseCursor, type BrowsePage,
} from '../api/catalog';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useGuidedTour, useTourAnchor } from '../context/GuidedTourContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import {
  mercadonaToUI, bonpreuToUI, carrefourToUI, bonareaToUI, consumToUI, diaToUI, sorliToUI,
  type UIProduct,
} from '../lib/productAdapters';
import { sortByName } from '../lib/sort';
import ActionSheet from '../components/ActionSheet';
import StoreProductList from '../components/StoreProductList';
import ViewModeToggle, { type ViewMode } from '../components/ViewModeToggle';
import ActiveCartBanner from '../components/ActiveCartBanner';

// Las tiendas y sus metadatos viven en constants/stores.ts (fuente única
// compartida con la preferencia de perfil "Supermercados").
type StoreKey = CatalogStore;

/** Datos mínimos para pintar una fila de categoría de cualquier súper + su ⋯. */
interface CatRow {
  store: CatalogStore;
  refId: string;
  name: string;
  subcount: number;
  onOpen: () => void;
}

/** Carga una página de navegación del catálogo del súper activo y la normaliza a
 *  UIProduct (cada súper tiene su browse + adaptador). El cursor lo gestiona el
 *  llamante; aquí solo se traduce store → (browse, adapter). */
async function loadBrowsePage(store: CatalogStore, cursor: BrowseCursor | null): Promise<BrowsePage<UIProduct>> {
  switch (store) {
    case 'mercadona': { const { items, nextCursor } = await browseProducts(cursor); return { items: items.map((p) => mercadonaToUI(p)), nextCursor }; }
    case 'esclat':    { const { items, nextCursor } = await browseBonpreuProducts(cursor); return { items: items.map(bonpreuToUI), nextCursor }; }
    case 'carrefour': { const { items, nextCursor } = await browseCarrefourProducts(cursor); return { items: items.map(carrefourToUI), nextCursor }; }
    case 'bonarea':   { const { items, nextCursor } = await browseBonareaProducts(cursor); return { items: items.map(bonareaToUI), nextCursor }; }
    case 'consum':    { const { items, nextCursor } = await browseConsumProducts(cursor); return { items: items.map(consumToUI), nextCursor }; }
    case 'dia':       { const { items, nextCursor } = await browseDiaProducts(cursor); return { items: items.map(diaToUI), nextCursor }; }
    case 'sorli':     { const { items, nextCursor } = await browseSorliProducts(cursor); return { items: items.map(sorliToUI), nextCursor }; }
  }
}

export default function CatalogScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(20);
  const navigation = useNavigation<any>();
  const { t, lang } = useTranslation();
  const { isCategoryFavorite, toggleCategoryFavorite } = useFavorites();
  const toast = useToast();
  const { notify: tourNotify, stepId: tourStepId, setStoreMenuOpen: tourSetStoreMenuOpen } = useGuidedTour();
  const storeAnchor = useTourAnchor('storeSelector');
  const firstCatAnchor = useTourAnchor('firstCategory');
  const [sheetCat, setSheetCat] = useState<CatRow | null>(null);
  const [store, setStore] = useState<StoreKey>('mercadona');
  const [tab, setTab] = useState<'categorias' | 'productos'>('productos');
  // Vista lista/cuadrícula compartida por los listados de búsqueda de productos
  // (la controla la fila de búsqueda, no el toolbar interno de StoreProductList).
  const [prodViewMode, setProdViewMode] = useState<ViewMode>('list');

  // Selector de tienda colapsado: solo se ve la activa; al tocar se despliega
  // un menú con el resto. `selectorBox` guarda su posición para anclar el menú.
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [selectorBox, setSelectorBox] = useState<LayoutRectangle | null>(null);
  // Alto del primer ítem del menú (para el "spotlight" del tutorial sobre él).
  const [firstStoreItemH, setFirstStoreItemH] = useState(0);

  // Resetea el aviso del tour al desmontar. (El efecto que informa de apertura
  // + nº de supers vive más abajo, tras calcular `visibleStores`.)
  useEffect(() => () => tourSetStoreMenuOpen(false), [tourSetStoreMenuOpen]);

  // Solo se muestran los supermercados elegidos en el perfil. Sin preferencia
  // (usuario antiguo / perfil aún cargando) → todos.
  const { profile } = useProfile();
  const enabledStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const visibleStores = CATALOG_STORES.filter((s) => enabledStores.includes(s.key));
  const activeStore = CATALOG_STORES.find((s) => s.key === store) ?? visibleStores[0];

  // Informa al tour de si el desplegable está abierto y de cuántos supers hay
  // (para que el paso 3 diga "el segundo" o, con uno solo, "el primero").
  useEffect(() => {
    tourSetStoreMenuOpen(storeMenuOpen, visibleStores.length);
  }, [storeMenuOpen, visibleStores.length, tourSetStoreMenuOpen]);

  // Al activarse el paso 3, re-mide el selector en pantalla (el ancla pudo
  // medirse tarde/obsoleta, o el selector se acaba de forzar visible). Sin esto,
  // la fase 1 no tendría objetivo y no saldrían anillo/chevron.
  useEffect(() => {
    if (tourStepId === 'store') storeAnchor.onLayout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStepId]);

  // Súper a iluminar en el desplegable durante el paso 3: el 2º (para enseñar a
  // cambiar) o el 1º si el usuario solo tiene uno.
  const tourTargetIdx = visibleStores.length >= 2 ? 1 : 0;

  // Anillo que pulsa sobre el súper objetivo (mismo lenguaje que el resto del
  // tour, pero SIN chevron: el menú es un Modal). "Respira" (opacidad ida/vuelta,
  // siempre visible). Solo corre con el menú abierto durante el paso 3.
  const menuPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!(tourStepId === 'store' && storeMenuOpen)) return;
    menuPulse.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(menuPulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(menuPulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [tourStepId, storeMenuOpen, menuPulse]);

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

  // Categorías BonpreuEsclat (espejo)
  const [bpCats, setBpCats] = useState<BonpreuCategory[]>([]);
  const [bpCatsLoading, setBpCatsLoading] = useState(false);
  const [bpCatsError, setBpCatsError] = useState(false);

  // Búsqueda de productos Carrefour (espejo)
  const [cfSearch, setCfSearch] = useState('');
  const [cfResults, setCfResults] = useState<CarrefourProduct[]>([]);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfError, setCfError] = useState(false);

  // Categorías Carrefour (espejo)
  const [cfCats, setCfCats] = useState<CarrefourCategory[]>([]);
  const [cfCatsLoading, setCfCatsLoading] = useState(false);
  const [cfCatsError, setCfCatsError] = useState(false);

  // Búsqueda de productos bonÀrea (espejo)
  const [baSearch, setBaSearch] = useState('');
  const [baResults, setBaResults] = useState<BonareaProduct[]>([]);
  const [baLoading, setBaLoading] = useState(false);
  const [baError, setBaError] = useState(false);

  // Categorías bonÀrea (espejo)
  const [baCats, setBaCats] = useState<BonareaCategory[]>([]);
  const [baCatsLoading, setBaCatsLoading] = useState(false);
  const [baCatsError, setBaCatsError] = useState(false);

  // Búsqueda de productos Consum (espejo)
  const [csSearch, setCsSearch] = useState('');
  const [csResults, setCsResults] = useState<ConsumProduct[]>([]);
  const [csLoading, setCsLoading] = useState(false);
  const [csError, setCsError] = useState(false);

  // Categorías Consum (espejo)
  const [csCats, setCsCats] = useState<ConsumCategory[]>([]);
  const [csCatsLoading, setCsCatsLoading] = useState(false);
  const [csCatsError, setCsCatsError] = useState(false);

  // Búsqueda de productos Dia (espejo)
  const [ddSearch, setDdSearch] = useState('');
  const [ddResults, setDdResults] = useState<DiaProduct[]>([]);
  const [ddLoading, setDdLoading] = useState(false);
  const [ddError, setDdError] = useState(false);

  // Categorías Dia (espejo)
  const [ddCats, setDdCats] = useState<DiaCategory[]>([]);
  const [ddCatsLoading, setDdCatsLoading] = useState(false);
  const [ddCatsError, setDdCatsError] = useState(false);

  // Búsqueda de productos Sorli (espejo)
  const [soSearch, setSoSearch] = useState('');
  const [soResults, setSoResults] = useState<SorliProduct[]>([]);
  const [soLoading, setSoLoading] = useState(false);
  const [soError, setSoError] = useState(false);

  // Categorías Sorli (espejo)
  const [soCats, setSoCats] = useState<SorliCategory[]>([]);
  const [soCatsLoading, setSoCatsLoading] = useState(false);
  const [soCatsError, setSoCatsError] = useState(false);

  // Navegación de productos (pestaña "Productos" sin texto): listado alfabético
  // del catálogo del súper activo, paginado por keyset. Estado ÚNICO compartido
  // por los 6 súpers porque solo se ve uno a la vez (igual que `catSearch`).
  const [browse, setBrowse] = useState<UIProduct[]>([]);
  const [browseCursor, setBrowseCursor] = useState<BrowseCursor | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false); // página inicial
  const [browseMore, setBrowseMore] = useState(false);       // páginas siguientes
  const [browseError, setBrowseError] = useState(false);
  // Texto de búsqueda del súper activo: con <2 letras estamos en modo navegación.
  const prodQuery = { mercadona: prodSearch, esclat: bpSearch, carrefour: cfSearch, bonarea: baSearch, consum: csSearch, dia: ddSearch, sorli: soSearch }[store];
  const browseMode = tab === 'productos' && prodQuery.trim().length < 2;

  // Carga la página 1 al entrar a navegación (cambio de súper, limpiar la
  // búsqueda o abrir la pestaña Productos sin texto).
  useEffect(() => {
    if (!browseMode) return;
    let cancelled = false;
    setBrowse([]); setBrowseCursor(null); setBrowseError(false); setBrowseMore(false); setBrowseLoading(true);
    loadBrowsePage(store, null)
      .then(({ items, nextCursor }) => { if (!cancelled) { setBrowse(items); setBrowseCursor(nextCursor); } })
      .catch(() => { if (!cancelled) setBrowseError(true); })
      .finally(() => { if (!cancelled) setBrowseLoading(false); });
    return () => { cancelled = true; };
  }, [store, browseMode, lang]);

  // Siguiente página keyset al llegar al final de la lista.
  const loadMoreBrowse = () => {
    if (browseLoading || browseMore || browseCursor == null) return;
    const cursor = browseCursor;
    setBrowseMore(true);
    loadBrowsePage(store, cursor)
      .then(({ items, nextCursor }) => { setBrowse((prev) => [...prev, ...items]); setBrowseCursor(nextCursor); })
      .catch(() => { /* conserva lo ya cargado */ })
      .finally(() => setBrowseMore(false));
  };

  useEffect(() => {
    setCatLoading(true); setCatError(false);
    fetchCategories()
      .then(setCategories)
      .catch(() => setCatError(true))
      .finally(() => setCatLoading(false));
  }, [lang]);

  // Carga perezosa de categorías Bonpreu la primera vez que se entra a esa tienda.
  useEffect(() => { setBpCats([]); }, [lang]);
  useEffect(() => {
    if (store !== 'esclat' || bpCats.length > 0 || bpCatsLoading) return;
    setBpCatsLoading(true); setBpCatsError(false);
    fetchBonpreuCategoryTree()
      .then(setBpCats)
      .catch(() => setBpCatsError(true))
      .finally(() => setBpCatsLoading(false));
  }, [store, lang]);

  // Mercadona: búsqueda server-side con debounce (antes barría ~100 subcategorías).
  useEffect(() => {
    const q = prodSearch.trim();
    if (q.length < 2) { setProdResults([]); setProdError(false); setProdLoading(false); return; }
    setProdLoading(true); setProdError(false);
    const handle = setTimeout(() => {
      searchProducts(q).then(setProdResults).catch(() => setProdError(true)).finally(() => setProdLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [prodSearch, lang]);

  // BonpreuEsclat: búsqueda server-side con debounce.
  useEffect(() => {
    const q = bpSearch.trim();
    if (q.length < 2) { setBpResults([]); setBpError(false); setBpLoading(false); return; }
    setBpLoading(true); setBpError(false);
    const handle = setTimeout(() => {
      searchBonpreuProducts(q).then(setBpResults).catch(() => setBpError(true)).finally(() => setBpLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [bpSearch, lang]);

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
  useEffect(() => { setBaCats([]); }, [lang]);
  useEffect(() => {
    if (store !== 'bonarea' || baCats.length > 0 || baCatsLoading) return;
    setBaCatsLoading(true); setBaCatsError(false);
    fetchBonareaCategoryTree()
      .then(setBaCats)
      .catch(() => setBaCatsError(true))
      .finally(() => setBaCatsLoading(false));
  }, [store, lang]);

  // bonÀrea: búsqueda server-side con debounce.
  useEffect(() => {
    const q = baSearch.trim();
    if (q.length < 2) { setBaResults([]); setBaError(false); setBaLoading(false); return; }
    setBaLoading(true); setBaError(false);
    const handle = setTimeout(() => {
      searchBonareaProducts(q).then(setBaResults).catch(() => setBaError(true)).finally(() => setBaLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [baSearch, lang]);

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

  // Carga perezosa de categorías Sorli la primera vez que se entra a esa tienda.
  useEffect(() => { setSoCats([]); }, [lang]);
  useEffect(() => {
    if (store !== 'sorli' || soCats.length > 0 || soCatsLoading) return;
    setSoCatsLoading(true); setSoCatsError(false);
    fetchSorliCategoryTree()
      .then(setSoCats)
      .catch(() => setSoCatsError(true))
      .finally(() => setSoCatsLoading(false));
  }, [store, lang]);

  // Sorli: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    const q = soSearch.trim();
    if (q.length < 2) { setSoResults([]); setSoError(false); setSoLoading(false); return; }
    setSoLoading(true); setSoError(false);
    const handle = setTimeout(() => {
      searchSorliProducts(q).then(setSoResults).catch(() => setSoError(true)).finally(() => setSoLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [soSearch, lang]);

  // Filtro de categorías por texto (cliente). Compartido por los 6 súpers: en la
  // pestaña de categorías solo se ve un súper a la vez, así que un único `catSearch` basta.
  const matchesCatSearch = (name: string) =>
    name.toLowerCase().includes(catSearch.trim().toLowerCase());

  // Categorías que pasan el filtro, ordenadas alfabéticamente según el idioma
  // activo (los nombres ya vienen localizados de la API/espejo de cada súper).
  const sortedCats = <T extends { name: string }>(arr: T[]): T[] =>
    sortByName(arr.filter((c) => matchesCatSearch(c.name)), (c) => c.name);

  const goToSubcategories = (cat: N1Category) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.categories,
    });
  };

  const goToMirrorSubcategories = (
    retailer: Exclude<CatalogStore, 'mercadona'>,
    cat: { name: string; children: { id: string; name: string }[] },
  ) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('SubCategory', {
      categoryName: cat.name,
      emoji,
      color,
      subcategories: cat.children,
      retailer,
    });
  };

  const handleToggleCategory = async (c: CatRow) => {
    setSheetCat(null);
    const { emoji, color } = getMeta(c.name);
    try {
      const added = await toggleCategoryFavorite({ store: c.store, refId: c.refId, name: c.name, emoji, color });
      toast.show(added ? t('catalog.favAdded', { name: c.name }) : t('catalog.favRemoved', { name: c.name }));
    } catch {
      toast.show(t('catalog.favError'), 'error');
    }
  };

  // Fila de categoría común a los 6 súpers: navega al tocar, ⋯ abre el ActionSheet
  // (ver subcategorías + marcar/quitar favorita) y estrella si ya es favorita.
  const renderCatRow = (c: CatRow, isFirst = false) => {
    const { emoji, color } = getMeta(c.name);
    const fav = isCategoryFavorite(c.store, c.refId);
    return (
      <View
        ref={isFirst ? firstCatAnchor.ref : undefined}
        onLayout={isFirst ? firstCatAnchor.onLayout : undefined}
        style={styles.row}
      >
        <TouchableOpacity style={styles.rowBody} onPress={c.onOpen} activeOpacity={0.8}>
          <View style={[styles.thumbnail, { backgroundColor: color + '1e' }]}>
            <Text style={styles.thumbnailEmoji}>{emoji}</Text>
          </View>
          <View style={styles.rowContent}>
            <Text style={styles.rowName}>{c.name}</Text>
            <Text style={styles.rowSub}>{t('catalog.subcategories', { n: c.subcount })}</Text>
          </View>
        </TouchableOpacity>
        {fav && <Ionicons name="star" size={15} color={colors.accent} style={styles.favStar} />}
        <TouchableOpacity onPress={() => setSheetCat(c)} hitSlop={8} style={styles.moreBtn} activeOpacity={0.7}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.inkSoft} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderCategory = ({ item, index }: { item: N1Category; index: number }) =>
    renderCatRow({ store: 'mercadona', refId: String(item.id), name: item.name, subcount: item.categories.length, onOpen: () => goToSubcategories(item) }, index === 0);

  const renderBpCategory = ({ item, index }: { item: BonpreuCategory; index: number }) =>
    renderCatRow({ store: 'esclat', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('esclat', item) }, index === 0);

  const renderCfCategory = ({ item, index }: { item: CarrefourCategory; index: number }) =>
    renderCatRow({ store: 'carrefour', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('carrefour', item) }, index === 0);

  const renderBaCategory = ({ item, index }: { item: BonareaCategory; index: number }) =>
    renderCatRow({ store: 'bonarea', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('bonarea', item) }, index === 0);

  const renderCsCategory = ({ item, index }: { item: ConsumCategory; index: number }) =>
    renderCatRow({ store: 'consum', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('consum', item) }, index === 0);

  const renderDdCategory = ({ item, index }: { item: DiaCategory; index: number }) =>
    renderCatRow({ store: 'dia', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('dia', item) }, index === 0);

  const renderSoCategory = ({ item, index }: { item: SorliCategory; index: number }) =>
    renderCatRow({ store: 'sorli', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('sorli', item) }, index === 0);

  // Estados de un listado de búsqueda de productos (compartido).
  const renderSearchStates = (search: string, loading: boolean, error: boolean, empty: boolean, list: React.ReactNode) => {
    if (search.trim().length < 2)
      return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.minLetters')}</Text></View>;
    if (loading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />;
    if (error) return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.searchError')}</Text></View>;
    if (empty) return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.noResults')}</Text></View>;
    return list;
  };

  // Pestaña "Productos" de un súper: con texto (≥2 letras) → búsqueda server-side
  // de siempre; sin texto → navegación alfabética del catálogo paginada (browse).
  const renderProductsTab = (
    query: string, searchLoading: boolean, searchError: boolean, searchItems: UIProduct[],
  ) => {
    if (query.trim().length >= 2) {
      return renderSearchStates(
        query, searchLoading, searchError, searchItems.length === 0,
        <StoreProductList
          products={searchItems}
          searchQuery={query}
          hideToolbar viewMode={prodViewMode} onViewModeChange={setProdViewMode}
        />,
      );
    }
    if (browseLoading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />;
    if (browseError) return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.searchError')}</Text></View>;
    return (
      <StoreProductList
        products={browse}
        hideToolbar viewMode={prodViewMode} onViewModeChange={setProdViewMode}
        onEndReached={loadMoreBrowse}
        loadingMore={browseMore}
      />
    );
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

  // Fila de búsqueda de productos: barra (consulta al servidor) + toggle
  // lista/cuadrícula a la derecha, en una sola fila (misma distribución que las
  // subcategorías). El toggle controla la vista de StoreProductList desde fuera.
  const productSearchRow = (placeholder: string, value: string, onChange: (s: string) => void) => (
    <View style={styles.prodSearchRow}>
      <View style={[styles.searchBar, styles.prodSearchBox]}>
        <Ionicons name="search-outline" size={18} color={colors.inkSoft} />
        <TextInput
          style={styles.searchInput}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          value={value}
          onChangeText={onChange}
          returnKeyType="search"
          autoCorrect={false}
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')}>
            <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
          </TouchableOpacity>
        )}
      </View>
      <ViewModeToggle value={prodViewMode} onChange={setProdViewMode} />
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <View style={[styles.headerArea, { paddingTop: headerTop }]}>
        <Text style={styles.title}>{t('catalog.title')}</Text>
        <ActiveCartBanner compact />
      </View>

      {/* Selector de tienda colapsado: muestra solo la activa y, al tocar,
          despliega el resto en un menú anclado. Normalmente oculto con un solo
          súper, pero se fuerza durante el paso 3 del tour para poder guiarlo. */}
      {(visibleStores.length > 1 || tourStepId === 'store') && (
        <View
          ref={storeAnchor.ref}
          collapsable={false}
          style={styles.selectorWrap}
          onLayout={(e) => { setSelectorBox(e.nativeEvent.layout); storeAnchor.onLayout(); }}
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

      {/* ── Mercadona ───────────────────────────────────────────── */}
      {store === 'mercadona' && tab === 'categorias' && (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
          {catLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : catError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadError')}</Text>
              <TouchableOpacity onPress={() => {
                setCatError(false); setCatLoading(true);
                fetchCategories().then(setCategories).catch(() => setCatError(true)).finally(() => setCatLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(categories)}
              keyExtractor={(item) => String(item.id)}
              renderItem={renderCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'mercadona' && tab === 'productos' && (
        <>
          {productSearchRow(t('catalog.searchProducts'),prodSearch, setProdSearch)}
          {renderProductsTab(prodSearch, prodLoading, prodError, prodResults.map((p) => mercadonaToUI(p)))}
        </>
      )}

      {/* ── BonpreuEsclat ───────────────────────────────────────── */}
      {store === 'esclat' && tab === 'categorias' && (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
          {bpCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : bpCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'BonpreuEsclat' })}</Text>
              <TouchableOpacity onPress={() => {
                setBpCatsError(false); setBpCatsLoading(true);
                fetchBonpreuCategoryTree().then(setBpCats).catch(() => setBpCatsError(true)).finally(() => setBpCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(bpCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderBpCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'esclat' && tab === 'productos' && (
        <>
          {productSearchRow(t('catalog.searchProducts'),bpSearch, setBpSearch)}
          {renderProductsTab(bpSearch, bpLoading, bpError, bpResults.map(bonpreuToUI))}
        </>
      )}

      {/* ── Carrefour ───────────────────────────────────────────── */}
      {store === 'carrefour' && tab === 'categorias' && (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
          {cfCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : cfCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Carrefour' })}</Text>
              <TouchableOpacity onPress={() => {
                setCfCatsError(false); setCfCatsLoading(true);
                fetchCarrefourCategoryTree().then(setCfCats).catch(() => setCfCatsError(true)).finally(() => setCfCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(cfCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderCfCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'carrefour' && tab === 'productos' && (
        <>
          {productSearchRow(t('catalog.searchProducts'),cfSearch, setCfSearch)}
          {renderProductsTab(cfSearch, cfLoading, cfError, cfResults.map(carrefourToUI))}
        </>
      )}

      {/* ── bonÀrea ──────────────────────────────────────────────── */}
      {store === 'bonarea' && tab === 'categorias' && (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
          {baCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : baCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'bonÀrea' })}</Text>
              <TouchableOpacity onPress={() => {
                setBaCatsError(false); setBaCatsLoading(true);
                fetchBonareaCategoryTree().then(setBaCats).catch(() => setBaCatsError(true)).finally(() => setBaCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(baCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderBaCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'bonarea' && tab === 'productos' && (
        <>
          {productSearchRow(t('catalog.searchProducts'),baSearch, setBaSearch)}
          {renderProductsTab(baSearch, baLoading, baError, baResults.map(bonareaToUI))}
        </>
      )}

      {/* ── Consum ───────────────────────────────────────────────── */}
      {store === 'consum' && tab === 'categorias' && (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
          {csCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : csCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Consum' })}</Text>
              <TouchableOpacity onPress={() => {
                setCsCatsError(false); setCsCatsLoading(true);
                fetchConsumCategoryTree().then(setCsCats).catch(() => setCsCatsError(true)).finally(() => setCsCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(csCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderCsCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'consum' && tab === 'productos' && (
        <>
          {productSearchRow(t('catalog.searchProducts'),csSearch, setCsSearch)}
          {renderProductsTab(csSearch, csLoading, csError, csResults.map(consumToUI))}
        </>
      )}

      {/* ── Dia ──────────────────────────────────────────────────── */}
      {store === 'dia' && tab === 'categorias' && (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
          {ddCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : ddCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Dia' })}</Text>
              <TouchableOpacity onPress={() => {
                setDdCatsError(false); setDdCatsLoading(true);
                fetchDiaCategoryTree().then(setDdCats).catch(() => setDdCatsError(true)).finally(() => setDdCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(ddCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderDdCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'dia' && tab === 'productos' && (
        <>
          {productSearchRow(t('catalog.searchProducts'),ddSearch, setDdSearch)}
          {renderProductsTab(ddSearch, ddLoading, ddError, ddResults.map(diaToUI))}
        </>
      )}

      {/* ── Sorli ────────────────────────────────────────────────── */}
      {store === 'sorli' && tab === 'categorias' && (
        <>
          {searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)}
          {soCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
          ) : soCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Sorli' })}</Text>
              <TouchableOpacity onPress={() => {
                setSoCatsError(false); setSoCatsLoading(true);
                fetchSorliCategoryTree().then(setSoCats).catch(() => setSoCatsError(true)).finally(() => setSoCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(soCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderSoCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'sorli' && tab === 'productos' && (
        <>
          {productSearchRow(t('catalog.searchProducts'),soSearch, setSoSearch)}
          {renderProductsTab(soSearch, soLoading, soError, soResults.map(sorliToUI))}
        </>
      )}

      {/* Menú desplegable de tiendas, anclado bajo el selector. */}
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
              {visibleStores.map((s, i) => {
                const on = s.key === store;
                const last = i === visibleStores.length - 1;
                return (
                  <TouchableOpacity
                    key={s.key}
                    style={[styles.menuItem, !last && styles.menuItemBorder, on && styles.menuItemActive]}
                    onPress={() => { setStore(s.key); setStoreMenuOpen(false); tourNotify('storeSelect'); }}
                    onLayout={i === 0 ? (e) => setFirstStoreItemH(e.nativeEvent.layout.height) : undefined}
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
              {/* Tutorial (paso 3): atenúa todos los súpers menos el objetivo
                  (el 2º para enseñar a cambiar; el 1º si solo hay uno) y lo
                  enmarca. Asume ítems de alto uniforme (= firstStoreItemH). */}
              {tourStepId === 'store' && firstStoreItemH > 0 && (
                <>
                  {tourTargetIdx > 0 && (
                    <View pointerEvents="none" style={[styles.menuTourDim, { top: 0, height: firstStoreItemH * tourTargetIdx }]} />
                  )}
                  <View pointerEvents="none" style={[styles.menuTourDim, { top: firstStoreItemH * (tourTargetIdx + 1), bottom: 0 }]} />
                  {/* Anillo que PULSA sobre el objetivo (opacidad ida/vuelta:
                      siempre visible, claramente "respira"). */}
                  <Animated.View
                    pointerEvents="none"
                    style={[styles.menuTourRing, {
                      top: firstStoreItemH * tourTargetIdx, height: firstStoreItemH,
                      opacity: menuPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
                    }]}
                  />
                </>
              )}
            </View>
          )}
        </Pressable>
      </Modal>

      {sheetCat && (
        <ActionSheet
          visible
          onClose={() => setSheetCat(null)}
          leading={{ type: 'emoji', ...getMeta(sheetCat.name) }}
          title={sheetCat.name}
          subtitle={t('catalog.subcategories', { n: sheetCat.subcount })}
          actions={[
            { icon: 'list-outline', label: t('catalog.seeSubcategories'), onPress: () => { const c = sheetCat; setSheetCat(null); c.onOpen(); } },
            isCategoryFavorite(sheetCat.store, sheetCat.refId)
              ? { icon: 'star', label: t('catalog.removeFavorite'), tint: colors.accent, onPress: () => handleToggleCategory(sheetCat) }
              : { icon: 'star-outline', label: t('catalog.markFavorite'), tint: colors.accent, onPress: () => handleToggleCategory(sheetCat) },
          ]}
        />
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  headerArea: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    paddingHorizontal: 16, paddingBottom: 10,
    // paddingTop inline (useHeaderTopPadding)
  },
  title: {
    fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3,
  },

  // ── Store selector (colapsado) + menú desplegable ─────────────
  selectorWrap: { marginHorizontal: 16, marginBottom: 10 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectorIcon: { width: 20, height: 20 },
  selectorName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },

  menuBackdrop: { flex: 1 },
  menu: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItemActive: { backgroundColor: colors.accentLight },
  // Tutorial: atenúa los súpers que NO son el objetivo (top/height o top/bottom
  // se fijan por uso) y enmarca el objetivo.
  menuTourDim: { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  menuTourRing: { position: 'absolute', left: 0, right: 0, borderWidth: 3, borderColor: colors.accent },
  menuItemName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  menuItemNameActive: { color: colors.accent },

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
  rowContent: { flex: 1 },
  rowName: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  rowSub: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  favStar: { marginRight: 4 },

  // ── States ────────────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  errorText: { fontSize: 15, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
});
