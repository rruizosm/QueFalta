import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import ProductImage from './ProductImage';
import GlassSurface from './GlassSurface';

export default function ProductGridCard({
  width,
  uri,
  name,
  price,
  priceChange,
  emoji,
  onPress,
}: {
  width: number;
  uri: string | null;
  name: string;
  price: string;
  priceChange?: { prevLabel: string; direction: 'up' | 'down' } | null;
  emoji?: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  return (
    <TouchableOpacity style={[styles.card, { width }]} activeOpacity={0.7} onPress={onPress}>
      <GlassSurface style={styles.imgWrap} fallbackColor={colors.white}>
        {uri ? (
          <ProductImage uri={uri} style={styles.img} />
        ) : emoji ? (
          <Text style={styles.placeholderEmoji}>{emoji}</Text>
        ) : (
          <Ionicons name="image-outline" size={22} color={colors.inkFaint} />
        )}
      </GlassSurface>
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      {priceChange ? (
        <View style={styles.changeRow}>
          <Text style={styles.previousPrice}>{priceChange.prevLabel}</Text>
          <Text
            style={[
              styles.changedPrice,
              { color: priceChange.direction === 'down' ? colors.ok : colors.red },
            ]}
          >
            {price}
          </Text>
        </View>
      ) : price ? <Text style={styles.price}>{price}</Text> : null}
    </TouchableOpacity>
  );
}

const themedStyles = () => StyleSheet.create({
  card: {},
  imgWrap: {
    width: '100%', aspectRatio: 1,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6,
  },
  img: { width: '100%', height: '100%' },
  placeholderEmoji: { fontSize: 26 },
  name: { fontSize: 11.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 14, minHeight: 28 },
  price: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent, marginTop: 2 },
  changeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 5, marginTop: 2 },
  previousPrice: {
    fontSize: 10.5,
    fontFamily: fonts.semibold,
    color: colors.inkSoft,
    textDecorationLine: 'line-through',
  },
  changedPrice: { fontSize: 12, fontFamily: fonts.bold },
});
