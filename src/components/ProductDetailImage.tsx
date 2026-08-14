import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import ProductImage from './ProductImage';

interface Props {
  uri: string | null | undefined;
  style: StyleProp<ViewStyle>;
  badgeLabel?: string;
}

/** Imagen principal de la ficha con una etiqueta contextual dentro del marco. */
export default function ProductDetailImage({ uri, style, badgeLabel }: Props) {
  return (
    <View style={[style, styles.frame]}>
      {uri ? (
        <ProductImage uri={uri} style={StyleSheet.absoluteFillObject} />
      ) : (
        <Ionicons name="image-outline" size={48} color={colors.inkFaint} />
      )}
      {badgeLabel ? <ProductDetailBadge label={badgeLabel} /> : null}
    </View>
  );
}

export function ProductDetailBadge({ label }: { label: string }) {
  return (
    <View style={styles.badge} pointerEvents="none">
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    position: 'relative',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    backgroundColor: '#F4C84A',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: 0.2,
  },
});
