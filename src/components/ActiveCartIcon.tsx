import { Text, type StyleProp, type TextStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useCart } from '../context/CartContext';

interface Props {
  size: number;
  color: string;
  fallback?: React.ComponentProps<typeof Ionicons>['name'];
  style?: StyleProp<TextStyle>;
}

/** Icono del grupo activo, con el glifo de carrito como fallback legacy. */
export default function ActiveCartIcon({ size, color, fallback = 'cart-outline', style }: Props) {
  const { activeCart } = useCart();

  if (activeCart?.groupIcon) {
    return (
      <Text
        style={[{ fontSize: size, lineHeight: Math.ceil(size * 1.25), textAlign: 'center' }, style]}
        accessible={false}
      >
        {activeCart.groupIcon}
      </Text>
    );
  }

  return <Ionicons name={fallback} size={size} color={color} />;
}
