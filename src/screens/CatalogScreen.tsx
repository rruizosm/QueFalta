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
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  searchEroskiProducts, fetchEroskiCategoryTree,
  searchCapraboProducts, fetchCapraboCategoryTree,
  searchCondisProducts, fetchCondisCategoryTree,
  searchAmetllerProducts, fetchAmetllerCategoryTree,
  searchAldiProducts, fetchAldiCategoryTree,
  searchHiperdinoProducts, fetchHiperdinoCategoryTree,
  searchAlcampoProducts, fetchAlcampoCategoryTree,
  searchPlusfrescProducts, fetchPlusfrescCategoryTree,
  browseProducts, browseBonpreuProducts, browseCarrefourProducts,
  browseBonareaProducts, browseConsumProducts, browseDiaProducts, browseSorliProducts,
  browseEroskiProducts, browseCapraboProducts, browseCondisProducts, browseAmetllerProducts,
  browseAldiProducts, browseHiperdinoProducts, browseAlcampoProducts, browsePlusfrescProducts,
  type BonpreuProduct, type BonpreuCategory,
  type CarrefourProduct, type CarrefourCategory,
  type BonareaProduct, type BonareaCategory,
  type ConsumProduct, type ConsumCategory,
  type DiaProduct, type DiaCategory,
  type SorliProduct, type SorliCategory,
  type CondisProduct, type CondisCategory,
  type AmetllerProduct, type AmetllerCategory,
  type AldiProduct, type AldiCategory,
  type HiperdinoProduct, type HiperdinoCategory,
  type AlcampoProduct, type AlcampoCategory,
  type PlusfrescProduct, type PlusfrescCategory,
  type TapestryProduct, type TapestryCategory,
  type BrowseCursor, type BrowsePage,
} from '../api/catalog';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import { storeInRegion, storesForRegion, type RegionValue } from '../constants/regions';
import {
  mercadonaToUI, bonpreuToUI, carrefourToUI, bonareaToUI, consumToUI, diaToUI, sorliToUI,
  eroskiToUI, capraboToUI, condisToUI, ametllerToUI, aldiToUI, hiperdinoToUI, alcampoToUI,
  plusfrescToUI,
  type UIProduct,
} from '../lib/productAdapters';
import { sortByName } from '../lib/sort';
import { createMultiStorePager, type MultiStorePager } from '../lib/multiStorePager';
import ActionSheet from '../components/ActionSheet';
import StoreProductList from '../components/StoreProductList';
import { type ViewMode } from '../components/ViewModeToggle';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments, { type Segment } from '../components/SlidingSegments';
import StoreDropdown, { type StoreSelection } from '../components/StoreDropdown';
import PaywallModal from '../components/PaywallModal';
import { limitsApply } from '../constants/limits';

// Las tiendas y sus metadatos viven en constants/stores.ts (fuente única
// compartida con la preferencia de perfil "Supermercados").
type StoreKey = StoreSelection;

// Primera página por súper/contexto durante la sesión. El catálogo se
// sincroniza semanalmente, pero un TTL corto permite mostrar al instante una
// revisita y revalidar silenciosamente si la copia ya tiene unos minutos.
const BROWSE_CACHE_TTL_MS = 5 * 60 * 1000;
interface BrowseCacheEntry {
  page: BrowsePage<UIProduct>;
  cachedAt: number;
}
const browsePageCache = new Map<string, BrowseCacheEntry>();

function browseCacheKey(
  store: StoreKey,
  lang: string,
  region: RegionValue | null,
  postalCode: string | null,
  order: 'asc' | 'desc',
): string {
  return `${store}:${lang}:${region ?? 'all'}:${postalCode ?? 'none'}:${order}`;
}

function startCategoryLoad<T>(
  load: (signal: AbortSignal) => Promise<T[]>,
  setItems: (items: T[]) => void,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
): () => void {
  const controller = new AbortController();
  let cancelled = false;
  setLoading(true);
  setError(false);
  load(controller.signal)
    .then((items) => {
      if (!cancelled) {
        setLoading(false);
        setItems(items);
      }
    })
    .catch(() => {
      if (!cancelled) {
        setLoading(false);
        setError(true);
      }
    });
  return () => {
    cancelled = true;
    controller.abort();
  };
}

function startProductSearch<T>(
  rawQuery: string,
  load: (query: string, signal: AbortSignal) => Promise<T[]>,
  setItems: (items: T[]) => void,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
): (() => void) | undefined {
  const query = rawQuery.trim();
  if (query.length < 2) {
    setItems([]);
    setError(false);
    setLoading(false);
    return;
  }
  const controller = new AbortController();
  let cancelled = false;
  setLoading(true);
  setError(false);
  const handle = setTimeout(() => {
    load(query, controller.signal)
      .then((items) => { if (!cancelled) setItems(items); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
  }, 300);
  return () => {
    cancelled = true;
    clearTimeout(handle);
    controller.abort();
    setLoading(false);
  };
}

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
async function loadBrowsePage(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  signal?: AbortSignal,
  order: 'priceAsc' | 'priceDesc' = 'priceAsc',
  limit = 50,
): Promise<BrowsePage<UIProduct>> {
  try {
    return await loadBrowsePageWithOrder(store, cursor, region, postalCode, signal, order, limit);
  } catch (error) {
    // Algunas tablas antiguas de producción aún no tienen el índice para
    // `unit_price`. No permitimos que una sola consulta lenta deje vacío el
    // catálogo combinado: recuperamos su primera página alfabética y la mezcla
    // la ordena en cliente. Las cancelaciones sí deben propagarse.
    if (signal?.aborted || (order !== 'priceAsc' && order !== 'priceDesc')) throw error;
    return loadBrowsePageWithOrder(store, cursor, region, postalCode, signal, false, limit);
  }
}

async function loadBrowsePageWithOrder(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
  signal?: AbortSignal,
  order: 'priceAsc' | 'priceDesc' | boolean = 'priceAsc',
  limit = 50,
): Promise<BrowsePage<UIProduct>> {
  switch (store) {
    case 'mercadona': { const { items, nextCursor } = await browseProducts(cursor, region, limit, signal, order as never); return { items: items.map((p) => mercadonaToUI(p)), nextCursor }; }
    case 'esclat':    { const { items, nextCursor } = await browseBonpreuProducts(cursor, limit, signal, order as never); return { items: items.map(bonpreuToUI), nextCursor }; }
    case 'carrefour': { const { items, nextCursor } = await browseCarrefourProducts(cursor, region, limit, signal, order as never); return { items: items.map(carrefourToUI), nextCursor }; }
    case 'bonarea':   { const { items, nextCursor } = await browseBonareaProducts(cursor, limit, signal, order as never); return { items: items.map(bonareaToUI), nextCursor }; }
    case 'consum':    { const { items, nextCursor } = await browseConsumProducts(cursor, region, postalCode, limit, signal, order as never); return { items: items.map(consumToUI), nextCursor }; }
    case 'dia':       { const { items, nextCursor } = await browseDiaProducts(cursor, region, limit, signal, order as never); return { items: items.map(diaToUI), nextCursor }; }
    case 'sorli':     { const { items, nextCursor } = await browseSorliProducts(cursor, limit, signal, order as never); return { items: items.map(sorliToUI), nextCursor }; }
    case 'eroski':    { const { items, nextCursor } = await browseEroskiProducts(cursor, limit, signal, order as never); return { items: items.map(eroskiToUI), nextCursor }; }
    case 'caprabo':   { const { items, nextCursor } = await browseCapraboProducts(cursor, limit, signal, order as never); return { items: items.map(capraboToUI), nextCursor }; }
    case 'condis':    { const { items, nextCursor } = await browseCondisProducts(cursor, limit, signal, order as never); return { items: items.map(condisToUI), nextCursor }; }
    case 'ametller':  { const { items, nextCursor } = await browseAmetllerProducts(cursor, limit, signal, order as never); return { items: items.map(ametllerToUI), nextCursor }; }
    case 'aldi':      { const { items, nextCursor } = await browseAldiProducts(cursor, limit, signal, order as never); return { items: items.map(aldiToUI), nextCursor }; }
    case 'hiperdino': { const { items, nextCursor } = await browseHiperdinoProducts(cursor, limit, signal, order as never); return { items: items.map(hiperdinoToUI), nextCursor }; }
    case 'alcampo':   { const { items, nextCursor } = await browseAlcampoProducts(cursor, limit, signal, order as never); return { items: items.map(alcampoToUI), nextCursor }; }
    case 'plusfresc': { const { items, nextCursor } = await browsePlusfrescProducts(cursor, postalCode, limit, signal, order as never); return { items: items.map(plusfrescToUI), nextCursor }; }
  }
}

async function loadStoreSearch(
  store: CatalogStore,
  query: string,
  region: RegionValue | null,
  postalCode: string | null,
  signal?: AbortSignal,
  limit = 50,
): Promise<UIProduct[]> {
  switch (store) {
    case 'mercadona': return (await searchProducts(query, region, limit, signal)).map((product) => mercadonaToUI(product));
    case 'esclat': return (await searchBonpreuProducts(query, limit, signal)).map(bonpreuToUI);
    case 'carrefour': return (await searchCarrefourProducts(query, region, limit, signal)).map(carrefourToUI);
    case 'bonarea': return (await searchBonareaProducts(query, limit, signal)).map(bonareaToUI);
    case 'consum': return (await searchConsumProducts(query, region, postalCode, limit, signal)).map(consumToUI);
    case 'dia': return (await searchDiaProducts(query, region, limit, signal)).map(diaToUI);
    case 'sorli': return (await searchSorliProducts(query, limit, signal)).map(sorliToUI);
    case 'eroski': return (await searchEroskiProducts(query, limit, signal)).map(eroskiToUI);
    case 'caprabo': return (await searchCapraboProducts(query, limit, signal)).map(capraboToUI);
    case 'condis': return (await searchCondisProducts(query, limit, signal)).map(condisToUI);
    case 'ametller': return (await searchAmetllerProducts(query, limit, signal)).map(ametllerToUI);
    case 'aldi': return (await searchAldiProducts(query, limit, signal)).map(aldiToUI);
    case 'hiperdino': return (await searchHiperdinoProducts(query, limit, signal)).map(hiperdinoToUI);
    case 'alcampo': return (await searchAlcampoProducts(query, limit, signal)).map(alcampoToUI);
    case 'plusfresc': return (await searchPlusfrescProducts(query, postalCode, limit, signal)).map(plusfrescToUI);
  }
}

function compareProductsByPrice(order: 'asc' | 'desc') {
  return (a: UIProduct, b: UIProduct) => {
    if (a.unitPrice == null && b.unitPrice != null) return 1;
    if (a.unitPrice != null && b.unitPrice == null) return -1;
    const priceDiff = (a.unitPrice ?? 0) - (b.unitPrice ?? 0);
    if (priceDiff !== 0) return order === 'asc' ? priceDiff : -priceDiff;
    const nameDiff = a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    if (nameDiff !== 0) return nameDiff;
    const storeDiff = CATALOG_STORE_KEYS.indexOf(a.store) - CATALOG_STORE_KEYS.indexOf(b.store);
    return storeDiff !== 0 ? storeDiff : a.id.localeCompare(b.id);
  };
}

export default function CatalogScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(20);
  const navigation = useNavigation<any>();
  const { t, lang } = useTranslation();
  const insets = useSafeAreaInsets();
  const { isCategoryFavorite, toggleCategoryFavorite } = useFavorites();
  const toast = useToast();
  const [sheetCat, setSheetCat] = useState<CatRow | null>(null);
  const [store, setStore] = useState<StoreKey>('mercadona');
  const [tab, setTab] = useState<'categorias' | 'productos'>('productos');
  const isAllStores = store === 'all';

  const handleStoreChange = (nextStore: StoreKey) => {
    setStore(nextStore);
    if (nextStore === 'all') setTab('productos');
  };
  // Vista lista/cuadrícula compartida por los listados de búsqueda de productos
  // (la controla la fila de búsqueda, no el toolbar interno de StoreProductList).
  const [prodViewMode, setProdViewMode] = useState<ViewMode>('list');
  // Orden de precio elegido desde los dos controles junto a lista/cuadrícula.
  const [productOrder, setProductOrder] = useState<'asc' | 'desc'>('asc');
  const [productSearchExpanded, setProductSearchExpanded] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
  }, []);

  const setProductSearchFocus = (expanded: boolean) => {
    if (expanded === productSearchExpanded) return;
    LayoutAnimation.configureNext({
      duration: 220,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
      delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
    });
    setProductSearchExpanded(expanded);
  };

  // Liquid Glass (F3): igual que Cambios de precios, todo el chrome (cabecera,
  // pestañas + selector de súper y buscador) vive en una franja de cristal
  // flotante y la lista pasa por debajo refractándose. `chromeH` = altura medida
  // de esa franja → se usa como topInset del contenido. En fallback (Android /
  // iOS ≤ 18) glassInset = 0 y el chrome va en flujo, como siempre.
  const [chromeH, setChromeH] = useState(0);
  const glassInset = glassAvailable ? chromeH : 0;

  // Selector de tienda colapsado: solo se ve el logo del súper activo (chip
  // redondo); al tocar se abre a pantalla completa la rejilla de súpers en 2
  // columnas (mismo diseño que Ofertas/Novedades/Cambios de precios).
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Solo se muestran los supermercados elegidos en el perfil ∩ los disponibles
  // en su comunidad autónoma (regionales solo en su zona; con region 'ES' o
  // NULL no se filtra nada). La preferencia NO se reescribe al cambiar de CCAA:
  // los súpers de fuera solo dejan de mostrarse y reaparecen si vuelve. Si la
  // intersección queda vacía (eligió solo súpers de otra región), cae a todos
  // los de la región — nunca un catálogo vacío (los nacionales están en todas).
  const { profile, isPremium, loading: profileLoading } = useProfile();
  const allLocked = !profileLoading && limitsApply(isPremium);
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const prefStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const prefInRegion = prefStores.filter((k) => storeInRegion(k, region));
  const enabledStores = prefInRegion.length > 0 ? prefInRegion : storesForRegion(region);
  const visibleStores = CATALOG_STORES.filter((s) => enabledStores.includes(s.key));

  // Si la tienda activa deja de estar permitida, salta a la primera visible.
  useEffect(() => {
    if (store !== 'all' && enabledStores.length > 0 && !enabledStores.includes(store)) {
      setStore(enabledStores[0]);
    }
  }, [enabledStores, store]);

  useEffect(() => {
    if (allLocked && store === 'all' && enabledStores[0]) {
      setStore(enabledStores[0]);
      setTab('productos');
    }
  }, [allLocked, enabledStores, store]);

  const [categories, setCategories] = useState<N1Category[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catError, setCatError] = useState(false);
  const [catSearch, setCatSearch] = useState('');

  // Búsqueda de productos Mercadona (espejo)
  const [prodSearch, setProdSearch] = useState('');
  const [prodResults, setProdResults] = useState<MercadonaProduct[]>([]);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodError, setProdError] = useState(false);

  // BÃºsqueda conjunta cuando el selector estÃ¡ en "Todos".
  const [allSearch, setAllSearch] = useState('');
  const [allResults, setAllResults] = useState<UIProduct[]>([]);
  const [allSearchLimit, setAllSearchLimit] = useState(50);
  const [allSearchMore, setAllSearchMore] = useState(false);
  const [allLoading, setAllLoading] = useState(false);
  const allSearchMoreController = useRef<AbortController | null>(null);
  const [allError, setAllError] = useState(false);

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

  // Búsqueda + categorías Eroski (espejo)
  const [ekSearch, setEkSearch] = useState('');
  const [ekResults, setEkResults] = useState<TapestryProduct[]>([]);
  const [ekLoading, setEkLoading] = useState(false);
  const [ekError, setEkError] = useState(false);
  const [ekCats, setEkCats] = useState<TapestryCategory[]>([]);
  const [ekCatsLoading, setEkCatsLoading] = useState(false);
  const [ekCatsError, setEkCatsError] = useState(false);

  // Búsqueda + categorías Caprabo (espejo)
  const [cbSearch, setCbSearch] = useState('');
  const [cbResults, setCbResults] = useState<TapestryProduct[]>([]);
  const [cbLoading, setCbLoading] = useState(false);
  const [cbError, setCbError] = useState(false);
  const [cbCats, setCbCats] = useState<TapestryCategory[]>([]);
  const [cbCatsLoading, setCbCatsLoading] = useState(false);
  const [cbCatsError, setCbCatsError] = useState(false);

  // Búsqueda de productos Condis (espejo)
  const [coSearch, setCoSearch] = useState('');
  const [coResults, setCoResults] = useState<CondisProduct[]>([]);
  const [coLoading, setCoLoading] = useState(false);
  const [coError, setCoError] = useState(false);

  // Categorías Condis (espejo)
  const [coCats, setCoCats] = useState<CondisCategory[]>([]);
  const [coCatsLoading, setCoCatsLoading] = useState(false);
  const [coCatsError, setCoCatsError] = useState(false);

  // Búsqueda de productos Ametller Origen (espejo)
  const [amSearch, setAmSearch] = useState('');
  const [amResults, setAmResults] = useState<AmetllerProduct[]>([]);
  const [amLoading, setAmLoading] = useState(false);
  const [amError, setAmError] = useState(false);

  // Categorías Ametller (espejo)
  const [amCats, setAmCats] = useState<AmetllerCategory[]>([]);
  const [amCatsLoading, setAmCatsLoading] = useState(false);
  const [amCatsError, setAmCatsError] = useState(false);

  // Búsqueda de productos Aldi (espejo)
  const [alSearch, setAlSearch] = useState('');
  const [alResults, setAlResults] = useState<AldiProduct[]>([]);
  const [alLoading, setAlLoading] = useState(false);
  const [alError, setAlError] = useState(false);

  // Categorías Aldi (espejo)
  const [alCats, setAlCats] = useState<AldiCategory[]>([]);
  const [alCatsLoading, setAlCatsLoading] = useState(false);
  const [alCatsError, setAlCatsError] = useState(false);

  // Búsqueda de productos HiperDino (espejo)
  const [hdSearch, setHdSearch] = useState('');
  const [hdResults, setHdResults] = useState<HiperdinoProduct[]>([]);
  const [hdLoading, setHdLoading] = useState(false);
  const [hdError, setHdError] = useState(false);

  // Categorías HiperDino (espejo)
  const [hdCats, setHdCats] = useState<HiperdinoCategory[]>([]);
  const [hdCatsLoading, setHdCatsLoading] = useState(false);
  const [hdCatsError, setHdCatsError] = useState(false);

  // Búsqueda de productos Alcampo (espejo)
  const [acSearch, setAcSearch] = useState('');
  const [acResults, setAcResults] = useState<AlcampoProduct[]>([]);
  const [acLoading, setAcLoading] = useState(false);
  const [acError, setAcError] = useState(false);

  // Categorías Alcampo (espejo)
  const [acCats, setAcCats] = useState<AlcampoCategory[]>([]);
  const [acCatsLoading, setAcCatsLoading] = useState(false);
  const [acCatsError, setAcCatsError] = useState(false);

  // Búsqueda de productos Plusfresc (espejo)
  const [pfSearch, setPfSearch] = useState('');
  const [pfResults, setPfResults] = useState<PlusfrescProduct[]>([]);
  const [pfLoading, setPfLoading] = useState(false);
  const [pfError, setPfError] = useState(false);

  // Categorías Plusfresc (espejo)
  const [pfCats, setPfCats] = useState<PlusfrescCategory[]>([]);
  const [pfCatsLoading, setPfCatsLoading] = useState(false);
  const [pfCatsError, setPfCatsError] = useState(false);

  // Navegación de productos (pestaña "Productos" sin texto): listado alfabético
  // del catálogo del súper activo, paginado por keyset. Estado ÚNICO compartido
  // por los 6 súpers porque solo se ve uno a la vez (igual que `catSearch`).
  const [browse, setBrowse] = useState<UIProduct[]>([]);
  const [browseCursor, setBrowseCursor] = useState<BrowseCursor | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false); // página inicial
  const [browseRefreshing, setBrowseRefreshing] = useState(false); // SWR sin spinner
  const [browseMore, setBrowseMore] = useState(false);       // páginas siguientes
  const [browseError, setBrowseError] = useState(false);
  const browseInitialController = useRef<AbortController | null>(null);
  const browseMoreController = useRef<AbortController | null>(null);
  // Texto de búsqueda del súper activo: con <2 letras estamos en modo navegación.
  const prodQuery = store === 'all'
    ? allSearch
    : { mercadona: prodSearch, esclat: bpSearch, carrefour: cfSearch, bonarea: baSearch, consum: csSearch, dia: ddSearch, sorli: soSearch, eroski: ekSearch, caprabo: cbSearch, condis: coSearch, ametller: amSearch, aldi: alSearch, hiperdino: hdSearch, alcampo: acSearch, plusfresc: pfSearch }[store];
  // Setter de búsqueda de productos del súper activo (para la fila de búsqueda
  // única que ahora vive en el chrome, en vez de una por bloque de súper).
  const setProdQuery = store === 'all'
    ? setAllSearch
    : { mercadona: setProdSearch, esclat: setBpSearch, carrefour: setCfSearch, bonarea: setBaSearch, consum: setCsSearch, dia: setDdSearch, sorli: setSoSearch, eroski: setEkSearch, caprabo: setCbSearch, condis: setCoSearch, ametller: setAmSearch, aldi: setAlSearch, hiperdino: setHdSearch, alcampo: setAcSearch, plusfresc: setPfSearch }[store];
  const browseMode = tab === 'productos' && prodQuery.trim().length < 2;
  const browseOrder = productOrder === 'desc' ? 'priceDesc' : 'priceAsc';
  const enabledStoresKey = enabledStores.join(',');
  const activeBrowseKey = browseCacheKey(
    store, lang, region, postalCode, productOrder,
  ) + (store === 'all' ? `:${enabledStoresKey}` : '');
  const allBrowsePager = useRef<MultiStorePager<UIProduct> | null>(null);
  const allBrowseRequestKey = useRef<string | null>(null);
  const activeBrowseKeyRef = useRef(activeBrowseKey);
  activeBrowseKeyRef.current = activeBrowseKey;

  // Primera página con caché de sesión + stale-while-revalidate. Una revisita
  // fresca no toca la red; una copia caducada se muestra al instante y se renueva
  // sin desmontar la lista. El AbortController corta la petición al cambiar de
  // súper/idioma/ubicación o abandonar Productos.
  useEffect(() => {
    browseInitialController.current?.abort();
    browseMoreController.current?.abort();
    browseInitialController.current = null;
    browseMoreController.current = null;
    if (!browseMode) {
      setBrowseRefreshing(false);
      setBrowseMore(false);
      return;
    }

    const requestKey = activeBrowseKey;
    if (store === 'all') {
      setBrowse([]);
      setBrowseCursor(null);
      setBrowseError(false);
      setBrowseMore(false);
      setBrowseLoading(true);
      setBrowseRefreshing(false);

      let cancelled = false;
      const controller = new AbortController();
      browseInitialController.current = controller;
      const pager = createMultiStorePager({
        stores: enabledStores,
        loadPage: (selectedStore, cursor, limit, signal) =>
          loadBrowsePage(selectedStore, cursor, region, postalCode, signal, browseOrder, limit),
        compare: compareProductsByPrice(productOrder),
      });
      allBrowsePager.current = pager;
      allBrowseRequestKey.current = requestKey;
      pager.nextPage(50, controller.signal)
        .then((items) => {
          if (cancelled || activeBrowseKeyRef.current !== requestKey) return;
          setBrowse(items);
          setBrowseCursor(pager.hasMore() ? { name: 0, id: 'all' } : null);
        })
        .catch(() => {
          if (!cancelled) setBrowseError(true);
        })
        .finally(() => {
          if (cancelled) return;
          if (browseInitialController.current === controller) browseInitialController.current = null;
          setBrowseLoading(false);
        });
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    allBrowsePager.current = null;
    allBrowseRequestKey.current = null;
    const cached = browsePageCache.get(requestKey);
    const hasCachedPage = cached != null;
    if (cached) {
      setBrowse(cached.page.items);
      setBrowseCursor(cached.page.nextCursor);
      setBrowseLoading(false);
      setBrowseError(false);
      setBrowseMore(false);
      if (Date.now() - cached.cachedAt < BROWSE_CACHE_TTL_MS) return;
    } else {
      setBrowse([]);
      setBrowseCursor(null);
      setBrowseError(false);
      setBrowseMore(false);
      setBrowseLoading(true);
    }

    let cancelled = false;
    const controller = new AbortController();
    browseInitialController.current = controller;
    setBrowseRefreshing(hasCachedPage);
    loadBrowsePage(store, null, region, postalCode, controller.signal, browseOrder)
      .then((page) => {
        if (cancelled || activeBrowseKeyRef.current !== requestKey) return;
        browsePageCache.set(requestKey, { page, cachedAt: Date.now() });
        setBrowse(page.items);
        setBrowseCursor(page.nextCursor);
        setBrowseError(false);
      })
      .catch(() => {
        if (!cancelled && !hasCachedPage) setBrowseError(true);
      })
      .finally(() => {
        if (cancelled) return;
        if (browseInitialController.current === controller) browseInitialController.current = null;
        setBrowseLoading(false);
        setBrowseRefreshing(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [store, browseMode, lang, region, postalCode, activeBrowseKey, browseOrder]);

  // Siguiente página keyset al llegar al final de la lista.
  const loadMoreBrowse = () => {
    if (browseLoading || browseRefreshing || browseMore || browseCursor == null) return;
    const requestKey = activeBrowseKey;
    const controller = new AbortController();
    browseMoreController.current?.abort();
    browseMoreController.current = controller;
    setBrowseMore(true);

    if (store === 'all') {
      const pager = allBrowseRequestKey.current === requestKey ? allBrowsePager.current : null;
      if (!pager) {
        setBrowseMore(false);
        return;
      }
      pager.nextPage(50, controller.signal)
        .then((items) => {
          if (activeBrowseKeyRef.current !== requestKey) return;
          setBrowse((prev) => [...prev, ...items]);
          setBrowseCursor(pager.hasMore() ? { name: 0, id: 'all' } : null);
        })
        .catch(() => { /* conserva lo ya cargado */ })
        .finally(() => {
          if (browseMoreController.current === controller) browseMoreController.current = null;
          if (activeBrowseKeyRef.current === requestKey) setBrowseMore(false);
        });
      return;
    }

    const cursor = browseCursor;
    loadBrowsePage(store, cursor, region, postalCode, controller.signal, browseOrder)
      .then(({ items, nextCursor }) => {
        if (activeBrowseKeyRef.current !== requestKey) return;
        setBrowse((prev) => [...prev, ...items]);
        setBrowseCursor(nextCursor);
      })
      .catch(() => { /* conserva lo ya cargado */ })
      .finally(() => {
        if (browseMoreController.current === controller) browseMoreController.current = null;
        if (activeBrowseKeyRef.current === requestKey) setBrowseMore(false);
      });
  };

  useEffect(() => { setCategories([]); setCatError(false); setCatLoading(false); }, [lang]);
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'mercadona' || categories.length > 0 || catLoading) return;
    return startCategoryLoad(fetchCategories, setCategories, setCatLoading, setCatError);
  }, [store, tab, lang, categories.length]);

  // Carga perezosa de categorías Bonpreu la primera vez que se entra a esa tienda.
  useEffect(() => { setBpCats([]); }, [lang]);
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'esclat' || bpCats.length > 0 || bpCatsLoading) return;
    return startCategoryLoad(fetchBonpreuCategoryTree, setBpCats, setBpCatsLoading, setBpCatsError);
  }, [store, tab, lang, bpCats.length]);

  // Mercadona: búsqueda server-side con debounce (antes barría ~100 subcategorías).
  useEffect(() => {
    if (store !== 'mercadona') return;
    return startProductSearch(prodSearch, (q, signal) => searchProducts(q, region, 50, signal), setProdResults, setProdLoading, setProdError);
  }, [store, prodSearch, lang, region]);

  // BonpreuEsclat: búsqueda server-side con debounce.
  useEffect(() => {
    if (store !== 'esclat') return;
    return startProductSearch(bpSearch, (q, signal) => searchBonpreuProducts(q, 50, signal), setBpResults, setBpLoading, setBpError);
  }, [store, bpSearch, lang]);

  // Carga perezosa de categorías Carrefour la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'carrefour' || cfCats.length > 0 || cfCatsLoading) return;
    return startCategoryLoad(fetchCarrefourCategoryTree, setCfCats, setCfCatsLoading, setCfCatsError);
  }, [store, tab]);

  // Carrefour: búsqueda server-side con debounce.
  useEffect(() => {
    if (store !== 'carrefour') return;
    return startProductSearch(cfSearch, (q, signal) => searchCarrefourProducts(q, region, 50, signal), setCfResults, setCfLoading, setCfError);
  }, [store, cfSearch, region]);

  // Carga perezosa de categorías bonÀrea la primera vez que se entra a esa tienda.
  useEffect(() => { setBaCats([]); }, [lang]);
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'bonarea' || baCats.length > 0 || baCatsLoading) return;
    return startCategoryLoad(fetchBonareaCategoryTree, setBaCats, setBaCatsLoading, setBaCatsError);
  }, [store, tab, lang, baCats.length]);

  // bonÀrea: búsqueda server-side con debounce.
  useEffect(() => {
    if (store !== 'bonarea') return;
    return startProductSearch(baSearch, (q, signal) => searchBonareaProducts(q, 50, signal), setBaResults, setBaLoading, setBaError);
  }, [store, baSearch, lang]);

  // Carga perezosa de categorías Consum la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'consum' || csCats.length > 0 || csCatsLoading) return;
    return startCategoryLoad(fetchConsumCategoryTree, setCsCats, setCsCatsLoading, setCsCatsError);
  }, [store, tab]);

  // Consum: búsqueda server-side con debounce.
  useEffect(() => {
    if (store !== 'consum') return;
    return startProductSearch(csSearch, (q, signal) => searchConsumProducts(q, region, postalCode, 50, signal), setCsResults, setCsLoading, setCsError);
  }, [store, csSearch, region, postalCode]);

  // Carga perezosa de categorías Dia la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'dia' || ddCats.length > 0 || ddCatsLoading) return;
    return startCategoryLoad(fetchDiaCategoryTree, setDdCats, setDdCatsLoading, setDdCatsError);
  }, [store, tab]);

  // Dia: búsqueda server-side con debounce.
  useEffect(() => {
    if (store !== 'dia') return;
    return startProductSearch(ddSearch, (q, signal) => searchDiaProducts(q, region, 50, signal), setDdResults, setDdLoading, setDdError);
  }, [store, ddSearch, region]);

  // Carga perezosa de categorías Sorli la primera vez que se entra a esa tienda.
  useEffect(() => { setSoCats([]); }, [lang]);
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'sorli' || soCats.length > 0 || soCatsLoading) return;
    return startCategoryLoad(fetchSorliCategoryTree, setSoCats, setSoCatsLoading, setSoCatsError);
  }, [store, tab, lang, soCats.length]);

  // Sorli: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    if (store !== 'sorli') return;
    return startProductSearch(soSearch, (q, signal) => searchSorliProducts(q, 50, signal), setSoResults, setSoLoading, setSoError);
  }, [store, soSearch, lang]);

  // Carga perezosa de categorías Eroski la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'eroski' || ekCats.length > 0 || ekCatsLoading) return;
    return startCategoryLoad(fetchEroskiCategoryTree, setEkCats, setEkCatsLoading, setEkCatsError);
  }, [store, tab]);

  // Eroski: búsqueda server-side con debounce.
  useEffect(() => {
    if (store !== 'eroski') return;
    return startProductSearch(ekSearch, (q, signal) => searchEroskiProducts(q, 50, signal), setEkResults, setEkLoading, setEkError);
  }, [store, ekSearch]);

  // Carga perezosa de categorías Caprabo la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'caprabo' || cbCats.length > 0 || cbCatsLoading) return;
    return startCategoryLoad(fetchCapraboCategoryTree, setCbCats, setCbCatsLoading, setCbCatsError);
  }, [store, tab]);

  // Caprabo: búsqueda server-side con debounce.
  useEffect(() => {
    if (store !== 'caprabo') return;
    return startProductSearch(cbSearch, (q, signal) => searchCapraboProducts(q, 50, signal), setCbResults, setCbLoading, setCbError);
  }, [store, cbSearch]);

  // Carga perezosa de categorías Condis la primera vez que se entra a esa tienda.
  useEffect(() => { setCoCats([]); }, [lang]);
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'condis' || coCats.length > 0 || coCatsLoading) return;
    return startCategoryLoad(fetchCondisCategoryTree, setCoCats, setCoCatsLoading, setCoCatsError);
  }, [store, tab, lang, coCats.length]);

  // Condis: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    if (store !== 'condis') return;
    return startProductSearch(coSearch, (q, signal) => searchCondisProducts(q, 50, signal), setCoResults, setCoLoading, setCoError);
  }, [store, coSearch, lang]);

  // Carga perezosa de categorías Ametller la primera vez que se entra a esa tienda.
  useEffect(() => { setAmCats([]); }, [lang]);
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'ametller' || amCats.length > 0 || amCatsLoading) return;
    return startCategoryLoad(fetchAmetllerCategoryTree, setAmCats, setAmCatsLoading, setAmCatsError);
  }, [store, tab, lang, amCats.length]);

  // Ametller: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    if (store !== 'ametller') return;
    return startProductSearch(amSearch, (q, signal) => searchAmetllerProducts(q, 50, signal), setAmResults, setAmLoading, setAmError);
  }, [store, amSearch, lang]);

  // Carga perezosa de categorías Aldi la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'aldi' || alCats.length > 0 || alCatsLoading) return;
    return startCategoryLoad(fetchAldiCategoryTree, setAlCats, setAlCatsLoading, setAlCatsError);
  }, [store, tab]);

  // Aldi: búsqueda server-side con debounce (es-only).
  useEffect(() => {
    if (store !== 'aldi') return;
    return startProductSearch(alSearch, (q, signal) => searchAldiProducts(q, 50, signal), setAlResults, setAlLoading, setAlError);
  }, [store, alSearch]);

  // Carga perezosa de categorías HiperDino la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'hiperdino' || hdCats.length > 0 || hdCatsLoading) return;
    return startCategoryLoad(fetchHiperdinoCategoryTree, setHdCats, setHdCatsLoading, setHdCatsError);
  }, [store, tab]);

  // HiperDino: búsqueda server-side con debounce (es-only).
  useEffect(() => {
    if (store !== 'hiperdino') return;
    return startProductSearch(hdSearch, (q, signal) => searchHiperdinoProducts(q, 50, signal), setHdResults, setHdLoading, setHdError);
  }, [store, hdSearch]);

  // Carga perezosa de categorías Alcampo la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'alcampo' || acCats.length > 0 || acCatsLoading) return;
    return startCategoryLoad(fetchAlcampoCategoryTree, setAcCats, setAcCatsLoading, setAcCatsError);
  }, [store, tab]);

  // Alcampo: búsqueda server-side con debounce (es-only).
  useEffect(() => {
    if (store !== 'alcampo') return;
    return startProductSearch(acSearch, (q, signal) => searchAlcampoProducts(q, 50, signal), setAcResults, setAcLoading, setAcError);
  }, [store, acSearch]);

  // Carga perezosa de categorías Plusfresc la primera vez que se entra a esa tienda.
  useEffect(() => { setPfCats([]); }, [lang]);
  useEffect(() => {
    if (tab !== 'categorias' || store !== 'plusfresc' || pfCats.length > 0 || pfCatsLoading) return;
    return startCategoryLoad(fetchPlusfrescCategoryTree, setPfCats, setPfCatsLoading, setPfCatsError);
  }, [store, tab, lang, pfCats.length]);

  // Plusfresc: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    if (store !== 'plusfresc') return;
    return startProductSearch(pfSearch, (q, signal) => searchPlusfrescProducts(q, postalCode, 50, signal), setPfResults, setPfLoading, setPfError);
  }, [store, pfSearch, lang, postalCode]);

  // "Todos": lanza la misma bÃºsqueda en los sÃºpers permitidos, mezcla por
  // precio y conserva un mÃ¡ximo global de 50 resultados.
  const loadMoreAllSearch = () => {
    if (store !== 'all' || allSearch.trim().length < 2 || allLoading || allSearchMore) return;
    const nextLimit = allSearchLimit + 50;
    const controller = new AbortController();
    allSearchMoreController.current?.abort();
    allSearchMoreController.current = controller;
    setAllSearchMore(true);
    Promise.all(enabledStores.map((selectedStore) =>
      loadStoreSearch(selectedStore, allSearch, region, postalCode, controller.signal, nextLimit),
    ))
      .then((pages) => {
        const nextItems = pages.flat().sort(compareProductsByPrice(productOrder)).slice(0, nextLimit);
        setAllResults((current) => {
          if (nextItems.length <= current.length) return current;
          setAllSearchLimit(nextLimit);
          return nextItems;
        });
      })
      .catch(() => { /* conserva los resultados ya cargados */ })
      .finally(() => {
        if (allSearchMoreController.current === controller) allSearchMoreController.current = null;
        setAllSearchMore(false);
      });
  };

  useEffect(() => {
    if (store !== 'all') return;
    setAllSearchLimit(50);
    setAllSearchMore(false);
    allSearchMoreController.current?.abort();
    const cleanup = startProductSearch(
      allSearch,
      async (q, signal) => {
        const pages = await Promise.all(
          enabledStores.map((selectedStore) =>
            loadStoreSearch(selectedStore, q, region, postalCode, signal, 50),
          ),
        );
        return pages.flat().sort(compareProductsByPrice(productOrder)).slice(0, 50);
      },
      setAllResults,
      setAllLoading,
      setAllError,
    );
    return () => {
      cleanup?.();
      allSearchMoreController.current?.abort();
      setAllSearchMore(false);
    };
  }, [store, allSearch, lang, region, postalCode, productOrder, enabledStoresKey]);

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
  const renderCatRow = (c: CatRow) => {
    const { emoji, color } = getMeta(c.name);
    const fav = isCategoryFavorite(c.store, c.refId);
    return (
      <GlassSurface style={styles.row} fallbackColor={colors.white}>
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
      </GlassSurface>
    );
  };

  const renderCategory = ({ item }: { item: N1Category }) =>
    renderCatRow({ store: 'mercadona', refId: String(item.id), name: item.name, subcount: item.categories.length, onOpen: () => goToSubcategories(item) });

  const renderBpCategory = ({ item }: { item: BonpreuCategory }) =>
    renderCatRow({ store: 'esclat', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('esclat', item) });

  const renderCfCategory = ({ item }: { item: CarrefourCategory }) =>
    renderCatRow({ store: 'carrefour', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('carrefour', item) });

  const renderBaCategory = ({ item }: { item: BonareaCategory }) =>
    renderCatRow({ store: 'bonarea', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('bonarea', item) });

  const renderCsCategory = ({ item }: { item: ConsumCategory }) =>
    renderCatRow({ store: 'consum', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('consum', item) });

  const renderDdCategory = ({ item }: { item: DiaCategory }) =>
    renderCatRow({ store: 'dia', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('dia', item) });

  const renderSoCategory = ({ item }: { item: SorliCategory }) =>
    renderCatRow({ store: 'sorli', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('sorli', item) });

  const renderEkCategory = ({ item }: { item: TapestryCategory }) =>
    renderCatRow({ store: 'eroski', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('eroski', item) });

  const renderCbCategory = ({ item }: { item: TapestryCategory }) =>
    renderCatRow({ store: 'caprabo', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('caprabo', item) });

  const renderCoCategory = ({ item }: { item: CondisCategory }) =>
    renderCatRow({ store: 'condis', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('condis', item) });

  const renderAmCategory = ({ item }: { item: AmetllerCategory }) =>
    renderCatRow({ store: 'ametller', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('ametller', item) });

  const renderAlCategory = ({ item }: { item: AldiCategory }) =>
    renderCatRow({ store: 'aldi', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('aldi', item) });

  const renderHdCategory = ({ item }: { item: HiperdinoCategory }) =>
    renderCatRow({ store: 'hiperdino', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('hiperdino', item) });

  const renderAcCategory = ({ item }: { item: AlcampoCategory }) =>
    renderCatRow({ store: 'alcampo', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('alcampo', item) });

  const renderPfCategory = ({ item }: { item: PlusfrescCategory }) =>
    renderCatRow({ store: 'plusfresc', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('plusfresc', item) });

  // Estados de un listado de búsqueda de productos (compartido).
  const renderSearchStates = (search: string, loading: boolean, error: boolean, empty: boolean, list: React.ReactNode) => {
    if (search.trim().length < 2)
      return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.minLetters')}</Text></View>;
    if (loading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />;
    if (error) return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.searchError')}</Text></View>;
    if (empty) return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.noResults')}</Text></View>;
    return list;
  };

  // Pestaña "Productos" de un súper: con texto (≥2 letras) → búsqueda server-side
  // de siempre; sin texto → navegación alfabética del catálogo paginada (browse).
  const renderProductsTab = (
    query: string, searchLoading: boolean, searchError: boolean, searchItems: UIProduct[],
  ) => {
    const orderedSearchItems = [...searchItems].sort((a, b) => {
      // Los productos sin precio quedan al final en ambos sentidos: no es
      // correcto presentarlos como el precio más alto al ordenar descendente.
      if (a.unitPrice == null && b.unitPrice == null) return 0;
      if (a.unitPrice == null) return 1;
      if (b.unitPrice == null) return -1;
      return productOrder === 'asc'
        ? a.unitPrice - b.unitPrice
        : b.unitPrice - a.unitPrice;
    });
    if (query.trim().length >= 2) {
      return renderSearchStates(
        query, searchLoading, searchError, orderedSearchItems.length === 0,
        <StoreProductList
          products={orderedSearchItems}
          searchQuery={undefined}
          hideToolbar viewMode={prodViewMode} onViewModeChange={setProdViewMode}
          onEndReached={store === 'all' ? loadMoreAllSearch : undefined}
          loadingMore={store === 'all' && allSearchMore}
          keepOrder
          roundedCards
          showStoreLogo={store === 'all'}
          topInset={glassInset}
          onScrollBeginDrag={() => setProductSearchFocus(false)}
        />,
      );
    }
    if (browseLoading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />;
    if (browseError) return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.searchError')}</Text></View>;
    return (
      <StoreProductList
        products={browse}
        hideToolbar viewMode={prodViewMode} onViewModeChange={setProdViewMode}
        roundedCards
        showStoreLogo={store === 'all'}
        keepOrder
        onEndReached={loadMoreBrowse}
        loadingMore={browseMore}
        topInset={glassInset}
        onScrollBeginDrag={() => setProductSearchFocus(false)}
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

  // Fila de búsqueda de productos: los dos selectores conservan exactamente el
  // patrón existente de lista/cuadrícula; el primero solo cambia el precio.
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
          onFocus={() => setProductSearchFocus(true)}
          onBlur={() => setProductSearchFocus(false)}
          returnKeyType="search"
          autoCorrect={false}
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChange('')}>
            <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.prodControls}>
        {glassAvailable ? (
          <SlidingSegments
            compact
            segments={[{ key: 'asc', icon: 'arrow-up' }, { key: 'desc', icon: 'arrow-down' }]}
            value={productOrder}
            onChange={(value) => setProductOrder(value as 'asc' | 'desc')}
          />
        ) : (
          <View style={styles.viewToggle}>
            <TouchableOpacity style={[styles.viewBtn, productOrder === 'asc' && styles.viewBtnOn]} onPress={() => setProductOrder('asc')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Precio ascendente">
              <Ionicons name="arrow-up" size={18} color={productOrder === 'asc' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.viewBtn, productOrder === 'desc' && styles.viewBtnOn]} onPress={() => setProductOrder('desc')} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Precio descendente">
              <Ionicons name="arrow-down" size={18} color={productOrder === 'desc' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
          </View>
        )}
        {!productSearchExpanded && (glassAvailable ? (
          <SlidingSegments
            compact
            segments={[{ key: 'list', icon: 'list' }, { key: 'grid', icon: 'grid' }]}
            value={prodViewMode}
            onChange={(value) => setProdViewMode(value as ViewMode)}
          />
        ) : (
          <View style={styles.viewToggle}>
            <TouchableOpacity style={[styles.viewBtn, prodViewMode === 'list' && styles.viewBtnOn]} onPress={() => setProdViewMode('list')} activeOpacity={0.85}>
              <Ionicons name="list" size={19} color={prodViewMode === 'list' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.viewBtn, prodViewMode === 'grid' && styles.viewBtnOn]} onPress={() => setProdViewMode('grid')} activeOpacity={0.85}>
              <Ionicons name="grid" size={17} color={prodViewMode === 'grid' ? colors.white : colors.inkSoft} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </View>
  );

  // Mismo selector con logo y chevrón que Novedades.
  const storeSelectorBlock = visibleStores.length > 0 && (
    <StoreDropdown
      stores={visibleStores}
      value={store}
      onChange={handleStoreChange}
      includeAll
      labeled
      modal={false}
      open={storeMenuOpen}
      onOpenChange={setStoreMenuOpen}
    />
  );
  const tabSegments: Segment<'productos' | 'categorias'>[] = [
    { key: 'productos', label: t('catalog.tabProducts'), icon: 'cube-outline' },
  ];
  if (!isAllStores) {
    tabSegments.push({ key: 'categorias', label: t('catalog.tabCategories'), icon: 'grid-outline' });
  }

  // Chrome de la pantalla (cabecera + fila de pestañas/selector + buscador),
  // rediseñado según el panel de Claude Design (segmentado de pastilla blanca,
  // chip redondo de súper, buscador y toggle redondeados). Es idéntico en ambos
  // modos; en glass va dentro de la franja de cristal flotante.
  const chrome = (
    <>
      <View style={[styles.headerArea, { paddingTop: headerTop }]}>
        <Text style={styles.title}>{t('catalog.title')}</Text>
        {storeSelectorBlock}
      </View>

      {/* Fila única: pestañas Productos/Categorías (flex) + selector de súper
          como bloque aparte a la derecha. En glass, píldora de acento deslizante
          (SlidingSegments) para conservar el efecto al cambiar de pestaña; en
          fallback, segmentado de pastilla blanca estático (Claude Design). */}
      <View style={styles.controlsRow}>
        {glassAvailable ? (
          <SlidingSegments
            style={{ flex: 1 }}
            segments={tabSegments}
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
            {!isAllStores && (
              <TouchableOpacity
                style={[styles.segBtn, tab === 'categorias' && styles.segBtnOn]}
                onPress={() => setTab('categorias')}
                activeOpacity={0.85}
              >
                <Ionicons name="grid-outline" size={16} color={tab === 'categorias' ? colors.accent : colors.inkSoft} />
                <Text style={[styles.segTxt, tab === 'categorias' ? styles.segTxtOn : styles.segTxtOff]}>{t('catalog.tabCategories')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Buscador de la pestaña activa (categorías compartido; productos por súper). */}
      {tab === 'categorias'
        ? searchBar(t('catalog.searchCategories'), catSearch, setCatSearch)
        : productSearchRow(t('catalog.searchProducts'), prodQuery, setProdQuery)}
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && chrome}

      {store === 'all' && tab === 'categorias' && (
        <FlatList
          data={visibleStores}
          keyExtractor={(item) => item.key}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.categoryStoreRow}
              onPress={() => handleStoreChange(item.key)}
              activeOpacity={0.8}
            >
              <View style={styles.categoryStoreLogoWrap}>
                {item.icon ? (
                  <Image source={item.icon} style={styles.categoryStoreLogo} resizeMode="cover" />
                ) : (
                  <Ionicons name="storefront" size={22} color={colors.accent} />
                )}
              </View>
              <Text style={styles.categoryStoreName}>{item.name}</Text>
              <Ionicons name="chevron-forward" size={19} color={colors.inkSoft} />
            </TouchableOpacity>
          )}
        />
      )}

      {store === 'all' && tab === 'productos' && (
        <>{renderProductsTab(allSearch, allLoading, allError, allResults)}</>
      )}

      {/* ── Mercadona ───────────────────────────────────────────── */}
      {store === 'mercadona' && tab === 'categorias' && (
        <>
          {catLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'mercadona' && tab === 'productos' && (
        <>
          {renderProductsTab(prodSearch, prodLoading, prodError, prodResults.map((p) => mercadonaToUI(p)))}
        </>
      )}

      {/* ── BonpreuEsclat ───────────────────────────────────────── */}
      {store === 'esclat' && tab === 'categorias' && (
        <>
          {bpCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'esclat' && tab === 'productos' && (
        <>
          {renderProductsTab(bpSearch, bpLoading, bpError, bpResults.map(bonpreuToUI))}
        </>
      )}

      {/* ── Carrefour ───────────────────────────────────────────── */}
      {store === 'carrefour' && tab === 'categorias' && (
        <>
          {cfCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'carrefour' && tab === 'productos' && (
        <>
          {renderProductsTab(cfSearch, cfLoading, cfError, cfResults.map(carrefourToUI))}
        </>
      )}

      {/* ── bonÀrea ──────────────────────────────────────────────── */}
      {store === 'bonarea' && tab === 'categorias' && (
        <>
          {baCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'bonarea' && tab === 'productos' && (
        <>
          {renderProductsTab(baSearch, baLoading, baError, baResults.map(bonareaToUI))}
        </>
      )}

      {/* ── Consum ───────────────────────────────────────────────── */}
      {store === 'consum' && tab === 'categorias' && (
        <>
          {csCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'consum' && tab === 'productos' && (
        <>
          {renderProductsTab(csSearch, csLoading, csError, csResults.map(consumToUI))}
        </>
      )}

      {/* ── Dia ──────────────────────────────────────────────────── */}
      {store === 'dia' && tab === 'categorias' && (
        <>
          {ddCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'dia' && tab === 'productos' && (
        <>
          {renderProductsTab(ddSearch, ddLoading, ddError, ddResults.map(diaToUI))}
        </>
      )}

      {/* ── Sorli ────────────────────────────────────────────────── */}
      {store === 'sorli' && tab === 'categorias' && (
        <>
          {soCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
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
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'sorli' && tab === 'productos' && (
        <>
          {renderProductsTab(soSearch, soLoading, soError, soResults.map(sorliToUI))}
        </>
      )}

      {/* ── Eroski ───────────────────────────────────────────────── */}
      {store === 'eroski' && tab === 'categorias' && (
        <>
          {ekCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : ekCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Eroski' })}</Text>
              <TouchableOpacity onPress={() => {
                setEkCatsError(false); setEkCatsLoading(true);
                fetchEroskiCategoryTree().then(setEkCats).catch(() => setEkCatsError(true)).finally(() => setEkCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(ekCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderEkCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'eroski' && tab === 'productos' && (
        <>
          {renderProductsTab(ekSearch, ekLoading, ekError, ekResults.map(eroskiToUI))}
        </>
      )}

      {/* ── Caprabo ──────────────────────────────────────────────── */}
      {store === 'caprabo' && tab === 'categorias' && (
        <>
          {cbCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : cbCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Caprabo' })}</Text>
              <TouchableOpacity onPress={() => {
                setCbCatsError(false); setCbCatsLoading(true);
                fetchCapraboCategoryTree().then(setCbCats).catch(() => setCbCatsError(true)).finally(() => setCbCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(cbCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderCbCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'caprabo' && tab === 'productos' && (
        <>
          {renderProductsTab(cbSearch, cbLoading, cbError, cbResults.map(capraboToUI))}
        </>
      )}

      {/* ── Condis ───────────────────────────────────────────────── */}
      {store === 'condis' && tab === 'categorias' && (
        <>
          {coCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : coCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Condis' })}</Text>
              <TouchableOpacity onPress={() => {
                setCoCatsError(false); setCoCatsLoading(true);
                fetchCondisCategoryTree().then(setCoCats).catch(() => setCoCatsError(true)).finally(() => setCoCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(coCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderCoCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'condis' && tab === 'productos' && (
        <>
          {renderProductsTab(coSearch, coLoading, coError, coResults.map(condisToUI))}
        </>
      )}

      {/* ── Ametller Origen ──────────────────────────────────────── */}
      {store === 'ametller' && tab === 'categorias' && (
        <>
          {amCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : amCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Ametller Origen' })}</Text>
              <TouchableOpacity onPress={() => {
                setAmCatsError(false); setAmCatsLoading(true);
                fetchAmetllerCategoryTree().then(setAmCats).catch(() => setAmCatsError(true)).finally(() => setAmCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(amCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderAmCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'ametller' && tab === 'productos' && (
        <>
          {renderProductsTab(amSearch, amLoading, amError, amResults.map(ametllerToUI))}
        </>
      )}

      {/* ── Aldi ─────────────────────────────────────────────────── */}
      {store === 'aldi' && tab === 'categorias' && (
        <>
          {alCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : alCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Aldi' })}</Text>
              <TouchableOpacity onPress={() => {
                setAlCatsError(false); setAlCatsLoading(true);
                fetchAldiCategoryTree().then(setAlCats).catch(() => setAlCatsError(true)).finally(() => setAlCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(alCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderAlCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'aldi' && tab === 'productos' && (
        <>
          {renderProductsTab(alSearch, alLoading, alError, alResults.map(aldiToUI))}
        </>
      )}

      {/* ── HiperDino ────────────────────────────────────────────── */}
      {store === 'hiperdino' && tab === 'categorias' && (
        <>
          {hdCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : hdCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'HiperDino' })}</Text>
              <TouchableOpacity onPress={() => {
                setHdCatsError(false); setHdCatsLoading(true);
                fetchHiperdinoCategoryTree().then(setHdCats).catch(() => setHdCatsError(true)).finally(() => setHdCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(hdCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderHdCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'hiperdino' && tab === 'productos' && (
        <>
          {renderProductsTab(hdSearch, hdLoading, hdError, hdResults.map(hiperdinoToUI))}
        </>
      )}

      {/* ── Alcampo ──────────────────────────────────────────────── */}
      {store === 'alcampo' && tab === 'categorias' && (
        <>
          {acCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : acCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Alcampo' })}</Text>
              <TouchableOpacity onPress={() => {
                setAcCatsError(false); setAcCatsLoading(true);
                fetchAlcampoCategoryTree().then(setAcCats).catch(() => setAcCatsError(true)).finally(() => setAcCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(acCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderAcCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'alcampo' && tab === 'productos' && (
        <>
          {renderProductsTab(acSearch, acLoading, acError, acResults.map(alcampoToUI))}
        </>
      )}

      {/* ── Plusfresc ────────────────────────────────────────────── */}
      {store === 'plusfresc' && tab === 'categorias' && (
        <>
          {pfCatsLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />
          ) : pfCatsError ? (
            <View style={styles.centerBox}>
              <Text style={styles.errorText}>{t('catalog.loadErrorStore', { store: 'Plusfresc' })}</Text>
              <TouchableOpacity onPress={() => {
                setPfCatsError(false); setPfCatsLoading(true);
                fetchPlusfrescCategoryTree().then(setPfCats).catch(() => setPfCatsError(true)).finally(() => setPfCatsLoading(false));
              }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={sortedCats(pfCats)}
              keyExtractor={(item) => item.id}
              renderItem={renderPfCategory}
              contentContainerStyle={[styles.list, { paddingBottom: bottomPad, paddingTop: 4 + glassInset }]}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          )}
        </>
      )}

      {store === 'plusfresc' && tab === 'productos' && (
        <>
          {renderProductsTab(pfSearch, pfLoading, pfError, pfResults.map(plusfrescToUI))}
        </>
      )}

      {/* Chrome de cristal: al FINAL del árbol para pintarse encima; la lista
          se refracta al pasar por debajo (topInset = altura medida del chrome).
          El selector sigue dentro: el cristal arranca en y=0 y su onLayout mide
          en pantalla (measureInWindow) para anclar el menú. */}
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

      {/* Panel de tiendas: rejilla a pantalla completa en DOS COLUMNAS (cada súper
          = tarjeta cuadrada de esquinas redondeadas con logo + nombre en columna),
          mismo diseño que Ofertas/Novedades/Cambios de precios. */}
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
            data={visibleStores}
            keyExtractor={(s) => s.key}
            numColumns={2}
            extraData={store}
            columnWrapperStyle={styles.storeGridRow}
            contentContainerStyle={[styles.storeGrid, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={(
              <Pressable
                style={({ pressed }) => [
                  styles.storeAllCard,
                  store === 'all' && styles.storeCardActive,
                  allLocked && styles.storeAllCardLocked,
                  pressed && styles.storeCardPressed,
                ]}
                onPress={() => {
                  if (allLocked) {
                    setStoreMenuOpen(false);
                    setPaywallVisible(true);
                    return;
                  }
                  handleStoreChange('all');
                  setStoreMenuOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: store === 'all', disabled: allLocked }}
              >
                {store === 'all' && (
                  <View style={styles.storeCardCheck}>
                    <Ionicons name="checkmark" size={14} color={colors.white} />
                  </View>
                )}
                <View style={styles.storeAllIconWrap}>
                  <Ionicons name="apps" size={24} color={colors.accent} />
                </View>
                <Text style={[styles.storeCardName, store === 'all' && styles.storeCardNameActive]}>
                  {t('common.all')}
                </Text>
                {allLocked && <Ionicons name="lock-closed" size={17} color={colors.inkSoft} />}
              </Pressable>
            )}
            renderItem={({ item }) => {
              const on = item.key === store;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.storeCard,
                    on && styles.storeCardActive,
                    pressed && styles.storeCardPressed,
                  ]}
                  onPress={() => { handleStoreChange(item.key); setStoreMenuOpen(false); }}
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

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        subtitle={t('paywall.allStoresSubtitle')}
      />

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
    flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3,
  },

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
  storeAllCard: {
    height: 78,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    marginBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.white,
    borderRadius: 20,
    borderWidth: 1, borderColor: colors.border,
  },
  storeAllCardLocked: { backgroundColor: colors.surfaceAlt },
  storeAllIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white,
  },
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

  // ── Search ────────────────────────────────────────────────────
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
  searchInput: {
    flex: 1, fontSize: 14, color: colors.ink, padding: 0,
    fontFamily: fonts.medium,
  },
  // Fila de búsqueda de productos: barra (flex) + orden + lista/cuadrícula.
  prodSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 8,
  },
  // La barra dentro de la fila no lleva márgenes propios (los pone la fila).
  prodSearchBox: { flex: 1, marginHorizontal: 0, marginBottom: 0, minWidth: 0 },
  prodControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  // ── Category rows ─────────────────────────────────────────────
  list: { paddingHorizontal: 16, paddingBottom: 20, paddingTop: 4 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    padding: 11, gap: 12,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  categoryStoreRow: {
    minHeight: 64,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 18,
  },
  categoryStoreLogoWrap: {
    width: 42, height: 42, borderRadius: 21, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  categoryStoreLogo: { width: '100%', height: '100%' },
  categoryStoreName: { flex: 1, fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  moreBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  thumbnail: {
    width: 42, height: 42,
    borderRadius: 14,
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

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0 },
  chromeGlass: { paddingBottom: 2 },
});
