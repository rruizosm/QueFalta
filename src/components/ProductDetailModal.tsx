import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { fetchProduct } from '../api/mercadona';
import { fetchProductMirror } from '../api/catalog';
import type { MercadonaProductDetail } from '../types';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../context/CartContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useProductDetailFooterPadding } from '../hooks/useProductDetailFooterPadding';
import { useTranslation } from '../context/LanguageContext';
import QuantityStepper from './QuantityStepper';
import ProductDetailImage from './ProductDetailImage';
import ProductInfoSections from './ProductInfoSections';
import { useNutritionInfoDisclosure } from './NutritionInfoButton';
import ProductDetailDiscoverySection from './ProductDetailDiscoverySection';
import ProductPriceLine from './ProductPriceLine';
import ActiveCartIcon from './ActiveCartIcon';

interface Props {
  /** Mercadona product id to show. When null, the modal is hidden. */
  productId: string | null;
  onClose: () => void;
  /** Padding superior de la cabecera. Lo fija StoreProductModal según el contexto:
   *  56 a pantalla completa (cesta, despeja el notch); 16 en la hoja (catálogo). */
  topInset?: number;
  badgeLabel?: string;
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

export default function ProductDetailModal({ productId, onClose, topInset = 16, badgeLabel }: Props) {
  const styles = useThemedStyles(themedStyles);
  const footerPaddingBottom = useProductDetailFooterPadding();
  const { t } = useTranslation();
  const { isProductFavorite, toggleProductFavorite } = useFavorites();
  const { activeCart, addToActiveCart } = useCart();
  const toast = useToast();
  const [product, setProduct] = useState<MercadonaProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [mirrorEan, setMirrorEan] = useState<string | null>(null);
  const [mirrorNutrition, setMirrorNutrition] = useState<unknown | null>(null);
  const [mirrorCategoryName, setMirrorCategoryName] = useState<string | null>(null);

  useEffect(() => {
    if (!productId) { setProduct(null); return; }
    setLoading(true);
    setError(false);
    setProduct(null);
    setMirrorEan(null);
    setMirrorNutrition(null);
    setMirrorCategoryName(null);
    setQty(1);
    let cancelled = false;
    (async () => {
      try {
        let p: MercadonaProductDetail;
        const mirror = await fetchProductMirror(productId);
        try {
          p = await fetchProduct(productId);
        } catch {
          // Producto regional: el almacén por defecto (mad1) no lo tiene → 404.
          // El espejo da un almacén que sí lo tiene para reintentar.
          if (!mirror.wh) throw new Error('sin almacén');
          p = await fetchProduct(productId, mirror.wh);
        }
        if (!cancelled) {
          setProduct(p);
          setMirrorEan(mirror.ean);
          setMirrorNutrition(mirror.nutrition);
          setMirrorCategoryName(mirror.categoryName);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
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
  const ingredients =
    product?.nutrition_information?.ingredients
    ?? product?.product_information?.ingredients?.accessible_text
    ?? product?.product_information?.ingredients?.detail
    ?? null;

  const fav = product ? isProductFavorite('mercadona', product.id) : false;
  const nutritionEan = mirrorEan ?? product?.ean ?? null;
  const nutrition = useNutritionInfoDisclosure({
    store: 'mercadona',
    ean: nutritionEan,
    inline: true,
    fallbackNutrition: mirrorNutrition,
    fallbackProductName: product?.display_name,
    fallbackCategoryName: mirrorCategoryName,
    fallbackIngredients: ingredients,
  });

  const handleToggleFav = async () => {
    if (!product) return;
    try {
      const added = await toggleProductFavorite({
        store: 'mercadona',
        refId: product.id,
        name: product.display_name,
        imageUrl: photo ?? product.thumbnail ?? null,
        price: product.price_instructions?.unit_price ?? null,
      });
      toast.show(
        t(added ? 'product.favAddedNamed' : 'product.favRemovedNamed', { name: product.display_name }),
      );
    } catch {
      toast.show(t('product.favError'), 'error');
    }
  };

  const handleAdd = async () => {
    if (!product) return;
    if (!activeCart) {
      Alert.alert(t('product.noCartTitle'), t('product.noCartMsg'));
      return;
    }
    setAdding(true);
    try {
      await addToActiveCart([{
        storeKey: 'mercadona',
        productName: product.display_name,
        quantity: qty,
        unit: 'ud',
        // La 1ª categoría del detalle es la N1 de Mercadona → zona de la lista.
        categoryName: product.categories?.[0]?.name ?? null,
        unitPrice: pi?.unit_price != null ? parseFloat(pi.unit_price) : null,
        imageUrl: photo ?? product.thumbnail ?? null,
        mercadonaProductId: product.id,
        storeProductId: product.id,
      }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t(qty === 1 ? 'product.addedOne' : 'product.addedMany', { n: qty, group: activeCart.groupName }));
      onClose();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(t('product.addErrorSingle'), 'error');
    } finally {
      setAdding(false);
    }
  };

  if (productId == null) return null;

  return (
    <View style={styles.overlay}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

        {/* Header */}
        <View style={[styles.header, { paddingTop: topInset }]}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('product.detailTitle')}</Text>
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
            <Text style={styles.errorText}>{t('product.detailLoadError')}</Text>
          </View>
        ) : (
          <>
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <ProductDetailImage uri={photo} style={styles.photo} badgeLabel={badgeLabel} alertTarget={{ store: 'mercadona', productId: product.id }} />

            <Text style={styles.name}>{product.display_name}</Text>
            {brand ? <Text style={styles.brand}>{brand}</Text> : null}

            <ProductPriceLine store="mercadona" productId={product.id} price={price} size={size} />
            {refPrice ? <Text style={styles.refPrice}>{refPrice}</Text> : null}

            <ProductDetailDiscoverySection
              nutrition={nutrition}
              productId={String(product.id)}
              excludeStore="mercadona"
            />

            {/* Características del producto */}
            <ProductInfoSections
              items={[
                { key: 'description', icon: 'reader-outline', title: t('product.sections.description'), text: clean(d?.description) },
                { key: 'info', icon: 'information-circle-outline', title: t('product.sections.info'), text: clean(d?.counter_info) },
                { key: 'ingredients', icon: 'leaf-outline', title: t('product.sections.ingredients'), text: clean(ingredients) },
                { key: 'storage', icon: 'time-outline', title: t('product.sections.storage'), text: clean(d?.storage_instructions) },
                { key: 'origin', icon: 'location-outline', title: t('product.sections.origin'), text: clean(origin) },
                { key: 'supplier', icon: 'pricetag-outline', title: t('product.sections.supplier'), text: clean(suppliers) },
                { key: 'legalName', icon: 'document-text-outline', title: t('product.sections.legalName'), text: clean(d?.legal_name) },
                { key: 'warnings', icon: 'warning-outline', title: t('product.sections.warnings'), text: clean(d?.mandatory_mentions ?? d?.danger_mentions) },
              ]}
            />

            {product.ean ? (
              <Text style={styles.ean}>EAN: {product.ean}</Text>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: footerPaddingBottom }]}>
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
                  <ActiveCartIcon size={16} color={colors.white} />
                  <Text style={styles.addBtnText}>{t('product.addToCart')}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          </>
        )}
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
    // paddingTop lo fija el prop `topInset` (StoreProductModal): 56 a pantalla
    // completa (cesta) para despejar el notch, 16 dentro de la hoja (catálogo).
    paddingHorizontal: 16, paddingBottom: 10,
  },
  closeBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 19,
  },
  favBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent,
    borderRadius: 19,
  },
  headerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },

  scroll: { paddingHorizontal: 16, paddingBottom: 48 },

  photo: {
    width: '100%', height: 260,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    marginBottom: 16,
    borderRadius: 20,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  name: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  brand: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 },
  price: { fontSize: 28, fontFamily: fonts.bold, color: colors.accent },
  size: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft },
  refPrice: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

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
    paddingVertical: 14, borderRadius: 23,
  },
  addBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
});
