import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
  offerTag,
  storeLogo,
  onPress,
  selectionState,
  accessibilityLabel,
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
  /** Tipo de promoción del retailer (3x2, CLUB Dia · 25%…). */
  offerTag?: string | null;
  storeLogo?: number | null;
  onPress: () => void;
  selectionState?: 'available' | 'selected';
  accessibilityLabel?: string;
}) {
  const styles = useThemedStyles(themedStyles);
  const hasStoreLogo = storeLogo != null;
  return (
    <TouchableOpacity
      style={[styles.card, rounded && styles.cardRounded, selectionState === 'selected' && styles.cardSelected, { width }]}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={selectionState === 'selected'}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={selectionState ? { selected: selectionState === 'selected', disabled: selectionState === 'selected' } : undefined}
    >
      {hasStoreLogo ? (
        <View style={styles.storeLogoBadge} pointerEvents="none">
          <Image source={storeLogo} style={styles.storeLogo} resizeMode="contain" />
        </View>
      ) : null}
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
          <View style={[styles.badge, hasStoreLogo && styles.badgeBelowStoreLogo]}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
        {offerTag ? (
          <View style={[
            styles.offerTag,
            (badgeLabel || hasStoreLogo) && styles.offerTagBelowBadge,
            hasStoreLogo && !badgeLabel && styles.offerTagBelowStoreLogo,
            badgeLabel && hasStoreLogo && styles.offerTagBelowBadgeAndStoreLogo,
          ]}>
            <Ionicons name="pricetag" size={9} color={colors.white} />
            <Text style={styles.offerTagText} numberOfLines={1}>{offerTag}</Text>
          </View>
        ) : null}
      </GlassSurface>
      {selectionState ? (
        <View style={styles.selectionBadge} pointerEvents="none">
          <Ionicons name={selectionState === 'selected' ? 'checkmark' : 'add'} size={19} color={colors.accent} />
        </View>
      ) : null}
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
  card: { position: 'relative' },
  cardSelected: { borderColor: colors.accentMid, backgroundColor: colors.accentLight },
  selectionBadge: {
    position: 'absolute', right: 12, top: 12, width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.accentMid,
  },
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
  storeLogoBadge: {
    position: 'absolute', top: 0, left: 0, zIndex: 3,
    width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  storeLogo: { width: '100%', height: '100%' },
  badgeBelowStoreLogo: { top: 44 },
  offerTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    minHeight: 21,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.red,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  offerTagBelowBadge: { top: 32 },
  offerTagBelowStoreLogo: { top: 44 },
  offerTagBelowBadgeAndStoreLogo: { top: 70 },
  offerTagText: {
    flexShrink: 1,
    fontSize: 9,
    fontFamily: fonts.bold,
    color: colors.white,
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
