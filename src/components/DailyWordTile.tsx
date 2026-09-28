import { memo, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import type { LetterState } from '../api/wordGame';

export const wordTileColors: Record<LetterState, string> = { correct: '#34784c', present: '#956315', absent: '#66616a' };
const FLIP_DURATION = 420;
const LETTER_DELAY = 180;

interface Props {
  letter: string;
  state?: LetterState;
  active: boolean;
  selected?: boolean;
  onSelect?: () => void;
  size: number;
  label: string;
  pendingLabel: string;
  column: number;
  revealId?: number;
  onRevealed: (id: number, column: number) => void;
}

/** Two faces keep the result hidden until the tile turns about its vertical axis. */
function DailyWordTile({ letter, state, active, selected, onSelect, size, label, pendingLabel, column, revealId, onRevealed }: Props) {
  const styles = useThemedStyles(themedStyles);
  const progress = useRef(new Animated.Value(0)).current;
  const [finished, setFinished] = useState(false);
  const animate = revealId !== undefined && state !== undefined;

  useEffect(() => {
    if (!animate || revealId === undefined) return;
    let mounted = true;
    const animation = Animated.sequence([
      Animated.delay(column * LETTER_DELAY),
      Animated.timing(progress, {
        toValue: 1, duration: FLIP_DURATION, easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true, isInteraction: false,
      }),
    ]);
    animation.start(({ finished: completed }) => {
      if (!mounted || !completed) return;
      setFinished(true);
      onRevealed(revealId, column);
    });
    return () => { mounted = false; animation.stop(); };
  }, [animate, column, onRevealed, progress, revealId]);

  const dimensions = { width: size, height: size };
  const visibleLetter = letter === 'I' ? 'I\u200B' : letter;
  const letterStyle = [styles.letter, { fontSize: Math.min(28, size * 0.52) }];
  const resultStyle = state && { backgroundColor: wordTileColors[state], borderColor: wordTileColors[state] };

  if (!animate && active && onSelect) return (
    <Pressable onPress={onSelect} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      style={[styles.cell, dimensions, styles.active, !!letter && styles.filled, selected && styles.selected]}>
      <Text style={letterStyle}>{visibleLetter}</Text>
      {selected && <View pointerEvents="none" style={styles.cursorMark} />}
    </Pressable>
  );

  if (!animate) return (
    <View accessible accessibilityLabel={label}
      style={[styles.cell, dimensions, active && styles.active, !!letter && !state && styles.filled, resultStyle]}>
      <Text style={[letterStyle, state && styles.white]}>{visibleLetter}</Text>
    </View>
  );

  return (
    <View accessible accessibilityLabel={finished ? label : pendingLabel} accessibilityState={{ busy: !finished }} style={dimensions}>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[
        styles.cell, styles.face, styles.active, styles.filled,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [1, 1, 0, 0] }),
          transform: [{ perspective: 600 }, { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }],
        },
      ]}><Text style={letterStyle}>{visibleLetter}</Text></Animated.View>
      <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[
        styles.cell, styles.face, resultStyle,
        {
          opacity: progress.interpolate({ inputRange: [0, 0.499, 0.5, 1], outputRange: [0, 0, 1, 1] }),
          transform: [{ perspective: 600 }, { rotateY: progress.interpolate({ inputRange: [0, 1], outputRange: ['-180deg', '0deg'] }) }],
        },
      ]}><Text style={[letterStyle, styles.white]}>{visibleLetter}</Text></Animated.View>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  cell: { borderRadius: 10, backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: colors.white, borderColor: colors.accentMid, borderWidth: 2 },
  filled: { borderColor: colors.accent },
  selected: { borderColor: colors.accent, borderWidth: 3 },
  cursorMark: { position: 'absolute', bottom: 3, width: 12, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  face: { ...StyleSheet.absoluteFill, backfaceVisibility: 'hidden' },
  letter: { fontFamily: fonts.bold, color: colors.ink },
  white: { color: '#fff' },
});

export default memo(DailyWordTile);
