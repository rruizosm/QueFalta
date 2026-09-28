import { useRef, useState } from 'react';
import { Pressable, View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import type { CatalogStore } from '../constants/stores';
import { productImageSource } from '../lib/productImageSource';
import ProductImage from './ProductImage';
import ProductAlertButton from './ProductAlertButton';
import RecipeImageViewer from './RecipeImageViewer';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  uri: string | null | undefined;
  style: StyleProp<ViewStyle>;
  badgeLabel?: string;
  alertTarget?: { store: CatalogStore; productId: string };
  emptyMessage?: string;
}

/** Imagen principal de la ficha con una etiqueta contextual dentro del marco. */
export default function ProductDetailImage({ uri, style, badgeLabel, alertTarget, emptyMessage }: Props) {
  const { t } = useTranslation();
  const [viewerVisible, setViewerVisible] = useState(false);
  const imageRef = useRef<View>(null);
  const imageProgress = useSharedValue(0);
  const fallback = emptyMessage ? <Text style={styles.emptyMessage}>{emptyMessage}</Text> : null;
  const hasUsableImage = Boolean(uri && productImageSource(uri));
  return (
    <View style={[style, styles.frame]}>
      <View ref={imageRef} collapsable={false} style={StyleSheet.absoluteFill}>
        {hasUsableImage && uri ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setViewerVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('product.detailTitle')}
          >
            <ProductImage uri={uri} style={StyleSheet.absoluteFill} fallback={fallback} />
          </Pressable>
        ) : fallback ? (
          fallback
        ) : (
          <Ionicons name="image-outline" size={48} color={colors.inkFaint} />
        )}
      </View>
      {alertTarget ? (
        <ProductAlertButton
          store={alertTarget.store}
          productId={alertTarget.productId}
          overlay
        />
      ) : null}
      {badgeLabel ? <ProductDetailBadge label={badgeLabel} /> : null}
      {viewerVisible && uri ? (
        <RecipeImageViewer
          uri={uri}
          title={t('product.detailTitle')}
          sourceRef={imageRef}
          imageRatio={1}
          progress={imageProgress}
          onClose={() => setViewerVisible(false)}
        />
      ) : null}
    </View>
  );
}

export function ProductDetailBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: '#F4C84A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: 0.2,
  },
  emptyMessage: {
    maxWidth: 280,
    paddingHorizontal: 24,
    textAlign: 'center',
    fontSize: 13.5,
    lineHeight: 20,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
});
