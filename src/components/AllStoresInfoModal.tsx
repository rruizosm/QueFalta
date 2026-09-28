import Ionicons from '@expo/vector-icons/Ionicons';
import {
  Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { CATALOG_STORES, type CatalogStore } from '../constants/stores';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import GlassSurface, { glassAvailable } from './GlassSurface';
import ProductImage from './ProductImage';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Lo pinta sobre un Modal ya abierto y evita presentar dos modales nativos. */
  contained?: boolean;
  /** Reutiliza el mismo diálogo para el aviso regional de Lidl. */
  variant?: 'allStores' | 'lidlCanary';
}

interface ExampleProduct {
  store: CatalogStore;
  storeName: string;
  name: string;
  meta: string;
  imageUrl: string;
  price: string;
}

/**
 * Muestra ilustrativa de la lista conjunta. Son referencias reales verificadas
 * en el catálogo el 26-09-2026; se presentan como ejemplo, no como una promesa
 * de precio permanente (el propio popup lo aclara).
 */
const EXAMPLE_PRODUCTS: ExampleProduct[] = [
  {
    store: 'mercadona',
    storeName: 'Mercadona',
    name: 'Leche semidesnatada Hacendado',
    meta: 'Brik · 1 l',
    imageUrl: 'https://prod-mercadona.imgix.net/images/da2348eb6ffa595fbfdbe66367bcad3c.jpg?fit=crop&h=300&w=300',
    price: '0,84 €',
  },
  {
    store: 'carrefour',
    storeName: 'Carrefour',
    name: 'Leche semidesnatada Carrefour',
    meta: 'Brik · 1 l',
    imageUrl: 'https://static.carrefour.es/hd_350x_/img_pim_food/231394_00_1.jpg',
    price: '0,84 €',
  },
  {
    store: 'lidl',
    storeName: 'Lidl',
    name: 'Leche semidesnatada',
    meta: '1 l',
    imageUrl: 'https://static-product-catalog.lidlplus.com/images/productdata/ES/original/highres/2425825_2442_v1_highres.png?im=Resize=(384)',
    price: '0,84 €',
  },
];

export default function AllStoresInfoModal({ visible, onClose, contained = false, variant = 'allStores' }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const maxHeight = Math.max(240, height - insets.top - insets.bottom - 40);
  const lidlCanary = variant === 'lidlCanary';

  const content = (
      <View style={[styles.overlay, contained && styles.containedOverlay]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <GlassSurface
          style={[
            styles.card,
            { maxHeight },
            !glassAvailable && styles.cardFallback,
          ]}
          fallbackColor={colors.white}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View style={styles.titleIcon}>
              <Ionicons name={lidlCanary ? 'information-circle-outline' : 'apps'} size={20} color={colors.accent} />
            </View>
            <Text style={styles.title}>{t(lidlCanary ? 'storePicker.lidlCanaryNoticeTitle' : 'storePicker.allStoresNoticeTitle')}</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={21} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Text style={styles.message}>{t(lidlCanary ? 'storePicker.lidlCanaryNoticeBody' : 'storePicker.allStoresNoticeBody')}</Text>

            {!lidlCanary && (
              <>
                <View style={styles.exampleHeading}>
                  <Text style={styles.exampleTitle}>{t('storePicker.allStoresExampleTitle')}</Text>
                  <Text style={styles.exampleHint}>{t('storePicker.allStoresExampleHint')}</Text>
                </View>

                <View style={styles.productList}>
                  {EXAMPLE_PRODUCTS.map((product) => {
                    const storeIcon = CATALOG_STORES.find((store) => store.key === product.store)?.icon;
                    return (
                      <View
                        key={product.store}
                        style={styles.productRow}
                        accessible
                        accessibilityLabel={`${product.name}. ${product.storeName}. ${product.price}`}
                      >
                        <View style={styles.storeLogoBadge} pointerEvents="none">
                          {storeIcon ? (
                            <Image source={storeIcon} style={styles.storeLogo} resizeMode="contain" />
                          ) : null}
                        </View>
                        <ProductImage uri={product.imageUrl} style={styles.productImage} />
                        <View style={styles.productInfo}>
                          <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                          <Text style={styles.productPrice}>{product.price}</Text>
                          <Text style={styles.productMeta} numberOfLines={1}>
                            {product.storeName} · {product.meta}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                <Text style={styles.disclaimer}>{t('storePicker.allStoresExampleDisclaimer')}</Text>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.acceptButton}
              onPress={onClose}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.acceptButtonText}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </GlassSurface>
      </View>
  );

  if (contained) return visible ? content : null;

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
    >
      {content}
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  containedOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100,
    elevation: 100,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 26,
    overflow: 'hidden',
  },
  cardFallback: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
  },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  title: {
    flex: 1,
    fontSize: 19,
    lineHeight: 23,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.25,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  scroll: { flexShrink: 1 },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 14,
  },
  message: {
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  exampleHeading: { marginTop: 16, marginBottom: 10, gap: 3 },
  exampleTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  exampleHint: {
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  productList: { gap: 8 },
  productRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  storeLogoBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 2,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeLogo: { width: '100%', height: '100%' },
  productImage: { width: 60, height: 60, flex: 0 },
  productInfo: { flex: 1, minWidth: 0 },
  productName: {
    fontSize: 13.5,
    lineHeight: 18,
    fontFamily: fonts.semibold,
    color: colors.ink,
  },
  productPrice: {
    marginTop: 3,
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.accent,
  },
  productMeta: {
    marginTop: 1,
    fontSize: 11.5,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  disclaimer: {
    marginTop: 10,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 18,
  },
  acceptButton: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.accent,
  },
  acceptButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.white,
  },
});
