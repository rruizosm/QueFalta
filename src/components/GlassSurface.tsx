/**
 * GlassSurface — superficie con Liquid Glass (iOS 26+) y fallback temado.
 *
 * Único punto de la app donde se decide cristal vs fondo normal (regla de
 * LIQUID-GLASS.md): las pantallas usan este componente, NUNCA GlassView
 * directo ni ramas Platform.OS.
 *
 * El cristal solo se activa si el BUILD lleva el módulo nativo de
 * expo-glass-effect Y el dispositivo es iOS 26+. En cualquier otro caso —
 * Android, iOS ≤ 18, o un update OTA corriendo sobre un build viejo sin el
 * módulo — renderiza una View opaca con `fallbackColor`, idéntica a la app de
 * siempre. El require es perezoso y va en try/catch porque el import del
 * paquete resuelve el módulo nativo a nivel de módulo (GlassView.ios.js) y en
 * un build sin él lanza excepción: los builds viejos ni lo tocan.
 */
import React from 'react';
import { Platform, View, ViewProps } from 'react-native';
import { colors } from '../constants/colors';
import { useTheme } from '../context/ThemeContext';

type GlassModule = typeof import('expo-glass-effect');

let glass: GlassModule | null = null;
if (Platform.OS === 'ios') {
  try {
    const mod: GlassModule = require('expo-glass-effect');
    if (mod.isLiquidGlassAvailable()) glass = mod; // false en iOS ≤ 18
  } catch {
    glass = null; // build sin el módulo nativo (p. ej. OTA sobre un build viejo)
  }
}

/**
 * true solo cuando este build + dispositivo pintan cristal de verdad.
 * Para las decisiones de layout que acompañan al glass (p. ej. tab bar en
 * position:absolute en F1): en fallback el layout debe quedar como hoy.
 */
export const glassAvailable = glass !== null;

interface Props extends ViewProps {
  /** Tinte del cristal (p. ej. colors.accentLight). Ignorado en fallback. */
  tintColor?: string;
  /** 'regular' = legible (por defecto) · 'clear' = más transparente. */
  glassEffectStyle?: 'regular' | 'clear';
  /** Efecto nativo al toque, para botones de cristal (campana en F2). */
  interactive?: boolean;
  /** Fondo del fallback. Por defecto colors.white (superficie de tarjeta). */
  fallbackColor?: string;
}

export default function GlassSurface({
  tintColor,
  glassEffectStyle = 'regular',
  interactive = false,
  fallbackColor,
  style,
  children,
  ...rest
}: Props) {
  // Tema del cristal: NO se usa la prop `colorScheme` del paquete — no
  // re-aplica el efecto al ponerse (expo/expo#43743) y en el primer build de
  // F1 el material salía OSCURO con todo en claro. En su lugar, ThemeContext
  // alinea el trait nativo con Appearance.setColorScheme() (el cristal en
  // 'auto' lo hereda al crearse) y el `key` remonta la vista al cambiar el
  // tema en caliente, porque el efecto tampoco se refresca solo con el trait.
  const { scheme } = useTheme();

  if (glass) {
    const NativeGlass = glass.GlassView;
    return (
      <NativeGlass
        key={scheme}
        style={style}
        glassEffectStyle={glassEffectStyle}
        tintColor={tintColor}
        isInteractive={interactive}
        {...rest}
      >
        {children}
      </NativeGlass>
    );
  }

  return (
    <View style={[{ backgroundColor: fallbackColor ?? colors.white }, style]} {...rest}>
      {children}
    </View>
  );
}
