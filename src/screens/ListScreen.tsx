import { useCallback, useRef, useState } from 'react';
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
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchListItems, setItemInCart, assignListItem, clearListItems, deleteListItems, mergeCartItems, type ListItemRow, type MergedCartItem } from '../api/lists';
import { fetchGroupMembers } from '../api/groups';
import { recordPurchase } from '../api/purchases';
import type { GroupMember } from '../types';
import ProgressBar from '../components/ProgressBar';
import ProductImage from '../components/ProductImage';
import ProductDetailModal from '../components/ProductDetailModal';
import ConfirmDialog from '../components/ConfirmDialog';
import UserAvatar from '../components/UserAvatar';

import { STORE_META, groupByStore } from '../constants/stores';
import { groupByZone, sortZoneItems } from '../constants/zones';

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// LayoutAnimation necesita habilitarse explícitamente en Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ListScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { session } = useAuth();
  const { activeCart } = useCart();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const listId = activeCart?.listId;
  const groupId = activeCart?.groupId;

  const [items, setItems] = useState<ListItemRow[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [assignItem, setAssignItem] = useState<MergedCartItem | null>(null);
  // Selector "asignar TODA la lista" (botón de la cabecera). Reusa la misma hoja
  // de miembros que el asignar por producto.
  const [assignAllVisible, setAssignAllVisible] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

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

  const doRemove = async (item: MergedCartItem): Promise<boolean> => {
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
  };

  const toggle = async (item: MergedCartItem) => {
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
  };

  // Fusiona duplicados del mismo producto sumando unidades.
  const merged = mergeCartItems(items);

  const doneItems = merged.filter((i) => i.inCart).length;
  const progress = merged.length > 0 ? doneItems / merged.length : 0;
  const totalCost = merged
    .filter((i) => i.unitPrice != null)
    .reduce((sum, i) => sum + i.unitPrice! * i.quantity, 0);
  const hasPrices = merged.some((i) => i.unitPrice != null);

  // Agrupado Tienda → Zona del súper (pasillo); dentro de cada zona, pendientes
  // primero y alfabético. Cada par tienda×zona es una sección del SectionList;
  // la cabecera de tienda solo se pinta en la primera zona de esa tienda.
  const sections = groupByStore(merged).flatMap((g) => {
    const storeInCart = g.data.filter((it) => it.inCart).length;
    return groupByZone(g.data).map((z, zi) => ({
      key: `${g.store}:${z.zone.key}`,
      store: g.store,
      zone: z.zone,
      firstOfStore: zi === 0,
      storeCount: g.data.length,
      storeInCart,
      data: sortZoneItems(z.data),
    }));
  });

  const renderItem = ({ item }: { item: MergedCartItem }) => (
    <CartItemRow
      item={item}
      members={members}
      onToggle={toggle}
      onOpenDetail={setDetailProductId}
      onAssign={setAssignItem}
      onRemove={doRemove}
    />
  );

  // ── No active cart ────────────────────────────────────────────
  if (!activeCart) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
        <View style={styles.header}>
          <Text style={styles.title}>{t('list.title')}</Text>
        </View>
        <View style={styles.centerBox}>
          <Ionicons name="cart-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.centerTitle}>{t('list.noCartTitle')}</Text>
          <Text style={styles.centerText}>{t('list.noCartText')}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 120 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
        <View style={styles.header}>
          <Text style={styles.title}>{activeCart.groupName}</Text>
        </View>
        <View style={styles.centerBox}>
          <Text style={styles.centerText}>{t('list.loadError')}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTexts}>
          <Text style={styles.title}>{activeCart.groupName}</Text>
          <Text style={styles.subtitle}>
            {t('list.subtitle', { done: doneItems, total: merged.length })}
          </Text>
        </View>
        {items.length > 0 && (
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setAssignAllVisible(true)}
              style={styles.clearAllBtn}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setConfirmClear(true)}
              style={styles.clearAllBtn}
              hitSlop={8}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="list-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.centerTitle}>{t('list.emptyTitle')}</Text>
          <Text style={styles.centerText}>{t('list.emptyText')}</Text>
        </View>
      ) : (
        <>
          {/* Progress */}
          <View style={styles.progressArea}>
            <ProgressBar progress={progress} height={8} />
            <View style={styles.progressRow}>
              <Text style={styles.progressHint}>{t('list.deleteHint')}</Text>
              <Text style={styles.progressLabel}>{t('list.completed', { pct: Math.round(progress * 100) })}</Text>
            </View>
          </View>

          {/* List */}
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.ids[0]}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => {
              const meta = STORE_META[section.store];
              const zoneInCart = section.data.filter((it) => it.inCart).length;
              return (
                <View>
                  {section.firstOfStore && (
                    <View style={[styles.storeHeader, section.key !== sections[0].key && { marginTop: 18 }]}>
                      {meta.icon ? (
                        <Image source={meta.icon} style={styles.storeHeaderIcon} resizeMode="cover" />
                      ) : (
                        <Ionicons name="pricetag-outline" size={14} color={colors.inkSoft} />
                      )}
                      <Text style={styles.storeHeaderText}>{meta.name}</Text>
                      <Text style={styles.storeHeaderCount}>{section.storeInCart}/{section.storeCount}</Text>
                    </View>
                  )}
                  <View style={styles.zoneHeader}>
                    <Text style={styles.zoneHeaderEmoji}>{section.zone.emoji}</Text>
                    <Text style={styles.zoneHeaderText}>{section.zone.label}</Text>
                    <Text style={styles.zoneHeaderCount}>{zoneInCart}/{section.data.length}</Text>
                  </View>
                </View>
              );
            }}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
            }
          />

          {/* Total bar */}
          {hasPrices && (
            <View style={styles.totalBar}>
              <Text style={styles.totalBarLabel}>{t('list.totalEstimated')}</Text>
              <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
            </View>
          )}

          {/* Done bar — covers total bar when complete */}
          {doneItems === merged.length && merged.length > 0 && (
            <View style={styles.doneBar}>
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

      <ProductDetailModal
        productId={detailProductId}
        onClose={() => setDetailProductId(null)}
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
            <View style={styles.sheet}>
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

      <ConfirmDialog
        visible={confirmClear}
        title={t('list.clearTitle')}
        message={t('list.clearMessage')}
        confirmLabel={t('list.clearConfirm')}
        cancelLabel={t('common.cancel')}
        destructive
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
function CartItemRow({ item, members, onToggle, onOpenDetail, onAssign, onRemove }: {
  item: MergedCartItem;
  members: GroupMember[];
  onToggle: (item: MergedCartItem) => void;
  onOpenDetail: (productId: string) => void;
  onAssign: (item: MergedCartItem) => void;
  onRemove: (item: MergedCartItem) => Promise<boolean>;
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
        disabled={removing || !item.mercadonaProductId}
        onPress={() => item.mercadonaProductId && onOpenDetail(item.mercadonaProductId)}
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
            {item.inCart ? (
              <View style={styles.inCartBadge}>
                <Text style={styles.inCartBadgeText}>{t('list.inCart')}</Text>
              </View>
            ) : item.unitPrice != null ? (
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

      <TouchableOpacity
        style={styles.deleteBtn}
        hitSlop={6}
        disabled={removing}
        onPress={handleDeletePress}
      >
        <Ionicons name="trash-outline" size={14} color={colors.inkFaint} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, gap: 8,
  },
  headerTexts: { flex: 1 },
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 8 },
  clearAllBtn: {
    width: 38, height: 38,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },

  progressArea: { paddingHorizontal: 16, marginBottom: 4, gap: 6 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  progressHint: { flex: 1, fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkFaint },
  progressLabel: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'right' },

  list: { paddingHorizontal: 16, paddingBottom: 140, paddingTop: 8 },

  sectionHeader: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8,
  },

  // ── Store section header ──────────────────────────────────────
  storeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  storeHeaderIcon: { width: 18, height: 18 },
  storeHeaderText: { fontSize: 13, fontFamily: fonts.bold, color: colors.ink, flex: 1 },
  storeHeaderCount: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.inkSoft },

  // ── Zone sub-header (pasillo dentro de la tienda) ─────────────
  zoneHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 2, marginBottom: 7, paddingLeft: 2,
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
    padding: 13, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
    gap: 11,
  },
  itemRowDone: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentMid,
  },
  checkbox: {
    width: 22, height: 22,
    borderWidth: 1.5, borderColor: colors.inkFaint,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  itemThumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.white },
  itemThumbPlaceholder: {
    width: 40, height: 40, borderRadius: 6,
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

  inCartBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  inCartBadgeText: { fontSize: 10, fontFamily: fonts.bold, color: colors.white },
  // Papelera: mismo tamaño que el checkbox de "seleccionar", a la derecha del todo.
  deleteBtn: {
    width: 22, height: 22,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },

  // ── Assignee ──────────────────────────────────────────────────
  assignBtn: { padding: 2 },
  assignAvatar: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  assignAvatarText: { fontSize: 11, fontFamily: fonts.bold, color: colors.white },
  assignEmpty: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },

  // ── Assign sheet ──────────────────────────────────────────────
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: 18, paddingBottom: 30,
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
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  totalBarLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft },
  totalBarAmount: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink },

  // ── Done bar ──────────────────────────────────────────────────
  doneBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  doneBarEmoji: { fontSize: 20 },
  doneBarText: { flex: 1, fontFamily: fonts.bold, color: colors.white, fontSize: 15 },
  doneBarBtn: {
    backgroundColor: colors.white,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  doneBarBtnText: { fontFamily: fonts.bold, color: colors.accent, fontSize: 13 },

  // ── States ────────────────────────────────────────────────────
  centerBox: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 40, gap: 10,
  },
  centerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  centerText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent, marginTop: 4 },
});
