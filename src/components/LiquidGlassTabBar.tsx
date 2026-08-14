/**
 * LiquidGlassTabBar — barra de pestañas FLOTANTE de cristal (diseño liquid
 * glass, iOS 26). Sigue la composición de la barra nativa de Palabra: una
 * superficie clara, muy redondeada y una cápsula tintada que se desliza bajo la
 * pestaña activa con un gesto elástico (squash-and-stretch).
 *
 * Solo se usa cuando `glassAvailable` (iOS 26+). En Android / iOS ≤ 18 la app
 * sigue con la BottomTabBar clásica de react-navigation (ver navigation/index).
 *
 * Adaptaciones al entorno de la app (lo que pide el README del handoff):
 *  - La selección toma el acento elegido por el usuario. Los iconos son
 *    Ionicons del propio set de la app.
 *  - El cristal (backdrop-filter) → `GlassSurface` (GlassView nativo).
 *  - El deslizamiento con overshoot → `Animated.spring` (driver nativo).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet, Text, View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CommonActions } from '@react-navigation/native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme } from '../context/ThemeContext';
import GlassSurface from './GlassSurface';
import { useReducedMotion } from '../hooks/useReducedMotion';

/** Alto de la barra de cristal (sin contar hueco inferior ni área segura). */
export const LIQUID_TABBAR_HEIGHT = 62;

/** Separación efectiva de la barra al borde INFERIOR de la pantalla. La barra
 *  flotante se mete en el área segura (puede convivir con el home indicator,
 *  como la tab bar nativa de iOS 26) pero sin llegar a tocarlo: en iPhones con
 *  indicador (inset 34) queda a 18 del borde; sin indicador, a 8. */
export function liquidTabBarBottom(insetBottom: number): number {
  return Math.max(insetBottom - 16, 8);
}

const SIDE_INSET = 12;
const BAR_RADIUS = 31;
const BAR_PAD_H = 4;
const PILL_RADIUS = 26;
const PILL_INSET_V = 5;
const PILL_SIDE_INSET = 2;

/** Iconos (Ionicons outline, el set de la app) por nombre de ruta. */
const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  Home:    'home-outline',
  Catalog: 'grid-outline',
  List:    'basket-outline',
  Groups:  'people-outline',
};

export default function LiquidGlassTabBar({
  state, navigation, descriptors,
}: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { scheme } = useTheme();
  const reducedMotion = useReducedMotion();
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
    if (reducedMotion) {
      translateX.setValue(target);
      stretch.setValue(0);
      settled.current = true;
      return;
    }
    if (!settled.current) {
      translateX.setValue(target);       // coloca sin animación al medir
      settled.current = true;
      return;
    }
    // Deslizamiento con overshoot (curva spring del diseño) + pulso de estiramiento
    // a lo largo del eje de viaje: lo que se lee como "líquido".
    Animated.spring(translateX, {
      toValue: target, useNativeDriver: true,
      stiffness: 260, damping: 24, mass: 0.78,
    }).start();
    Animated.sequence([
      Animated.timing(stretch, { toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(stretch, { toValue: 0, useNativeDriver: true, stiffness: 210, damping: 18, mass: 0.7 }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, tabW, reducedMotion, stretch, translateX]);

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.96] });

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

  const selectedFill = scheme === 'dark' ? colors.accentMid : colors.accentLight;
  const glassVeil = scheme === 'dark'
    ? ['rgba(38,32,25,0.88)', 'rgba(38,32,25,0.72)'] as const
    : ['rgba(255,255,255,0.72)', 'rgba(255,255,255,0.52)'] as const;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.root, { paddingBottom: liquidTabBarBottom(insets.bottom) }]}
    >
      {/* Wrap con la SOMBRA de la barra (fuera del recorte del cristal). */}
      <View style={styles.shadowWrap}>
        <GlassSurface style={styles.bar} glassEffectStyle="clear" onLayout={onInnerLayout}>
          {/* Velo blanco degradado del handoff (rgba .62→.38): da el look
              translúcido claro sobre el cristal 'clear' (el 'regular' solo se
              veía como plancha esmerilada sobre fondo plano). */}
          <LinearGradient
            pointerEvents="none"
            colors={glassVeil}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.4, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {/* Cápsula tintada de selección. */}
          {pillW > 0 && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.pill,
                { width: pillW, transform: [{ translateX }, { scaleX }, { scaleY }] },
              ]}
            >
              <LinearGradient
                colors={[selectedFill, selectedFill]}
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
            const color = focused ? colors.accent : colors.inkSoft;
            return (
              <Pressable
                key={route.key}
                onPress={() => onPress(route, focused)}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={styles.tab}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={label}
              >
                <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                  <Ionicons name={ICONS[route.name] ?? 'ellipse-outline'} size={23} color={color} />
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
    shadowColor: '#2b2521',
    shadowOpacity: 0.13,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  bar: {
    height: LIQUID_TABBAR_HEIGHT,
    borderRadius: BAR_RADIUS,
    overflow: 'hidden',
    paddingHorizontal: BAR_PAD_H,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.48)',
  },
  pill: {
    position: 'absolute', left: 0, top: PILL_INSET_V, bottom: PILL_INSET_V,
    borderRadius: PILL_RADIUS,
    overflow: 'hidden',
  },
  pillFill: { flex: 1, borderRadius: PILL_RADIUS },
  tab: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  // El activo gana presencia sin cambiar de icono, igual que la barra nativa.
  iconWrapActive: {
    transform: [{ scale: 1.04 }],
  },
  label: { fontSize: 10, letterSpacing: 0 },
  badge: {
    position: 'absolute', top: -5, right: -9,
    minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4,
    backgroundColor: '#df4b2e',
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { color: '#ffffff', fontFamily: fonts.bold, fontSize: 9.5 },
});
