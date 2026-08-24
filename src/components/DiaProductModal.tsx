import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import type { DiaProduct } from '../api/catalog';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useFavorites } from '../context/FavoritesContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useProductDetailFooterPadding } from '../hooks/useProductDetailFooterPadding';
import { useTranslation } from '../context/LanguageContext';
import QuantityStepper from '../components/QuantityStepper';
import ProductDetailImage from '../components/ProductDetailImage';
import ProductInfoSections from '../components/ProductInfoSections';
import SimilarProductsSection from '../components/SimilarProductsSection';
import ProductPriceLine from '../components/ProductPriceLine';
import ActiveCartIcon from './ActiveCartIcon';

interface Props {
  /** Producto a mostrar (ya cargado de dia_products). null = oculto. */
  product: DiaProduct | null;
  onClose: () => void;
  /** Padding superior de la cabecera (lo fija StoreProductModal): 56 a pantalla
   *  completa (cesta), 16 dentro de la hoja (catálogo). */
  topInset?: number;
  badgeLabel?: string;
}

/** Detalle de un producto de Dia. Pinta los datos ya cargados (no hay fetch:
 *  el catálogo de Dia va por el espejo en Supabase). El formato del envase va
 *  dentro del display_name ("... 600 g"); la marca sí viene separada. */
export default function DiaProductModal({ product, onClose, topInset = 16, badgeLabel }: Props) {
  const styles = useThemedStyles(themedStyles);
  const footerPaddingBottom = useProductDetailFooterPadding();
  const { activeCart, addToActiveCart } = useCart();
  const { isProductFavorite, toggleProductFavorite } = useFavorites();
  const toast = useToast();
  const { t } = useTranslation();
  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setQty(1); }, [product?.id]);

  if (!product) return null;
  const price = product.priceFormat
    ?? (product.unitPrice != null ? `${product.unitPrice.toFixed(2).replace('.', ',')} €` : null);
  const previousPromoPrice = product.promoBasePrice != null
    && product.unitPrice != null
    && product.promoBasePrice > product.unitPrice
    ? `${product.promoBasePrice.toFixed(2).replace('.', ',')} €`
    : null;
  const fav = isProductFavorite('dia', product.id);

  const handleToggleFav = async () => {
    try {
      const added = await toggleProductFavorite({
        store: 'dia',
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
        <ProductDetailImage uri={product.thumbnail} style={styles.photo} badgeLabel={badgeLabel} alertTarget={{ store: 'dia', productId: product.id }} />

        <Text style={styles.name}>{product.displayName}</Text>
        {product.brand ? <Text style={styles.brand}>{product.brand}</Text> : null}

        <ProductPriceLine
          store="dia"
          productId={product.id}
          price={price}
          promotionPreviousPrice={previousPromoPrice}
          priceTone={previousPromoPrice ? 'down' : 'default'}
        />
        {product.pricePerUnit ? <Text style={styles.refPrice}>{product.pricePerUnit}</Text> : null}

        {product.promoName ? (
          <View style={styles.promoBox}>
            <View style={styles.promoPill}>
              <Ionicons name="pricetags" size={12} color={colors.white} />
              <Text style={styles.promoPillText}>{product.promoName}</Text>
            </View>
            {product.promoText ? <Text style={styles.promoText}>{product.promoText}</Text> : null}
          </View>
        ) : null}

        {/* Comparativa: más barato en otros súper */}
        <SimilarProductsSection productId={product.id} excludeStore="dia" />

        {/* Características del producto (del vike_pageContext de Dia; null si aún no rastreada) */}
        <ProductInfoSections
          items={[
            { key: 'description', icon: 'reader-outline', title: t('product.sections.description'), text: product.description },
            { key: 'ingredients', icon: 'leaf-outline', title: t('product.sections.ingredients'), text: product.ingredients },
            { key: 'nutrition', icon: 'nutrition-outline', title: t('product.sections.nutrition'), text: product.nutrition },
            { key: 'storage', icon: 'time-outline', title: t('product.sections.storage'), text: product.conservation },
            { key: 'preparation', icon: 'restaurant-outline', title: t('product.sections.preparation'), text: product.preparation },
            { key: 'legalName', icon: 'document-text-outline', title: t('product.sections.legalName'), text: product.denomination },
            { key: 'operator', icon: 'business-outline', title: t('product.sections.operator'), text: product.operator },
            { key: 'category', icon: 'pricetags-outline', title: t('product.category'), text: product.categoryName },
          ]}
        />

        <Text style={styles.note}>{t('product.fromStore', { store: 'Dia' })}</Text>
      </ScrollView>

      {/* Pie: cantidad + añadir a la cesta */}
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
  brand: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 14 },
  price: { fontSize: 28, fontFamily: fonts.bold, color: colors.accent },
  refPrice: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },

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
    paddingVertical: 14, borderRadius: 23,
  },
  addBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
});
