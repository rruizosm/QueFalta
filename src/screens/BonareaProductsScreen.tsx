import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { CatalogStackParamList } from '../types';
import { fetchBonareaProductsByCategory, type BonareaProduct } from '../api/catalog';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import QuantityStepper from '../components/QuantityStepper';
import ProductImage from '../components/ProductImage';
import ViewModeToggle, { type ViewMode } from '../components/ViewModeToggle';
import ProductGridCard from '../components/ProductGridCard';
import BonareaProductModal from '../components/BonareaProductModal';

type BonareaProductsRouteProp = RouteProp<CatalogStackParamList, 'BonareaProducts'>;

// Cuadrícula: 3 por fila (idéntica a Mercadona). El ancho de tarjeta se fija aquí
// para que la última fila no se estire al tener menos de 3 productos.
const GRID_COLS = 3;
const GRID_GAP = 8;
const CARD_W = (Dimensions.get('window').width - 32 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

export default function BonareaProductsScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { categoryId, categoryName, parentName } = useRoute<BonareaProductsRouteProp>().params;

  const { activeCart, addToActiveCart } = useCart();
  const toast = useToast();

  const [products, setProducts] = useState<BonareaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<BonareaProduct | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchBonareaProductsByCategory(categoryId)
      .then(setProducts)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [categoryId]);

  const increment = (id: string) => setQuantities((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
  const decrement = (id: string) => setQuantities((p) => ({ ...p, [id]: Math.max(0, (p[id] ?? 0) - 1) }));
  const cartCount = Object.values(quantities).reduce((a, b) => a + b, 0);

  const handleAddToCart = async () => {
    if (!activeCart) {
      Alert.alert('Sin carrito activo', 'Activa el carrito de un grupo en la pestaña Grupos antes de añadir productos.');
      return;
    }
    const items = products
      .filter((p) => (quantities[p.id] ?? 0) > 0)
      .map((p) => ({
        productName: p.displayName,
        quantity: quantities[p.id],
        unit: 'ud',
        mercadonaProductId: null,
        unitPrice: p.unitPrice,
        imageUrl: p.thumbnail,
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

  const renderGridItem = ({ item }: { item: BonareaProduct }) => (
    <ProductGridCard
      width={CARD_W}
      uri={item.thumbnail}
      name={item.displayName}
      price={item.priceFormat ?? (item.unitPrice != null ? `${item.unitPrice.toFixed(2).replace('.', ',')} €` : '')}
      onPress={() => setDetail(item)}
    />
  );

  const renderItem = ({ item }: { item: BonareaProduct }) => {
    const qty = quantities[item.id] ?? 0;
    const active = qty > 0;
    const price = item.priceFormat
      ?? (item.unitPrice != null ? `${item.unitPrice.toFixed(2).replace('.', ',')} €` : null);
    return (
      <View style={[styles.row, active && styles.rowActive]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => setDetail(item)}>
          {item.thumbnail ? (
            <ProductImage uri={item.thumbnail} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbPlaceholder]}>
              <Ionicons name="image-outline" size={22} color={colors.inkFaint} />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{item.displayName}</Text>
          <View style={styles.meta}>
            {price ? <Text style={styles.price}>{price}</Text> : null}
            {item.pricePerUnit ? (
              <>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.size}>{item.pricePerUnit}</Text>
              </>
            ) : null}
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

      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{categoryName}</Text>
          <Text style={styles.breadcrumb} numberOfLines={1}>
            {parentName ? <>{parentName} <Text style={{ color: colors.inkFaint }}>›</Text> </> : null}
            {categoryName}
          </Text>
        </View>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No se pudieron cargar los productos.</Text>
        </View>
      ) : viewMode === 'grid' ? (
        <FlatList
          key="grid"
          data={products}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLS}
          renderItem={renderGridItem}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No hay productos en esta categoría.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          key="list"
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No hay productos en esta categoría.</Text>
            </View>
          }
        />
      )}

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

      <BonareaProductModal product={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  headerArea: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  breadcrumb: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 4 },

  gridRow: { gap: GRID_GAP },
  gridContent: { paddingHorizontal: 16, paddingBottom: 110, paddingTop: 4, gap: GRID_GAP },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, padding: 11,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  rowActive: { backgroundColor: colors.accentLight, borderColor: colors.accentMid },
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

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },

  cartBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.ink,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, paddingBottom: 28,
  },
  cartLabel: { fontFamily: fonts.semibold, color: colors.white, fontSize: 13 },
  cartTarget: { fontFamily: fonts.medium, color: colors.accent, fontSize: 11.5, marginTop: 2 },
  cartBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 10 },
  cartBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },
});
