import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import type { CarrefourProduct } from '../api/catalog';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../context/FavoritesContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import QuantityStepper from '../components/QuantityStepper';
import ProductDetailImage from '../components/ProductDetailImage';
import FoodIndexSummary from '../components/FoodIndexSummary';
import ProductInfoSections from '../components/ProductInfoSections';
import { useNutritionInfoDisclosure } from '../components/NutritionInfoButton';
import SimilarProductsSection from '../components/SimilarProductsSection';
import ProductPriceLine from '../components/ProductPriceLine';

interface Props {
  /** Producto a mostrar (ya cargado de carrefour_products). null = oculto. */
  product: CarrefourProduct | null;
  onClose: () => void;
  /** Padding superior de la cabecera (lo fija StoreProductModal): 56 a pantalla
   *  completa (cesta), 16 dentro de la hoja (catálogo). */
  topInset?: number;
  badgeLabel?: string;
}

/** Detalle de un producto de Carrefour. Pinta los datos ya cargados (no hay fetch:
 *  la API de Carrefour va por el espejo en Supabase). */
export default function CarrefourProductModal({ product, onClose, topInset = 16, badgeLabel }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { activeCart, addToActiveCart } = useCart();
  const { isProductFavorite, toggleProductFavorite } = useFavorites();
  const toast = useToast();
  const { t } = useTranslation();
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  const nutrition = useNutritionInfoDisclosure({
    store: 'carrefour',
    ean: product?.ean,
    inline: true,
    fallbackNutrition: product?.nutrition,
    fallbackProductName: product?.displayName,
    fallbackCategoryName: product?.categoryName,
    fallbackIngredients: product?.ingredients,
  });

  useEffect(() => { setQty(1); }, [product?.id]);

  if (!product) return null;
  const price = product.priceFormat
    ?? (product.unitPrice != null ? `${product.unitPrice.toFixed(2).replace('.', ',')} €` : null);
  const fav = isProductFavorite('carrefour', product.id);
  // Oferta (ver carrefour_offers.sql). Los datos son del sync semanal, así que
  // una promo puede caducar a mitad de semana: promo_end la oculta al vencer
  // (comparación de fechas ISO en LOCAL; null = el badge no traía fecha).
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const promoActive = product.promoName != null && (product.promoEnd == null || product.promoEnd >= today);
  const prevPrice = product.strikethroughPrice != null
    ? `${product.strikethroughPrice.toFixed(2).replace('.', ',')} €` : null;

  const handleToggleFav = async () => {
    try {
      const added = await toggleProductFavorite({
        store: 'carrefour',
        refId: product.id,
        name: product.displayName,
        imageUrl: product.thumbnail,
        price: product.unitPrice != null ? String(product.unitPrice) : null,
      });
      toast.show(t(added ? 'product.favAddedNamed' : 'product.favRemovedNamed', { name: product.displayName }));
    } catch {
      toast.show(t('product.favError'), 'error');
    }
  };

  const handleAdd = async () => {
    if (!activeCart) {
      Alert.alert(t('product.noCartTitle'), t('product.noCartMsg'));
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

  return (
    <View style={styles.overlay}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <View style={[styles.header, { paddingTop: topInset }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Ionicons name="close" size={24} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('product.detailTitle')}</Text>
        <TouchableOpacity onPress={handleToggleFav} style={styles.favBtn} activeOpacity={0.7}>
          <Ionicons name={fav ? 'star' : 'star-outline'} size={22} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ProductDetailImage uri={product.thumbnail} style={styles.photo} badgeLabel={badgeLabel} />

        <Text style={styles.name}>{product.displayName}</Text>

        <ProductPriceLine
          store="carrefour"
          productId={product.id}
          price={price}
          fallbackPreviousPrice={prevPrice}
        />
        {product.pricePerUnit ? <Text style={styles.refPrice}>{product.pricePerUnit}</Text> : null}

        {nutrition.info?.foodIndex ? (
          <FoodIndexSummary
            index={nutrition.info.foodIndex}
            onPress={nutrition.open}
            expanded={nutrition.expanded}
          >
            {nutrition.inlineContent}
          </FoodIndexSummary>
        ) : null}

        {/* Promo de lote ("3x2", "2ª unidad -70%"…) con sus condiciones completas
            (el texto de Carrefour ya incluye la validez: "Válido del … al …"). */}
        {promoActive ? (
          <View style={styles.promoBox}>
            <View style={styles.promoPill}>
              <Ionicons name="pricetags" size={12} color={colors.white} />
              <Text style={styles.promoPillText}>{product.promoName}</Text>
            </View>
            {product.promoText ? <Text style={styles.promoText}>{product.promoText}</Text> : null}
          </View>
        ) : null}

        {/* Comparativa: más barato en otros súper */}
        <SimilarProductsSection productId={product.id} excludeStore="carrefour" />

        {/* Características del producto (del __INITIAL_STATE__ de Carrefour; null si aún no rastreada) */}
        <ProductInfoSections
          items={[
            { key: 'ingredients', icon: 'leaf-outline', title: t('product.sections.ingredients'), text: product.ingredients },
            { key: 'allergens', icon: 'alert-circle-outline', title: t('product.sections.allergens'), text: product.allergens },
            { key: 'storage', icon: 'time-outline', title: t('product.sections.storage'), text: product.conservation },
            { key: 'preparation', icon: 'restaurant-outline', title: t('product.sections.preparation'), text: product.preparation },
            { key: 'origin', icon: 'location-outline', title: t('product.sections.origin'), text: product.origin },
            { key: 'legalName', icon: 'document-text-outline', title: t('product.sections.legalName'), text: product.denomination },
            { key: 'operator', icon: 'business-outline', title: t('product.sections.operator'), text: product.operator },
            { key: 'category', icon: 'pricetags-outline', title: t('product.category'), text: product.categoryName },
          ]}
        />

        <Text style={styles.note}>{t('product.fromStore', { store: 'Carrefour' })}</Text>
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
              <Text style={styles.addBtnText}>{t('product.addToCart')}</Text>
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
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10,
  },
  closeBtn: {
    width: 38, height: 38, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 19,
  },
  favBtn: {
    width: 38, height: 38, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent,
    borderRadius: 19,
  },
  headerTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },

  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  photo: {
    width: '100%', height: 260, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
    borderRadius: 20,
  },
  photoPlaceholder: { alignItems: 'center', justifyContent: 'center' },

  name: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 },
  price: { fontSize: 28, fontFamily: fonts.bold, color: colors.accent },
  prevPrice: {
    fontSize: 16, fontFamily: fonts.semibold, color: colors.inkSoft,
    textDecorationLine: 'line-through',
  },
  refPrice: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  // ── Oferta (promo de lote) ────────────────────────────────────
  promoBox: {
    marginTop: 14, padding: 12, gap: 8,
    backgroundColor: colors.accentLight,
    borderWidth: 1, borderColor: colors.accentMid,
  },
  promoPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 4,
  },
  promoPillText: { fontSize: 12, fontFamily: fonts.bold, color: colors.white },
  promoText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.ink, lineHeight: 18 },

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
