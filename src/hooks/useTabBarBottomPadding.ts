import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { glassAvailable } from '../components/GlassSurface';

/**
 * paddingBottom del contenido scrolleable de las pantallas de pestañas (y
 * offset `bottom` de las barras fijas pegadas abajo, pasando 0). Espejo por
 * abajo de useHeaderTopPadding.
 *
 * - Sin cristal (Android, iOS ≤ 18, build sin el módulo de expo-glass-effect):
 *   devuelve el MISMO valor de diseño de siempre — la tab bar reserva su hueco
 *   en el layout y no hay nada que compensar.
 * - Con tab bar de cristal (F1 liquid glass): la barra flota en absolute y el
 *   contenido pasa por debajo → se suma su alto para que el final del scroll
 *   (o la barra fija) quede por encima del cristal, con el mismo aire de hoy.
 *
 * Solo puede usarse DENTRO del tab navigator (useBottomTabBarHeight lee su
 * contexto); en onboarding/login no hay tab bar y no hace falta.
 */
export function useTabBarBottomPadding(designPadding: number): number {
  const tabBarHeight = useBottomTabBarHeight();
  return glassAvailable ? designPadding + tabBarHeight : designPadding;
}
