import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../constants/typography';
import { colors } from '../constants/colors';
import { type MercadonaProduct } from '../api/mercadona';
import { fetchMercadonaProductsByCategory } from '../api/catalog';
import { CatalogStackParamList } from '../types';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { mercadonaToUI } from '../lib/productAdapters';
import StoreProductList from '../components/StoreProductList';
import ActiveCartBanner from '../components/ActiveCartBanner';

type ProductsRouteProp = RouteProp<CatalogStackParamList, 'Products'>;

export default function ProductsScreen() {
  const styles = useThemedStyles(themedStyles);
  const { lang } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<ProductsRouteProp>();
  const { subcategoryId, subcategoryName, categoryName, emoji = '🛒' } = route.params;

  const [products, setProducts] = useState<MercadonaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchMercadonaProductsByCategory(subcategoryId)
      .then(setProducts)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [subcategoryId, lang]);

  const uiProducts = useMemo(
    () => products.map((p) => mercadonaToUI(p, categoryName)),
    [products, categoryName],
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ActiveCartBanner topInset />

      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{subcategoryName}</Text>
          <Text style={styles.breadcrumb}>
            {categoryName} <Text style={{ color: colors.inkFaint }}>›</Text> {subcategoryName}
          </Text>
        </View>
      </View>

      <StoreProductList products={uiProducts} loading={loading} error={error} emoji={emoji} searchable />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  headerArea: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
  },
  backBtn: {
    width: 38, height: 38, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  breadcrumb: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
});
