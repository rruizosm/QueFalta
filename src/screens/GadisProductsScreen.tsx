import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { fetchGadisProductsByCategory, type GadisProduct } from '../api/catalog';
import { gadisToUI } from '../lib/productAdapters';
import StoreProductList from '../components/StoreProductList';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import type { CatalogStackParamList } from '../types';

type RouteProps = RouteProp<CatalogStackParamList, 'GadisProducts'>;

export default function GadisProductsScreen() {
  const navigation = useNavigation(); const route = useRoute<RouteProps>(); const insets = useSafeAreaInsets();
  const { categoryId, categoryName } = route.params;
  const [products, setProducts] = useState<GadisProduct[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false);
  useEffect(() => { let alive = true; setLoading(true); fetchGadisProductsByCategory(categoryId).then((rows) => { if (alive) setProducts(rows); }).catch(() => { if (alive) setError(true); }).finally(() => { if (alive) setLoading(false); }); return () => { alive = false; }; }, [categoryId]);
  const items = useMemo(() => products.map(gadisToUI), [products]);
  return <View style={[styles.screen, { paddingTop: insets.top }]}>
    <ProfileSubscreenHeader title={categoryName} icon="pricetags-outline" headerTop={0} />
    {loading ? <ActivityIndicator style={styles.center} color={colors.accent} size="large" /> : error ? <Text style={styles.message}>No se pudieron cargar los productos.</Text> : <StoreProductList products={items} />}
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: colors.paper }, center: { flex: 1 }, message: { margin: 24, fontFamily: fonts.regular, color: colors.inkSoft, textAlign: 'center' } });
