/**
 * LiquidGlassTabBar — barra de pestañas FLOTANTE de cristal (diseño liquid
 * glass, iOS 26). Recreación del handoff "Liquid Glass Nav": barra despegada de
 * los bordes, muy redondeada, material esmerilado, con una PÍLDORA que se
 * desliza bajo la pestaña activa con un rebote elástico (squash-and-stretch).
 *
 * Solo se usa cuando `glassAvailable` (iOS 26+). En Android / iOS ≤ 18 la app
 * sigue con la BottomTabBar clásica de react-navigation (ver navigation/index).
 *
 * Adaptaciones al entorno de la app (lo que pide el README del handoff):
 *  - El verde fijo del diseño (#2f9e44) → `colors.accent` (sistema de acento
 *    dinámico): la píldora y el color activo siguen el color elegido por el
 *    usuario en Apariencia. El gris inactivo → `colors.inkSoft` (respeta el
 *    modo oscuro). Iconos = Ionicons outline del propio set de la app.
 *  - El cristal (backdrop-filter) → `GlassSurface` (GlassView nativo).
 *  - El deslizamiento con overshoot → `Animated.spring` (driver nativo).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Platform, Pressable, StyleSheet, Text, View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import GlassSurface from './GlassSurface';

/** Alto de la barra de cristal (sin contar hueco inferior ni área segura). */
export const LIQUID_TABBAR_HEIGHT = 66;

/** Separación efectiva de la barra al borde INFERIOR de la pantalla. La barra
 *  flotante se mete en el área segura (puede convivir con el home indicator,
 *  como la tab bar nativa de iOS 26) pero sin llegar a tocarlo: en iPhones con
 *  indicador (inset 34) queda a 18 del borde; sin indicador, a 8. */
export function liquidTabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom - 16, 8);
}

const SIDE_INSET = 18;     // margen lateral (barra despegada de los bordes)
const BAR_RADIUS = 30;
const BAR_PAD_H = 10;      // padding horizontal interno (define el área de la píldora)
const PILL_RADIUS = 22;
const PILL_INSET_V = 8;    // separación vertical de la píldora dentro de la barra
const PILL_SIDE_INSET = 4; // la píldora es un poco más estrecha que la pestaña

/** Iconos (Ionicons outline, el set de la app) por nombre de ruta. */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home:    'home-outline',
  Catalog: 'grid-outline',
  List:    'basket-outline',
  Groups:  'people-outline',
};

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

interface Props extends BottomTabBarProps {
  /** Ref del View que envuelve la barra: el tour mide su rect (ancla 'tabBar'). */
  barRef: React.RefObject<View | null>;
  onBarLayout: () => void;
}

export default function LiquidGlassTabBar({
  state, navigation, descriptors, barRef, onBarLayout,
}: Props) {
  const insets = useSafeAreaInsets();
  const active = state.index;
  const n = state.routes.length;

  // Ancho interno (barra − padding) medido, para calcular geometría de la píldora.
  const [innerW, setInnerW] = useState(0);
  const tabW = innerW > 0 ? innerW / n : 0;
  const pillW = tabW > 0 ? tabW - PILL_SIDE_INSET * 2 : 0;

  // translateX de la píldora + valor de "stretch" (0 reposo, 1 estirada).
  const translateX = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const settled = useRef(false); // primer posicionamiento sin animar

  const pillX = (i: number) => BAR_PAD_H + PILL_SIDE_INSET + tabW * i;

  useEffect(() => {
    if (tabW <= 0) return;
    const target = pillX(active);
    if (!settled.current) {
      translateX.setValue(target);       // coloca sin animación al medir
      settled.current = true;
      return;
    }
    // Deslizamiento con overshoot (curva spring del diseño) + pulso de estiramiento
    // a lo largo del eje de viaje: lo que se lee como "líquido".
    Animated.spring(translateX, {
      toValue: target, useNativeDriver: true,
      stiffness: 170, damping: 15, mass: 0.9,
    }).start();
    Animated.sequence([
      Animated.timing(stretch, { toValue: 1, duration: 170, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(stretch, { toValue: 0, useNativeDriver: true, stiffness: 120, damping: 9, mass: 0.7 }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabW]);

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });

  const onInnerLayout = (e: LayoutChangeEvent) => {
    // Ancho del área de contenido (barra − padding horizontal).
    setInnerW(e.nativeEvent.layout.width - BAR_PAD_H * 2);
  };

  // Réplica del handler de la BottomTabBar de react-navigation: navega por el
  // objeto route (target = key del navigator), respetando tabPress preventable.
  const onPress = (route: (typeof state.routes)[number], focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      Haptics.selectionAsync();
      navigation.dispatch({ ...CommonActions.navigate(route), target: state.key });
    }
  };

  const accent = colors.accent;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { paddingBottom: liquidTabBarBottom(insets.bottom) }]}
    >
      {/* Wrap con la SOMBRA de la barra (fuera del recorte del cristal) + ref del tour. */}
      <View ref={barRef} collapsable={false} onLayout={onBarLayout} style={styles.shadowWrap}>
        <GlassSurface style={styles.bar} glassEffectStyle="clear" onLayout={onInnerLayout}>
          {/* Velo blanco degradado del handoff (rgba .62→.38): da el look
              translúcido claro sobre el cristal 'clear' (el 'regular' solo se
              veía como plancha esmerilada sobre fondo plano). */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.62)', 'rgba(255,255,255,0.38)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.4, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Brillo superior (flourish del diseño). */}
          <LinearGradient
            pointerEvents="none"
            colors={['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)']}
            style={styles.streak}
          />

          {/* Píldora deslizante de acento. */}
          {pillW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pill,
                { width: pillW, transform: [{ translateX }, { scaleX }, { scaleY }] },
              ]}
            >
              <LinearGradient
                colors={[hexToRgba(accent, 0.30), hexToRgba(accent, 0.16)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.pillFill}
              />
            </Animated.View>
          )}

          {/* Pestañas. */}
          {state.routes.map((route, i) => {
            const focused = i === active;
            const { options } = descriptors[route.key];
            const label = (options.title ?? route.name) as string;
            const badge = options.tabBarBadge;
            const color = focused ? accent : colors.inkSoft;
            return (
              <Pressable
                key={route.key}
                onPress={() => onPress(route, focused)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={styles.tab}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={label}
              >
                <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                  <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={24} color={color} />
                  {badge != null && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{badge}</Text>
                    </View>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[styles.label, { color, fontFamily: focused ? fonts.bold : fonts.semibold }]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </GlassSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: SIDE_INSET,
  },
  shadowWrap: {
    borderRadius: BAR_RADIUS,
    // Sombra proyectada de la barra (base verdosa del diseño). iOS-only (glass).
    shadowColor: '#1e3719',
    shadowOpacity: 0.42,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
  },
  bar: {
    height: LIQUID_TABBAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
    paddingHorizontal: BAR_PAD_H,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  streak: {
    position: 'absolute', top: 2, left: 14, right: 14, height: 16,
    borderRadius: 20,
  },
  pill: {
    position: 'absolute', left: 0, top: PILL_INSET_V, bottom: PILL_INSET_V,
    borderRadius: PILL_RADIUS,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  pillFill: { flex: 1, borderRadius: PILL_RADIUS },
  tab: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  // Icono activo: sube un pelín, crece y añade un halo de acento (glow del diseño).
  iconWrapActive: {
    transform: [{ translateY: -1 }, { scale: 1.06 }],
    shadowColor: '#2f9e44',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  label: { fontSize: 11.5, letterSpacing: 0.2 },
  badge: {
    position: 'absolute', top: -5, right: -9,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: '#df4b2e',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 9.5 },
});
