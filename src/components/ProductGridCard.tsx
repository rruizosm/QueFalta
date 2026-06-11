import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import ProductImage from './ProductImage';

/**
 * Tarjeta de producto para la vista en cuadrícula: imagen, nombre y precio "y ya".
 * Agnóstica de la tienda (recibe valores ya normalizados). El ancho lo fija la
 * pantalla (según columnas/gap) para que la última fila no se estire. Tocarla
 * abre el detalle (donde se añade al carrito), igual que en la vista lista.
 */
export default function ProductGridCard({
  width,
  uri,
  name,
  price,
  emoji,
  onPress,
}: {
  width: number;
  uri: string | null;
  name: string;
  price: string;
  emoji?: string;
  onPress: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  return (
    <TouchableOpacity style={[styles.card, { width }]} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.imgWrap}>
        {uri ? (
          <ProductImage uri={uri} style={styles.img} />
        ) : emoji ? (
          <Text style={styles.placeholderEmoji}>{emoji}</Text>
        ) : (
          <Ionicons name="image-outline" size={22} color={colors.inkFaint} />
        )}
      </View>
      <Text style={styles.name} numberOfLines={2}>{name}</Text>
      {price ? <Text style={styles.price}>{price}</Text> : null}
    </TouchableOpacity>
  );
}

const themedStyles = () => StyleSheet.create({
  card: {},
  imgWrap: {
    width: '100%', aspectRatio: 1,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, overflow: 'hidden',
  },
  img: { width: '100%', height: '100%' },
  placeholderEmoji: { fontSize: 26 },
  // minHeight reserva el alto de 2 líneas → precios alineados aunque el nombre ocupe 1.
  name: { fontSize: 11.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 14, minHeight: 28 },
  price: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent, marginTop: 2 },
});
