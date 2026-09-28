import { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import GlassSurface from './GlassSurface';

const scores = [
  { length: 4, points: [100, 85, 70, 55, 40, 25] },
  { length: 5, points: [120, 102, 84, 66, 48, 30] },
  { length: 6, points: [140, 119, 98, 77, 56, 35] },
];

export default function WordGameScoringCarousel() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const scroll = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const [indicatorScales] = useState(() => scores.map(() => new Animated.Value(1)));

  useEffect(() => {
    // Also cancel an in-flight bounce when Reduce Motion is enabled.
    indicatorScales.forEach((scale) => { scale.stopAnimation(); scale.setValue(1); });
    return () => indicatorScales.forEach((scale) => scale.stopAnimation());
  }, [indicatorScales, reducedMotion]);

  const selectPage = (index: number) => {
    const scale = indicatorScales[index];
    // Restart on every press, including repeated presses on the current page.
    scale.stopAnimation();
    scale.setValue(1);
    if (!reducedMotion) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 0.8, duration: 80, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, stiffness: 320, damping: 10, mass: 0.6, useNativeDriver: true }),
      ]).start();
    }
    scroll.current?.scrollTo({ x: index * width, animated: !reducedMotion });
  };

  return <View style={styles.section}>
    <Text style={styles.heading}>{t('wordGame.scoringTitle')}</Text>
    <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}>
      {width > 0 && <ScrollView ref={scroll} horizontal pagingEnabled directionalLockEnabled
        showsHorizontalScrollIndicator={false} bounces={false}
        onContentSizeChange={() => scroll.current?.scrollTo({ x: page * width, animated: false })}
        onScroll={({ nativeEvent }) => setPage(Math.max(0, Math.min(2, Math.round(nativeEvent.contentOffset.x / width))))}
        scrollEventThrottle={16}>
        {scores.map(({ length, points }, index) => <View key={length} style={[styles.page, { width }]}
          accessibilityElementsHidden={page !== index} importantForAccessibility={page === index ? 'auto' : 'no-hide-descendants'}>
          <Text accessibilityRole="header" style={styles.length}>{t('wordGame.letters', { n: length })}</Text>
          {points.map((score, attempt) => <View key={attempt} style={styles.row} accessible
            accessibilityLabel={`${t('wordGame.scoringAttempt', { n: attempt + 1 })}: ${score} ${t('wordGame.points')}`}>
            <Text style={styles.attempt}>{t('wordGame.scoringAttempt', { n: attempt + 1 })}</Text>
            <Text style={styles.score}>{score} {t('wordGame.points')}</Text>
          </View>)}
        </View>)}
      </ScrollView>}
    </View>
    <View style={styles.pagination}>
      {scores.map(({ length }, index) => <TouchableOpacity key={length} style={styles.pageButton}
        accessibilityRole="button" accessibilityLabel={t('wordGame.letters', { n: length })}
        accessibilityState={{ selected: page === index }}
        onPress={() => selectPage(index)}>
        <Animated.View style={{ transform: [{ scale: indicatorScales[index] }] }}>
          <GlassSurface style={[styles.dot, page === index && styles.activeDot]}
            fallbackColor={page === index ? colors.accent : colors.border}
            tintColor={page === index ? colors.accent : undefined} />
        </Animated.View>
      </TouchableOpacity>)}
    </View>
    <Text style={styles.hint}>{t('wordGame.scoringSwipe', { n: page + 1 })}</Text>
    <Text style={styles.body}>{t('wordGame.rulesScoringBody')}{'\n\n'}{t('wordGame.rankingHistoryHelp')}</Text>
  </View>;
}

const themedStyles = () => StyleSheet.create({
  section: { marginTop: 24 },
  heading: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 23, color: colors.ink, marginBottom: 12 },
  page: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, padding: 14 },
  length: { fontFamily: fonts.bold, fontSize: 19, color: colors.accent, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  attempt: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink },
  score: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 15, color: colors.ink, textAlign: 'right', fontVariant: ['tabular-nums'] },
  pagination: { flexDirection: 'row', justifyContent: 'center' },
  pageButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  activeDot: { width: 20 },
  hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.ink, textAlign: 'center', marginBottom: 24 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.ink },
});
