import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Altura de barra de estado con la que se calibraron los paddingTop fijos de
// iOS (52/54/56). La diferencia con el valor que pasa cada pantalla es el
// "aire" de diseño que queda entre la barra y la cabecera (52 → 6, 56 → 10).
const IOS_DESIGN_STATUS_BAR = 46;

/**
 * paddingTop de las cabeceras propias (la app no usa headers nativos: cada
 * pantalla dibuja su cabecera bajo la barra de estado).
 *
 * - iOS: devuelve el MISMO valor fijo de siempre — el diseño se calibró ahí
 *   y no debe moverse ni un punto.
 * - Android: el SDK 54 fuerza edge-to-edge (la app dibuja bajo la barra de
 *   estado) y la altura de la barra varía por dispositivo → inset real + el
 *   aire de diseño. Sin esto, la cabecera queda pegada/solapada a la barra.
 */
export function useHeaderTopPadding(iosPadding: number): number {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'ios') return iosPadding;
  return insets.top + (iosPadding - IOS_DESIGN_STATUS_BAR);
}
