import { useCallback, useState } from 'react';
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
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { fetchListItems, setItemInCart, assignListItem, clearListItems, deleteListItems, mergeCartItems, type ListItemRow, type MergedCartItem } from '../api/lists';
import { fetchGroupMembers } from '../api/groups';
import { recordPurchase } from '../api/purchases';
import type { GroupMember } from '../types';
import ProgressBar from '../components/ProgressBar';
import ProductDetailModal from '../components/ProductDetailModal';
import UserAvatar from '../components/UserAvatar';

import { STORE_META, groupByStore } from '../constants/stores';

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// LayoutAnimation necesita habilitarse explícitamente en Android.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ListScreen() {
  const styles = useThemedStyles(themedStyles);
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
  const [finishing, setFinishing] = useState(false);

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
      toast.show('No se pudo asignar el artículo.', 'error');
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
        mercadonaProductId: it.mercadonaProductId,
        unitPrice: it.unitPrice,
        imageUrl: it.imageUrl,
      }));
      await recordPurchase(activeCart.groupId, totalCost, snapshot, userId);
      await clearListItems(activeCart.listId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show('¡Compra finalizada! 🎉');
      setItems([]);
    } catch {
      toast.show('No se pudo finalizar la compra.', 'error');
    } finally {
      setFinishing(false);
    }
  };

  const confirmRemove = (item: MergedCartItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Eliminar artículo',
      `¿Quitar ${item.productName} de la lista?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Eliminar', style: 'destructive', onPress: () => doRemove(item) },
      ],
    );
  };

  const doRemove = async (item: MergedCartItem) => {
    const ids = new Set(item.ids);
    const prev = items;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setItems((list) => list.filter((it) => !ids.has(it.id)));
    try {
      await deleteListItems(item.ids);
    } catch {
      setItems(prev);
      toast.show('No se pudo eliminar el artículo.', 'error');
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
      toast.show('No se pudo actualizar el artículo.', 'error');
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

  // Agrupado por supermercado; dentro de cada tienda, lo pendiente primero.
  const sections = groupByStore(merged).map((g) => ({
    key: g.store,
    store: g.store,
    data: [...g.data].sort((a, b) => Number(a.inCart) - Number(b.inCart)),
  }));

  const renderItem = ({ item }: { item: MergedCartItem }) => (
    <TouchableOpacity
      style={[styles.itemRow, item.inCart && styles.itemRowDone]}
      onPress={() => toggle(item)}
      onLongPress={() => confirmRemove(item)}
      activeOpacity={0.75}
    >
      <View style={[styles.checkbox, item.inCart && styles.checkboxChecked]}>
        {item.inCart && <Ionicons name="checkmark" size={13} color={colors.white} />}
      </View>
      {(item.imageUrl || item.categoryEmoji) ? (
        <TouchableOpacity
          activeOpacity={0.7}
          disabled={!item.mercadonaProductId}
          onPress={() => item.mercadonaProductId && setDetailProductId(item.mercadonaProductId)}
        >
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.itemThumb} resizeMode="contain" />
          ) : (
            <View style={styles.itemThumbPlaceholder}>
              <Text style={styles.itemEmoji}>{item.categoryEmoji}</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : null}
      <View style={styles.itemContent}>
        <Text style={[styles.itemName, item.inCart && styles.itemNameDone]}>
          {item.productName}
        </Text>
        <Text style={styles.itemUnit}>{item.quantity} {item.unit}</Text>
      </View>

      {/* Assignee */}
      {(() => {
        const assignee = item.assignedTo ? members.find((m) => m.id === item.assignedTo) : null;
        return (
          <TouchableOpacity
            style={styles.assignBtn}
            activeOpacity={0.7}
            hitSlop={6}
            onPress={() => setAssignItem(item)}
          >
            {assignee ? (
              <UserAvatar avatarUrl={assignee.avatarUrl} initials={assignee.initials} color={assignee.color} size={28} />
            ) : (
              <View style={styles.assignEmpty}>
                <Ionicons name="person-add-outline" size={15} color={colors.inkFaint} />
              </View>
            )}
          </TouchableOpacity>
        );
      })()}

      {item.inCart ? (
        <View style={styles.inCartBadge}>
          <Text style={styles.inCartBadgeText}>En cesta</Text>
        </View>
      ) : item.unitPrice != null ? (
        <Text style={styles.itemPrice}>{formatEuro(item.unitPrice * item.quantity)}</Text>
      ) : null}
    </TouchableOpacity>
  );

  // ── No active cart ────────────────────────────────────────────
  if (!activeCart) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
        <View style={styles.header}>
          <Text style={styles.title}>Mi Lista</Text>
        </View>
        <View style={styles.centerBox}>
          <Ionicons name="cart-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.centerTitle}>No tienes ningún carrito activo</Text>
          <Text style={styles.centerText}>
            Ve a Grupos y pulsa "Activar carrito" para empezar tu lista de la compra.
          </Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 120 }} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>{activeCart.groupName}</Text>
        </View>
        <View style={styles.centerBox}>
          <Text style={styles.centerText}>No se pudo cargar la lista.</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{activeCart.groupName}</Text>
          <Text style={styles.subtitle}>
            {doneItems} de {merged.length} artículos recogidos
          </Text>
        </View>
      </View>

      {items.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="list-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.centerTitle}>Tu lista está vacía</Text>
          <Text style={styles.centerText}>
            Añade productos desde el catálogo y aparecerán aquí.
          </Text>
        </View>
      ) : (
        <>
          {/* Progress */}
          <View style={styles.progressArea}>
            <ProgressBar progress={progress} height={8} />
            <View style={styles.progressRow}>
              <Text style={styles.progressHint}>Mantén pulsado un artículo para eliminarlo</Text>
              <Text style={styles.progressLabel}>{Math.round(progress * 100)}% completado</Text>
            </View>
          </View>

          {/* List */}
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.ids[0]}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => {
              const meta = STORE_META[section.store];
              const inCart = section.data.filter((it) => it.inCart).length;
              return (
                <View style={[styles.storeHeader, section.store !== sections[0].store && { marginTop: 18 }]}>
                  {meta.icon ? (
                    <Image source={meta.icon} style={styles.storeHeaderIcon} resizeMode="cover" />
                  ) : (
                    <Ionicons name="pricetag-outline" size={14} color={colors.inkSoft} />
                  )}
                  <Text style={styles.storeHeaderText}>{meta.name}</Text>
                  <Text style={styles.storeHeaderCount}>{inCart}/{section.data.length}</Text>
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
              <Text style={styles.totalBarLabel}>Total estimado</Text>
              <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
            </View>
          )}

          {/* Done bar — covers total bar when complete */}
          {doneItems === merged.length && merged.length > 0 && (
            <View style={styles.doneBar}>
              <Text style={styles.doneBarEmoji}>🎉</Text>
              <Text style={styles.doneBarText}>¡Lista completada!</Text>
              <TouchableOpacity
                style={styles.doneBarBtn}
                onPress={handleFinish}
                disabled={finishing}
              >
                {finishing
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={styles.doneBarBtnText}>Finalizar</Text>}
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <ProductDetailModal
        productId={detailProductId}
        onClose={() => setDetailProductId(null)}
      />

      {/* Assign-to-member sheet */}
      <Modal
        visible={!!assignItem}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignItem(null)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setAssignItem(null)} />
          {assignItem && (
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle} numberOfLines={1}>¿Quién trae {assignItem.productName}?</Text>

              <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
                {members.map((m) => {
                  const selected = assignItem.assignedTo === m.id;
                  return (
                    <TouchableOpacity
                      key={m.id}
                      style={styles.sheetRow}
                      activeOpacity={0.7}
                      onPress={() => doAssign(assignItem, m.id)}
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
                onPress={() => doAssign(assignItem, null)}
              >
                <Ionicons name="close-circle-outline" size={18} color={colors.inkSoft} />
                <Text style={styles.sheetClearText}>Sin asignar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

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
  itemContent: { flex: 1 },
  itemName: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  itemNameDone: { color: colors.inkSoft, textDecorationLine: 'line-through' },
  itemUnit: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  itemPrice: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },
  inCartBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  inCartBadgeText: { fontSize: 10, fontFamily: fonts.bold, color: colors.white },

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
    paddingHorizontal: 16, paddingVertical: 13, paddingBottom: 28,
  },
  totalBarLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft },
  totalBarAmount: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink },

  // ── Done bar ──────────────────────────────────────────────────
  doneBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28, gap: 10,
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
