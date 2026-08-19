import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { CATALOG_STORES } from '../constants/stores';
import { fonts } from '../constants/typography';
import GlassSurface from './GlassSurface';

const SETTLED_BUBBLE_SIZE = 82;
const BUBBLE_VIEWBOX_SIZE = 304;

const RETINA_SHADER_SOURCE = `
uniform float2 u_size;
uniform half3 u_accent;

float bell(float value, float width) {
  float normalized = value / width;
  return exp(-0.5 * normalized * normalized);
}

half4 main(float2 position) {
  float2 safeSize = max(u_size, float2(1.0));
  float2 uv = position / safeSize;
  float x = uv.x * 2.0 - 1.0;

  // Arco de lente: alto en los extremos y profundo en el centro.
  float wave = sin(x * 5.5) * 0.004;
  float curveY = 0.72 - 0.34 * x * x + wave;
  float distanceToArc = uv.y - curveY;
  float sideFade = 1.0 - smoothstep(0.91, 1.06, abs(x));

  // Aberracion cromatica en profundidad: luz fria arriba, sombra calida abajo.
  float glow = bell(distanceToArc + 0.006, 0.105) * 0.16;
  float ice = bell(distanceToArc + 0.057, 0.018) * 0.58;
  float cyan = bell(distanceToArc + 0.034, 0.032) * 0.88;
  float blue = bell(distanceToArc, 0.041) * 1.0;
  float violet = bell(distanceToArc - 0.046, 0.043) * 0.68;
  float pink = bell(distanceToArc - 0.088, 0.068) * 0.34;

  half3 electricBlue = mix(u_accent, half3(0.02, 0.34, 1.0), 0.42);
  half3 weightedColor =
    half3(0.84, 1.0, 1.0) * half(ice) +
    half3(0.05, 0.86, 1.0) * half(cyan) +
    electricBlue * half(blue) +
    half3(0.43, 0.25, 1.0) * half(violet) +
    half3(0.96, 0.55, 0.88) * half(pink) +
    half3(0.25, 0.68, 1.0) * half(glow);

  float weight = ice + cyan + blue + violet + pink + glow;
  half3 color = weightedColor / half(max(weight, 0.001));
  float alpha = clamp(weight * 0.82, 0.0, 0.94) * sideFade;

  return half4(color * half(alpha), half(alpha));
}
`;

type SkiaModule = typeof import('@shopify/react-native-skia');

let skiaModule: SkiaModule | null = null;
let retinaShader: ReturnType<SkiaModule['Skia']['RuntimeEffect']['Make']> = null;
try {
  // Perezoso para que una OTA sobre un build antiguo sin Skia mantenga el SVG.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- compatibilidad OTA con binarios sin Skia
  const loadedSkia: SkiaModule = require('@shopify/react-native-skia');
  skiaModule = loadedSkia;
  retinaShader = loadedSkia.Skia.RuntimeEffect.Make(RETINA_SHADER_SOURCE);
} catch {
  skiaModule = null;
  retinaShader = null;
}

const FOLLOW_SPRING = {
  stiffness: 300,
  damping: 30,
  mass: 3,
  reduceMotion: ReduceMotion.System,
} as const;

// Valores adaptados del experimento Wabi & More de quattro4maggi. Una masa
// alta y una velocidad inicial ascendente hacen que el encaje se sienta como
// la burbuja del vídeo de referencia, no como una transición de pantalla.
const SNAP_SPRING = {
  stiffness: 550,
  damping: 140,
  mass: 9,
  velocity: -300,
  reduceMotion: ReduceMotion.System,
} as const;

type StoreSlot = {
  dx: number;
  dy: number;
  size: number;
  rotation: number;
};

// Los 18 catálogos salen desde la burbuja y forman una nube irregular. Los
// offsets se calculan desde su posición encajada para conservar la composición
// en móviles estrechos sin dejar ningún supermercado fuera de pantalla.
const STORE_SLOTS: readonly StoreSlot[] = [
  { dx: -150, dy: -184, size: 44, rotation: -9 },
  { dx: -91,  dy: -214, size: 39, rotation: 6 },
  { dx: -27,  dy: -186, size: 45, rotation: -4 },
  { dx: 43,   dy: -215, size: 40, rotation: 8 },
  { dx: 112,  dy: -180, size: 45, rotation: -6 },
  { dx: -174, dy: -121, size: 47, rotation: 6 },
  { dx: -112, dy: -111, size: 41, rotation: -8 },
  { dx: 0,    dy: -127, size: 43, rotation: 4 },
  { dx: 95,   dy: -119, size: 42, rotation: -5 },
  { dx: 159,  dy: -112, size: 39, rotation: 7 },
  { dx: -181, dy: -50,  size: 43, rotation: -5 },
  { dx: -125, dy: -32,  size: 47, rotation: 7 },
  { dx: 120,  dy: -42,  size: 46, rotation: -7 },
  { dx: 177,  dy: -57,  size: 40, rotation: 5 },
  { dx: -160, dy: 34,   size: 42, rotation: 8 },
  { dx: -96,  dy: 48,   size: 45, rotation: -5 },
  { dx: 92,   dy: 45,   size: 43, rotation: 6 },
  { dx: 156,  dy: 27,   size: 41, rotation: -7 },
] as const;

type Props = {
  accentColor: string;
  accentLightColor: string;
  accentMidColor: string;
  finalVisualsVisible: boolean;
  height: number;
  inkColor: string;
  inkSoftColor: string;
  paperColor: string;
  reducedMotion: boolean;
  revealed: boolean;
  safeAreaTop: number;
  swipeHint: string;
  title: string;
  width: number;
  onReveal: () => void;
};

type BubbleOpticsProps = {
  accentColor: string;
  accentLightColor: string;
  accentMidColor: string;
  paperColor: string;
};

type BubbleRetinaProps = {
  accentColor: string;
  size: SharedValue<number>;
};

/**
 * Banda cromatica que atraviesa la lente al arrastrarla. Las curvas apiladas
 * desplazan el cian hacia la cara iluminada y el violeta/rosa hacia la sombra,
 * como la aberracion de una lente gruesa en vez de un unico trazo de color.
 */
function BubbleRetinaFallback({ accentColor }: Pick<BubbleRetinaProps, 'accentColor'>) {
  return (
    <Svg
      pointerEvents="none"
      viewBox={`0 0 ${BUBBLE_VIEWBOX_SIZE} ${BUBBLE_VIEWBOX_SIZE}`}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <Filter
          id="retinaBloom"
          x="-60"
          y="-80"
          width="424"
          height="464"
          filterUnits="userSpaceOnUse"
          primitiveUnits="userSpaceOnUse"
        >
          <FeGaussianBlur stdDeviation="9" />
        </Filter>
        <Filter
          id="retinaSoft"
          x="-48"
          y="-64"
          width="400"
          height="432"
          filterUnits="userSpaceOnUse"
          primitiveUnits="userSpaceOnUse"
        >
          <FeGaussianBlur stdDeviation="2.7" />
        </Filter>
      </Defs>

      <G filter="url(#retinaBloom)">
        <Path
          d="M -14 132 C 20 252 284 252 318 132"
          fill="none"
          stroke="#ef9ce7"
          strokeLinecap="round"
          strokeOpacity={0.38}
          strokeWidth={48}
        />
        <Path
          d="M -8 114 C 28 230 276 230 312 114"
          fill="none"
          stroke="#3ce8ff"
          strokeLinecap="round"
          strokeOpacity={0.48}
          strokeWidth={36}
        />
      </G>

      <G filter="url(#retinaSoft)">
        <Path
          d="M -10 130 C 24 242 280 242 314 130"
          fill="none"
          stroke="#eda3ea"
          strokeLinecap="round"
          strokeOpacity={0.26}
          strokeWidth={35}
        />
        <Path
          d="M -8 125 C 28 232 276 232 312 125"
          fill="none"
          stroke="#7750ff"
          strokeLinecap="round"
          strokeOpacity={0.62}
          strokeWidth={29}
        />
        <Path
          d="M -5 119 C 34 220 270 220 309 119"
          fill="none"
          stroke={accentColor}
          strokeLinecap="round"
          strokeOpacity={0.96}
          strokeWidth={21}
        />
        <Path
          d="M 0 112 C 40 208 264 208 304 112"
          fill="none"
          stroke="#29d8ff"
          strokeLinecap="round"
          strokeOpacity={0.84}
          strokeWidth={13}
        />
        <Path
          d="M 4 106 C 47 197 257 197 300 106"
          fill="none"
          stroke="#ddffff"
          strokeLinecap="round"
          strokeOpacity={0.58}
          strokeWidth={4.5}
        />
      </G>
    </Svg>
  );
}

function colorVector(hex: string): readonly [number, number, number] {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return [0.184, 0.424, 0.71];
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  ];
}

/** Shader real en builds nuevos; SVG equivalente y seguro para OTAs antiguas. */
function BubbleRetina({ accentColor, size }: BubbleRetinaProps) {
  const accent = useMemo(() => colorVector(accentColor), [accentColor]);
  const uniforms = useDerivedValue(() => ({
    u_size: [size.value, size.value],
    u_accent: accent,
  }));

  if (!skiaModule || !retinaShader) {
    return <BubbleRetinaFallback accentColor={accentColor} />;
  }

  const { Canvas, Fill, Shader } = skiaModule;
  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill>
        <Shader source={retinaShader} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
}

/**
 * Reflejos dibujados encima del material nativo. Son deliberadamente amplios
 * y de poco contraste: la esfera se lee por la luz que recoge en el borde y
 * por sus causticas, no por una capa de color opaca.
 */
function BubbleOptics({
  accentColor,
  accentLightColor,
  accentMidColor,
  paperColor,
}: BubbleOpticsProps) {
  return (
    <Svg
      pointerEvents="none"
      viewBox={`0 0 ${BUBBLE_VIEWBOX_SIZE} ${BUBBLE_VIEWBOX_SIZE}`}
      style={StyleSheet.absoluteFill}
    >
      <Defs>
        <RadialGradient id="sphereWash" cx="31%" cy="22%" rx="76%" ry="79%" fx="27%" fy="17%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.24} />
          <Stop offset="0.36" stopColor={paperColor} stopOpacity={0.09} />
          <Stop offset="0.7" stopColor="#ffffff" stopOpacity={0.015} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.12} />
        </RadialGradient>
        <SvgLinearGradient id="rim" x1="8%" y1="4%" x2="91%" y2="96%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.8} />
          <Stop offset="0.26" stopColor="#ffffff" stopOpacity={0.24} />
          <Stop offset="0.58" stopColor={paperColor} stopOpacity={0.1} />
          <Stop offset="0.82" stopColor={accentColor} stopOpacity={0.055} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.58} />
        </SvgLinearGradient>
        <RadialGradient id="upperBloom" cx="50%" cy="28%" rx="50%" ry="72%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.31} />
          <Stop offset="0.48" stopColor="#ffffff" stopOpacity={0.13} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="lowerCaustic" cx="48%" cy="48%" rx="52%" ry="52%">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={0.18} />
          <Stop offset="0.58" stopColor={accentLightColor} stopOpacity={0.07} />
          <Stop offset="1" stopColor={accentMidColor} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id="sideRefraction" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={accentColor} stopOpacity={0.1} />
          <Stop offset="1" stopColor={accentColor} stopOpacity={0} />
        </RadialGradient>
      </Defs>

      <Circle cx="152" cy="152" r="150" fill="url(#sphereWash)" />
      <Ellipse cx="113" cy="67" rx="108" ry="55" fill="url(#upperBloom)" rotation="-8" origin="113, 67" />
      <Ellipse cx="91" cy="238" rx="104" ry="69" fill="url(#lowerCaustic)" rotation="18" origin="91, 238" />
      <Ellipse cx="275" cy="180" rx="29" ry="103" fill="url(#sideRefraction)" rotation="8" origin="275, 180" />

      <Path
        d="M 33 111 C 66 52 150 27 231 63"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeOpacity={0.24}
        strokeWidth={4.5}
      />
      <Path
        d="M 56 255 C 102 282 195 284 249 236"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeOpacity={0.1}
        strokeWidth={2.2}
      />
      <Circle cx="152" cy="152" r="149" fill="none" stroke="url(#rim)" strokeWidth={1.7} />
      <Circle cx="152" cy="152" r="145.5" fill="none" stroke="#ffffff" strokeOpacity={0.13} strokeWidth={0.9} />
    </Svg>
  );
}

export function getLoginBubbleTargetY(height: number, safeAreaTop: number): number {
  return Math.min(Math.max(height * 0.31, safeAreaTop + 214), 276);
}

/**
 * Portada gestual inspirada en Wabi & More de quattro4maggi (MIT).
 * La esfera sigue el dedo, vuelve al borde si el gesto es corto y se encaja
 * con muelle al superar el umbral; entonces nacen de ella todos los catálogos.
 */
export default function LoginBubbleIntro({
  accentColor,
  accentLightColor,
  accentMidColor,
  finalVisualsVisible,
  height,
  inkColor,
  inkSoftColor,
  paperColor,
  reducedMotion,
  revealed,
  safeAreaTop,
  swipeHint,
  title,
  width,
  onReveal,
}: Props) {
  const targetX = width / 2;
  const targetY = getLoginBubbleTargetY(height, safeAreaTop);
  const initialY = height + 34;
  const initialBubbleSize = Math.min(Math.max(width * 0.98, 336), 404);
  const centerX = useSharedValue(revealed ? targetX : targetX);
  const centerY = useSharedValue(revealed ? targetY : initialY);
  const startX = useSharedValue(targetX);
  const startY = useSharedValue(initialY);
  const arrowFloat = useSharedValue(0);
  const finalVisualOpacity = useSharedValue(finalVisualsVisible ? 1 : 0);
  const announceReveal = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onReveal();
  }, [onReveal]);

  useEffect(() => {
    if (revealed) {
      centerX.value = targetX;
      centerY.value = targetY;
    }
  }, [centerX, centerY, revealed, targetX, targetY]);

  useEffect(() => {
    if (reducedMotion || revealed) {
      cancelAnimation(arrowFloat);
      arrowFloat.value = 0;
      return undefined;
    }

    arrowFloat.value = withRepeat(
      withTiming(1, { duration: 760, reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
    return () => cancelAnimation(arrowFloat);
  }, [arrowFloat, reducedMotion, revealed]);

  useEffect(() => {
    const shouldShow = !revealed || finalVisualsVisible;
    finalVisualOpacity.value = reducedMotion
      ? (shouldShow ? 1 : 0)
      : withTiming(shouldShow ? 1 : 0, {
        duration: 220,
        reduceMotion: ReduceMotion.System,
      });
  }, [finalVisualOpacity, finalVisualsVisible, reducedMotion, revealed]);

  const finishWithoutDrag = useCallback(() => {
    centerX.value = targetX;
    centerY.value = targetY;
    announceReveal();
  }, [announceReveal, centerX, centerY, targetX, targetY]);

  const pan = useMemo(() => Gesture.Pan()
    .enabled(!revealed)
    .minDistance(4)
    .onBegin(() => {
      startX.value = centerX.value;
      startY.value = centerY.value;
    })
    .onUpdate((event) => {
      const nextX = Math.max(68, Math.min(width - 68, startX.value + event.translationX * 0.32));
      const nextY = Math.max(targetY, Math.min(initialY, startY.value + event.translationY));
      centerX.value = withSpring(nextX, FOLLOW_SPRING);
      centerY.value = withSpring(nextY, FOLLOW_SPRING);
    })
    .onEnd((event) => {
      const travel = initialY - targetY;
      const passedThreshold = centerY.value <= initialY - travel * 0.27;
      const fastSwipe = event.velocityY < -780;

      if (passedThreshold || fastSwipe) {
        if (reducedMotion) {
          centerX.value = targetX;
          centerY.value = targetY;
          runOnJS(announceReveal)();
          return;
        }

        centerX.value = withSpring(targetX, SNAP_SPRING);
        centerY.value = withSpring(targetY, SNAP_SPRING, (finished) => {
          if (finished) runOnJS(announceReveal)();
        });
        return;
      }

      centerX.value = withSpring(targetX, SNAP_SPRING);
      centerY.value = withSpring(initialY, SNAP_SPRING);
    }), [
    announceReveal,
    centerX,
    centerY,
    initialY,
    reducedMotion,
    revealed,
    startX,
    startY,
    targetX,
    targetY,
    width,
  ]);

  const bubbleSize = useDerivedValue(() => {
    const progress = interpolate(
      centerY.value,
      [targetY, initialY],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return interpolate(
      progress,
      [0, 1],
      [initialBubbleSize, SETTLED_BUBBLE_SIZE],
      Extrapolation.CLAMP,
    );
  });

  const bubbleStyle = useAnimatedStyle(() => {
    const size = bubbleSize.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      left: centerX.value - size / 2,
      top: centerY.value - size / 2,
    };
  });

  const titleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      centerY.value,
      [targetY, initialY - (initialY - targetY) * 0.54, initialY],
      [0, 0.18, 1],
      Extrapolation.CLAMP,
    ),
    transform: [{
      translateY: interpolate(centerY.value, [targetY, initialY], [-20, 0], Extrapolation.CLAMP),
    }],
  }));

  const hintStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      centerY.value,
      [targetY, initialY - (initialY - targetY) * 0.68, initialY],
      [0, 0.72, 1],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateY: interpolate(arrowFloat.value, [0, 1], [4, -5]) }],
  }));

  const retinaStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      centerY.value,
      [targetY, initialY],
      [1, 0],
      Extrapolation.CLAMP,
    );

    return {
      opacity: interpolate(
        progress,
        [0, 0.035, 0.13, 0.76, 0.96, 1],
        [0, 0.12, 0.96, 1, 0.22, 0],
        Extrapolation.CLAMP,
      ),
      transform: [
        {
          translateY: interpolate(
            progress,
            [0, 0.1, 0.78, 1],
            [-68, -52, 68, 88],
            Extrapolation.CLAMP,
          ),
        },
      ],
    };
  });

  const finalVisualStyle = useAnimatedStyle(() => ({
    opacity: finalVisualOpacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        pointerEvents={revealed ? 'none' : 'auto'}
        accessible={!revealed}
        accessibilityRole="button"
        accessibilityLabel={swipeHint}
        accessibilityHint={title}
        accessibilityActions={[{ name: 'activate', label: swipeHint }]}
        onAccessibilityTap={finishWithoutDrag}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'activate') finishWithoutDrag();
        }}
        style={[styles.container, finalVisualStyle]}
      >
        <Animated.View
          pointerEvents="none"
          style={[styles.titleWrap, { top: safeAreaTop + 72 }, titleStyle]}
        >
          <Text style={[styles.title, { color: inkColor }]}>{title}</Text>
        </Animated.View>

        <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
          {CATALOG_STORES.map((store, index) => (
            <StoreBubble
              key={store.key}
              icon={store.icon}
              index={index}
              name={store.name}
              reducedMotion={reducedMotion}
              revealed={revealed}
              safeAreaTop={safeAreaTop}
              slot={STORE_SLOTS[index]}
              targetX={targetX}
              targetY={targetY}
              width={width}
            />
          ))}
        </View>

        <Animated.View
          pointerEvents="none"
          style={[styles.hint, { bottom: Math.max(76, height * 0.09) }, hintStyle]}
        >
          <Text style={[styles.hintArrow, { color: accentColor }]}>↑</Text>
          <Text style={[styles.hintText, { color: inkSoftColor }]}>{swipeHint}</Text>
        </Animated.View>

        <Animated.View
          pointerEvents="none"
          accessible={false}
          style={[
            styles.bubbleShell,
            bubbleStyle,
          ]}
        >
          <GlassSurface
            accessible={false}
            fallbackColor="rgba(255,255,255,0.12)"
            glassEffectStyle="clear"
            pointerEvents="none"
            style={styles.bubbleGlass}
          >
            <Animated.View
              pointerEvents="none"
              style={[styles.retinaLayer, retinaStyle]}
            >
              <BubbleRetina
                accentColor={accentColor}
                size={bubbleSize}
              />
            </Animated.View>
            <BubbleOptics
              accentColor={accentColor}
              accentLightColor={accentLightColor}
              accentMidColor={accentMidColor}
              paperColor={paperColor}
            />
          </GlassSurface>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

type StoreBubbleProps = {
  icon: number | null;
  index: number;
  name: string;
  reducedMotion: boolean;
  revealed: boolean;
  safeAreaTop: number;
  slot: StoreSlot;
  targetX: number;
  targetY: number;
  width: number;
};

function StoreBubble({
  icon,
  index,
  name,
  reducedMotion,
  revealed,
  safeAreaTop,
  slot,
  targetX,
  targetY,
  width,
}: StoreBubbleProps) {
  const reveal = useSharedValue(revealed ? 1 : 0);
  const float = useSharedValue(0);
  const left = Math.max(5, Math.min(width - slot.size - 5, targetX + slot.dx - slot.size / 2));
  const top = Math.max(safeAreaTop + 8, targetY + slot.dy - slot.size / 2);
  const originLeft = targetX - slot.size / 2;
  const originTop = targetY - slot.size / 2;

  useEffect(() => {
    cancelAnimation(reveal);
    cancelAnimation(float);

    if (!revealed) {
      reveal.value = 0;
      float.value = 0;
      return undefined;
    }

    if (reducedMotion) {
      reveal.value = 1;
      float.value = 0;
      return undefined;
    }

    reveal.value = withDelay(
      70 + index * 44,
      withSpring(1, {
        stiffness: 155,
        damping: 15,
        mass: 0.85,
        reduceMotion: ReduceMotion.System,
      }),
    );
    float.value = withDelay(
      940 + index * 32,
      withRepeat(
        withTiming(1, {
          duration: 1450 + (index % 4) * 180,
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      ),
    );

    return () => {
      cancelAnimation(reveal);
      cancelAnimation(float);
    };
  }, [float, index, reducedMotion, reveal, revealed]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(reveal.value, [0, 0.16, 1], [0, 0.72, 1], Extrapolation.CLAMP),
    transform: [
      { translateX: interpolate(reveal.value, [0, 1], [originLeft, left]) },
      {
        translateY: interpolate(reveal.value, [0, 1], [originTop, top])
          + interpolate(float.value, [0, 1], [2, -4 - (index % 3)]),
      },
      { rotate: `${interpolate(reveal.value, [0, 1], [0, slot.rotation])}deg` },
      { scale: interpolate(reveal.value, [0, 0.7, 1], [0.18, 1.08, 1]) },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.storeBubble,
        { width: slot.size, height: slot.size, borderRadius: slot.size / 2 },
        animatedStyle,
      ]}
    >
      {icon != null ? (
        <Image source={icon} contentFit="contain" transition={0} style={styles.storeLogo} />
      ) : (
        <Text style={styles.storeFallback}>{name.slice(0, 2).toUpperCase()}</Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    overflow: 'hidden',
  },
  titleWrap: {
    position: 'absolute',
    left: 30,
    right: 30,
    alignItems: 'center',
  },
  title: {
    maxWidth: 330,
    textAlign: 'center',
    fontSize: 34,
    lineHeight: 39,
    letterSpacing: -1.25,
    fontFamily: fonts.bold,
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 4,
  },
  hintArrow: {
    fontSize: 27,
    lineHeight: 28,
    fontFamily: fonts.medium,
  },
  hintText: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.semibold,
    letterSpacing: 0.1,
  },
  bubbleShell: {
    position: 'absolute',
    zIndex: 3,
    shadowColor: '#727979',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 6,
  },
  bubbleGlass: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.36)',
  },
  retinaLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  storeBubble: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.90)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#4c82b8',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
  },
  storeLogo: {
    width: '100%',
    height: '100%',
  },
  storeFallback: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: '#2f6cb5',
  },
});
