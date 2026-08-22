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
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTheme } from '../context/ThemeContext';

const HEIGHT = 40;
const RADIUS = 20;
const EMPHASIZED_HEIGHT = 44;
const EMPHASIZED_RADIUS = 22;
const PAD = 3; // padding interno de la pista (la píldora corre dentro de él)
const PILL_RADIUS = RADIUS - PAD;
const EMPHASIZED_PILL_RADIUS = EMPHASIZED_RADIUS - PAD;
const COMPACT_SEG_W = 42; // ancho fijo de cada segmento en modo icono (compact)
const DENSE_COMPACT_SEG_W = 32;

export interface Segment<K extends string> {
  key: K;
  /** Etiqueta de texto; omítela para un segmento SOLO icono (modo compact). */
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  accessibilityLabel?: string;
}

interface Props<K extends string> {
  segments: Segment<K>[];
  value: K | null;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  /** Segmentos cuadrados de ancho fijo y solo icono (p. ej. lista/cuadrícula). */
  compact?: boolean;
  /** Variante más estrecha para filas con varios controles compactos. */
  dense?: boolean;
  /** Refuerza el perímetro para selectores principales sobre Liquid Glass. */
  emphasized?: boolean;
  activationDirection?: 'fromStart' | 'fromEnd';
}

function hexToRgba(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default function SlidingSegments<K extends string>({
  segments, value, onChange, style, compact = false, dense = false, emphasized = false,
  activationDirection,
}: Props<K>) {
  const { scheme } = useTheme();
  const reducedMotion = useReducedMotion();
  const active = value == null ? -1 : Math.max(0, segments.findIndex((s) => s.key === value));

  // La píldora usa la geometría REAL del segmento. Inferirla desde el ancho
  // exterior de la pista desalineaba unos píxeles los controles compactos por
  // la combinación de padding, borde y redondeo a píxeles del dispositivo.
  const [segmentLayouts, setSegmentLayouts] = useState<
    ({ x: number; width: number } | undefined)[]
  >([]);
  const activeLayout = active >= 0 ? segmentLayouts[active] : undefined;
  const activeX = activeLayout?.x;
  const activeW = activeLayout?.width ?? 0;

  const translateX = useRef(new Animated.Value(0)).current;
  const stretch = useRef(new Animated.Value(0)).current;
  const settled = useRef(false); // primer posicionamiento sin animar
  const wasInactive = useRef(value == null);

  useEffect(() => {
    if (active < 0) {
      wasInactive.current = true;
      return;
    }
    if (activeX == null || activeW <= 0) return;
    const target = activeX;
    if (reducedMotion) {
      translateX.setValue(target);
      stretch.setValue(0);
      settled.current = true;
      wasInactive.current = false;
      return;
    }
    const animateActivation = Boolean(activationDirection && wasInactive.current);
    if (!settled.current) {
      settled.current = true;
      if (!animateActivation) {
        translateX.setValue(target);
        wasInactive.current = false;
        return;
      }
    }
    if (animateActivation) {
      const origin = activationDirection === 'fromStart' ? target - activeW : target + activeW;
      translateX.setValue(origin);
    }
    wasInactive.current = false;
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
  }, [active, activeW, activeX, activationDirection, reducedMotion, stretch, translateX]);

  const scaleX = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const scaleY = stretch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] });

  const onSegmentLayout = (index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setSegmentLayouts((current) => {
      const previous = current[index];
      if (previous?.x === x && previous.width === width) return current;
      const next = [...current];
      next[index] = { x, width };
      return next;
    });
  };

  const accent = colors.accent;
  const compactTrackWidth = compact
    ? segments.length * (dense ? DENSE_COMPACT_SEG_W : COMPACT_SEG_W) + PAD * 2 + 2
    : undefined;
  const emphasizedTrackColors = scheme === 'dark'
    ? {
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderColor: 'rgba(255,255,255,0.20)',
      }
    : {
        backgroundColor: 'rgba(255,255,255,0.38)',
        borderColor: 'rgba(43,37,33,0.10)',
      };

  const track = (
    <View
      style={[
        styles.track,
        compact && styles.trackCompact,
        emphasized && (compact ? styles.trackEmphasizedCompact : styles.trackEmphasized),
        emphasized && emphasizedTrackColors,
        !emphasized && style,
      ]}
    >
      {emphasized && <View pointerEvents="none" style={styles.trackHighlight} />}

      {/* Píldora deslizante de acento. */}
      {activeW > 0 && active >= 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            emphasized && !compact && styles.pillEmphasized,
            { width: activeW, transform: [{ translateX }, { scaleX }, { scaleY }] },
          ]}
        >
          <LinearGradient
            colors={emphasized
              ? [hexToRgba(accent, 0.36), hexToRgba(accent, 0.20)]
              : [hexToRgba(accent, 0.30), hexToRgba(accent, 0.16)]}
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
            style={[styles.seg, compact && styles.segCompact, dense && styles.segDense]}
            onLayout={(e) => onSegmentLayout(i, e)}
            accessibilityRole="button"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={s.accessibilityLabel ?? s.label}
            onPress={() => {
              if (!focused) {
                Haptics.selectionAsync();
                onChange(s.key);
              }
            }}
          >
            {s.icon ? (
              <Ionicons
                name={s.icon}
                size={s.label ? 13 : 19}
                color={color}
                style={s.icon === 'grid' && !s.label ? styles.gridIconOptical : undefined}
              />
            ) : null}
            {s.label ? (
              <Text style={[
                styles.label,
                dense && styles.labelDense,
                emphasized && !compact && styles.labelEmphasized,
                { color, fontFamily: focused ? fonts.bold : fonts.semibold },
              ]}>
                {s.label}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (!emphasized) return track;

  return (
    <View
      style={[
        styles.emphasizedShell,
        compact && styles.trackCompact,
        compact ? styles.emphasizedShellCompact : styles.emphasizedShellLarge,
        compactTrackWidth != null && { width: compactTrackWidth },
        style,
      ]}
    >
      {track}
    </View>
  );
}

// La variante base conserva los velos blancos de LiquidGlassTabBar. La variante
// principal refuerza el contorno según el tema; texto y acento se resuelven inline.
const styles = StyleSheet.create({
  track: {
    height: HEIGHT, borderRadius: RADIUS, padding: PAD,
    flexDirection: 'row', alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.55)',
    overflow: 'hidden',
  },
  // Compact: la pista se ciñe a su contenido (segmentos de ancho fijo).
  trackCompact: { alignSelf: 'center' },
  emphasizedShell: {
    shadowColor: '#000',
    shadowOpacity: 0.11,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  emphasizedShellCompact: { height: HEIGHT, borderRadius: RADIUS },
  emphasizedShellLarge: { height: EMPHASIZED_HEIGHT, borderRadius: EMPHASIZED_RADIUS },
  trackEmphasized: {
    flex: 1,
    height: EMPHASIZED_HEIGHT,
    borderRadius: EMPHASIZED_RADIUS,
  },
  trackEmphasizedCompact: { flex: 1, height: HEIGHT, borderRadius: RADIUS },
  trackHighlight: {
    position: 'absolute',
    top: 1,
    left: 10,
    right: 10,
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  pill: {
    position: 'absolute', left: 0, top: PAD, bottom: PAD,
    borderRadius: PILL_RADIUS,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)',
    overflow: 'hidden',
  },
  pillEmphasized: { borderRadius: EMPHASIZED_PILL_RADIUS },
  pillFill: { flex: 1, borderRadius: PILL_RADIUS },
  seg: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
  },
  // Compact: ancho fijo (cuadrado) en vez de repartir el espacio.
  segCompact: { flex: 0, width: COMPACT_SEG_W },
  segDense: { width: DENSE_COMPACT_SEG_W },
  // El contorno de `grid` queda visualmente cargado a la izquierda dentro de
  // su caja tipográfica; 1 pt lo centra ópticamente en la píldora circular.
  gridIconOptical: { transform: [{ translateX: 1 }] },
  label: { fontSize: 12.5, letterSpacing: 0.1 },
  labelEmphasized: { fontSize: 13 },
  labelDense: { fontSize: 10 },
});
