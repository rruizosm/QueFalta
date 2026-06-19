import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../constants/typography';
import { colors } from '../constants/colors';
import { CatalogStackParamList } from '../types';
import { fetchCarrefourProductsByCategory, type CarrefourProduct } from '../api/catalog';
import { getMeta } from '../constants/categoryMeta';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { carrefourToUI } from '../lib/productAdapters';
import StoreProductList from '../components/StoreProductList';
import ActiveCartBanner from '../components/ActiveCartBanner';

type RouteProps = RouteProp<CatalogStackParamList, 'CarrefourProducts'>;

export default function CarrefourProductsScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { categoryId, categoryName, parentName } = useRoute<RouteProps>().params;

  const [products, setProducts] = useState<CarrefourProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchCarrefourProductsByCategory(categoryId)
      .then(setProducts)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [categoryId]);

  const uiProducts = useMemo(() => products.map(carrefourToUI), [products]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ActiveCartBanner topInset />

      <View style={styles.headerArea}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{categoryName}</Text>
          <Text style={styles.breadcrumb} numberOfLines={1}>
            {parentName ? <>{parentName} <Text style={{ color: colors.inkFaint }}>›</Text> </> : null}
            {categoryName}
          </Text>
        </View>
      </View>

      <StoreProductList
        products={uiProducts}
        loading={loading}
        error={error}
        emoji={getMeta(parentName ?? categoryName).emoji}
        emptyText={t('product.emptyCategory')}
        searchable
      />
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
