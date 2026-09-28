import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

export const WORD_STREAK_BANNER_DURATION_MS = 4_000;
const EXIT_DURATION_MS = 160;
export const STREAK_NUMBER_DELAY_MS = 300;
const STREAK_NUMBER_DURATION_MS = 280;

export default function WordStreakBanner({ streak, label, dayLabel, onDismiss }: {
  streak: number;
  label: string;
  dayLabel: string;
  onDismiss: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(reducedMotion ? 0 : -14)).current;
  const numberProgress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const flameProgress = useRef(new Animated.Value(0)).current;
  const previousStreak = Math.max(0, streak - 1);
  const widestStreak = String(previousStreak).length > String(streak).length ? previousStreak : streak;
  const accessibilityMessage = `${label} · ${streak} ${dayLabel}`;

  useEffect(() => {
    numberProgress.setValue(reducedMotion ? 1 : 0);
    flameProgress.setValue(0);
    if (!reducedMotion) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(translateY, { toValue: 0, friction: 9, useNativeDriver: true }),
      ]).start();
    }
    const numberTimer = setTimeout(() => {
      if (!reducedMotion) {
        Animated.timing(numberProgress, {
          toValue: 1,
          duration: STREAK_NUMBER_DURATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      }
      AccessibilityInfo.announceForAccessibility(accessibilityMessage);
    }, reducedMotion ? 0 : STREAK_NUMBER_DELAY_MS);
    const flameAnimation = reducedMotion ? null : Animated.loop(
      Animated.timing(flameProgress, {
        toValue: 1,
        duration: 360,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      { iterations: 3 },
    );
    flameAnimation?.start();
    const timer = setTimeout(() => {
      if (reducedMotion) {
        onDismiss();
        return;
      }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: EXIT_DURATION_MS, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -10, duration: EXIT_DURATION_MS, useNativeDriver: true }),
      ]).start(({ finished }) => { if (finished) onDismiss(); });
    }, reducedMotion ? WORD_STREAK_BANNER_DURATION_MS : WORD_STREAK_BANNER_DURATION_MS - EXIT_DURATION_MS);
    return () => {
      clearTimeout(numberTimer);
      clearTimeout(timer);
      flameAnimation?.stop();
      opacity.stopAnimation();
      translateY.stopAnimation();
      numberProgress.stopAnimation();
      flameProgress.stopAnimation();
    };
  }, [accessibilityMessage, flameProgress, numberProgress, onDismiss, opacity, reducedMotion, translateY]);

  const oldNumberStyle = {
    opacity: numberProgress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [{ translateY: numberProgress.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) }],
  };
  const newNumberStyle = {
    opacity: numberProgress,
    transform: [{ translateY: numberProgress.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  };
  const flameStyle = {
    transform: [
      { translateY: flameProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] }) },
      { scale: flameProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.16, 1] }) },
      { rotate: flameProgress.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-3deg', '4deg', '-3deg'] }) },
    ],
  };

  return (
    <Animated.View pointerEvents="none" accessible accessibilityLabel={accessibilityMessage}
      accessibilityRole="alert" accessibilityLiveRegion="assertive"
      style={[styles.wrap, {
        top: insets.top + 8,
        left: Math.max(16, insets.left),
        right: Math.max(16, insets.right),
        opacity,
        transform: [{ translateY }],
      }]}>
      <View style={styles.banner}>
        <Animated.View style={flameStyle}>
          <Ionicons name="flame-outline" size={30} color={colors.accent} />
        </Animated.View>
        <View style={styles.textRow} importantForAccessibility="no-hide-descendants">
          <Text style={styles.text}>{label} ·</Text>
          <View style={styles.numberWindow}>
            <Text style={[styles.number, styles.numberSizer]}>{widestStreak}</Text>
            <Animated.Text style={[styles.number, styles.numberLayer, oldNumberStyle]}>{previousStreak}</Animated.Text>
            <Animated.Text style={[styles.number, styles.numberLayer, newNumberStyle]}>{streak}</Animated.Text>
          </View>
          <Text style={styles.text}>{dayLabel}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const themedStyles = () => StyleSheet.create({
  wrap: { position: 'absolute', zIndex: 30, alignItems: 'stretch', elevation: 12 },
  banner: {
    width: '100%', height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.accent, shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16, shadowRadius: 14,
  },
  textRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  text: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 18, color: colors.ink, textAlign: 'center' },
  numberWindow: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  number: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, color: colors.accent, fontVariant: ['tabular-nums'] },
  numberSizer: { opacity: 0 },
  numberLayer: { position: 'absolute' },
});
