import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { fetchFroizProductsByCategory, type FroizProduct } from '../api/catalog';
import { froizToUI } from '../lib/productAdapters';
import StoreProductList from '../components/StoreProductList';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import type { CatalogStackParamList } from '../types';

type RouteProps = RouteProp<CatalogStackParamList, 'FroizProducts'>;

export default function FroizProductsScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const insets = useSafeAreaInsets();
  const { categoryId, categoryName } = route.params;
  const [products, setProducts] = useState<FroizProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(false);
    fetchFroizProductsByCategory(categoryId)
      .then((rows) => { if (alive) setProducts(rows); })
      .catch(() => { if (alive) setError(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [categoryId]);

  const items = useMemo(() => products.map(froizToUI), [products]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ProfileSubscreenHeader title={categoryName} icon="pricetags-outline" headerTop={0} />
      {loading ? (
        <ActivityIndicator style={styles.center} color={colors.accent} size="large" />
      ) : error ? (
        <Text style={styles.message}>{t('catalog.loadErrorStore', { store: 'Froiz' })}</Text>
      ) : (
        <StoreProductList products={items} />
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  center: { flex: 1 },
  message: {
    margin: 24,
    fontFamily: fonts.regular,
    color: colors.inkSoft,
    textAlign: 'center',
  },
});
