import { memo, useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Image,
  RefreshControl,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchListItems, setItemInCart, assignListItem, clearListItems, deleteListItems, updateListItemQuantity, updateListItemsComment, mergeCartItems, type LinkedNoteProduct, type ListItemRow, type MergedCartItem } from '../api/lists';
import { fetchMercadonaNames } from '../api/catalog';
import { fetchGroupMembers, type GroupSummary } from '../api/groups';
import { recordPurchase } from '../api/purchases';
import type { GroupMember } from '../types';
import ProductImage from '../components/ProductImage';
import StoreProductModal, { type ProductRef } from '../components/StoreProductModal';
import ConfirmDialog from '../components/ConfirmDialog';
import UserAvatar from '../components/UserAvatar';
import ProductNoteSheet from '../components/ProductNoteSheet';
import AmbientBubbleBackdrop from '../components/AmbientBubbleBackdrop';
import ActiveCartIcon from '../components/ActiveCartIcon';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { peekStartupCache, startupKeys, writeStartupCache } from '../lib/startupCache';

import { STORE_META, groupByStore, storeOfItem, type Store } from '../constants/stores';
import { groupByZone, sortZoneItems, type ShopZone } from '../constants/zones';

// Sección del SectionList de la cesta. `zone` es null en la sección "tienda
// plegada" (solo cabecera de tienda, sin productos). Los contadores son sobre
// el total real. Una zona conserva sus filas montadas al plegarse para poder
// recortarlas progresivamente desde el borde inferior.
type CartSection = {
  key: string;
  store: Store;
  zone: ShopZone | null;
  firstOfStore: boolean;
  storeCollapsed: boolean;
  storeCount: number;
  storeInCart: number;
  zoneCount: number;
  zoneInCart: number;
  zoneCollapsed: boolean;
  data: MergedCartItem[];
};

type PreparedCartStore = {
  store: Store;
  count: number;
  inCart: number;
  zones: {
    zone: ShopZone;
    count: number;
    inCart: number;
    data: MergedCartItem[];
  }[];
};

const EMPTY_CART_ITEMS: MergedCartItem[] = [];
const ZONE_DOUBLE_TAP_MS = 300;
const ZONE_ROW_ANIMATION_MS = 210;
const ZONE_STAGGER_WINDOW_MS = 180;
const zoneRowStyles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  hidden: { height: 0, opacity: 0 },
  measure: { paddingBottom: 10 },
});

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// Referencia {tienda, id} para abrir la ficha de un artículo de la cesta en
// CUALQUIER súper. La tienda se deduce del dominio de la imagen / id de Mercadona
// (storeOfItem); el id es el de Mercadona para Mercadona y el store_product_id
// guardado para el resto. Devuelve null para ítems manuales o sin id (no abren
// ficha), igual que antes.
function productRefOf(item: MergedCartItem): ProductRef | null {
  const store = storeOfItem(item);
  if (store === 'otros') return null;
  const id = store === 'mercadona' ? item.mercadonaProductId : item.storeProductId;
  return id ? { store, id } : null;
}

// LayoutAnimation necesita habilitarse explícitamente en Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ListScreen() {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const headerTop = useHeaderTopPadding(56);
  // Con tab bar de cristal: eleva las barras fijas (total/completada) por encima
  // del cristal y agranda el paddingBottom de la lista en la misma medida.
  const tabBarOffset = useTabBarBottomPadding(0);
  const insets = useSafeAreaInsets();
  const { t, lang } = useTranslation();
  const { session } = useAuth();
  const { activeCart } = useCart();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const listId = activeCart?.listId;
  const groupId = activeCart?.groupId;

  const cachedItems = listId && userId
    ? peekStartupCache<ListItemRow[]>(startupKeys.listItems(userId, listId))
    : null;
  const cachedMembers = groupId && userId
    ? peekStartupCache<GroupMember[]>(startupKeys.groupMembers(userId, groupId))
      ?? peekStartupCache<GroupSummary[]>(startupKeys.groups(userId))
        ?.find((group) => group.id === groupId)?.members
        ?? null
    : null;
  const [items, setItems] = useState<ListItemRow[]>(cachedItems ?? []);
  // Nombres de Mercadona re-traducidos al idioma activo (id → nombre). El
  // product_name guardado en list_items es un snapshot del idioma con el que se
  // añadió, así que en català se mostraría en castellano sin esto.
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<GroupMember[]>(cachedMembers ?? []);
  const [loading, setLoading] = useState(!!listId && cachedItems === null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ProductRef | null>(null);
  const [assignItem, setAssignItem] = useState<MergedCartItem | null>(null);
  const [noteItem, setNoteItem] = useState<MergedCartItem | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  // Selector "asignar TODA la lista" (botón de la cabecera). Reusa la misma hoja
  // de miembros que el asignar por producto.
  const [assignAllVisible, setAssignAllVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Cabeceras plegadas por el usuario: por tienda (clave = store) y por
  // tienda×zona (clave = `${store}:${zone.key}`). En memoria — se reinicia al
  // recargar. Plegar una tienda oculta todas sus zonas y productos; plegar una
  // zona oculta solo sus productos.
  const [collapsedStores, setCollapsedStores] = useState<Set<string>>(new Set());
  const [collapsedZones, setCollapsedZones] = useState<Set<string>>(new Set());
  // El primer toque se aplica sin demora. Si el siguiente llega sobre la misma
  // zona dentro del umbral, extendemos esa misma dirección a toda la tienda.
  const lastZoneTap = useRef<{
    key: string;
    timestamp: number;
    wasCollapsed: boolean;
  } | null>(null);

  // Liquid Glass (F3): la cabecera vive en una franja de cristal flotante y la
  // lista pasa por debajo refractándose (paddingTop del contenido = altura
  // medida del chrome). En fallback (Android / iOS ≤ 18), cabecera en flujo.
  const [chromeH, setChromeH] = useState(0);
  const glassInset = glassAvailable ? chromeH : 0;

  const toggleStore = useCallback((store: string) => {
    Haptics.selectionAsync();
    if (!reducedMotion) {
      LayoutAnimation.configureNext({
        duration: 280,
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
        delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
      });
    }
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      if (next.has(store)) next.delete(store);
      else next.add(store);
      return next;
    });
  }, [reducedMotion]);

  const toggleZone = useCallback((key: string) => {
    Haptics.selectionAsync();
    // La cabecera responde al instante; las filas conservan el montaje para
    // que AnimatedZoneRow pueda plegarlas sin un salto de layout.
    setCollapsedZones((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(() => {
    if (!listId) { setItems([]); setLoading(false); return Promise.resolve(); }
    setError(false);
    const itemsP = fetchListItems(listId).then((next) => {
      setItems(next);
      if (userId) writeStartupCache(startupKeys.listItems(userId, listId), next);
    }).catch(() => setError(true));
    const membersP = groupId
      ? fetchGroupMembers(groupId).then((next) => {
          setMembers(next);
          if (userId) writeStartupCache(startupKeys.groupMembers(userId, groupId), next);
        }).catch(() => {})
      : Promise.resolve();
    return Promise.all([itemsP, membersP]).finally(() => setLoading(false));
  }, [listId, groupId, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Conserva también los cambios optimistas (marcar, asignar, borrar, cantidad)
  // para que una terminación en frío no recupere el snapshot anterior.
  useEffect(() => {
    if (!loading && listId && userId) {
      writeStartupCache(startupKeys.listItems(userId, listId), items);
    }
  }, [items, listId, loading, userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const doAssign = async (item: MergedCartItem, memberId: string | null) => {
    setAssignItem(null);
    const ids = new Set(item.ids);
    const prev = new Map(items.filter((it) => ids.has(it.id)).map((it) => [it.id, it.assignedTo]));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((list) => list.map((it) => (ids.has(it.id) ? { ...it, assignedTo: memberId } : it)));
    try {
      await Promise.all(item.ids.map((id) => assignListItem(id, memberId)));
    } catch {
      setItems((list) => list.map((it) => (ids.has(it.id) ? { ...it, assignedTo: prev.get(it.id) ?? null } : it)));
      toast.show(t('list.assignError'), 'error');
    }
  };

  // Asigna TODOS los artículos de la lista al miembro elegido (o los desasigna
  // con memberId = null). Optimista: actualiza el estado local y revierte si falla.
  const doAssignAll = async (memberId: string | null) => {
    setAssignAllVisible(false);
    const prev = items;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems((list) => list.map((it) => ({ ...it, assignedTo: memberId })));
    try {
      await Promise.all(items.map((it) => assignListItem(it.id, memberId)));
    } catch {
      setItems(prev);
      toast.show(t('list.assignError'), 'error');
    }
  };

  const handleFinish = async () => {
    if (!activeCart || finishing || items.length === 0) return;
    setFinishing(true);
    try {
      const snapshot = merged.map((it) => ({
        productName: it.productName,
        quantity: it.quantity,
        unit: it.unit,
        categoryEmoji: it.categoryEmoji,
        categoryName: it.categoryName,
        mercadonaProductId: it.mercadonaProductId,
        storeProductId: it.storeProductId,
        unitPrice: it.unitPrice,
        imageUrl: it.imageUrl,
        note: it.note,
        noteProduct: it.noteProduct,
      }));
      await recordPurchase(activeCart.groupId, totalCost, snapshot, userId);
      await clearListItems(activeCart.listId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('list.purchaseDone'));
      setItems([]);
    } catch {
      toast.show(t('list.purchaseError'), 'error');
    } finally {
      setFinishing(false);
    }
  };

  // Vacía toda la lista del grupo (descarte, sin registrar compra como "Finalizar").
  const handleClearAll = async () => {
    setConfirmClear(false);
    if (!activeCart) return;
    const prev = items;
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems([]);
    try {
      await clearListItems(activeCart.listId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('list.cleared'));
    } catch {
      setItems(prev);
      toast.show(t('list.clearError'), 'error');
    }
  };

  const doRemove = useCallback(async (item: MergedCartItem): Promise<boolean> => {
    const ids = new Set(item.ids);
    const prev = items;
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((list) => list.filter((it) => !ids.has(it.id)));
    try {
      await deleteListItems(item.ids);
      return true;
    } catch {
      setItems(prev);
      toast.show(t('list.removeError'), 'error');
      return false;
    }
  }, [items, reducedMotion, t, toast]);

  // Resta una unidad de un producto. Como un artículo fusionado puede abarcar
  // varias filas, opera sobre una fila concreta: si tiene cantidad > 1 la baja en
  // uno; si era la última unidad de esa fila, la borra. Optimista, revierte si falla.
  const doDecrement = useCallback(async (item: MergedCartItem) => {
    if (item.quantity <= 1) return;
    const rows = items.filter((it) => item.ids.includes(it.id));
    // Preferimos rebajar una fila con varias unidades antes que borrar una entera.
    const target = rows.find((r) => r.quantity > 1) ?? rows[rows.length - 1];
    if (!target) return;
    const prev = items;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    try {
      if (target.quantity > 1) {
        const newQty = target.quantity - 1;
        setItems((list) => list.map((it) => (it.id === target.id ? { ...it, quantity: newQty } : it)));
        await updateListItemQuantity(target.id, newQty);
      } else {
        setItems((list) => list.filter((it) => it.id !== target.id));
        await deleteListItems([target.id]);
      }
    } catch {
      setItems(prev);
      toast.show(t('list.updateError'), 'error');
    }
  }, [items, reducedMotion, t, toast]);

  const doSaveNote = useCallback(async (
    note: string | null,
    noteProduct: LinkedNoteProduct | null,
  ) => {
    if (!noteItem || noteSaving) return;
    const ids = new Set(noteItem.ids);
    const previous = new Map(
      items.filter((it) => ids.has(it.id)).map((it) => [it.id, {
        note: it.note,
        noteProduct: it.noteProduct,
      }]),
    );
    setNoteSaving(true);
    setItems((list) => list.map((it) => (
      ids.has(it.id) ? { ...it, note, noteProduct } : it
    )));
    try {
      await updateListItemsComment(noteItem.ids, note, noteProduct);
      setNoteItem(null);
    } catch {
      setItems((list) => list.map((it) => (
        ids.has(it.id) ? {
          ...it,
          note: previous.get(it.id)?.note ?? null,
          noteProduct: previous.get(it.id)?.noteProduct ?? null,
        } : it
      )));
      toast.show(t('list.noteError'), 'error');
    } finally {
      setNoteSaving(false);
    }
  }, [items, noteItem, noteSaving, t, toast]);

  const toggle = useCallback(async (item: MergedCartItem) => {
    const next = !item.inCart;
    const ids = new Set(item.ids);
    const prevState = new Map(items.filter((it) => ids.has(it.id)).map((it) => [it.id, it.inCart]));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!reducedMotion) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.map((it) => (ids.has(it.id) ? { ...it, inCart: next } : it)));
    try {
      await Promise.all(item.ids.map((id) => setItemInCart(id, next)));
    } catch {
      setItems((prev) => prev.map((it) => (ids.has(it.id) ? { ...it, inCart: prevState.get(it.id) ?? it.inCart } : it)));
      toast.show(t('list.updateError'), 'error');
    }
  }, [items, reducedMotion, t, toast]);

  // Clave estable con el CONJUNTO de ids de Mercadona presentes (ordenado). Así
  // marcar "en cesta" (que reemplaza `items` con el mismo conjunto de ids) no
  // dispara una recarga de nombres; solo cambia al añadir/quitar productos.
  const mercadonaIdsKey = useMemo(() => {
    const ids = items.map((it) => it.mercadonaProductId).filter(Boolean) as string[];
    return [...new Set(ids)].sort().join(',');
  }, [items]);

  // Re-traduce los nombres de Mercadona al idioma activo (se rehace al cambiar de
  // idioma o el conjunto de productos). Otros súpers no tienen display_name_ca.
  useEffect(() => {
    const ids = mercadonaIdsKey ? mercadonaIdsKey.split(',') : [];
    if (ids.length === 0) { setNameOverrides({}); return; }
    let cancelled = false;
    fetchMercadonaNames(ids)
      .then((map) => { if (!cancelled) setNameOverrides(map); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mercadonaIdsKey, lang]);

  // Aplica el nombre localizado (si lo hay) antes de fusionar/pintar.
  const localizedItems = useMemo(
    () => items.map((it) =>
      it.mercadonaProductId && nameOverrides[it.mercadonaProductId]
        ? { ...it, productName: nameOverrides[it.mercadonaProductId] }
        : it),
    [items, nameOverrides],
  );

  // Fusiona duplicados del mismo producto sumando unidades.
  const merged = useMemo(() => mergeCartItems(localizedItems), [localizedItems]);

  const { doneItems, totalCost, hasPrices } = useMemo(() => ({
    doneItems: merged.filter((i) => i.inCart).length,
    totalCost: merged.reduce(
      (sum, i) => sum + (i.unitPrice != null ? i.unitPrice * i.quantity : 0),
      0,
    ),
    hasPrices: merged.some((i) => i.unitPrice != null),
  }), [merged]);

  // El agrupado, sus contadores y el orden alfabético dependen de los
  // productos, no de si una cabecera está plegada. Prepararlos una sola vez
  // evita repetir filtros y ordenaciones al tocar una tienda o zona.
  const preparedStores = useMemo<PreparedCartStore[]>(() => (
    groupByStore(merged).map((group) => ({
      store: group.store,
      count: group.data.length,
      inCart: group.data.filter((item) => item.inCart).length,
      zones: groupByZone(group.data).map((zoneGroup) => ({
        zone: zoneGroup.zone,
        count: zoneGroup.data.length,
        inCart: zoneGroup.data.filter((item) => item.inCart).length,
        data: sortZoneItems(zoneGroup.data),
      })),
    }))
  ), [merged]);

  const handleZonePress = useCallback((section: CartSection) => {
    const now = Date.now();
    const previousTap = lastZoneTap.current;
    const isDoubleTap = previousTap?.key === section.key
      && now - previousTap.timestamp <= ZONE_DOUBLE_TAP_MS;

    if (!isDoubleTap || !previousTap) {
      lastZoneTap.current = {
        key: section.key,
        timestamp: now,
        wasCollapsed: section.zoneCollapsed,
      };
      toggleZone(section.key);
      return;
    }

    lastZoneTap.current = null;
    const store = preparedStores.find((group) => group.store === section.store);
    if (!store) return;

    const shouldCollapse = !previousTap.wasCollapsed;
    Haptics.selectionAsync();
    setCollapsedZones((prev) => {
      const next = new Set(prev);
      store.zones.forEach(({ zone }) => {
        const zoneKey = `${section.store}:${zone.key}`;
        if (shouldCollapse) next.add(zoneKey);
        else next.delete(zoneKey);
      });
      return next;
    });
  }, [preparedStores, toggleZone]);

  // Agrupado Tienda → Zona del súper (pasillo); dentro de cada zona, pendientes
  // primero y alfabético. Cada par tienda×zona es una sección del SectionList;
  // la cabecera de tienda solo se pinta en la primera zona de esa tienda.
  // Plegado: si la tienda está plegada se emite una única sección con solo su
  // cabecera (sin zonas ni productos). Una zona plegada conserva `data`: cada
  // fila anima y recorta su propia altura, de la última a la primera. Así la
  // lista no desaparece de golpe y el despliegue puede recorrer el camino inverso.
  const sections = useMemo<CartSection[]>(() => preparedStores.flatMap((group): CartSection[] => {
    if (collapsedStores.has(group.store)) {
      return [{
        key: `${group.store}:__store`,
        store: group.store,
        zone: null,
        firstOfStore: true,
        storeCollapsed: true,
        storeCount: group.count,
        storeInCart: group.inCart,
        zoneCount: 0,
        zoneInCart: 0,
        zoneCollapsed: false,
        data: EMPTY_CART_ITEMS,
      }];
    }
    return group.zones.map((zoneGroup, zoneIndex) => {
      const zoneKey = `${group.store}:${zoneGroup.zone.key}`;
      const zoneCollapsed = collapsedZones.has(zoneKey);
      return {
        key: zoneKey,
        store: group.store,
        zone: zoneGroup.zone,
        firstOfStore: zoneIndex === 0,
        storeCollapsed: false,
        storeCount: group.count,
        storeInCart: group.inCart,
        zoneCount: zoneGroup.count,
        zoneInCart: zoneGroup.inCart,
        zoneCollapsed,
        data: zoneGroup.data,
      };
    });
  }), [preparedStores, collapsedStores, collapsedZones]);

  const renderItem = useCallback(({ item, index, section }: {
    item: MergedCartItem;
    index: number;
    section: CartSection;
  }) => (
    <AnimatedZoneRow
      collapsed={section.zoneCollapsed}
      index={index}
      itemCount={section.data.length}
      reducedMotion={reducedMotion}
    >
      <CartItemRow
        item={item}
        members={members}
        onToggle={toggle}
        onOpenDetail={setDetailTarget}
        onAssign={setAssignItem}
        onRemove={doRemove}
        onDecrement={doDecrement}
        onEditNote={setNoteItem}
      />
    </AnimatedZoneRow>
  ), [members, toggle, doRemove, doDecrement, reducedMotion]);

  // ── Shared screen shell ───────────────────────────────────────
  // Cabecera compartida por todos los estados. En glass vive en una franja
  // flotante medida; en fallback forma parte del flujo normal de la pantalla.
  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.titleWrap}>
        <View style={styles.titleIcon}>
          <ActiveCartIcon size={15} color={colors.accent} fallback="basket" />
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {activeCart?.groupName ?? t('list.title')}
        </Text>
      </View>

      {activeCart && !loading && !error && (
        <View style={styles.subtitleRow}>
          <Text style={styles.subtitle}>
            {t('list.subtitle', { done: doneItems, total: merged.length })}
          </Text>
          {items.length > 0 && (
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => setAssignAllVisible(true)}
                style={({ pressed }) => [styles.headerBtn, styles.headerBtnPrimary, pressed && styles.headerBtnPressed]}
                hitSlop={10}
              >
                <Ionicons name="person-add-outline" size={17} color={colors.white} />
              </Pressable>
              <Pressable
                onPress={() => setConfirmClear(true)}
                style={({ pressed }) => [styles.headerBtn, pressed && styles.headerBtnPressed]}
                hitSlop={10}
              >
                <Ionicons name="trash-outline" size={17} color={colors.inkSoft} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );

  const screenState = !activeCart ? (
    <View style={[
      styles.centerBox,
      styles.centerBoxRaised,
      glassAvailable && { paddingTop: glassInset },
    ]}>
      <Ionicons name="cart-outline" size={48} color={colors.inkFaint} />
      <Text style={styles.centerTitle}>{t('list.noCartTitle')}</Text>
      <Text style={styles.centerText}>{t('list.noCartText')}</Text>
    </View>
  ) : loading ? (
    <ActivityIndicator
      size="large"
      color={colors.accent}
      style={{ marginTop: glassInset + 48 }}
    />
  ) : error ? (
    <View style={[styles.centerBox, glassAvailable && { paddingTop: glassInset }]}>
      <Text style={styles.centerText}>{t('list.loadError')}</Text>
      <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </TouchableOpacity>
    </View>
  ) : items.length === 0 ? (
    <View style={[
      styles.centerBox,
      styles.centerBoxRaised,
      glassAvailable && { paddingTop: glassInset },
    ]}>
      <Ionicons name="list-outline" size={48} color={colors.inkFaint} />
      <Text style={styles.centerTitle}>{t('list.emptyTitle')}</Text>
      <Text style={styles.centerText}>{t('list.emptyText')}</Text>
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <AmbientBubbleBackdrop showGradient={false} />
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && header}

      {screenState ?? (
        <>
          {/* List */}
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.ids[0]}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => {
              const meta = STORE_META[section.store];
              return (
                <View>
                  {section.firstOfStore && (
                    <TouchableOpacity
                      style={[styles.storeHeader, section.key !== sections[0].key && { marginTop: 18 }]}
                      activeOpacity={0.6}
                      onPress={() => toggleStore(section.store)}
                    >
                      {meta.icon ? (
                        <Image source={meta.icon} style={styles.storeHeaderIcon} resizeMode="cover" />
                      ) : (
                        <Ionicons name="pricetag-outline" size={14} color={colors.inkSoft} />
                      )}
                      <Text style={styles.storeHeaderText}>{meta.name}</Text>
                      <Text style={styles.storeHeaderCount}>{section.storeInCart}/{section.storeCount}</Text>
                      <Ionicons
                        name={section.storeCollapsed ? 'chevron-forward' : 'chevron-down'}
                        size={15}
                        color={colors.inkFaint}
                      />
                    </TouchableOpacity>
                  )}
                  {section.zone && (
                    <TouchableOpacity
                      style={styles.zoneHeader}
                      activeOpacity={0.6}
                      onPress={() => handleZonePress(section)}
                    >
                      <Text style={styles.zoneHeaderEmoji}>{section.zone.emoji}</Text>
                      <Text style={styles.zoneHeaderText}>{t(`zones.${section.zone.key}`)}</Text>
                      <Text style={styles.zoneHeaderCount}>{section.zoneInCart}/{section.zoneCount}</Text>
                      <Ionicons
                        name={section.zoneCollapsed ? 'chevron-forward' : 'chevron-down'}
                        size={13}
                        color={colors.inkFaint}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
            contentContainerStyle={[styles.list, { paddingBottom: 140 + tabBarOffset, paddingTop: 8 + glassInset }]}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
                // El spinner nace bajo el chrome de cristal, no detrás.
                progressViewOffset={glassInset}
              />
            }
          />

          {/* Total bar */}
          {hasPrices && (
            <View style={[styles.totalBar, { bottom: tabBarOffset + 8 }]}>
              <Text style={styles.totalBarLabel}>{t('list.totalEstimated')}</Text>
              <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
            </View>
          )}

          {/* Done bar — covers total bar when complete */}
          {doneItems === merged.length && merged.length > 0 && (
            <View style={[styles.doneBar, { bottom: tabBarOffset + 8 }]}>
              <Text style={styles.doneBarEmoji}>🎉</Text>
              <Text style={styles.doneBarText}>{t('list.listCompleted')}</Text>
              <TouchableOpacity
                style={styles.doneBarBtn}
                onPress={handleFinish}
                disabled={finishing}
              >
                {finishing
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={styles.doneBarBtnText}>{t('list.finish')}</Text>}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Chrome de cristal: al FINAL del árbol para pintarse encima; la lista
          se refracta al pasar por debajo (paddingTop = altura medida). */}
      {glassAvailable && (
        <View
          style={styles.chrome}
          onLayout={(e) => setChromeH(e.nativeEvent.layout.height)}
        >
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {header}
          </GlassSurface>
        </View>
      )}

      <StoreProductModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        fullScreen
      />

      <ProductNoteSheet
        visible={!!noteItem}
        productName={noteItem?.productName ?? ''}
        initialValue={noteItem?.note ?? null}
        initialProduct={noteItem?.noteProduct ?? null}
        busy={noteSaving}
        onSave={doSaveNote}
        onClose={() => { if (!noteSaving) setNoteItem(null); }}
      />

      {/* Assign-to-member sheet — un producto (assignItem) o toda la lista (assignAllVisible) */}
      <Modal
        visible={!!assignItem || assignAllVisible}
        transparent
        animationType={reducedMotion ? 'none' : 'slide'}
        onRequestClose={() => { setAssignItem(null); setAssignAllVisible(false); }}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => { setAssignItem(null); setAssignAllVisible(false); }} />
          {(!!assignItem || assignAllVisible) && (
            <View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 30 : Math.max(insets.bottom + 10, 30) }]}>
              <Text style={styles.sheetTitle} numberOfLines={1}>
                {assignAllVisible
                  ? t('list.assignAllTitle')
                  : t('list.whoBrings', { product: assignItem?.productName ?? '' })}
              </Text>

              <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
                {members.map((m) => {
                  const selected = !assignAllVisible && assignItem?.assignedTo === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.sheetRow}
                      activeOpacity={0.7}
                      onPress={() => (assignAllVisible ? doAssignAll(m.id) : doAssign(assignItem!, m.id))}
                    >
                      <UserAvatar avatarUrl={m.avatarUrl} initials={m.initials} color={m.color} size={38} />
                      <Text style={styles.sheetRowText} numberOfLines={1}>{m.name}</Text>
                      {selected && <Ionicons name="checkmark" size={20} color={colors.accent} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                style={styles.sheetClear}
                activeOpacity={0.7}
                onPress={() => (assignAllVisible ? doAssignAll(null) : doAssign(assignItem!, null))}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.inkSoft} />
                <Text style={styles.sheetClearText}>{t('common.unassigned')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>

      {/* Sin `destructive`: el botón Vaciar va en el accent elegido por el
          usuario (Apariencia), no en el rojo fijo de acciones destructivas. */}
      <ConfirmDialog
        visible={confirmClear}
        title={t('list.clearTitle')}
        message={t('list.clearMessage')}
        confirmLabel={t('list.clearConfirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleClearAll}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

// Mantiene cada tarjeta montada al plegar una zona y anima su altura dentro de
// una ventana escalonada. Al cerrar empieza por la última tarjeta (abajo →
// arriba); al abrir recorre el orden inverso (arriba → abajo). El recorte evita
// que una tarjeta se pinte encima de la siguiente mientras cambia de altura.
const AnimatedZoneRow = memo(function AnimatedZoneRow({
  collapsed,
  index,
  itemCount,
  reducedMotion,
  children,
}: PropsWithChildren<{
  collapsed: boolean;
  index: number;
  itemCount: number;
  reducedMotion: boolean;
}>) {
  const progress = useRef(new Animated.Value(collapsed ? 0 : 1)).current;
  const previousCollapsed = useRef(collapsed);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  useEffect(() => {
    if (previousCollapsed.current === collapsed) {
      progress.setValue(collapsed ? 0 : 1);
      return;
    }
    previousCollapsed.current = collapsed;

    if (reducedMotion) {
      progress.setValue(collapsed ? 0 : 1);
      return;
    }

    const staggerStep = itemCount > 1
      ? ZONE_STAGGER_WINDOW_MS / (itemCount - 1)
      : 0;
    const staggerIndex = collapsed ? itemCount - 1 - index : index;
    const animation = Animated.timing(progress, {
      toValue: collapsed ? 0 : 1,
      duration: ZONE_ROW_ANIMATION_MS,
      delay: Math.round(staggerIndex * staggerStep),
      easing: Easing.bezier(0.22, 0.72, 0.24, 1),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [collapsed, index, itemCount, progress, reducedMotion]);

  const animatedStyle = contentHeight == null
    ? (collapsed ? zoneRowStyles.hidden : null)
    : {
        height: progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0, contentHeight],
        }),
        opacity: progress,
      };

  return (
    <Animated.View
      style={[zoneRowStyles.clip, animatedStyle]}
      pointerEvents={collapsed ? 'none' : 'auto'}
      accessibilityElementsHidden={collapsed}
      importantForAccessibility={collapsed ? 'no-hide-descendants' : 'auto'}
    >
      <View
        style={zoneRowStyles.measure}
        onLayout={({ nativeEvent }) => {
          const nextHeight = nativeEvent.layout.height;
          setContentHeight((current) => (
            current == null || Math.abs(current - nextHeight) > 0.5 ? nextHeight : current
          ));
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
});

// Fila del carrito. Tres zonas táctiles independientes: el checkbox marca
// "En cesta", la zona central (foto + nombre) abre el detalle del producto y
// la papelera elimina en un toque — tacha el artículo, lo desvanece y entonces
// borra. Si el borrado en servidor falla, la fila reaparece.
const CartItemRow = memo(function CartItemRow({ item, members, onToggle, onOpenDetail, onAssign, onRemove, onDecrement, onEditNote }: {
  item: MergedCartItem;
  members: GroupMember[];
  onToggle: (item: MergedCartItem) => void;
  onOpenDetail: (target: ProductRef) => void;
  onAssign: (item: MergedCartItem) => void;
  onRemove: (item: MergedCartItem) => Promise<boolean>;
  onDecrement: (item: MergedCartItem) => void;
  onEditNote: (item: MergedCartItem) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  const handleDeletePress = () => {
    if (removing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRemoving(true);
    // El delay deja ver el tachado un instante antes de desvanecer.
    const remove = async () => {
      const ok = await onRemove(item);
      if (!ok) {
        opacity.setValue(1);
        setRemoving(false);
      }
    };
    if (reducedMotion) {
      opacity.setValue(0);
      void remove();
    } else {
      Animated.timing(opacity, { toValue: 0, duration: 350, delay: 150, useNativeDriver: true })
        .start(remove);
    }
  };

  const assignee = item.assignedTo ? members.find((m) => m.id === item.assignedTo) : null;
  // Ficha del producto: disponible para cualquier súper con id (no para manuales).
  const detailTarget = productRefOf(item);

  return (
    <Animated.View style={[styles.itemCard, item.inCart && styles.itemCardDone, { opacity }]}>
      <View style={styles.itemRow}>
        <TouchableOpacity
          hitSlop={10}
          disabled={removing}
          onPress={() => onToggle(item)}
        >
          <View style={[styles.checkbox, item.inCart && styles.checkboxChecked]}>
            {item.inCart && <Ionicons name="checkmark" size={13} color={colors.white} />}
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.itemBody}
          activeOpacity={0.7}
          disabled={removing || !detailTarget}
          onPress={() => detailTarget && onOpenDetail(detailTarget)}
        >
          {item.imageUrl ? (
            <ProductImage uri={item.imageUrl} style={styles.itemThumb} />
          ) : item.categoryEmoji ? (
            <View style={styles.itemThumbPlaceholder}>
              <Text style={styles.itemEmoji}>{item.categoryEmoji}</Text>
            </View>
          ) : null}
          <View style={styles.itemContent}>
            <Text style={[styles.itemName, (item.inCart || removing) && styles.itemNameDone]}>
              {item.productName}
            </Text>
            <View style={styles.itemUnitRow}>
              <Text style={styles.itemUnit}>{item.quantity} {item.unit}</Text>
              {item.unitPrice != null ? (
                <Text style={styles.itemPrice}>{formatEuro(item.unitPrice * item.quantity)}</Text>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.assignBtn}
          activeOpacity={0.7}
          hitSlop={8}
          disabled={removing}
          onPress={() => onAssign(item)}
          accessibilityRole="button"
          accessibilityLabel={t('list.whoBrings', { product: item.productName })}
        >
          {assignee ? (
            <UserAvatar avatarUrl={assignee.avatarUrl} initials={assignee.initials} color={assignee.color} size={28} />
          ) : (
            <View style={styles.assignEmpty}>
              <Ionicons name="person-add-outline" size={15} color={colors.inkFaint} />
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.qtyActions}>
          {item.quantity > 1 && (
            <TouchableOpacity
              style={styles.qtyBtn}
              hitSlop={8}
              disabled={removing}
              onPress={() => onDecrement(item)}
              accessibilityRole="button"
              accessibilityLabel={t('common.decreaseQuantity')}
            >
              <Ionicons name="remove" size={16} color={colors.inkFaint} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.qtyBtn}
            hitSlop={8}
            disabled={removing}
            onPress={handleDeletePress}
            accessibilityRole="button"
            accessibilityLabel={t('list.deleteProduct', { product: item.productName })}
          >
            <Ionicons name="trash-outline" size={15} color={colors.inkFaint} />
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.noteExtension, item.inCart && styles.noteExtensionDone]}
        activeOpacity={0.7}
        disabled={removing}
        onPress={() => onEditNote(item)}
        accessibilityRole="button"
        accessibilityLabel={item.note || item.noteProduct
          ? t('list.noteEditA11y', { note: item.note ?? item.noteProduct?.name ?? '' })
          : t('list.notePlaceholder')}
      >
        <Ionicons
          name={item.note || item.noteProduct ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'}
          size={14}
          color={item.note || item.noteProduct ? colors.accent : colors.inkFaint}
        />
        <View style={styles.noteContent}>
          {item.note ? (
            <Text style={[styles.noteText, styles.noteTextFilled]} numberOfLines={2}>
              {item.note}
            </Text>
          ) : !item.noteProduct ? (
            <Text style={styles.noteText} numberOfLines={1}>{t('list.notePlaceholder')}</Text>
          ) : null}
          {item.noteProduct && (
            <View style={styles.noteProductRow}>
              {item.noteProduct.imageUrl ? (
                <ProductImage uri={item.noteProduct.imageUrl} style={styles.noteProductImage} />
              ) : (
                <Ionicons name="link-outline" size={12} color={colors.accent} />
              )}
              <Text style={styles.noteProductText} numberOfLines={1}>
                {t('list.noteLinkedProduct', {
                  product: item.noteProduct.name,
                  store: STORE_META[item.noteProduct.store].name,
                })}
              </Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={13} color={colors.inkFaint} />
      </TouchableOpacity>
    </Animated.View>
  );
});

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    paddingHorizontal: 16, paddingBottom: 12,
    // paddingTop inline (useHeaderTopPadding)
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  // Contador + acciones (esferas) en la misma fila, bajo el título.
  subtitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 8,
  },
  subtitle: { flex: 1, fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft },
  headerActions: { flexDirection: 'row', gap: 6 },
  // Esfera (círculo, como el cerrar de NotificationsSheet) con efecto de
  // pulsado (se encoge y atenúa mientras está presionado). Igual en glass y
  // fallback: color sólido, sin glass anidado.
  headerBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  headerBtnPrimary: { backgroundColor: colors.accent },
  headerBtnPressed: { transform: [{ scale: 0.88 }], opacity: 0.7 },

  list: { paddingHorizontal: 16, paddingBottom: 140, paddingTop: 8 },

  sectionHeader: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8,
  },

  // ── Store section header ──────────────────────────────────────
  storeHeader: {
    minHeight: 40,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: 8, paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
  },
  storeHeaderIcon: { width: 18, height: 18, borderRadius: 4 },
  storeHeaderText: { fontSize: 13, fontFamily: fonts.bold, color: colors.ink, flex: 1 },
  storeHeaderCount: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.inkSoft },

  // ── Zone sub-header (pasillo dentro de la tienda) ─────────────
  zoneHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 34, marginTop: 2, marginBottom: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    backgroundColor: colors.surfaceAlt, borderRadius: 18,
  },
  zoneHeaderEmoji: { fontSize: 12 },
  zoneHeaderText: {
    flex: 1, fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  zoneHeaderCount: { fontSize: 10.5, fontFamily: fonts.semibold, color: colors.inkFaint },

  // ── Item rows ─────────────────────────────────────────────────
  itemCard: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    overflow: 'hidden',
  },
  itemCardDone: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 13, paddingVertical: 12,
    gap: 10,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: colors.inkFaint,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  itemThumb: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.white },
  itemThumbPlaceholder: {
    width: 50, height: 50, borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  itemEmoji: { fontSize: 19 },
  itemBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  itemNameDone: { color: colors.inkSoft, textDecorationLine: 'line-through' },
  // Cantidad + coste/badge en la misma línea, bajo el nombre.
  itemUnitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  itemUnit: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft },
  itemPrice: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },

  // Restar y eliminar igualan los 28 pt del control de asignación. El espacio
  // mayor evita que se lean como una única acción apretada.
  qtyActions: { alignItems: 'center', justifyContent: 'center', gap: 10 },
  qtyBtn: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.inkFaint,
  },

  // ── Assignee ──────────────────────────────────────────────────
  assignBtn: { padding: 2 },
  assignAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  assignAvatarText: { fontSize: 11, fontFamily: fonts.bold, color: colors.white },
  // Mismo trazo que el checkbox (1.5 inkFaint); discontinuo = sin asignar.
  assignEmpty: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.inkFaint, borderStyle: 'dashed',
  },

  // Pie unido a la tarjeta. El divisor punteado lo diferencia del bloque
  // principal sin convertirlo en una segunda tarjeta flotante.
  noteExtension: {
    minHeight: 34,
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 13, paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderStyle: 'dotted',
  },
  noteExtensionDone: { borderTopColor: colors.accentMid },
  noteText: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.inkFaint,
  },
  noteTextFilled: { color: colors.inkSoft },
  noteContent: { flex: 1, gap: 4 },
  noteProductRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteProductImage: { width: 18, height: 18, borderRadius: 5, backgroundColor: colors.white },
  noteProductText: {
    flex: 1, fontSize: 10.5, lineHeight: 14,
    fontFamily: fonts.semibold, color: colors.accent,
  },

  // ── Assign sheet ──────────────────────────────────────────────
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.border,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 18, overflow: 'hidden',
    // paddingBottom inline: iOS 30 (como antes); Android, sobre el inset del sistema.
  },
  sheetTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink, paddingHorizontal: 18, marginBottom: 6 },
  sheetList: { maxHeight: 320 },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetAvatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetAvatarText: { fontSize: 14, fontFamily: fonts.bold, color: colors.white },
  sheetRowText: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  sheetClear: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 15, marginTop: 6,
  },
  sheetClearText: { fontSize: 14, fontFamily: fonts.bold, color: colors.inkSoft },

  // ── Total bar ─────────────────────────────────────────────────
  totalBar: {
    position: 'absolute', bottom: 0, left: 16, right: 16,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  totalBarLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft },
  totalBarAmount: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink },

  // ── Done bar ──────────────────────────────────────────────────
  doneBar: {
    position: 'absolute', bottom: 0, left: 16, right: 16,
    backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, gap: 10,
    borderRadius: 18,
  },
  doneBarEmoji: { fontSize: 20 },
  doneBarText: { flex: 1, fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  doneBarBtn: {
    backgroundColor: colors.white,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 15,
  },
  doneBarBtnText: { fontFamily: fonts.bold, color: colors.accent, fontSize: 13 },

  // ── States ────────────────────────────────────────────────────
  centerBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 10,
  },
  centerBoxRaised: { paddingBottom: 160 },
  centerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  centerText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent, marginTop: 4 },

  // ── Chrome de cristal (solo glassAvailable, F3) ───────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
