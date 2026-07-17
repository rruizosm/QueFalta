/**
 * GuidedTourContext — la "demo" interactiva de la app: un tutorial GUIADO POR
 * ACCIONES REALES (no tooltips pasivos). Cada paso resalta un elemento y solo
 * avanza cuando el usuario hace la acción correcta. Recortado al *core loop*
 * (comprar en grupo); los extras (favoritos) se descubren solos:
 *
 *   1. Prepara un carrito (Grupos)     → activeCart deja de ser null
 *                                        (crea grupo si no tiene + Activar carrito)
 *   2. Abre el Catálogo                → pestaña Catalog enfocada
 *   3. Selecciona un supermercado      → notify('storeSelect') (2 fases: selector
 *                                        → 2º súper del desplegable)
 *   4. Añade el 2º producto            → notify('cartAdd') (el usuario navega
 *                                        categoría/subcategoría por su cuenta)
 *   5. Revísalo en Mi lista            → pestaña List
 *
 * NO bloquea la app: el overlay atenúa con un "agujero" sobre el objetivo pero
 * deja pasar los toques (pointerEvents). Solo la burbuja captura toques.
 *
 * Señales: rutas vía `navigationRef` (live binding de ../navigation), `useCart`
 * y `useFavorites`, y `notify()` para acciones puntuales que disparan los
 * propios componentes (CatalogScreen, StoreProductList).
 *
 * Anclaje: pestañas por geometría (debe coincidir con navigation/index.tsx);
 * elementos concretos vía `useTourAnchor(key)` (mide su rect en pantalla).
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Animated, Easing, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from './ThemeContext';
import { useTranslation } from './LanguageContext';
import { useAuth } from './AuthContext';
import { useCart } from './CartContext';
import { useFavorites } from './FavoritesContext';
import { useToast } from './ToastContext';
import { navigationRef } from '../navigation';

const SEEN_KEY = '@guidedtour_seen_v1';

// Debe coincidir con navigation/index.tsx: [Home, Catalog, List, Groups].
const TAB_COUNT = 4;
// Altura BASE de la barra (sin el inset inferior de Android) — debe coincidir
// con el `height: 70 + bottomInset` de `tabBarStyle` en navigation/index.tsx.
// Solo se usa como estimación de emergencia si el ancla 'tabBar' aún no se ha
// medido; en cuanto se mide, se usa su alto REAL (ver `barHeight` más abajo).
const TAB_BAR_HEIGHT = 70;
const TAB = { Home: 0, Catalog: 1, List: 2, Groups: 3 } as const;

const PRODUCT_ROUTES = [
  'Products', 'BonpreuProducts', 'CarrefourProducts',
  'BonareaProducts', 'ConsumProducts', 'DiaProducts', 'SorliProducts',
  'EroskiProducts', 'CapraboProducts', 'CondisProducts', 'AmetllerProducts', 'AldiProducts',
  'HiperdinoProducts', 'AlcampoProducts', 'PlusfrescProducts',
];

type AnchorKey =
  | 'storeSelector' | 'tabBar' | 'firstCategory' | 'firstSubcategory'
  | 'productStepper' | 'addButton' | 'createGroup' | 'activateCart';
type TourEvent = 'storeSelect' | 'qtyPicked' | 'cartAdd';

type Await =
  | 'cartActive' | 'tabCatalog' | 'route:SubCategory' | 'route:Products'
  | 'favorite' | 'route:Favorites' | 'tabList'
  | `event:${TourEvent}`;

type BubblePos = 'top' | 'bottom' | 'bottomAboveTabs';

interface Step {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  textKey: string;
  await: Await;
  tabIndex?: number;
  anchorKey?: AnchorKey;
  bubble: BubblePos;
}

// Recortado a 6 pasos (antes 10): fuera los dos de favoritos; "abre
// subcategoría" + "pulsa +" + "Añadir" se fusionan en un único paso 'add' que
// espera el evento final `cartAdd`. Los emisores/anclas sobrantes (qtyPicked,
// firstSubcategory, addButton) quedan inertes: no pasa nada si nadie los espera.
const STEPS: Step[] = [
  // anchorKey 'createGroup' solo existe cuando el usuario NO tiene grupos (la
  // pantalla de Grupos monta el CTA del estado vacío): el spotlight pasa del tab
  // al botón "crear grupo". Con grupos, no se registra → se ilumina el tab.
  { id: 'cart', icon: 'cart', tabIndex: TAB.Groups, anchorKey: 'createGroup', bubble: 'bottomAboveTabs', await: 'cartActive',
    titleKey: 'tour.cartTitle', textKey: 'tour.cartText' },
  { id: 'catalog', icon: 'grid', tabIndex: TAB.Catalog, bubble: 'bottomAboveTabs', await: 'tabCatalog',
    titleKey: 'tour.catalogTitle', textKey: 'tour.catalogText' },
  // store: tarjeta en la MISMA posición que catalog (encima de la barra de
  // pestañas); el chevron/spotlight apuntan al objetivo real (arriba/medio).
  { id: 'store', icon: 'storefront', anchorKey: 'storeSelector', bubble: 'bottomAboveTabs', await: 'event:storeSelect',
    titleKey: 'tour.storeTitle', textKey: 'tour.storeText' },
  // add: sin paso de categoría previo (el usuario navega solo). Tarjeta ARRIBA
  // para no tapar la barra "Añadir" del fondo; resalta el + del 2º producto.
  { id: 'add', icon: 'add-circle', anchorKey: 'productStepper', bubble: 'top', await: 'event:cartAdd',
    titleKey: 'tour.addTitle', textKey: 'tour.addText' },
  { id: 'list', icon: 'list', tabIndex: TAB.List, bubble: 'bottomAboveTabs', await: 'tabList',
    titleKey: 'tour.listTitle', textKey: 'tour.listText' },
];

interface Rect { x: number; y: number; w: number; h: number }

interface GuidedTourValue {
  startTour: () => void;
  notify: (ev: TourEvent) => void;
  registerAnchor: (key: AnchorKey, rect: Rect) => void;
  /** Quita un ancla (la usa `useTourAnchor({clearOnUnmount})` al desmontarse el
   *  elemento) para que el spotlight no apunte a una posición obsoleta. */
  unregisterAnchor: (key: AnchorKey) => void;
  /** id del paso activo (o null) — para que una pantalla resalte un elemento
   *  propio (p.ej. el primer súper del desplegable, que vive en un Modal). */
  stepId: string | null;
  /** Avisa al tour de que el desplegable de súper (un Modal por encima del
   *  overlay) está abierto: el overlay oscurece TODO sin agujero (también el
   *  selector) y deja que el Modal ilumine el súper objetivo. `count` = nº de
   *  supers visibles, para que el texto diga "el segundo" o "el primero". */
  setStoreMenuOpen: (open: boolean, count?: number) => void;
}

const GuidedTourContext = createContext<GuidedTourValue>({
  startTour: () => {},
  notify: () => {},
  registerAnchor: () => {},
  unregisterAnchor: () => {},
  stepId: null,
  setStoreMenuOpen: () => {},
});

export function GuidedTourProvider({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Estimación de la altura real de la barra (mismo cálculo que `bottomInset`
  // en navigation/index.tsx) para cuando el ancla 'tabBar' todavía no se ha
  // medido — así el fallback no se queda corto en Android edge-to-edge.
  const fallbackBarHeight = TAB_BAR_HEIGHT + (Platform.OS === 'android' ? insets.bottom : 0);
  const { session } = useAuth();
  const { activeCart } = useCart();
  const { products: favProducts } = useFavorites();
  const toast = useToast();

  const seenKey = session?.user.id ? `${SEEN_KEY}:${session.user.id}` : SEEN_KEY;

  const [active, setActive] = useState(false);
  const [invite, setInvite] = useState(false);
  const [index, setIndex] = useState(0);
  const [anchors, setAnchors] = useState<Partial<Record<AnchorKey, Rect>>>({});
  const [nav, setNav] = useState<{ tab?: string; route?: string }>({});
  const [storeMenuOpen, setStoreMenuOpenState] = useState(false);
  const [storeCount, setStoreCount] = useState(0);
  // Fase B del paso 'add': true cuando el usuario ya pulsó el "+" (eligió 1ª
  // unidad). El objetivo pasa del "+" al botón "Añadir".
  const [addQtyPicked, setAddQtyPicked] = useState(false);
  const setStoreMenuOpen = useCallback((open: boolean, count?: number) => {
    setStoreMenuOpenState(open);
    if (typeof count === 'number') setStoreCount(count);
  }, []);

  // Origen del árbol de la app según `measureInWindow` (sonda 1×1 en el
  // (0,0) del root). En Android, RN implementa measureInWindow restando el
  // "marco visible" de la ventana, que EXCLUYE la barra de estado → todas las
  // anclas llegan `insets.top` más arriba de su posición real en el overlay
  // (que sí arranca en el borde superior de la pantalla con edge-to-edge).
  // Restar el origen medido con la MISMA API corrige cualquier convención;
  // en iOS la sonda mide (0,0) y no cambia nada.
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const originRef = useRef<View>(null);
  const measureOrigin = useCallback(() => {
    const node = originRef.current as any;
    if (!node?.measureInWindow) return;
    requestAnimationFrame(() => {
      try {
        node.measureInWindow((x: number, y: number) => {
          setOrigin((prev) => (prev.x === x && prev.y === y ? prev : { x, y }));
        });
      } catch { /* ignore */ }
    });
  }, []);
  // Re-mide el origen al activarse el tour (por si la ventana cambió desde el
  // arranque) además de en el onLayout inicial de la sonda.
  useEffect(() => { if (active) measureOrigin(); }, [active, measureOrigin]);

  const activeRef = useRef(false);
  const indexRef = useRef(0);
  const favBaselineRef = useRef(0);
  const favCountRef = useRef(favProducts.length);
  const autoChecked = useRef(false);

  // Señales animadas que indican "dónde tocar": anillo accent que RESPIRA sobre
  // el objetivo y chevron que rebota apuntándolo. (Del diseño "Onboarding
  // Catàleg".) Ambos se pintan DESPUÉS de la tarjeta (ver más abajo) para que el
  // paso 'add' (tarjeta arriba, objetivo justo detrás) no los oculte.
  const pulse = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  activeRef.current = active;
  indexRef.current = index;
  favCountRef.current = favProducts.length;

  const finishTour = useCallback((completed: boolean) => {
    setActive(false);
    setIndex(0);
    AsyncStorage.setItem(seenKey, '1').catch(() => {});
    if (completed) toast.show(t('tour.done'));
  }, [seenKey, toast, t]);

  // OJO: nada de efectos secundarios dentro del updater de setIndex — React
  // ejecuta los updaters DURANTE el render y llamar ahí a finishTour (que hace
  // toast.show → setState del ToastProvider) da "Cannot update a component
  // while rendering a different component". La decisión se toma con indexRef,
  // que se actualiza aquí mismo para que dos advance() en el mismo tick no
  // salten un paso de más.
  const advance = useCallback(() => {
    setAddQtyPicked(false); // cada cambio de paso resetea la fase B del 'add'
    const ni = indexRef.current + 1;
    if (ni >= STEPS.length) { finishTour(true); return; }
    indexRef.current = ni;
    Haptics.selectionAsync();
    if (STEPS[ni].await === 'favorite') favBaselineRef.current = favCountRef.current;
    setIndex(ni);
  }, [finishTour]);

  const startTour = useCallback(() => {
    setInvite(false);
    setIndex(0);
    setAddQtyPicked(false);
    if (STEPS[0].await === 'favorite') favBaselineRef.current = favCountRef.current;
    setActive(true);
  }, []);

  // El aviso ("¿Te enseño cómo funciona?") es la 1ª vez OPT-IN: ya no se
  // auto-lanza el tour. Aceptar arranca; "Ahora no" sella el flag para no
  // insistir (siempre queda disponible en Perfil → Ver tutorial).
  const declineInvite = useCallback(() => {
    setInvite(false);
    AsyncStorage.setItem(seenKey, '1').catch(() => {});
    toast.show(t('tour.inviteDismissed'));
  }, [seenKey, toast, t]);

  const notify = useCallback((ev: TourEvent) => {
    if (!activeRef.current) return;
    const cur = STEPS[indexRef.current];
    // Paso 'add': al elegir la 1ª unidad ('qtyPicked') pasa a fase B (objetivo =
    // botón "Añadir"). No avanza el paso; eso lo hace 'cartAdd'.
    if (ev === 'qtyPicked' && cur?.id === 'add') setAddQtyPicked(true);
    if (cur?.await === `event:${ev}`) advance();
  }, [advance]);

  const registerAnchor = useCallback((key: AnchorKey, rect: Rect) => {
    // Sin gate por `active`: algunas anclas (la barra de pestañas) se miden al
    // arrancar la app, antes de que el tour empiece, y deben quedar disponibles.
    setAnchors((prev) => {
      const cur = prev[key];
      if (cur && cur.x === rect.x && cur.y === rect.y && cur.w === rect.w && cur.h === rect.h) return prev;
      return { ...prev, [key]: rect };
    });
  }, []);

  const unregisterAnchor = useCallback((key: AnchorKey) => {
    setAnchors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // 1ª vez (tras el onboarding), por usuario: ofrecemos el tour con un aviso
  // OPT-IN en vez de auto-lanzarlo (el alta ya es largo; no encadenar más).
  useEffect(() => {
    if (autoChecked.current) return;
    autoChecked.current = true;
    let timer: ReturnType<typeof setTimeout>;
    AsyncStorage.getItem(seenKey).then((seen) => {
      if (seen) return;
      timer = setTimeout(() => setInvite(true), 900);
    });
    return () => clearTimeout(timer);
  }, [seenKey]);

  // (Las señales animadas halo/chevron se arrancan más abajo, una vez calculado
  //  `hole`: necesitan re-arrancar TAMBIÉN cuando el objetivo se mide y aparecen.)

  // Observa la navegación SOLO mientras el tour está activo.
  useEffect(() => {
    if (!active) return;
    let unsub: (() => void) | undefined;
    const update = () => {
      if (!navigationRef.isReady()) return;
      const route = navigationRef.getCurrentRoute()?.name;
      const root: any = navigationRef.getRootState();
      const tab = root?.routes?.[root.index]?.name;
      setNav({ tab, route });
    };
    const attach = () => {
      if (!navigationRef.isReady()) return false;
      update();
      unsub = navigationRef.addListener('state', update);
      return true;
    };
    if (!attach()) {
      const poll = setInterval(() => { if (attach()) clearInterval(poll); }, 120);
      return () => { clearInterval(poll); unsub?.(); };
    }
    return () => unsub?.();
  }, [active]);

  // Avance por estado (rutas / carrito / favoritos). Los eventos puntuales
  // (storeMenu, cartAdd) los dispara notify().
  useEffect(() => {
    if (!active) return;
    const step = STEPS[index];
    if (!step) return;
    let done = false;
    switch (step.await) {
      case 'cartActive':        done = !!activeCart; break;
      case 'tabCatalog':        done = nav.tab === 'Catalog'; break;
      case 'route:SubCategory': done = nav.route === 'SubCategory'; break;
      case 'route:Products':    done = PRODUCT_ROUTES.includes(nav.route ?? ''); break;
      case 'route:Favorites':   done = nav.route === 'Favorites'; break;
      case 'tabList':           done = nav.tab === 'List'; break;
      case 'favorite':          done = favProducts.length > favBaselineRef.current; break;
      default: break; // event:* → notify()
    }
    // Robustez "se adelantó": si solo tiene un súper no hay selector que abrir,
    // o si ignora el paso y entra directo en una categoría, damos por hecho el
    // paso del selector de súper para no atascar el tour.
    if (!done && step.id === 'store' && nav.route === 'SubCategory') done = true;
    if (done) advance();
  }, [active, index, nav, activeCart, favProducts.length, advance]);

  const step = active ? STEPS[index] : undefined;
  const stepId = step?.id ?? null;

  const value = useMemo(
    () => ({ startTour, notify, registerAnchor, unregisterAnchor, stepId, setStoreMenuOpen }),
    [startTour, notify, registerAnchor, unregisterAnchor, stepId, setStoreMenuOpen],
  );

  // Geometría del objetivo a resaltar. La barra de pestañas se MIDE (ancla
  // 'tabBar'): usamos su BORDE SUPERIOR real (acierta con el home indicator) y
  // una altura FIJA de contenido (icono+etiqueta) — no la altura total medida,
  // que puede incluir el relleno del área segura y estiraría el recuadro.
  // Toda ancla medida con measureInWindow se pasa a coordenadas del overlay
  // restando el origen medido con esa misma API (ver `origin` arriba).
  const toOverlay = (r: Rect): Rect => ({ x: r.x - origin.x, y: r.y - origin.y, w: r.w, h: r.h });
  const bar = anchors.tabBar ? toOverlay(anchors.tabBar) : undefined;
  const cellW = (bar?.w ?? width) / TAB_COUNT;
  const TAB_CONTENT_H = 50;
  const tabRect = (i: number): Rect => {
    const barY = bar?.y ?? height - fallbackBarHeight;
    return {
      x: (bar?.x ?? 0) + cellW * i + cellW * 0.16,
      y: barY + 5,
      w: cellW * 0.68,
      h: TAB_CONTENT_H,
    };
  };
  // Con el desplegable de súper abierto, NO resaltamos el selector: oscurecemos
  // todo (el selector incluido) y el Modal del menú ilumina solo el primer súper.
  const menuMode = step?.id === 'store' && storeMenuOpen;
  // Paso 'add': fase A apunta al "+" (productStepper); fase B (ya pulsado +) al
  // botón "Añadir" (addButton) → los indicadores del "+" desaparecen solos.
  const addPhaseB = step?.id === 'add' && addQtyPicked;
  // Paso 'cart' (3 estados, solo cuando el usuario está EN Grupos):
  //   · ya hay grupo  → botón "Activar carrito" (activateCart)
  //   · sin grupo     → CTA "crear grupo" (createGroup)
  //   · fuera de Grupos → ninguno (cae a resaltar la pestaña Grupos para ir allí)
  // Se gatea por `nav.tab` porque la pantalla de Grupos sigue montada al cambiar
  // de pestaña: sus anclas quedan registradas y no deben usarse fuera de Grupos.
  const onGroups = nav.tab === 'Groups';
  let cartAnchor: AnchorKey | undefined;
  if (step?.id === 'cart' && onGroups) {
    // `createGroup` (CTA del estado vacío) tiene PRIORIDAD: solo existe cuando no
    // hay grupos, así que su presencia descarta cualquier `activateCart` que
    // hubiera quedado registrado de un grupo ya borrado (defensa anti-fantasma).
    cartAnchor = anchors.createGroup ? 'createGroup'
      : anchors.activateCart ? 'activateCart'
      : undefined;
  }
  const effectiveAnchor: AnchorKey | undefined =
    addPhaseB ? 'addButton'
      : step?.id === 'cart' ? cartAnchor
      : step?.anchorKey;
  const cartActivatePhase = effectiveAnchor === 'activateCart';
  let spot: Rect | null = null;
  let spotIsTab = false; // el objetivo es una pestaña de la barra inferior
  if (menuMode) spot = null;
  else if (effectiveAnchor && anchors[effectiveAnchor]) spot = toOverlay(anchors[effectiveAnchor]!);
  else if (typeof step?.tabIndex === 'number') { spot = tabRect(step.tabIndex); spotIsTab = true; }

  const pad = 8;
  const hole = spot
    ? { x: spot.x - pad, y: spot.y - pad, w: spot.w + pad * 2, h: spot.h + pad * 2 }
    : null;

  // Posición de la tarjeta. `bottomAboveTabs` la fija SIEMPRE en el mismo sitio
  // (encima de la barra de pestañas, medida): así catalog/store/category/list
  // comparten ubicación. El hueco extra (CHEVRON_GAP) deja sitio al chevron
  // cuando el objetivo es el propio tab justo debajo.
  const CHEVRON_GAP = 58;
  // Alto REAL medido de la barra (ancla 'tabBar') en vez de `height - bar.y`:
  // esa resta asume que `useWindowDimensions().height` coincide exactamente con
  // el sistema de coordenadas de `measureInWindow`, lo que en Android
  // edge-to-edge no siempre es cierto — el desajuste desplazaba la tarjeta (y,
  // como comparten `bar.y`, también el anillo del tab) hacia arriba de la
  // pantalla. Usar el alto medido directamente es autoconsistente y evita el
  // problema por completo.
  const barHeight = bar?.h ?? fallbackBarHeight;
  const aboveTabsBottom = barHeight + CHEVRON_GAP;
  const bubblePos = (): any => {
    if (step?.bubble === 'top') return { top: 86, left: 16, right: 16 };
    if (step?.bubble === 'bottomAboveTabs') return { bottom: aboveTabsBottom, left: 16, right: 16 };
    return { bottom: 48, left: 16, right: 16 };
  };

  // Chevron centrado sobre el objetivo. Si el objetivo es un TAB (debajo de la
  // tarjeta) va en el hueco justo encima del tab; si es un ancla (arriba/medio),
  // encima del ancla. El "pico" solo cuando el objetivo es un tab.
  const spotCx = hole ? hole.x + hole.w / 2 : 0;
  const chevronTop = hole ? (spotIsTab ? hole.y - 46 : Math.max(hole.y - 54, 56)) : 0;
  const showBeak = !!hole && spotIsTab;
  const beakLeft = Math.min(Math.max(spotCx - 16 - 8, 12), width - 32 - 28);

  // Loops de las señales animadas (halo que "respira" + chevron que rebota). Se
  // RE-ARRANCAN en cada cambio de paso/fase (index/addQtyPicked/storeMenuOpen) y
  // —clave— cuando APARECE el objetivo (`holePresent`): el halo y el chevron
  // (Animated.View) se montan/desmontan según `hole`, y un loop con el driver JS
  // que ya estaba corriendo NO re-anima una vista que se monta DESPUÉS (p. ej. en
  // el paso 'add', cuando el ancla del "+" se mide al cargar el producto, ya a
  // mitad de paso). Al re-arrancar en ese momento, la vista recién montada recibe
  // un valor animado de nuevo (si no, salían fijos).
  const holePresent = !!hole;
  useEffect(() => {
    if (!active || !holePresent) return;
    pulse.setValue(0);
    bob.setValue(0);
    // El anillo "respira" (opacidad ida/vuelta) en vez de desvanecerse a 0 y
    // quedarse invisible casi todo el ciclo (lo que se percibía como "no pulsa").
    // `useNativeDriver: false` A PROPÓSITO: el driver JS reescribe el estilo de la
    // vista MONTADA en cada frame, así que se re-engancha al re-arrancar el loop
    // con la vista nueva (el driver nativo no lo hace y se quedaba congelado). Son
    // 2 animaciones triviales sobre un overlay que solo existe durante el tour.
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 560, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(bob, { toValue: 0, duration: 560, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ]),
    );
    pulseLoop.start();
    bobLoop.start();
    return () => { pulseLoop.stop(); bobLoop.stop(); };
  }, [active, holePresent, index, addQtyPicked, storeMenuOpen, pulse, bob]);

  return (
    <GuidedTourContext.Provider value={value}>
      {children}

      {/* Sonda de origen: 1×1 invisible en el (0,0) del root, medida con la
          misma API que las anclas (ver comentario de `origin`). */}
      <View
        ref={originRef}
        collapsable={false}
        pointerEvents="none"
        onLayout={measureOrigin}
        style={styles.originProbe}
      />

      {step && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {/* Atenuado con "agujero" (4 rectángulos) o atenuado suave si no hay
              objetivo medido. Todo pointerEvents none → no bloquea la app. */}
          {hole ? (
            <>
              <View pointerEvents="none" style={[styles.dim, { left: 0, right: 0, top: 0, height: hole.y }]} />
              <View pointerEvents="none" style={[styles.dim, { left: 0, right: 0, top: hole.y + hole.h, bottom: 0 }]} />
              <View pointerEvents="none" style={[styles.dim, { left: 0, width: hole.x, top: hole.y, height: hole.h }]} />
              <View pointerEvents="none" style={[styles.dim, { left: hole.x + hole.w, right: 0, top: hole.y, height: hole.h }]} />
              <View pointerEvents="none" style={[styles.ring, { left: hole.x, top: hole.y, width: hole.w, height: hole.h }]} />
            </>
          ) : (
            // Sin objetivo: atenuado suave (pasos sin ancla) o FUERTE cuando el
            // desplegable de súper está abierto (para igualar el oscuro del resto).
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: menuMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.28)' }]}
            />
          )}

          {/* Burbuja (sí captura toques) */}
          <View style={[styles.card, bubblePos()]} pointerEvents="auto">
            {/* "Pico" que apunta al objetivo (solo pasos de pestaña). */}
            {showBeak && <View pointerEvents="none" style={[styles.beak, { left: beakLeft }]} />}
            <View style={styles.cardHead}>
              <View style={styles.iconBox}>
                <Ionicons name={step.icon} size={20} color={colors.accent} />
              </View>
              <Text style={styles.cardTitle}>
                {menuMode ? t('tour.storeMenuTitle')
                  : addPhaseB ? t('tour.addConfirmTitle')
                  : cartActivatePhase ? t('tour.cartActivateTitle')
                  : t(step.titleKey)}
              </Text>
              <TouchableOpacity onPress={() => finishTour(false)} hitSlop={8}>
                <Text style={styles.skip}>{t('tour.skip')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardText}>
              {menuMode
                ? (storeCount >= 2 ? t('tour.storeMenuTextMulti') : t('tour.storeMenuTextSingle'))
                : addPhaseB ? t('tour.addConfirmText')
                : cartActivatePhase ? t('tour.cartActivateText')
                : t(step.textKey)}
            </Text>

            <View style={styles.cardFooter}>
              <View style={styles.dots}>
                {STEPS.map((_, i) => (
                  <View key={i} style={[styles.dot, i === index && styles.dotOn, i < index && styles.dotDone]} />
                ))}
              </View>
              <Text style={styles.stepCount}>{t('onboarding.step', { step: index + 1, total: STEPS.length })}</Text>
            </View>
          </View>

          {/* Anillo accent que "respira" sobre el objetivo (halo justo por fuera
              del marco). Va DESPUÉS de la tarjeta para que NUNCA quede oculto bajo
              ella: en el paso 'add' la tarjeta va arriba y el producto/botón puede
              caer justo detrás → si se pintara antes, la tarjeta lo tapaba. */}
          {hole && (
            <Animated.View
              pointerEvents="none"
              style={[styles.pulseRing, {
                left: hole.x - 5, top: hole.y - 5, width: hole.w + 10, height: hole.h + 10,
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }],
              }]}
            />
          )}

          {/* Chevron que rebota apuntando al objetivo. Va DESPUÉS de la tarjeta
              (se pinta por encima) y en su hueco, para que no quede tapado. */}
          {hole && (
            <Animated.View
              pointerEvents="none"
              style={[styles.chevron, {
                left: spotCx - 19, top: chevronTop,
                transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, 13] }) }],
              }]}
            >
              <Ionicons name="chevron-down" size={22} color={colors.white} />
            </Animated.View>
          )}
        </View>
      )}

      {/* Aviso OPT-IN (1ª vez): tarjeta centrada con backdrop que SÍ bloquea —
          es una decisión sí/no, no un paso guiado. */}
      {invite && !active && (
        <View style={styles.inviteBackdrop} pointerEvents="auto">
          <View style={styles.inviteCard}>
            <View style={styles.inviteIcon}>
              <Ionicons name="sparkles" size={26} color={colors.accent} />
            </View>
            <Text style={styles.inviteTitle}>{t('tour.inviteTitle')}</Text>
            <Text style={styles.inviteText}>{t('tour.inviteText')}</Text>
            <TouchableOpacity style={styles.inviteStart} onPress={startTour} activeOpacity={0.85}>
              <Text style={styles.inviteStartText}>{t('tour.inviteStart')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={declineInvite} hitSlop={8} style={styles.inviteLater}>
              <Text style={styles.inviteLaterText}>{t('tour.inviteLater')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </GuidedTourContext.Provider>
  );
}

export function useGuidedTour(): GuidedTourValue {
  return useContext(GuidedTourContext);
}

/** Registra un elemento como objetivo resaltable del tour. Ata `ref` y
 *  `onLayout` al View que quieras resaltar (mide su posición en pantalla).
 *  `clearOnUnmount`: quita el ancla al desmontarse el elemento — para anclas
 *  condicionales (p.ej. el CTA "crear grupo" del estado vacío) que no deben
 *  dejar un spotlight obsoleto cuando desaparecen. */
export function useTourAnchor(
  key: AnchorKey,
  opts?: { clearOnUnmount?: boolean; enabled?: boolean },
) {
  const { registerAnchor, unregisterAnchor } = useGuidedTour();
  const clearOnUnmount = opts?.clearOnUnmount ?? false;
  // `enabled` (def. true): mientras sea false NO se registra el ancla y, si ya
  // estaba puesta, se quita — así el spotlight/chevron no apuntan a un objetivo
  // que aún no está listo (p. ej. el "+" del producto del paso 'add' antes de
  // que cargue la lista; si no, se vería el recuadro en una posición obsoleta y
  // "saltaría" al recolocarse). Al volver a true se re-mide la posición real.
  const enabled = opts?.enabled ?? true;
  // `any` para poder atar el ref tanto a un View como a un TouchableOpacity.
  const ref = useRef<any>(null);
  const measure = useCallback(() => {
    const node = ref.current as any;
    if (!node?.measureInWindow) return;
    requestAnimationFrame(() => {
      try {
        node.measureInWindow((x: number, y: number, w: number, h: number) => {
          if (w > 0 && h > 0) registerAnchor(key, { x, y, w, h });
        });
      } catch { /* ignore */ }
    });
  }, [key, registerAnchor]);
  const onLayout = useCallback(() => {
    if (enabled) measure();
  }, [enabled, measure]);
  useEffect(() => {
    if (!enabled) { unregisterAnchor(key); return; }
    measure(); // re-mide al (re)activarse, por si el layout ya ocurrió
  }, [enabled, key, measure, unregisterAnchor]);
  useEffect(() => {
    if (!clearOnUnmount) return;
    return () => unregisterAnchor(key);
  }, [key, clearOnUnmount, unregisterAnchor]);
  return { ref, onLayout };
}

const themedStyles = () => StyleSheet.create({
  originProbe: { position: 'absolute', top: 0, left: 0, width: 1, height: 1, opacity: 0 },
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  ring: {
    position: 'absolute',
    borderWidth: 2, borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 3, borderColor: colors.accent,
  },
  chevron: {
    position: 'absolute',
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.32, shadowRadius: 5, elevation: 6,
  },

  card: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 18, elevation: 10,
  },
  beak: {
    position: 'absolute', bottom: -8,
    width: 16, height: 16,
    backgroundColor: colors.white,
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: colors.border,
    transform: [{ rotate: '45deg' }],
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: {
    width: 38, height: 38, flexShrink: 0,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  skip: { fontSize: 12.5, fontFamily: fonts.semibold, color: colors.inkSoft },

  cardText: { fontSize: 13.5, lineHeight: 19, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 12 },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  dots: { flexDirection: 'row', gap: 5, flexShrink: 1, flexWrap: 'wrap' },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.border },
  dotOn: { backgroundColor: colors.accent, width: 16 },
  dotDone: { backgroundColor: colors.accentMid },
  stepCount: { fontSize: 11, fontFamily: fonts.bold, color: colors.inkSoft, letterSpacing: 0.4 },

  // ── Aviso OPT-IN (1ª vez) ─────────────────────────────────────
  inviteBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', padding: 28,
  },
  inviteCard: {
    width: '100%', maxWidth: 380,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 18, elevation: 10,
  },
  inviteIcon: {
    width: 56, height: 56,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  inviteTitle: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  inviteText: {
    fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, color: colors.inkSoft,
    textAlign: 'center', marginTop: 8,
  },
  inviteStart: {
    alignSelf: 'stretch', backgroundColor: colors.accent,
    paddingVertical: 13, alignItems: 'center', marginTop: 22,
  },
  inviteStartText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  inviteLater: { paddingVertical: 10, marginTop: 4 },
  inviteLaterText: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.inkSoft },
});
