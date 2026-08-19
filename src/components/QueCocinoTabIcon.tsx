import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  focused: boolean;
}

/** Logo de la pestaña QuéCocino. Conserva el reflejo del CTA original. */
export default function QueCocinoTabIcon({ focused }: Props) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const shine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    shine.setValue(0);
    if (reducedMotion) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(650),
        Animated.timing(shine, {
          toValue: 1,
          duration: 1050,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1700),
        Animated.timing(shine, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [reducedMotion, shine]);

  const translateX = shine.interpolate({
    inputRange: [0, 1],
    outputRange: [-52, 62],
  });

  return (
    <View
      style={[styles.logo, focused && styles.logoFocused]}
      accessible={false}
      importantForAccessibility="no"
    >
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />
      <Animated.View
        pointerEvents="none"
        style={[styles.shine, { transform: [{ translateX }, { rotate: '16deg' }] }]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.62)', 'rgba(255,255,255,0)']}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Ionicons name="restaurant" size={20} color="#ffffff" />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  logo: {
    width: 42, height: 42, borderRadius: 15, overflow: 'hidden',
    backgroundColor: colors.accent,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.36)',
    alignItems: 'center', justifyContent: 'center',
  },
  logoFocused: {
    transform: [{ scale: 1.06 }],
    borderColor: 'rgba(255,255,255,0.72)',
  },
  glowTop: {
    position: 'absolute', width: 54, height: 54, borderRadius: 27,
    top: -39, right: -5, backgroundColor: 'rgba(255,255,255,0.25)',
  },
  glowBottom: {
    position: 'absolute', width: 38, height: 38, borderRadius: 19,
    bottom: -28, left: 2, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  shine: {
    position: 'absolute', top: -18, bottom: -18, left: 0,
    width: 25,
  },
});
