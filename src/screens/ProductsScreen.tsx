import React, { useEffect, useState } from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import {
  fetchCategoryDetail,
  flattenProducts,
  formatPrice,
  formatSize,
  type MercadonaProduct,
} from '../api/mercadona';
import { CatalogStackParamList } from '../types';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import QuantityStepper from '../components/QuantityStepper';
import ProductDetailModal from '../components/ProductDetailModal';

type ProductsRouteProp = RouteProp<CatalogStackParamList, 'Products'>;

export default function ProductsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<ProductsRouteProp>();
  const {
    subcategoryId,
    subcategoryName,
    categoryName,
    emoji = '🛒',
    color = colors.accent,
  } = route.params;

  const { activeCart, addToActiveCart } = useCart();
  const toast = useToast();

  const [products, setProducts] = useState<MercadonaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);

  useEffect(() => {
    fetchCategoryDetail(subcategoryId)
      .then((detail) => setProducts(flattenProducts(detail)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [subcategoryId]);

  const increment = (id: string) =>
    setQuantities((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  const decrement = (id: string) =>
    setQuantities((prev) => ({ ...prev, [id]: Math.max(0, (prev[id] ?? 0) - 1) }));

  const cartCount = Object.values(quantities).reduce((a, b) => a + b, 0);

  const handleAddToCart = async () => {
    if (!activeCart) {
      Alert.alert(
        'Sin carrito activo',
        'Activa el carrito de un grupo en la pestaña Grupos antes de añadir productos.',
      );
      return;
    }
    const items = products
      .filter((p) => (quantities[p.id] ?? 0) > 0)
      .map((p) => ({
        productName: p.display_name,
        quantity: quantities[p.id],
        unit: 'ud',
        categoryEmoji: emoji,
        mercadonaProductId: p.id,
        unitPrice: parseFloat(p.price_instructions.unit_price),
        imageUrl: p.thumbnail ?? null,
      }));
    if (items.length === 0) return;
    setAdding(true);
    try {
      const count = items.reduce((a, b) => a + b.quantity, 0);
      await addToActiveCart(items);
      setQuantities({});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`${count} ${count === 1 ? 'artículo añadido' : 'artículos añadidos'} a ${activeCart.groupName}`);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('No se pudieron añadir los productos.', 'error');
    } finally {
      setAdding(false);
    }
  };

  const renderItem = ({ item }: { item: MercadonaProduct }) => {
    const qty = quantities[item.id] ?? 0;
    const active = qty > 0;
    return (
      <View style={[styles.row, active && styles.rowActive]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => setDetailProductId(item.id)}>
          {item.thumbnail ? (
            <Image source={{ uri: item.thumbnail }} style={styles.thumb} resizeMode="contain" />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Text style={{ fontSize: 22 }}>{emoji}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{item.display_name}</Text>
          <View style={styles.meta}>
            <Text style={styles.size}>{formatSize(item)}</Text>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.price}>{formatPrice(item)}</Text>
          </View>
        </View>
        <QuantityStepper
          value={qty}
          onIncrement={() => increment(item.id)}
          onDecrement={() => decrement(item.id)}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{subcategoryName}</Text>
          <Text style={styles.breadcrumb}>
            {categoryName} <Text style={{ color: colors.inkFaint }}>›</Text> {subcategoryName}
          </Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No hay productos disponibles</Text>
            </View>
          }
        />
      )}

      {/* Cart bar */}
      {cartCount > 0 && (
        <View style={styles.cartBar}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cartLabel}>
              {cartCount} artículo{cartCount !== 1 ? 's' : ''} seleccionado{cartCount !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.cartTarget} numberOfLines={1}>
              {activeCart ? `→ ${activeCart.groupName}` : 'Sin carrito activo'}
            </Text>
          </View>
          <TouchableOpacity style={styles.cartBtn} onPress={handleAddToCart} disabled={adding}>
            {adding ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.cartBtnText}>Añadir</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.white} />
              </View>
            )}
          </TouchableOpacity>
        </View>
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

  headerArea: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16,
    paddingTop: 52, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  breadcrumb: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 4 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    padding: 11, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
    gap: 12,
  },
  rowActive: {
    backgroundColor: colors.accentLight,
    borderColor: colors.accentMid,
  },
  thumb: { width: 50, height: 50, flex: 0 },
  thumbPlaceholder: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 18 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  size: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft },
  dot: { fontSize: 11, color: colors.inkFaint },
  price: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },

  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },

  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.ink,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28,
  },
  cartLabel: { fontFamily: fonts.semibold, color: colors.white, fontSize: 13 },
  cartTarget: { fontFamily: fonts.medium, color: colors.accent, fontSize: 11.5, marginTop: 2 },
  cartBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  cartBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },
});
