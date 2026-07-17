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
import { useGuidedTour, useTourAnchor } from '../context/GuidedTourContext';
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
import ActionSheet from '../components/ActionSheet';
import StoreProductList from '../components/StoreProductList';
import { type ViewMode } from '../components/ViewModeToggle';
import ActiveCartBanner from '../components/ActiveCartBanner';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';

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
async function loadBrowsePage(
  store: CatalogStore,
  cursor: BrowseCursor | null,
  region: RegionValue | null,
  postalCode: string | null,
): Promise<BrowsePage<UIProduct>> {
  switch (store) {
    case 'mercadona': { const { items, nextCursor } = await browseProducts(cursor, region); return { items: items.map((p) => mercadonaToUI(p)), nextCursor }; }
    case 'esclat':    { const { items, nextCursor } = await browseBonpreuProducts(cursor); return { items: items.map(bonpreuToUI), nextCursor }; }
    case 'carrefour': { const { items, nextCursor } = await browseCarrefourProducts(cursor, region); return { items: items.map(carrefourToUI), nextCursor }; }
    case 'bonarea':   { const { items, nextCursor } = await browseBonareaProducts(cursor); return { items: items.map(bonareaToUI), nextCursor }; }
    case 'consum':    { const { items, nextCursor } = await browseConsumProducts(cursor, region, postalCode); return { items: items.map(consumToUI), nextCursor }; }
    case 'dia':       { const { items, nextCursor } = await browseDiaProducts(cursor, region); return { items: items.map(diaToUI), nextCursor }; }
    case 'sorli':     { const { items, nextCursor } = await browseSorliProducts(cursor); return { items: items.map(sorliToUI), nextCursor }; }
    case 'eroski':    { const { items, nextCursor } = await browseEroskiProducts(cursor); return { items: items.map(eroskiToUI), nextCursor }; }
    case 'caprabo':   { const { items, nextCursor } = await browseCapraboProducts(cursor); return { items: items.map(capraboToUI), nextCursor }; }
    case 'condis':    { const { items, nextCursor } = await browseCondisProducts(cursor); return { items: items.map(condisToUI), nextCursor }; }
    case 'ametller':  { const { items, nextCursor } = await browseAmetllerProducts(cursor); return { items: items.map(ametllerToUI), nextCursor }; }
    case 'aldi':      { const { items, nextCursor } = await browseAldiProducts(cursor); return { items: items.map(aldiToUI), nextCursor }; }
    case 'hiperdino': { const { items, nextCursor } = await browseHiperdinoProducts(cursor); return { items: items.map(hiperdinoToUI), nextCursor }; }
    case 'alcampo':   { const { items, nextCursor } = await browseAlcampoProducts(cursor); return { items: items.map(alcampoToUI), nextCursor }; }
    case 'plusfresc': { const { items, nextCursor } = await browsePlusfrescProducts(cursor, postalCode); return { items: items.map(plusfrescToUI), nextCursor }; }
  }
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
  const { notify: tourNotify, stepId: tourStepId, setStoreMenuOpen: tourSetStoreMenuOpen } = useGuidedTour();
  const storeAnchor = useTourAnchor('storeSelector');
  const firstCatAnchor = useTourAnchor('firstCategory');
  const [sheetCat, setSheetCat] = useState<CatRow | null>(null);
  const [store, setStore] = useState<StoreKey>('mercadona');
  const [tab, setTab] = useState<'categorias' | 'productos'>('productos');
  // Vista lista/cuadrícula compartida por los listados de búsqueda de productos
  // (la controla la fila de búsqueda, no el toolbar interno de StoreProductList).
  const [prodViewMode, setProdViewMode] = useState<ViewMode>('list');

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

  // Resetea el aviso del tour al desmontar. (El efecto que informa de apertura
  // + nº de supers vive más abajo, tras calcular `visibleStores`.)
  useEffect(() => () => tourSetStoreMenuOpen(false), [tourSetStoreMenuOpen]);

  // Solo se muestran los supermercados elegidos en el perfil ∩ los disponibles
  // en su comunidad autónoma (regionales solo en su zona; con region 'ES' o
  // NULL no se filtra nada). La preferencia NO se reescribe al cambiar de CCAA:
  // los súpers de fuera solo dejan de mostrarse y reaparecen si vuelve. Si la
  // intersección queda vacía (eligió solo súpers de otra región), cae a todos
  // los de la región — nunca un catálogo vacío (los nacionales están en todas).
  const { profile } = useProfile();
  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const prefStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const prefInRegion = prefStores.filter((k) => storeInRegion(k, region));
  const enabledStores = prefInRegion.length > 0 ? prefInRegion : storesForRegion(region);
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
  const [browseMore, setBrowseMore] = useState(false);       // páginas siguientes
  const [browseError, setBrowseError] = useState(false);
  // Texto de búsqueda del súper activo: con <2 letras estamos en modo navegación.
  const prodQuery = { mercadona: prodSearch, esclat: bpSearch, carrefour: cfSearch, bonarea: baSearch, consum: csSearch, dia: ddSearch, sorli: soSearch, eroski: ekSearch, caprabo: cbSearch, condis: coSearch, ametller: amSearch, aldi: alSearch, hiperdino: hdSearch, alcampo: acSearch, plusfresc: pfSearch }[store];
  // Setter de búsqueda de productos del súper activo (para la fila de búsqueda
  // única que ahora vive en el chrome, en vez de una por bloque de súper).
  const setProdQuery = { mercadona: setProdSearch, esclat: setBpSearch, carrefour: setCfSearch, bonarea: setBaSearch, consum: setCsSearch, dia: setDdSearch, sorli: setSoSearch, eroski: setEkSearch, caprabo: setCbSearch, condis: setCoSearch, ametller: setAmSearch, aldi: setAlSearch, hiperdino: setHdSearch, alcampo: setAcSearch, plusfresc: setPfSearch }[store];
  const browseMode = tab === 'productos' && prodQuery.trim().length < 2;

  // Carga la página 1 al entrar a navegación (cambio de súper, limpiar la
  // búsqueda o abrir la pestaña Productos sin texto).
  useEffect(() => {
    if (!browseMode) return;
    let cancelled = false;
    setBrowse([]); setBrowseCursor(null); setBrowseError(false); setBrowseMore(false); setBrowseLoading(true);
      loadBrowsePage(store, null, region, postalCode)
      .then(({ items, nextCursor }) => { if (!cancelled) { setBrowse(items); setBrowseCursor(nextCursor); } })
      .catch(() => { if (!cancelled) setBrowseError(true); })
      .finally(() => { if (!cancelled) setBrowseLoading(false); });
    return () => { cancelled = true; };
  }, [store, browseMode, lang, region, postalCode]);

  // Siguiente página keyset al llegar al final de la lista.
  const loadMoreBrowse = () => {
    if (browseLoading || browseMore || browseCursor == null) return;
    const cursor = browseCursor;
    setBrowseMore(true);
      loadBrowsePage(store, cursor, region, postalCode)
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
      searchProducts(q, region).then(setProdResults).catch(() => setProdError(true)).finally(() => setProdLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [prodSearch, lang, region]);

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
      searchCarrefourProducts(q, region).then(setCfResults).catch(() => setCfError(true)).finally(() => setCfLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [cfSearch, region]);

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
      searchConsumProducts(q, region, postalCode).then(setCsResults).catch(() => setCsError(true)).finally(() => setCsLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [csSearch, region, postalCode]);

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
      searchDiaProducts(q, region).then(setDdResults).catch(() => setDdError(true)).finally(() => setDdLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [ddSearch, region]);

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

  // Carga perezosa de categorías Eroski la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'eroski' || ekCats.length > 0 || ekCatsLoading) return;
    setEkCatsLoading(true); setEkCatsError(false);
    fetchEroskiCategoryTree()
      .then(setEkCats)
      .catch(() => setEkCatsError(true))
      .finally(() => setEkCatsLoading(false));
  }, [store]);

  // Eroski: búsqueda server-side con debounce.
  useEffect(() => {
    const q = ekSearch.trim();
    if (q.length < 2) { setEkResults([]); setEkError(false); setEkLoading(false); return; }
    setEkLoading(true); setEkError(false);
    const handle = setTimeout(() => {
      searchEroskiProducts(q).then(setEkResults).catch(() => setEkError(true)).finally(() => setEkLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [ekSearch]);

  // Carga perezosa de categorías Caprabo la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'caprabo' || cbCats.length > 0 || cbCatsLoading) return;
    setCbCatsLoading(true); setCbCatsError(false);
    fetchCapraboCategoryTree()
      .then(setCbCats)
      .catch(() => setCbCatsError(true))
      .finally(() => setCbCatsLoading(false));
  }, [store]);

  // Caprabo: búsqueda server-side con debounce.
  useEffect(() => {
    const q = cbSearch.trim();
    if (q.length < 2) { setCbResults([]); setCbError(false); setCbLoading(false); return; }
    setCbLoading(true); setCbError(false);
    const handle = setTimeout(() => {
      searchCapraboProducts(q).then(setCbResults).catch(() => setCbError(true)).finally(() => setCbLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [cbSearch]);

  // Carga perezosa de categorías Condis la primera vez que se entra a esa tienda.
  useEffect(() => { setCoCats([]); }, [lang]);
  useEffect(() => {
    if (store !== 'condis' || coCats.length > 0 || coCatsLoading) return;
    setCoCatsLoading(true); setCoCatsError(false);
    fetchCondisCategoryTree()
      .then(setCoCats)
      .catch(() => setCoCatsError(true))
      .finally(() => setCoCatsLoading(false));
  }, [store, lang]);

  // Condis: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    const q = coSearch.trim();
    if (q.length < 2) { setCoResults([]); setCoError(false); setCoLoading(false); return; }
    setCoLoading(true); setCoError(false);
    const handle = setTimeout(() => {
      searchCondisProducts(q).then(setCoResults).catch(() => setCoError(true)).finally(() => setCoLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [coSearch, lang]);

  // Carga perezosa de categorías Ametller la primera vez que se entra a esa tienda.
  useEffect(() => { setAmCats([]); }, [lang]);
  useEffect(() => {
    if (store !== 'ametller' || amCats.length > 0 || amCatsLoading) return;
    setAmCatsLoading(true); setAmCatsError(false);
    fetchAmetllerCategoryTree()
      .then(setAmCats)
      .catch(() => setAmCatsError(true))
      .finally(() => setAmCatsLoading(false));
  }, [store, lang]);

  // Ametller: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    const q = amSearch.trim();
    if (q.length < 2) { setAmResults([]); setAmError(false); setAmLoading(false); return; }
    setAmLoading(true); setAmError(false);
    const handle = setTimeout(() => {
      searchAmetllerProducts(q).then(setAmResults).catch(() => setAmError(true)).finally(() => setAmLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [amSearch, lang]);

  // Carga perezosa de categorías Aldi la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'aldi' || alCats.length > 0 || alCatsLoading) return;
    setAlCatsLoading(true); setAlCatsError(false);
    fetchAldiCategoryTree()
      .then(setAlCats)
      .catch(() => setAlCatsError(true))
      .finally(() => setAlCatsLoading(false));
  }, [store]);

  // Aldi: búsqueda server-side con debounce (es-only).
  useEffect(() => {
    const q = alSearch.trim();
    if (q.length < 2) { setAlResults([]); setAlError(false); setAlLoading(false); return; }
    setAlLoading(true); setAlError(false);
    const handle = setTimeout(() => {
      searchAldiProducts(q).then(setAlResults).catch(() => setAlError(true)).finally(() => setAlLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [alSearch]);

  // Carga perezosa de categorías HiperDino la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'hiperdino' || hdCats.length > 0 || hdCatsLoading) return;
    setHdCatsLoading(true); setHdCatsError(false);
    fetchHiperdinoCategoryTree()
      .then(setHdCats)
      .catch(() => setHdCatsError(true))
      .finally(() => setHdCatsLoading(false));
  }, [store]);

  // HiperDino: búsqueda server-side con debounce (es-only).
  useEffect(() => {
    const q = hdSearch.trim();
    if (q.length < 2) { setHdResults([]); setHdError(false); setHdLoading(false); return; }
    setHdLoading(true); setHdError(false);
    const handle = setTimeout(() => {
      searchHiperdinoProducts(q).then(setHdResults).catch(() => setHdError(true)).finally(() => setHdLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [hdSearch]);

  // Carga perezosa de categorías Alcampo la primera vez que se entra a esa tienda.
  useEffect(() => {
    if (store !== 'alcampo' || acCats.length > 0 || acCatsLoading) return;
    setAcCatsLoading(true); setAcCatsError(false);
    fetchAlcampoCategoryTree()
      .then(setAcCats)
      .catch(() => setAcCatsError(true))
      .finally(() => setAcCatsLoading(false));
  }, [store]);

  // Alcampo: búsqueda server-side con debounce (es-only).
  useEffect(() => {
    const q = acSearch.trim();
    if (q.length < 2) { setAcResults([]); setAcError(false); setAcLoading(false); return; }
    setAcLoading(true); setAcError(false);
    const handle = setTimeout(() => {
      searchAlcampoProducts(q).then(setAcResults).catch(() => setAcError(true)).finally(() => setAcLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [acSearch]);

  // Carga perezosa de categorías Plusfresc la primera vez que se entra a esa tienda.
  useEffect(() => { setPfCats([]); }, [lang]);
  useEffect(() => {
    if (store !== 'plusfresc' || pfCats.length > 0 || pfCatsLoading) return;
    setPfCatsLoading(true); setPfCatsError(false);
    fetchPlusfrescCategoryTree()
      .then(setPfCats)
      .catch(() => setPfCatsError(true))
      .finally(() => setPfCatsLoading(false));
  }, [store, lang]);

  // Plusfresc: búsqueda server-side con debounce (bilingüe: re-busca al cambiar idioma).
  useEffect(() => {
    const q = pfSearch.trim();
    if (q.length < 2) { setPfResults([]); setPfError(false); setPfLoading(false); return; }
    setPfLoading(true); setPfError(false);
    const handle = setTimeout(() => {
      searchPlusfrescProducts(q, postalCode).then(setPfResults).catch(() => setPfError(true)).finally(() => setPfLoading(false));
    }, 300);
    return () => clearTimeout(handle);
  }, [pfSearch, lang, postalCode]);

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

  const renderEkCategory = ({ item, index }: { item: TapestryCategory; index: number }) =>
    renderCatRow({ store: 'eroski', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('eroski', item) }, index === 0);

  const renderCbCategory = ({ item, index }: { item: TapestryCategory; index: number }) =>
    renderCatRow({ store: 'caprabo', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('caprabo', item) }, index === 0);

  const renderCoCategory = ({ item, index }: { item: CondisCategory; index: number }) =>
    renderCatRow({ store: 'condis', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('condis', item) }, index === 0);

  const renderAmCategory = ({ item, index }: { item: AmetllerCategory; index: number }) =>
    renderCatRow({ store: 'ametller', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('ametller', item) }, index === 0);

  const renderAlCategory = ({ item, index }: { item: AldiCategory; index: number }) =>
    renderCatRow({ store: 'aldi', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('aldi', item) }, index === 0);

  const renderHdCategory = ({ item, index }: { item: HiperdinoCategory; index: number }) =>
    renderCatRow({ store: 'hiperdino', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('hiperdino', item) }, index === 0);

  const renderAcCategory = ({ item, index }: { item: AlcampoCategory; index: number }) =>
    renderCatRow({ store: 'alcampo', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('alcampo', item) }, index === 0);

  const renderPfCategory = ({ item, index }: { item: PlusfrescCategory; index: number }) =>
    renderCatRow({ store: 'plusfresc', refId: item.id, name: item.name, subcount: item.children.length, onOpen: () => goToMirrorSubcategories('plusfresc', item) }, index === 0);

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
    if (query.trim().length >= 2) {
      return renderSearchStates(
        query, searchLoading, searchError, searchItems.length === 0,
        <StoreProductList
          products={searchItems}
          searchQuery={query}
          hideToolbar viewMode={prodViewMode} onViewModeChange={setProdViewMode}
          topInset={glassInset}
        />,
      );
    }
    if (browseLoading) return <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 + glassInset }} />;
    if (browseError) return <View style={styles.centerBox}><Text style={styles.errorText}>{t('catalog.searchError')}</Text></View>;
    return (
      <StoreProductList
        products={browse}
        hideToolbar viewMode={prodViewMode} onViewModeChange={setProdViewMode}
        onEndReached={loadMoreBrowse}
        loadingMore={browseMore}
        topInset={glassInset}
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
  // lista/cuadrícula a la derecha, en una sola fila. En glass el toggle es un
  // SlidingSegments compacto (misma píldora de acento deslizante que las
  // pestañas); en fallback, la pastilla estática de Claude Design.
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
      {glassAvailable ? (
        <SlidingSegments
          compact
          segments={[
            { key: 'list', icon: 'list' },
            { key: 'grid', icon: 'grid' },
          ]}
          value={prodViewMode}
          onChange={setProdViewMode}
        />
      ) : (
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.viewBtn, prodViewMode === 'list' && styles.viewBtnOn]}
            onPress={() => setProdViewMode('list')}
            activeOpacity={0.85}
          >
            <Ionicons name="list" size={19} color={prodViewMode === 'list' ? colors.white : colors.inkSoft} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.viewBtn, prodViewMode === 'grid' && styles.viewBtnOn]}
            onPress={() => setProdViewMode('grid')}
            activeOpacity={0.85}
          >
            <Ionicons name="grid" size={17} color={prodViewMode === 'grid' ? colors.white : colors.inkSoft} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  // Selector de súper compacto: chip REDONDO con solo el logo del súper activo,
  // como bloque aparte en la misma fila que las pestañas. Al tocar abre el panel
  // de cristal centrado (ya no un desplegable anclado), así que no necesita medir
  // su rect; el wrapper conserva el ancla del tutorial (ring sobre el selector).
  const storeSelectorBlock = (visibleStores.length > 1 || tourStepId === 'store') && (
    <View ref={storeAnchor.ref} collapsable={false} onLayout={storeAnchor.onLayout}>
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
    </View>
  );

  // Chrome de la pantalla (cabecera + fila de pestañas/selector + buscador),
  // rediseñado según el panel de Claude Design (segmentado de pastilla blanca,
  // chip redondo de súper, buscador y toggle redondeados). Es idéntico en ambos
  // modos; en glass va dentro de la franja de cristal flotante.
  const chrome = (
    <>
      <View style={[styles.headerArea, { paddingTop: headerTop }]}>
        <Text style={styles.title}>{t('catalog.title')}</Text>
        <ActiveCartBanner compact />
      </View>

      {/* Fila única: pestañas Productos/Categorías (flex) + selector de súper
          como bloque aparte a la derecha. En glass, píldora de acento deslizante
          (SlidingSegments) para conservar el efecto al cambiar de pestaña; en
          fallback, segmentado de pastilla blanca estático (Claude Design). */}
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
            extraData={[store, tourStepId, storeMenuOpen]}
            columnWrapperStyle={styles.storeGridRow}
            contentContainerStyle={[styles.storeGrid, { paddingBottom: insets.bottom + 24 }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const on = item.key === store;
              // Tutorial (paso 3): resalta el súper objetivo (el 2º para enseñar a
              // cambiar; el 1º si solo hay uno) y atenúa el resto.
              const tourActive = tourStepId === 'store' && storeMenuOpen;
              const dimmed = tourActive && index !== tourTargetIdx;
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.storeCard,
                    on && styles.storeCardActive,
                    pressed && styles.storeCardPressed,
                    dimmed && styles.storeCardDim,
                  ]}
                  onPress={() => { setStore(item.key); setStoreMenuOpen(false); tourNotify('storeSelect'); }}
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
                  {/* Anillo de acento que "respira" sobre el súper objetivo. */}
                  {tourActive && index === tourTargetIdx && (
                    <Animated.View
                      pointerEvents="none"
                      style={[styles.storeCardRing, {
                        opacity: menuPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }),
                      }]}
                    />
                  )}
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
  storeCardDim: { opacity: 0.3 },
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
  // Tutorial: anillo de acento que "respira" sobre el súper objetivo.
  storeCardRing: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 20, borderWidth: 3, borderColor: colors.accent,
  },

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

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0 },
  chromeGlass: { paddingBottom: 2 },
});
