import { useCallback, useState } from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useCart } from '../context/CartContext';
import { fetchListItems, setItemInCart, type ListItemRow } from '../api/lists';
import ProgressBar from '../components/ProgressBar';
import ProductDetailModal from '../components/ProductDetailModal';

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

export default function ListScreen() {
  const { activeCart } = useCart();
  const listId = activeCart?.listId;

  const [items, setItems] = useState<ListItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!listId) { setItems([]); setLoading(false); return; }
    setError(false);
    fetchListItems(listId)
      .then(setItems)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [listId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggle = async (id: string) => {
    const target = items.find((i) => i.id === id);
    if (!target) return;
    const next = !target.inCart;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, inCart: next } : it)));
    try {
      await setItemInCart(id, next);
    } catch {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, inCart: !next } : it)));
      Alert.alert('Error', 'No se pudo actualizar el artículo.');
    }
  };

  const doneItems = items.filter((i) => i.inCart).length;
  const progress = items.length > 0 ? doneItems / items.length : 0;
  const totalCost = items
    .filter((i) => i.unitPrice != null)
    .reduce((sum, i) => sum + i.unitPrice! * i.quantity, 0);
  const hasPrices = items.some((i) => i.unitPrice != null);

  const pending = items.filter((i) => !i.inCart);
  const done = items.filter((i) => i.inCart);
  const sections = [
    { key: 'pending', title: `Por recoger (${pending.length})`, data: pending },
    { key: 'done',    title: `En la cesta (${done.length})`,    data: done },
  ].filter((s) => s.data.length > 0);

  const renderItem = ({ item }: { item: ListItemRow }) => (
    <TouchableOpacity
      style={[styles.itemRow, item.inCart && styles.itemRowDone]}
      onPress={() => toggle(item.id)}
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
            {doneItems} de {items.length} artículos recogidos
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
            <Text style={styles.progressLabel}>{Math.round(progress * 100)}% completado</Text>
          </View>

          {/* List */}
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <Text style={[
                styles.sectionHeader,
                section.key === 'done' && pending.length > 0 ? { marginTop: 14 } : null,
              ]}>
                {section.title}
              </Text>
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={false}
          />

          {/* Total bar */}
          {hasPrices && (
            <View style={styles.totalBar}>
              <Text style={styles.totalBarLabel}>Total estimado</Text>
              <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
            </View>
          )}

          {/* Done bar — covers total bar when complete */}
          {doneItems === items.length && items.length > 0 && (
            <View style={styles.doneBar}>
              <Text style={styles.doneBarEmoji}>🎉</Text>
              <Text style={styles.doneBarText}>¡Lista completada!</Text>
              <TouchableOpacity
                style={styles.doneBarBtn}
                onPress={() => Alert.alert('Lista', '¡Compra finalizada!')}
              >
                <Text style={styles.doneBarBtnText}>Finalizar</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      <ProductDetailModal
        productId={detailProductId}
        onClose={() => setDetailProductId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12,
  },
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  progressArea: { paddingHorizontal: 16, marginBottom: 4, gap: 6 },
  progressLabel: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'right' },

  list: { paddingHorizontal: 16, paddingBottom: 140, paddingTop: 8 },

  sectionHeader: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 8,
  },

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
