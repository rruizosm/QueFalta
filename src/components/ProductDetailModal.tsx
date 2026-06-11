import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { fetchProduct } from '../api/mercadona';
import type { MercadonaProductDetail } from '../types';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import { useThemedStyles } from '../context/ThemeContext';
import QuantityStepper from './QuantityStepper';
import ProductImage from './ProductImage';
import SimilarProductsSection from './SimilarProductsSection';

interface Props {
  /** Mercadona product id to show. When null, the modal is hidden. */
  productId: string | null;
  onClose: () => void;
}

const formatEuro = (s?: string | null): string | null => {
  if (s == null) return null;
  const n = parseFloat(s);
  return Number.isNaN(n) ? null : `${n.toFixed(2).replace('.', ',')} €`;
};

/** The Mercadona API returns some fields as HTML; strip tags + decode basic entities. */
const clean = (text?: string | null): string | null => {
  if (!text) return null;
  const out = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&deg;/g, '°')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
  return out || null;
};

export default function ProductDetailModal({ productId, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { isProductFavorite, toggleProductFavorite } = useFavorites();
  const { activeCart, addToActiveCart } = useCart();
  const toast = useToast();
  const [product, setProduct] = useState<MercadonaProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!productId) { setProduct(null); return; }
    setLoading(true);
    setError(false);
    setProduct(null);
    setQty(1);
    let cancelled = false;
    fetchProduct(productId)
      .then((p) => { if (!cancelled) setProduct(p); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productId]);

  const photo =
    product?.photos?.[0]?.regular ??
    product?.photos?.[0]?.zoom ??
    product?.thumbnail ??
    null;

  const pi = product?.price_instructions;
  const price = formatEuro(pi?.unit_price);
  const refPrice =
    pi?.reference_price && pi?.reference_format
      ? `${formatEuro(pi.reference_price)} / ${pi.reference_format}`
      : null;
  const size =
    pi?.unit_size && pi?.size_format
      ? `${pi.unit_size} ${pi.size_format}`
      : product?.packaging ?? null;

  const d = product?.details;
  const brand = product?.brand ?? d?.brand ?? null;
  const origin = product?.origin ?? d?.origin ?? null;
  const suppliers = d?.suppliers?.map((s) => s.name).filter(Boolean).join(', ') || null;

  const fav = product ? isProductFavorite(product.id) : false;

  const handleToggleFav = async () => {
    if (!product) return;
    try {
      const added = await toggleProductFavorite({
        refId: product.id,
        name: product.display_name,
        imageUrl: photo ?? product.thumbnail ?? null,
        price: product.price_instructions?.unit_price ?? null,
      });
      toast.show(
        added ? `${product.display_name} en favoritos` : `${product.display_name} quitado de favoritos`,
      );
    } catch {
      toast.show('No se pudo actualizar el favorito.', 'error');
    }
  };

  const handleAdd = async () => {
    if (!product) return;
    if (!activeCart) {
      Alert.alert('Sin carrito activo', 'Activa el carrito de un grupo en la pestaña Grupos antes de añadir productos.');
      return;
    }
    setAdding(true);
    try {
      await addToActiveCart([{
        productName: product.display_name,
        quantity: qty,
        unit: 'ud',
        unitPrice: pi?.unit_price != null ? parseFloat(pi.unit_price) : null,
        imageUrl: photo ?? product.thumbnail ?? null,
        mercadonaProductId: product.id,
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

  if (productId == null) return null;

  return (
    <View style={styles.overlay}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Producto</Text>
          {product ? (
            <TouchableOpacity onPress={handleToggleFav} style={styles.favBtn} activeOpacity={0.7}>
              <Ionicons name={fav ? 'star' : 'star-outline'} size={22} color={colors.accent} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 38 }} />
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 80 }} />
        ) : error || !product ? (
          <View style={styles.centerBox}>
            <Ionicons name="alert-circle-outline" size={44} color={colors.inkFaint} />
            <Text style={styles.errorText}>No se pudo cargar la información del producto.</Text>
          </View>
        ) : (
          <>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* Photo */}
            {photo ? (
              <ProductImage uri={photo} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]}>
                <Ionicons name="image-outline" size={48} color={colors.inkFaint} />
              </View>
            )}

            {/* Name + brand */}
            <Text style={styles.name}>{product.display_name}</Text>
            {brand ? <Text style={styles.brand}>{brand}</Text> : null}

            {/* Price */}
            <View style={styles.priceRow}>
              {price ? <Text style={styles.price}>{price}</Text> : null}
              {size ? <Text style={styles.size}>{size}</Text> : null}
            </View>
            {refPrice ? <Text style={styles.refPrice}>{refPrice}</Text> : null}

            {/* Comparativa: más barato en otros súper */}
            <SimilarProductsSection productName={product.display_name} excludeStore="mercadona" />

            {/* Details */}
            <Section title="Descripción" text={d?.description} />
            <Section title="Información" text={d?.counter_info} />
            <Section title="Ingredientes" text={product.nutrition_information?.ingredients} />
            <Section title="Conservación" text={d?.storage_instructions} />
            <Section title="Origen" text={origin} />
            <Section title="Proveedor" text={suppliers} />
            <Section title="Nombre legal" text={d?.legal_name} />
            <Section title="Advertencias" text={d?.mandatory_mentions ?? d?.danger_mentions} />

            {product.ean ? (
              <Text style={styles.ean}>EAN: {product.ean}</Text>
            ) : null}
          </ScrollView>

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
          </>
        )}
    </View>
  );
}

function Section({ title, text }: { title: string; text?: string | null }) {
  const styles = useThemedStyles(themedStyles);
  const value = clean(text);
  if (!value) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionText}>{value}</Text>
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
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  favBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent,
  },
  headerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },

  scroll: { paddingHorizontal: 16, paddingBottom: 48 },

  photo: {
    width: '100%', height: 260,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 16,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  name: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  brand: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 },
  price: { fontSize: 28, fontFamily: fonts.bold, color: colors.accent },
  size: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft },
  refPrice: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  section: { marginTop: 18 },
  sectionTitle: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 5,
  },
  sectionText: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.ink, lineHeight: 20 },

  ean: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkFaint, marginTop: 22 },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  errorText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },

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
