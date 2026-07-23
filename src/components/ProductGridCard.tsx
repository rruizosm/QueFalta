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
  rounded = false,
  badgeLabel,
  onPress,
}: {
  width: number;
  uri: string | null;
  name: string;
  price: string;
  priceChange?: { prevLabel: string; direction: 'up' | 'down' } | null;
  emoji?: string;
  /** Variante redondeada para las superficies principales del catálogo. */
  rounded?: boolean;
  /** Etiqueta superpuesta sobre la imagen (p. ej. "Novedad"). */
  badgeLabel?: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  return (
    <TouchableOpacity
      style={[styles.card, rounded && styles.cardRounded, { width }]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <GlassSurface
        style={[styles.imgWrap, rounded && styles.imgWrapRounded]}
        fallbackColor={colors.white}
      >
        {uri ? (
          <ProductImage uri={uri} style={styles.img} />
        ) : emoji ? (
          <Text style={styles.placeholderEmoji}>{emoji}</Text>
        ) : (
          <Ionicons name="image-outline" size={22} color={colors.inkFaint} />
        )}
        {badgeLabel ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
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
  cardRounded: {
    padding: 8,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  imgWrap: {
    width: '100%', aspectRatio: 1,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 6,
  },
  imgWrapRounded: { borderRadius: 12, overflow: 'hidden' },
  img: { width: '100%', height: '100%' },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#F4C84A',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: 0.1,
  },
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
