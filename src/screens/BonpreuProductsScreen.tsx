import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Image, Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { CatalogStackParamList } from '../types';
import { fetchBonpreuProductsByCategory, type BonpreuProduct } from '../api/catalog';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../context/FavoritesContext';
import QuantityStepper from '../components/QuantityStepper';
import BonpreuProductModal from '../components/BonpreuProductModal';

type BonpreuProductsRouteProp = RouteProp<CatalogStackParamList, 'BonpreuProducts'>;

export default function BonpreuProductsScreen() {
  const navigation = useNavigation<any>();
  const { categoryId, categoryName, parentName } = useRoute<BonpreuProductsRouteProp>().params;

  const { activeCart, addToActiveCart } = useCart();
  const toast = useToast();
  const { products: favProductsList, isProductFavorite, toggleProductFavorite } = useFavorites();

  const [products, setProducts] = useState<BonpreuProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState<BonpreuProduct | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchBonpreuProductsByCategory(categoryId)
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

  const handleSwipeFav = async (p: BonpreuProduct) => {
    try {
      const added = await toggleProductFavorite({
        refId: p.id,
        name: p.displayName,
        imageUrl: p.thumbnail,
        price: p.unitPrice != null ? String(p.unitPrice) : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(added ? 'Producto añadido a favoritos' : 'Producto eliminado de favoritos');
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('No se pudo actualizar el favorito.', 'error');
    }
  };

  const renderFavAction = () => (
    <View style={styles.swipeAction}>
      <Ionicons name="star" size={22} color={colors.white} />
    </View>
  );

  const renderItem = ({ item }: { item: BonpreuProduct }) => {
    const qty = quantities[item.id] ?? 0;
    const active = qty > 0;
    const fav = isProductFavorite(item.id);
    return (
      <Swipeable
        friction={1}
        leftThreshold={48}
        overshootFriction={8}
        renderLeftActions={renderFavAction}
        onSwipeableOpen={(direction, swipeable) => {
          if (direction === 'left') {
            handleSwipeFav(item);
            swipeable.close();
          }
        }}
      >
        <View style={[styles.row, active && styles.rowActive]}>
          {fav && <View style={styles.favBar} />}
          <TouchableOpacity activeOpacity={0.7} onPress={() => setDetail(item)}>
            {item.thumbnail ? (
              <Image source={{ uri: item.thumbnail }} style={styles.thumb} resizeMode="contain" />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <Ionicons name="image-outline" size={22} color={colors.inkFaint} />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.info}>
            <Text style={styles.name} numberOfLines={2}>{item.displayName}</Text>
            <View style={styles.meta}>
              <Text style={styles.size}>{item.priceFormat ?? item.packaging ?? ''}</Text>
              {item.unitPrice != null ? (
                <>
                  <Text style={styles.dot}>·</Text>
                  <Text style={styles.price}>{item.unitPrice.toFixed(2).replace('.', ',')} €</Text>
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
      </Swipeable>
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
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>No se pudieron cargar los productos.</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          extraData={favProductsList}
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

      <BonpreuProductModal product={detail} onClose={() => setDetail(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
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

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white, padding: 11,
    borderWidth: 1, borderColor: colors.border, gap: 12,
  },
  rowActive: { backgroundColor: colors.accentLight, borderColor: colors.accentMid },
  favBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, backgroundColor: colors.accent },
  swipeAction: {
    flex: 1, backgroundColor: colors.accent,
    alignItems: 'flex-start', justifyContent: 'center', paddingLeft: 26,
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
