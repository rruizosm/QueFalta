import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

/**
 * Insignia de "producto exclusivo de ciertas CCAA": círculo con una exclamación
 * roja. Se superpone sobre la imagen del producto en la lista y la cuadrícula
 * (Mercadona regional). El aro blanco la hace visible sobre cualquier foto.
 * La explicación textual ("Producto solo disponible en …") va en la ficha.
 */
export default function ExclusiveBadge({
  size = 18,
  style,
}: {
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.halo, { borderRadius: size }, style]}>
      <Ionicons name="alert-circle" size={size} color={colors.red} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Aro blanco bajo el icono para que el rojo destaque sobre imágenes claras.
  halo: { backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
});
