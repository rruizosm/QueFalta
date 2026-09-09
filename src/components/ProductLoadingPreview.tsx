import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import type { UIProduct } from '../lib/productAdapters';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import ProductImage from './ProductImage';

/** Paint the list snapshot immediately; purchasing still waits for the full detail. */
export default function ProductLoadingPreview({ product }: { product?: UIProduct }) {
  const styles = useThemedStyles(themedStyles);
  return (
    <View style={styles.content}>
      {product ? <>
        {product.imageUrl ? <ProductImage uri={product.imageUrl} style={styles.image} /> : null}
        <Text style={styles.name}>{product.name}</Text>
        <Text style={styles.price}>{product.priceLabel}</Text>
        {product.metaLabel ? <Text style={styles.meta}>{product.metaLabel}</Text> : null}
      </> : null}
      <ActivityIndicator color={colors.accent} style={styles.indicator} />
    </View>
  );
}
const themedStyles = () => StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  image: { height: 240, width: '100%', backgroundColor: colors.white },
  name: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginTop: 16 },
  price: { fontFamily: fonts.bold, fontSize: 22, color: colors.ink, marginTop: 12 },
  meta: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft, marginTop: 6 },
  indicator: { marginTop: 24 },
});
