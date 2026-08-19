/**
 * Puente neutro entre el splash nativo y la primera pantalla real.
 * No muestra la marca ni el icono: en una primera apertura, el primer elemento
 * reconocible debe ser la burbuja interactiva del login.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, StatusBar, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function BootLoader() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const pulse = useRef(new Animated.Value(reducedMotion ? 1 : 0.35)).current;
  const splashHidden = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(1);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.35,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  const hideNativeSplash = () => {
    if (splashHidden.current) return;
    splashHidden.current = true;
    SplashScreen.hideAsync().catch(() => {});
  };

  return (
    <View
      style={styles.container}
      onLayout={hideNativeSplash}
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
    >
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <Animated.View style={[styles.progressDot, { opacity: pulse }]} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
