/**
 * BootLoader — pantalla de carga de marca que se muestra en el arranque en frío
 * mientras se resuelven sesión, perfil y demás estado inicial (ver
 * src/navigation/index.tsx). Sustituye al antiguo `return null`, que dejaba un
 * frame en blanco al ocultarse el splash nativo demasiado pronto.
 *
 * Oculta el splash NATIVO en su primer layout (con fade), de modo que el splash
 * nativo entrega el relevo a esta pantalla animada sin parpadeo. Como el
 * navigator siempre renderiza este componente primero en cada arranque, es el
 * único sitio que oculta el splash.
 */
import { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, StatusBar,
} from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';

const LOGO = require('../../assets/quefalta-logo-blue.png');

// Pantalla de marca con apariencia FIJA (igual que LoginScreen): fondo azul claro
// del logo y texto en tinta casi negra, para que se lea bien en claro y oscuro.
const LOGO_BG = '#E1EBF7';
const BRAND_INK = '#2b2521';

export default function BootLoader() {
  const styles = useThemedStyles(themedStyles);

  // Aparición del conjunto (fade + leve subida) y latido continuo del logo.
  const enter = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const splashHidden = useRef(false);

  useEffect(() => {
    Animated.timing(enter, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [enter, pulse]);

  // Entrega del relevo: oculta el splash nativo una sola vez, ya pintada esta
  // pantalla (onLayout garantiza que hay layout antes de descubrir el nativo).
  const hideNativeSplash = () => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });

  return (
    <View style={styles.container} onLayout={hideNativeSplash}>
      <StatusBar barStyle="dark-content" backgroundColor={LOGO_BG} />

      <Animated.View style={[styles.content, { opacity: enter, transform: [{ translateY }] }]}>
        <Animated.Image
          source={LOGO}
          resizeMode="contain"
          style={[styles.logo, { transform: [{ scale }] }]}
        />

        <Text style={styles.brand}>QuéFalta</Text>
      </Animated.View>

      {/* Indicador de progreso: tres puntos que laten desfasados */}
      <Animated.View style={[styles.dots, { opacity: enter }]}>
        <Dot pulse={pulse} delay={0} color={colors.accent} />
        <Dot pulse={pulse} delay={0.33} color={colors.accent} />
        <Dot pulse={pulse} delay={0.66} color={colors.accent} />
      </Animated.View>
    </View>
  );
}

/** Punto que sube y baja la opacidad siguiendo el latido global, desfasado. */
function Dot({ pulse, delay, color }: { pulse: Animated.Value; delay: number; color: string }) {
  // Desfasa el latido por punto rotando la fase del valor 0→1.
  const phased = Animated.add(pulse, new Animated.Value(delay));
  const opacity = phased.interpolate({
    inputRange: [0, 0.5, 1, 1.5],
    outputRange: [0.3, 1, 0.3, 1],
    extrapolate: 'clamp',
  });
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity }} />;
}

const themedStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LOGO_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    gap: 22,
  },
  logo: {
    width: 160,
    height: 133, // mantiene la proporción del recorte (552×458)
  },
  brand: {
    fontSize: 30,
    fontFamily: fonts.bold,
    color: BRAND_INK,
    letterSpacing: -0.5,
  },
  dots: {
    position: 'absolute',
    bottom: 64,
    flexDirection: 'row',
    gap: 8,
  },
});
