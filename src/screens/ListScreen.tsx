import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchListItems, setItemInCart, assignListItem, clearListItems, deleteListItems, updateListItemQuantity, mergeCartItems, type ListItemRow, type MergedCartItem } from '../api/lists';
import { fetchMercadonaNames } from '../api/catalog';
import { fetchGroupMembers } from '../api/groups';
import { recordPurchase } from '../api/purchases';
import type { GroupMember } from '../types';
import ProductImage from '../components/ProductImage';
import StoreProductModal, { type ProductRef } from '../components/StoreProductModal';
import ConfirmDialog from '../components/ConfirmDialog';
import UserAvatar from '../components/UserAvatar';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';

import { STORE_META, groupByStore, storeOfItem, type Store } from '../constants/stores';
import { groupByZone, sortZoneItems, type ShopZone } from '../constants/zones';

// Sección del SectionList de la cesta. `zone` es null en la sección "tienda
// plegada" (solo cabecera de tienda, sin productos). Los contadores son sobre
// el total real; `data` puede ir vacía al plegar zona o tienda.
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

  const [items, setItems] = useState<ListItemRow[]>([]);
  // Nombres de Mercadona re-traducidos al idioma activo (id → nombre). El
  // product_name guardado en list_items es un snapshot del idioma con el que se
  // añadió, así que en català se mostraría en castellano sin esto.
  const [nameOverrides, setNameOverrides] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ProductRef | null>(null);
  const [assignItem, setAssignItem] = useState<MergedCartItem | null>(null);
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

  // Liquid Glass (F3): la cabecera vive en una franja de cristal flotante y la
  // lista pasa por debajo refractándose (paddingTop del contenido = altura
  // medida del chrome). En fallback (Android / iOS ≤ 18), cabecera en flujo.
  const [chromeH, setChromeH] = useState(0);
  const glassInset = glassAvailable ? chromeH : 0;

  const toggleStore = useCallback((store: string) => {
    Haptics.selectionAsync();
    // Animar aquí fuerza a recalcular el layout de todas las filas visibles y
    // se vuelve costoso al desplegar una tienda completa.
    setCollapsedStores((prev) => {
      const next = new Set(prev);
      next.has(store) ? next.delete(store) : next.add(store);
      return next;
    });
  }, []);

  const toggleZone = useCallback((key: string) => {
    Haptics.selectionAsync();
    // La cabecera responde al instante; SectionList virtualiza las filas nuevas.
    setCollapsedZones((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(() => {
    if (!listId) { setItems([]); setLoading(false); return Promise.resolve(); }
    setError(false);
    const itemsP = fetchListItems(listId).then(setItems).catch(() => setError(true));
    const membersP = groupId
      ? fetchGroupMembers(groupId).then(setMembers).catch(() => {})
      : Promise.resolve();
    return Promise.all([itemsP, membersP]).finally(() => setLoading(false));
  }, [listId, groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((list) => list.filter((it) => !ids.has(it.id)));
    try {
      await deleteListItems(item.ids);
      return true;
    } catch {
      setItems(prev);
      toast.show(t('list.removeError'), 'error');
      return false;
    }
  }, [items, t, toast]);

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
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
  }, [items, t, toast]);

  const toggle = useCallback(async (item: MergedCartItem) => {
    const next = !item.inCart;
    const ids = new Set(item.ids);
    const prevState = new Map(items.filter((it) => ids.has(it.id)).map((it) => [it.id, it.inCart]));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((prev) => prev.map((it) => (ids.has(it.id) ? { ...it, inCart: next } : it)));
    try {
      await Promise.all(item.ids.map((id) => setItemInCart(id, next)));
    } catch {
      setItems((prev) => prev.map((it) => (ids.has(it.id) ? { ...it, inCart: prevState.get(it.id) ?? it.inCart } : it)));
      toast.show(t('list.updateError'), 'error');
    }
  }, [items, t, toast]);

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

  // Agrupado Tienda → Zona del súper (pasillo); dentro de cada zona, pendientes
  // primero y alfabético. Cada par tienda×zona es una sección del SectionList;
  // la cabecera de tienda solo se pinta en la primera zona de esa tienda.
  // Plegado: si la tienda está plegada se emite una única sección con solo su
  // cabecera (sin zonas ni productos); si una zona está plegada, su cabecera se
  // mantiene pero `data` va vacía. Los contadores se calculan sobre el total
  // real (no sobre `data`, que puede quedar vacía al plegar).
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
        data: zoneCollapsed ? EMPTY_CART_ITEMS : zoneGroup.data,
      };
    });
  }), [preparedStores, collapsedStores, collapsedZones]);

  const renderItem = useCallback(({ item }: { item: MergedCartItem }) => (
    <CartItemRow
      item={item}
      members={members}
      onToggle={toggle}
      onOpenDetail={setDetailTarget}
      onAssign={setAssignItem}
      onRemove={doRemove}
      onDecrement={doDecrement}
    />
  ), [members, toggle, doRemove, doDecrement]);

  // ── Shared screen shell ───────────────────────────────────────
  // Cabecera compartida por todos los estados. En glass vive en una franja
  // flotante medida; en fallback forma parte del flujo normal de la pantalla.
  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.titleWrap}>
        <View style={styles.titleIcon}>
          <Ionicons name="basket" size={18} color={colors.accent} />
        </View>
        <Text style={styles.title}>{activeCart?.groupName ?? t('list.title')}</Text>
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
                      onPress={() => toggleZone(section.key)}
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

      {/* Assign-to-member sheet — un producto (assignItem) o toda la lista (assignAllVisible) */}
      <Modal
        visible={!!assignItem || assignAllVisible}
        transparent
        animationType="slide"
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

// Fila del carrito. Tres zonas táctiles independientes: el checkbox marca
// "En cesta", la zona central (foto + nombre) abre el detalle del producto y
// la papelera elimina en un toque — tacha el artículo, lo desvanece y entonces
// borra. Si el borrado en servidor falla, la fila reaparece.
const CartItemRow = memo(function CartItemRow({ item, members, onToggle, onOpenDetail, onAssign, onRemove, onDecrement }: {
  item: MergedCartItem;
  members: GroupMember[];
  onToggle: (item: MergedCartItem) => void;
  onOpenDetail: (target: ProductRef) => void;
  onAssign: (item: MergedCartItem) => void;
  onRemove: (item: MergedCartItem) => Promise<boolean>;
  onDecrement: (item: MergedCartItem) => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;

  const handleDeletePress = () => {
    if (removing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRemoving(true);
    // El delay deja ver el tachado un instante antes de desvanecer.
    Animated.timing(opacity, { toValue: 0, duration: 350, delay: 150, useNativeDriver: true })
      .start(async () => {
        const ok = await onRemove(item);
        if (!ok) {
          opacity.setValue(1);
          setRemoving(false);
        }
      });
  };

  const assignee = item.assignedTo ? members.find((m) => m.id === item.assignedTo) : null;
  // Ficha del producto: disponible para cualquier súper con id (no para manuales).
  const detailTarget = productRefOf(item);

  return (
    <Animated.View style={[styles.itemRow, item.inCart && styles.itemRowDone, { opacity }]}>
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

      {/* Asignar a + papelera, alineados a la derecha y centrados verticalmente */}
      <TouchableOpacity
        style={styles.assignBtn}
        activeOpacity={0.7}
        hitSlop={6}
        disabled={removing}
        onPress={() => onAssign(item)}
      >
        {assignee ? (
          <UserAvatar avatarUrl={assignee.avatarUrl} initials={assignee.initials} color={assignee.color} size={28} />
        ) : (
          <View style={styles.assignEmpty}>
            <Ionicons name="person-add-outline" size={15} color={colors.inkFaint} />
          </View>
        )}
      </TouchableOpacity>

      {/* Restar una unidad (solo si hay más de una) y eliminar, apilados y centrados. */}
      <View style={styles.qtyActions}>
        {item.quantity > 1 && (
          <TouchableOpacity
            style={styles.qtyBtn}
            hitSlop={6}
            disabled={removing}
            onPress={() => onDecrement(item)}
          >
            <Ionicons name="remove" size={15} color={colors.inkFaint} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.qtyBtn}
          hitSlop={6}
          disabled={removing}
          onPress={handleDeletePress}
        >
          <Ionicons name="trash-outline" size={14} color={colors.inkFaint} />
        </TouchableOpacity>
      </View>
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
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  title: { flex: 1, fontSize: 25, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.4 },
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
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 13, paddingVertical: 12, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
    gap: 10,
  },
  itemRowDone: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accent,
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

  // Acciones de cantidad (restar / eliminar): apiladas en vertical y centradas,
  // a la derecha del todo. Cada botón es del tamaño del checkbox de "seleccionar"
  // y con SU MISMO trazo (1.5 inkFaint) para que se vean igual de marcados.
  qtyActions: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  qtyBtn: {
    width: 22, height: 22, borderRadius: 11,
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
