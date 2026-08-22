import { useEffect, useRef, type ReactNode } from 'react';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import type { OpenFoodFactsNutrition } from '../api/openFoodFacts';
import type { CatalogStore } from '../constants/stores';
import { colors } from '../constants/colors';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { shouldRevealProductDiscovery } from '../lib/productDetailLoading';
import { useTranslation } from '../context/LanguageContext';
import FoodIndexSummary from './FoodIndexSummary';
import SimilarProductsSection from './SimilarProductsSection';

interface NutritionDisclosureState {
  active: boolean;
  resolved: boolean;
  info: OpenFoodFactsNutrition | null;
  open: () => Promise<void>;
  expanded: boolean;
  inlineContent: ReactNode;
}

interface Props {
  nutrition: NutritionDisclosureState;
  productId: string;
  excludeStore: CatalogStore;
}

/**
 * Revela como una sola unidad el índice y el comparador. Mientras se resuelve
 * la nutrición conserva un hueco compacto de carga; así el comparador no llega
 * a pintarse en una posición provisional para saltar después hacia abajo.
 */
export default function ProductDetailDiscoverySection({
  nutrition,
  productId,
  excludeStore,
}: Props) {
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const reveal = shouldRevealProductDiscovery(nutrition.active, nutrition.resolved);
  const opacity = useRef(new Animated.Value(reveal ? 1 : 0)).current;

  useEffect(() => {
    if (!reveal) {
      opacity.setValue(0);
      return;
    }
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [opacity, reducedMotion, reveal]);

  if (!reveal) {
    return (
      <View
        style={styles.pending}
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
      >
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  return (
    <Animated.View style={{ opacity }}>
      {nutrition.info?.foodIndex ? (
        <FoodIndexSummary
          index={nutrition.info.foodIndex}
          onPress={nutrition.open}
          expanded={nutrition.expanded}
        >
          {nutrition.inlineContent}
        </FoodIndexSummary>
      ) : null}

      <SimilarProductsSection productId={productId} excludeStore={excludeStore} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pending: {
    minHeight: 66,
    marginTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
