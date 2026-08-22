import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts } from '../constants/typography';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from '../context/LanguageContext';
import VerifiedBadge from './VerifiedBadge';

interface Props {
  visible: boolean;
  onDismiss: () => void;
}

interface CelebrationParticle {
  left: number;
  top: number;
  size: number;
  phase: number;
  driftX: number;
  color: string;
  kind: 'spark' | 'flake';
}

const PARTICLES: CelebrationParticle[] = [
  { left: 8, top: 18, size: 7, phase: 0.03, driftX: 16, color: '#FFF0A0', kind: 'flake' },
  { left: 16, top: 48, size: 4, phase: 0.38, driftX: -11, color: '#F4C449', kind: 'spark' },
  { left: 23, top: 8, size: 5, phase: 0.71, driftX: 14, color: '#FFFDF0', kind: 'spark' },
  { left: 28, top: 72, size: 8, phase: 0.16, driftX: -18, color: '#C27600', kind: 'flake' },
  { left: 36, top: 32, size: 5, phase: 0.57, driftX: 10, color: '#F7D25A', kind: 'flake' },
  { left: 43, top: 4, size: 4, phase: 0.86, driftX: -12, color: '#FFFFFF', kind: 'spark' },
  { left: 49, top: 80, size: 6, phase: 0.27, driftX: 17, color: '#D2900F', kind: 'flake' },
  { left: 57, top: 22, size: 7, phase: 0.64, driftX: -15, color: '#FFF6C7', kind: 'flake' },
  { left: 63, top: 64, size: 4, phase: 0.08, driftX: 11, color: '#FFFDF0', kind: 'spark' },
  { left: 70, top: 6, size: 6, phase: 0.43, driftX: -17, color: '#B66D00', kind: 'flake' },
  { left: 77, top: 42, size: 5, phase: 0.78, driftX: 13, color: '#FFE47B', kind: 'spark' },
  { left: 84, top: 75, size: 8, phase: 0.21, driftX: -14, color: '#A95F00', kind: 'flake' },
  { left: 91, top: 27, size: 4, phase: 0.52, driftX: 9, color: '#FFFFFF', kind: 'spark' },
  { left: 4, top: 68, size: 5, phase: 0.91, driftX: -9, color: '#E5A51B', kind: 'flake' },
  { left: 13, top: 84, size: 4, phase: 0.31, driftX: 14, color: '#FFF3B8', kind: 'spark' },
  { left: 32, top: 54, size: 4, phase: 0.82, driftX: -10, color: '#FFFFFF', kind: 'spark' },
  { left: 53, top: 46, size: 5, phase: 0.13, driftX: 13, color: '#D98F08', kind: 'flake' },
  { left: 67, top: 88, size: 4, phase: 0.48, driftX: -11, color: '#FFF8D4', kind: 'spark' },
  { left: 81, top: 15, size: 5, phase: 0.74, driftX: 12, color: '#F4C449', kind: 'flake' },
  { left: 95, top: 61, size: 6, phase: 0.25, driftX: -16, color: '#FFF0A0', kind: 'flake' },
];

export default function PlusWelcomeTransition({ visible, onDismiss }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [messageVisible, setMessageVisible] = useState(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const particleCycle = useRef(new Animated.Value(0)).current;

  const animations = useMemo(() => ({
    backdrop: Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: reducedMotion ? 0 : 1500,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }),
    reveal: Animated.timing(reveal, {
      toValue: 1,
      duration: reducedMotion ? 0 : 560,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
  }), [backdropOpacity, reducedMotion, reveal]);

  useEffect(() => {
    backdropOpacity.stopAnimation();
    reveal.stopAnimation();
    particleCycle.stopAnimation();
    backdropOpacity.setValue(0);
    reveal.setValue(0);
    particleCycle.setValue(0);
    setMessageVisible(false);

    if (!visible) return undefined;

    let particleLoop: Animated.CompositeAnimation | undefined;

    animations.backdrop.start(({ finished }) => {
      if (!finished) return;
      setMessageVisible(true);
      AccessibilityInfo.announceForAccessibility(
        `${t('paywall.welcomeTitle')}. ${t('paywall.welcomeBody')}`,
      );
      animations.reveal.start();

      if (reducedMotion) return;
      particleLoop = Animated.loop(
        Animated.timing(particleCycle, {
          toValue: 1,
          duration: 4200,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      particleLoop.start();
    });

    return () => {
      animations.backdrop.stop();
      animations.reveal.stop();
      particleLoop?.stop();
    };
  }, [
    animations,
    backdropOpacity,
    particleCycle,
    reducedMotion,
    reveal,
    t,
    visible,
  ]);

  if (!visible) return null;

  const badgeScale = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [0.68, 1],
  });
  const copyTranslateY = reveal.interpolate({
    inputRange: [0, 1],
    outputRange: [18, 0],
  });
  return (
    <View
      style={styles.root}
      accessibilityViewIsModal
      onAccessibilityEscape={onDismiss}
    >
      <StatusBar style="light" animated />
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />

      {messageVisible ? (
        <Animated.View style={[styles.closeWrap, { top: Math.max(insets.top, 12) + 8, opacity: reveal }]}>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('paywall.closeWelcome')}
          >
            <Ionicons name="close" size={22} color="#FFF6C7" />
          </TouchableOpacity>
        </Animated.View>
      ) : null}

      <View style={styles.celebration} pointerEvents={messageVisible ? 'auto' : 'none'}>
        <View style={styles.symbolStage} pointerEvents="none" accessible={false}>
          {messageVisible ? PARTICLES.map((particle, index) => {
            const phase = reducedMotion
              ? new Animated.Value(particle.phase)
              : Animated.modulo(Animated.add(particleCycle, particle.phase), 1);
            const translateX = phase.interpolate({
              inputRange: [0, 0.35, 0.7, 1],
              outputRange: [-particle.driftX * 0.5, particle.driftX, -particle.driftX * 0.2, -particle.driftX * 0.5],
            });
            const translateY = phase.interpolate({
              inputRange: [0, 1],
              outputRange: [22, -34],
            });
            const opacity = phase.interpolate({
              inputRange: [0, 0.1, 0.48, 0.88, 1],
              outputRange: [0, 0.95, 0.55, 0.9, 0],
            });
            const rotation = phase.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', particle.driftX > 0 ? '260deg' : '-260deg'],
            });

            return (
              <Animated.View
                key={`${particle.left}-${particle.top}`}
                style={[
                  styles.particle,
                  particle.kind === 'spark' ? styles.spark : styles.flake,
                  {
                    left: `${particle.left}%`,
                    top: `${particle.top}%`,
                    width: particle.size,
                    height: particle.kind === 'spark' ? particle.size : Math.max(2, particle.size * 0.38),
                    backgroundColor: particle.color,
                    opacity: Animated.multiply(opacity, reveal),
                    transform: [{ translateX }, { translateY }, { rotate: rotation }],
                  },
                ]}
              />
            );
          }) : null}

          <Animated.View
            style={[
              styles.badge,
              { opacity: reveal, transform: [{ scale: badgeScale }] },
            ]}
          >
            <VerifiedBadge size={118} marginLeft={0} tone="gold" />
          </Animated.View>
          <Animated.View style={[styles.sparkleIcon, { opacity: reveal, transform: [{ scale: badgeScale }] }]}> 
            <Ionicons name="sparkles" size={29} color="#FFE47B" />
          </Animated.View>
        </View>

        <Animated.View
          style={[
            styles.copy,
            { opacity: reveal, transform: [{ translateY: copyTranslateY }] },
          ]}
          accessible
          accessibilityRole="text"
        >
          <Text style={styles.title}>{t('paywall.welcomeTitle')}</Text>
          <Text style={styles.body}>{t('paywall.welcomeBody')}</Text>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030912',
  },
  closeWrap: {
    position: 'absolute',
    right: 18,
    zIndex: 4,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(244,196,73,0.38)',
  },
  celebration: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 18,
  },
  symbolStage: {
    width: 330,
    maxWidth: '100%',
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    shadowColor: '#F4C449',
    shadowOpacity: 1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 18,
  },
  sparkleIcon: {
    position: 'absolute',
    left: '66%',
    top: 45,
    shadowColor: '#F7D25A',
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  particle: {
    position: 'absolute',
    shadowColor: '#F4C449',
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  spark: { borderRadius: 999 },
  flake: { borderRadius: 2 },
  copy: {
    alignItems: 'center',
    maxWidth: 350,
    marginTop: -12,
  },
  title: {
    color: '#FFF8D4',
    fontFamily: fonts.bold,
    fontSize: 27,
    lineHeight: 34,
    letterSpacing: -0.6,
    textAlign: 'center',
    textShadowColor: 'rgba(210,144,15,0.72)',
    textShadowRadius: 12,
  },
  body: {
    color: 'rgba(255,255,255,0.82)',
    fontFamily: fonts.medium,
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginTop: 12,
  },
});
