import { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { fonts } from '../constants/typography';
import { colors } from '../constants/colors';
import { CatalogStackParamList } from '../types';
import {
  fetchEroskiProductsByCategory, fetchCapraboProductsByCategory, type TapestryProduct,
} from '../api/catalog';
import { getMeta } from '../constants/categoryMeta';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { eroskiToUI, capraboToUI } from '../lib/productAdapters';
import StoreProductList from '../components/StoreProductList';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';

type RouteProps = RouteProp<CatalogStackParamList, 'EroskiProducts' | 'CapraboProducts'>;

// Eroski y Caprabo comparten pantalla (mismo backend Tapestry); solo cambia el
// fetch y el adaptador, elegidos por el nombre de la ruta.
export default function TapestryProductsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProps>();
  const { categoryId, categoryName, parentName } = route.params;
  const isCaprabo = route.name === 'CapraboProducts';
  const fetchByCategory = isCaprabo ? fetchCapraboProductsByCategory : fetchEroskiProductsByCategory;
  const toUI = isCaprabo ? capraboToUI : eroskiToUI;

  const [products, setProducts] = useState<TapestryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetchByCategory(categoryId)
      .then(setProducts)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [categoryId, isCaprabo]);

  const uiProducts = useMemo(() => products.map(toUI), [products, isCaprabo]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <View style={[styles.headerArea, { paddingTop: headerTop }]}>
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
        roundedCards
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
