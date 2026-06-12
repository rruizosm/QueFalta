import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import type { DiaProduct } from '../api/catalog';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import QuantityStepper from '../components/QuantityStepper';
import ProductImage from '../components/ProductImage';
import SimilarProductsSection from '../components/SimilarProductsSection';

interface Props {
  /** Producto a mostrar (ya cargado de dia_products). null = oculto. */
  product: DiaProduct | null;
  onClose: () => void;
}

/** Detalle de un producto de Dia. Pinta los datos ya cargados (no hay fetch:
 *  el catálogo de Dia va por el espejo en Supabase). El formato del envase va
 *  dentro del display_name ("... 600 g"); la marca sí viene separada. */
export default function DiaProductModal({ product, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { activeCart, addToActiveCart } = useCart();
  const toast = useToast();
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setQty(1); }, [product?.id]);

  if (!product) return null;
  const price = product.priceFormat
    ?? (product.unitPrice != null ? `${product.unitPrice.toFixed(2).replace('.', ',')} €` : null);

  const handleAdd = async () => {
    if (!activeCart) {
      Alert.alert('Sin carrito activo', 'Activa el carrito de un grupo en la pestaña Grupos antes de añadir productos.');
      return;
    }
    setAdding(true);
    try {
      await addToActiveCart([{
        productName: product.displayName,
        quantity: qty,
        unit: 'ud',
        categoryName: product.categoryName,
        unitPrice: product.unitPrice,
        imageUrl: product.thumbnail,
        mercadonaProductId: null,
      }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`${qty} ${qty === 1 ? 'artículo añadido' : 'artículos añadidos'} a ${activeCart.groupName}`);
      onClose();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show('No se pudo añadir el producto.', 'error');
    } finally {
      setAdding(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      <View style={styles.header}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Producto</Text>
        <View style={styles.closeBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {product.thumbnail ? (
          <ProductImage uri={product.thumbnail} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoPlaceholder]}>
            <Ionicons name="image-outline" size={48} color={colors.inkFaint} />
          </View>
        )}

        <Text style={styles.name}>{product.displayName}</Text>
        {product.brand ? <Text style={styles.brand}>{product.brand}</Text> : null}

        <View style={styles.priceRow}>
          {price ? <Text style={styles.price}>{price}</Text> : null}
        </View>
        {product.pricePerUnit ? <Text style={styles.refPrice}>{product.pricePerUnit}</Text> : null}

        {/* Comparativa: más barato en otros súper */}
        <SimilarProductsSection productName={product.displayName} excludeStore="dia" />

        {product.categoryName ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Categoría</Text>
            <Text style={styles.sectionText}>{product.categoryName}</Text>
          </View>
        ) : null}

        <Text style={styles.note}>Producto de Dia</Text>
      </ScrollView>

      {/* Pie: cantidad + añadir a la cesta */}
      <View style={styles.footer}>
        <QuantityStepper
          value={qty}
          min={1}
          onIncrement={() => setQty((q) => q + 1)}
          onDecrement={() => setQty((q) => Math.max(1, q - 1))}
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd} disabled={adding} activeOpacity={0.85}>
          {adding ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="cart-outline" size={16} color={colors.white} />
              <Text style={styles.addBtnText}>Añadir a la cesta</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.paper, zIndex: 100,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10,
  },
  closeBtn: {
    width: 38, height: 38, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },

  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  photo: {
    width: '100%', height: 260, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  name: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  brand: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 },
  price: { fontSize: 28, fontFamily: fonts.bold, color: colors.accent },
  refPrice: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  section: { marginTop: 18 },
  sectionTitle: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 5,
  },
  sectionText: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.ink, lineHeight: 20 },
  note: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkFaint, marginTop: 24 },

  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.paper,
  },
  addBtn: {
    flex: 1, backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14,
  },
  addBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
});
