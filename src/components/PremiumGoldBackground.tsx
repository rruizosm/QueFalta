import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface Props {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  active?: boolean;
  /** Opacidad de la capa dorada base; no afecta al contenido. */
  baseOpacity?: number;
}

type Percent = `${number}%`;

interface GoldParticle {
  left: Percent;
  top: Percent;
  size: number;
  phase: number;
  travelX: number;
  travelY: number;
  rotation: `${number}deg`;
  color: string;
  kind: 'flake' | 'spark';
}

export const PREMIUM_GOLD_INK = '#593500';

const PARTICLES: GoldParticle[] = [
  { left: '7%', top: '24%', size: 6, phase: 0.08, travelX: 15, travelY: -13, rotation: '22deg', color: '#FFF6C7', kind: 'flake' },
  { left: '14%', top: '68%', size: 4, phase: 0.62, travelX: -9, travelY: -17, rotation: '-28deg', color: '#FFFDF0', kind: 'spark' },
  { left: '23%', top: '38%', size: 5, phase: 0.34, travelX: 11, travelY: 15, rotation: '48deg', color: '#C27600', kind: 'flake' },
  { left: '31%', top: '76%', size: 7, phase: 0.81, travelX: 17, travelY: -12, rotation: '-16deg', color: '#FFF0A0', kind: 'flake' },
  { left: '40%', top: '18%', size: 4, phase: 0.46, travelX: -13, travelY: 16, rotation: '36deg', color: '#FFFFFF', kind: 'spark' },
  { left: '48%', top: '57%', size: 6, phase: 0.15, travelX: 9, travelY: -18, rotation: '-42deg', color: '#B66D00', kind: 'flake' },
  { left: '57%', top: '30%', size: 5, phase: 0.73, travelX: -16, travelY: 13, rotation: '18deg', color: '#FFF8D4', kind: 'spark' },
  { left: '64%', top: '72%', size: 8, phase: 0.27, travelX: 14, travelY: -15, rotation: '52deg', color: '#F4C449', kind: 'flake' },
  { left: '72%', top: '42%', size: 4, phase: 0.91, travelX: -10, travelY: 18, rotation: '-20deg', color: '#FFFFFF', kind: 'spark' },
  { left: '80%', top: '20%', size: 7, phase: 0.53, travelX: 13, travelY: 14, rotation: '31deg', color: '#A95F00', kind: 'flake' },
  { left: '87%', top: '66%', size: 5, phase: 0.2, travelX: -15, travelY: -14, rotation: '-35deg', color: '#FFF3B8', kind: 'flake' },
  { left: '94%', top: '35%', size: 4, phase: 0.7, travelX: 8, travelY: 17, rotation: '45deg', color: '#FFFFFF', kind: 'spark' },
];

let nextBackgroundSeed = 0;

/** Fondo dorado animado con brillos, virutas y partículas para accesos Plus. */
export default function PremiumGoldBackground({
  children,
  style,
  active = true,
  baseOpacity = 0.3,
}: Props) {
  const goldOpacity = Math.max(0, Math.min(1, baseOpacity));
  const seedRef = useRef<number | null>(null);
  if (seedRef.current === null) {
    seedRef.current = nextBackgroundSeed;
    nextBackgroundSeed += 1;
  }
  const instanceSeed = seedRef.current;
  const flow = useRef(new Animated.Value(0)).current;
  const particleMotions = useRef(
    PARTICLES.map(() => new Animated.Value(0)),
  ).current;
  const [particleAreaHeight, setParticleAreaHeight] = useState(78);
  const reducedMotion = useReducedMotion();
  const instanceParticles = useMemo<GoldParticle[]>(() => PARTICLES.map((particle, index) => {
    const direction = (instanceSeed + index) % 2 === 0 ? 1 : -1;
    const verticalDirection = (instanceSeed * 2 + index) % 3 === 0 ? -1 : 1;
    const left = 4 + ((parseFloat(particle.left) + instanceSeed * 11.3 + index * 2.1) % 92);
    const top = 10 + ((parseFloat(particle.top) + instanceSeed * 13.7 + index * 4.3) % 70);
    const rotation = -55 + ((parseFloat(particle.rotation) + instanceSeed * 19 + index * 7) % 110);

    return {
      ...particle,
      left: `${left}%` as Percent,
      top: `${top}%` as Percent,
      size: Math.max(3, particle.size + ((instanceSeed + index) % 3) - 1),
      phase: (
        particle.phase
        + parseFloat(particle.top) / 100
        + instanceSeed * 0.197
        + index * 0.031
      ) % 1,
      travelX: particle.travelX * direction * (0.82 + ((instanceSeed + index) % 4) * 0.09),
      travelY: particle.travelY * verticalDirection * (0.84 + ((instanceSeed * 2 + index) % 4) * 0.08),
      rotation: `${rotation}deg` as `${number}deg`,
    };
  }), [instanceSeed]);

  useEffect(() => {
    flow.stopAnimation();
    particleMotions.forEach((motion) => {
      motion.stopAnimation();
      motion.setValue(0);
    });
    flow.setValue((0.23 + instanceSeed * 0.173) % 1);

    if (!active || reducedMotion) return undefined;

    const flowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(flow, {
          toValue: 1,
          duration: 2450 + (instanceSeed % 5) * 230,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flow, {
          toValue: 0,
          duration: 2670 + (instanceSeed % 4) * 270,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const fallingAnimations = particleMotions.map((motion, index) => (
      Animated.loop(
        Animated.timing(motion, {
          toValue: 1,
          duration: 3000 + ((instanceSeed * 491 + index * 337) % 2800),
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      )
    ));
    const animation = Animated.parallel([flowAnimation, ...fallingAnimations]);

    animation.start();
    return () => animation.stop();
  }, [active, flow, instanceSeed, particleMotions, reducedMotion]);

  const flowX = flow.interpolate({
    inputRange: [0, 1],
    outputRange: [-130, 130],
  });

  return (
    <View
      style={[styles.container, { backgroundColor: `rgba(217,148,13,${goldOpacity})` }, style]}
      onLayout={(event) => {
        const nextHeight = event.nativeEvent.layout.height;
        if (nextHeight > 0 && nextHeight !== particleAreaHeight) {
          setParticleAreaHeight(nextHeight);
        }
      }}
    >
      <LinearGradient
        colors={[
          `rgba(181,106,0,${goldOpacity})`,
          `rgba(229,165,27,${goldOpacity})`,
          `rgba(255,228,123,${goldOpacity})`,
          `rgba(213,139,8,${goldOpacity})`,
          `rgba(255,240,163,${goldOpacity})`,
          `rgba(199,122,0,${goldOpacity})`,
        ]}
        locations={[0, 0.2, 0.38, 0.58, 0.78, 1]}
        start={{ x: 0, y: 0.2 }}
        end={{ x: 1, y: 0.8 }}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View
        pointerEvents="none"
        style={[styles.flow, { transform: [{ translateX: flowX }, { rotate: '-9deg' }] }]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.78)', 'rgba(255,248,195,0.2)', 'transparent']}
          locations={[0, 0.28, 0.48, 0.66, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {instanceParticles.map((particle, index) => {
          const phase = Animated.modulo(
            Animated.add(particleMotions[index], particle.phase),
            1,
          );
          const translateX = phase.interpolate({
            inputRange: [0, 0.34, 0.7, 1],
            outputRange: [
              -particle.travelX / 2,
              particle.travelX / 2,
              -particle.travelX * 0.15,
              -particle.travelX / 2,
            ],
          });
          const translateY = phase.interpolate({
            inputRange: [0, 1],
            outputRange: [-particle.size - 5, particleAreaHeight + particle.size + 5],
          });
          const opacity = phase.interpolate({
            inputRange: [0, 0.06, 0.88, 1],
            outputRange: [0, 0.9, 0.7, 0],
          });
          const scale = phase.interpolate({
            inputRange: [0, 0.1, 0.82, 1],
            outputRange: [0.7, 1, 0.88, 0.7],
          });
          const fallingRotation = phase.interpolate({
            inputRange: [0, 1],
            outputRange: [
              '0deg',
              `${particle.travelX >= 0 ? 240 : -240}deg`,
            ],
          });

          return (
            <Animated.View
              key={`${particle.left}-${particle.top}-${index}`}
              style={[
                styles.particle,
                particle.kind === 'spark' ? styles.spark : styles.flake,
                {
                  left: particle.left,
                  top: 0,
                  width: particle.size,
                  height: particle.kind === 'spark' ? particle.size : Math.max(2, particle.size * 0.38),
                  backgroundColor: particle.color,
                  opacity,
                  transform: [
                    { translateX },
                    { translateY },
                    { rotate: particle.rotation },
                    { rotate: fallingRotation },
                    { scale },
                  ],
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 20,
  },
  flow: {
    position: 'absolute',
    width: '125%',
    height: 190,
    left: '-12.5%',
    top: -56,
  },
  particle: { position: 'absolute' },
  flake: { borderRadius: 2 },
  spark: { borderRadius: 999 },
  content: { flex: 1 },
});
