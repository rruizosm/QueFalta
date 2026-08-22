import { View, Text, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import type { NutriScoreGrade } from '../lib/productAdapters';
import ProductImage from './ProductImage';
import GlassSurface from './GlassSurface';
import type { CatalogStore } from '../constants/stores';
import ProductPriceLine from './ProductPriceLine';
import { ProductDetailBadge } from './ProductDetailImage';
import ProductAlertButton from './ProductAlertButton';

const grades: Record<NutriScoreGrade, string> = { A: '#038141', B: '#85bb2a', C: '#fecb02', D: '#ee8100', E: '#e63e11' };

interface Props {
  imageUri: string | null;
  name: string;
  brand?: string | null;
  price?: string | null;
  size?: string | null;
  referencePrice?: string | null;
  nutriScoreGrade?: string | null;
  store?: CatalogStore;
  productId?: string;
  promotionPreviousPrice?: string | null;
  priceTone?: 'default' | 'down' | 'up';
  badgeLabel?: string;
}

export default function ProductDetailHero({
  imageUri, name, brand, price, size, referencePrice, nutriScoreGrade, store, productId,
  promotionPreviousPrice = null, priceTone = 'default', badgeLabel,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const grade = nutriScoreGrade?.trim().toUpperCase() as NutriScoreGrade | undefined;
  const validGrade = grade && Object.prototype.hasOwnProperty.call(grades, grade) ? grade : null;
  return <View style={styles.hero}>
    <GlassSurface style={styles.imageWrap} fallbackColor={colors.white}>
      {imageUri ? <ProductImage uri={imageUri} style={styles.image} /> : <Ionicons name="image-outline" size={42} color={colors.inkFaint} />}
      {store && productId ? <ProductAlertButton store={store} productId={productId} overlay /> : null}
      {badgeLabel ? <ProductDetailBadge label={badgeLabel} /> : null}
    </GlassSurface>
    <View style={styles.info}>
      <Text style={styles.name} numberOfLines={3}>{name}</Text>
      {brand ? <Text style={styles.brand} numberOfLines={1}>{brand}</Text> : null}
      {store && productId ? (
        <ProductPriceLine
          store={store}
          productId={productId}
          price={price ?? null}
          size={size}
          promotionPreviousPrice={promotionPreviousPrice}
          priceTone={priceTone}
        />
      ) : (
        <View style={styles.priceRow}>{price ? <Text style={styles.price}>{price}</Text> : null}{size ? <Text style={styles.size}>{size}</Text> : null}</View>
      )}
      {referencePrice ? <Text style={styles.referencePrice}>{referencePrice}</Text> : null}
      {validGrade ? <View style={styles.nutriScore} accessibilityLabel={`Nutri-Score ${validGrade}`}>
        {(Object.keys(grades) as NutriScoreGrade[]).map((item) => <View key={item} style={[styles.nutriCell, { backgroundColor: grades[item] }, item === validGrade && styles.nutriCellActive]}><Text style={[styles.nutriLetter, item === validGrade ? styles.nutriLetterActive : styles.nutriLetterInactive]}>{item}</Text></View>)}
      </View> : null}
    </View>
  </View>;
}

const themedStyles = () => StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 22 },
  imageWrap: { width: '42%', aspectRatio: 1, flexShrink: 0, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 20 },
  image: { width: '100%', height: '100%' }, info: { flex: 1, minWidth: 0, paddingTop: 2 },
  name: { fontSize: 20, lineHeight: 24, fontFamily: fonts.bold, color: colors.ink }, brand: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3 },
  priceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8, marginTop: 12 }, price: { fontSize: 25, fontFamily: fonts.bold, color: colors.accent }, size: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft }, referencePrice: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  nutriScore: { flexDirection: 'row', alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 4, marginTop: 9 }, nutriCell: { width: 24, height: 26, alignItems: 'center', justifyContent: 'center' }, nutriCellActive: { borderWidth: 2, borderColor: colors.white }, nutriLetter: { fontFamily: fonts.bold }, nutriLetterActive: { color: colors.white, fontSize: 16 }, nutriLetterInactive: { color: 'rgba(255,255,255,0.58)', fontSize: 12 },
});
