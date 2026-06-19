/**
 * GuidedTourContext — la "demo" interactiva de la app: un tutorial GUIADO POR
 * ACCIONES REALES (no tooltips pasivos). Cada paso resalta un elemento y solo
 * avanza cuando el usuario hace la acción correcta. Recortado al *core loop*
 * (comprar en grupo); los extras (favoritos) se descubren solos:
 *
 *   1. Prepara un carrito (Grupos)     → activeCart deja de ser null
 *                                        (crea grupo si no tiene + Activar carrito)
 *   2. Abre el Catálogo                → pestaña Catalog enfocada
 *   3. Selecciona un supermercado      → notify('storeSelect')
 *   4. Entra en una categoría          → ruta SubCategory
 *   5. Abre una subcategoría y añade   → notify('cartAdd')
 *   6. Revísalo en Mi lista            → pestaña List
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
  View, Text, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
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
const TAB_BAR_HEIGHT = 70;
const TAB = { Home: 0, Catalog: 1, List: 2, Groups: 3 } as const;

const PRODUCT_ROUTES = [
  'Products', 'BonpreuProducts', 'CarrefourProducts',
  'BonareaProducts', 'ConsumProducts', 'DiaProducts',
];

type AnchorKey =
  | 'storeSelector' | 'tabBar' | 'firstCategory' | 'firstSubcategory'
  | 'productStepper' | 'addButton' | 'createGroup';
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
  { id: 'store', icon: 'storefront', anchorKey: 'storeSelector', bubble: 'bottom', await: 'event:storeSelect',
    titleKey: 'tour.storeTitle', textKey: 'tour.storeText' },
  { id: 'category', icon: 'albums', anchorKey: 'firstCategory', bubble: 'bottom', await: 'route:SubCategory',
    titleKey: 'tour.categoryTitle', textKey: 'tour.categoryText' },
  { id: 'add', icon: 'add-circle', anchorKey: 'productStepper', bubble: 'bottom', await: 'event:cartAdd',
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
   *  selector) y deja que el Modal ilumine solo el primer súper. */
  setStoreMenuOpen: (open: boolean) => void;
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
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);

  const activeRef = useRef(false);
  const indexRef = useRef(0);
  const favBaselineRef = useRef(0);
  const favCountRef = useRef(favProducts.length);
  const autoChecked = useRef(false);

  activeRef.current = active;
  indexRef.current = index;
  favCountRef.current = favProducts.length;

  const finishTour = useCallback((completed: boolean) => {
    setActive(false);
    setIndex(0);
    AsyncStorage.setItem(seenKey, '1').catch(() => {});
    if (completed) toast.show(t('tour.done'));
  }, [seenKey, toast, t]);

  const advance = useCallback(() => {
    setIndex((i) => {
      const ni = i + 1;
      if (ni >= STEPS.length) { finishTour(true); return i; }
      Haptics.selectionAsync();
      if (STEPS[ni].await === 'favorite') favBaselineRef.current = favCountRef.current;
      return ni;
    });
  }, [finishTour]);

  const startTour = useCallback(() => {
    setInvite(false);
    setIndex(0);
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
    if (STEPS[indexRef.current]?.await === `event:${ev}`) advance();
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
    [startTour, notify, registerAnchor, unregisterAnchor, stepId],
  );

  // Geometría del objetivo a resaltar. La barra de pestañas se MIDE (ancla
  // 'tabBar'): usamos su BORDE SUPERIOR real (acierta con el home indicator) y
  // una altura FIJA de contenido (icono+etiqueta) — no la altura total medida,
  // que puede incluir el relleno del área segura y estiraría el recuadro.
  const bar = anchors.tabBar;
  const cellW = (bar?.w ?? width) / TAB_COUNT;
  const TAB_CONTENT_H = 50;
  const tabRect = (i: number): Rect => {
    const barY = bar?.y ?? height - TAB_BAR_HEIGHT;
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
  let spot: Rect | null = null;
  if (menuMode) spot = null;
  else if (step?.anchorKey && anchors[step.anchorKey]) spot = anchors[step.anchorKey]!;
  else if (typeof step?.tabIndex === 'number') spot = tabRect(step.tabIndex);

  const bubblePos = (): any => {
    if (step?.bubble === 'top') return { top: 86, left: 16, right: 16 };
    if (step?.bubble === 'bottomAboveTabs') return { bottom: TAB_BAR_HEIGHT + 26, left: 16, right: 16 };
    return { bottom: 48, left: 16, right: 16 };
  };

  const pad = 8;
  const hole = spot
    ? { x: spot.x - pad, y: spot.y - pad, w: spot.w + pad * 2, h: spot.h + pad * 2 }
    : null;

  return (
    <GuidedTourContext.Provider value={value}>
      {children}

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
            <View style={styles.cardHead}>
              <View style={styles.iconBox}>
                <Ionicons name={step.icon} size={20} color={colors.accent} />
              </View>
              <Text style={styles.cardTitle}>{t(step.titleKey)}</Text>
              <TouchableOpacity onPress={() => finishTour(false)} hitSlop={8}>
                <Text style={styles.skip}>{t('tour.skip')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.cardText}>{t(step.textKey)}</Text>

            <View style={styles.cardFooter}>
              <View style={styles.dots}>
                {STEPS.map((_, i) => (
                  <View key={i} style={[styles.dot, i === index && styles.dotOn, i < index && styles.dotDone]} />
                ))}
              </View>
              <Text style={styles.stepCount}>{t('onboarding.step', { step: index + 1, total: STEPS.length })}</Text>
            </View>
          </View>
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
export function useTourAnchor(key: AnchorKey, opts?: { clearOnUnmount?: boolean }) {
  const { registerAnchor, unregisterAnchor } = useGuidedTour();
  const clearOnUnmount = opts?.clearOnUnmount ?? false;
  // `any` para poder atar el ref tanto a un View como a un TouchableOpacity.
  const ref = useRef<any>(null);
  const onLayout = useCallback(() => {
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
  useEffect(() => {
    if (!clearOnUnmount) return;
    return () => unregisterAnchor(key);
  }, [key, clearOnUnmount, unregisterAnchor]);
  return { ref, onLayout };
}

const themedStyles = () => StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  ring: {
    position: 'absolute',
    borderWidth: 2, borderColor: colors.white,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  card: {
    position: 'absolute',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22, shadowRadius: 18, elevation: 10,
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
