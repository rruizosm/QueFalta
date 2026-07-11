/**
 * SlidingSegments — conmutador segmentado con PÍLDORA deslizante de acento.
 *
 * Réplica a escala de control del lenguaje de LiquidGlassTabBar (F1b):
 * Animated.spring con overshoot + pulso de estiramiento (squash-and-stretch)
 * al cambiar de segmento, píldora en degradado de acento con borde claro.
 *
 * SOLO para el chrome de cristal de las pantallas glass (F3): vive SOBRE un
 * GlassSurface del padre y por eso NO pinta cristal propio (regla F5: no
 * anidar GlassSurface) — su pista es un velo translúcido. En fallback cada
 * pantalla conserva su switcher clásico intacto (ver PriceChangesScreen).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated, Easing, Pressable, StyleSheet, Text, View,
  type LayoutChangeEvent, type StyleProp, type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';

const HEIGHT = 40;
const RADIUS = 20;
const PAD = 3; // padding interno de la pista (la píldora corre dentro de él)
const PILL_RADIUS = RADIUS - PAD;

export interface Segment<K extends string> {
  key: K;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props<K extends string> {
  segments: Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
}

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function SlidingSegments<K extends string>({
  segments, value, onChange, style,
}: Props<K>) {
  const n = segments.length;
  const active = Math.max(0, segments.findIndex((s) => s.key === value));

  // Ancho interno (pista − padding) medido, para la geometría de la píldora.
  const [innerW, setInnerW] = useState(0);
  const tabW = innerW > 0 ? innerW / n : 0;

  const translateX = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const settled = useRef(false); // primer posicionamiento sin animar

  useEffect(() => {
    if (tabW <= 0) return;
    const target = PAD + tabW * active;
    if (!settled.current) {
      translateX.setValue(target); // coloca sin animación al medir
      settled.current = true;
      return;
    }
    // Deslizamiento con overshoot + pulso de estiramiento en el eje de viaje
    // (el "líquido"), mismas curvas que la tab bar de cristal.
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

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

  const onLayout = (e: LayoutChangeEvent) =>
    setInnerW(e.nativeEvent.layout.width - PAD * 2);

  const accent = colors.accent;

  return (
    <View style={[styles.track, style]} onLayout={onLayout}>
      {/* Píldora deslizante de acento. */}
      {tabW > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { width: tabW, transform: [{ translateX }, { scaleX }, { scaleY }] },
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

      {segments.map((s, i) => {
        const focused = i === active;
        const color = focused ? accent : colors.inkSoft;
        return (
          <Pressable
            key={s.key}
            style={styles.seg}
            accessibilityRole="button"
            accessibilityState={focused ? { selected: true } : {}}
            accessibilityLabel={s.label}
            onPress={() => {
              if (!focused) {
                Haptics.selectionAsync();
                onChange(s.key);
              }
            }}
          >
            {s.icon ? <Ionicons name={s.icon} size={13} color={color} /> : null}
            <Text style={[styles.label, { color, fontFamily: focused ? fonts.bold : fonts.semibold }]}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Velos/bordes blancos fijos (no temados), como en LiquidGlassTabBar: son el
// lenguaje del material de cristal; los colores de texto sí van temados inline.
const styles = StyleSheet.create({
  track: {
    height: HEIGHT, borderRadius: RADIUS, padding: PAD,
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  pill: {
    position: 'absolute', left: 0, top: PAD, bottom: PAD,
    borderRadius: PILL_RADIUS,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  pillFill: { flex: 1, borderRadius: PILL_RADIUS },
  seg: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  label: { fontSize: 12.5, letterSpacing: 0.1 },
});
