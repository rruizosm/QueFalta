import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { fetchWordProfileStats } from '../api/wordGame';
import { activityMonths, STAT_PERIODS, type WordProfileStats } from '../lib/wordProfileStats';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';

export default function WordProfileStatistics({ userId, positionsLocked, onUnlock }: {
  userId: string; positionsLocked: boolean; onUnlock: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t, lang } = useTranslation();
  const [data, setData] = useState<WordProfileStats | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const calendar = useRef<ScrollView>(null);
  useFocusEffect(useCallback(() => {
    if (!userId) return;
    let active = true;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      setFailed(false);
      fetchWordProfileStats(request.signal).then((result) => {
        if (active && !request.signal.aborted) setData(result);
      }).catch(() => {
        if (active && !request.signal.aborted) setFailed(true);
      });
    };
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => { active = false; controller?.abort(); subscription.remove(); };
  // retry deliberately restarts the focused request after a failed load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, retry]));
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';
  const completed = new Set(data?.activityDays);
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>{t('wordGame.statsTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.titleRow}>
          <Ionicons name="grid-outline" size={18} color={colors.accent} />
          <Text style={styles.title}>{t('wordGame.title')}</Text>
        </View>
        {failed ? (
          <View accessibilityLiveRegion="polite">
            <Text style={styles.note}>{t('wordGame.statsError')}</Text>
            <TouchableOpacity accessibilityRole="button" style={styles.retry} onPress={() => setRetry((n) => n + 1)}>
              <Text style={styles.retryText}>{t('wordGame.statsRetry')}</Text>
            </TouchableOpacity>
          </View>
        ) : !data ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : (
          <>
            <View style={styles.streak}>
              <Ionicons name="flame-outline" size={30} color={colors.accent} />
              <View style={styles.streakBody}>
                <Text style={styles.label}>{t('wordGame.statsStreak')}</Text>
                <Text style={styles.streakValue}>{t('wordGame.statsDays', { n: data.bestStreak })}</Text>
                <Text style={styles.note}>{t('wordGame.statsStreakHint')}</Text>
              </View>
            </View>
            <Text style={styles.subtitle}>{t('wordGame.statsPositions')}</Text>
            {positionsLocked ? <TouchableOpacity style={styles.lockedPositions} onPress={onUnlock} accessibilityRole="button"
              accessibilityLabel={t('wordGame.statsPositionsPlus')}>
              <Ionicons name="lock-closed-outline" size={22} color={colors.accent} />
              <Text style={styles.lockedText}>{t('wordGame.statsPositionsPlus')}</Text>
            </TouchableOpacity> : <View style={styles.positions}>
              {STAT_PERIODS.map((period) => {
                const best = data.bestPositions[period];
                return (
                  <View key={period} style={styles.position} accessible>
                    <Text style={styles.label}>{t(`wordGame.statsPeriod_${period}`)}</Text>
                    <Text style={styles.rank}>{best ? `#${best.rank}` : '—'}</Text>
                    <Text style={styles.note}>{best
                      ? new Date(`${best.periodStart}T12:00:00Z`).toLocaleDateString(locale, {
                        timeZone: 'UTC', ...(period === 'yearly' ? { year: 'numeric' as const }
                          : period === 'monthly' ? { month: 'short' as const, year: 'numeric' as const }
                            : { day: 'numeric' as const, month: 'short' as const, year: 'numeric' as const }),
                      }) : t('wordGame.statsNoPosition')}</Text>
                    {best?.provisional && <Text style={styles.provisional}>{t('wordGame.currentPeriod')}</Text>}
                  </View>
                );
              })}
            </View>
            }
            {!positionsLocked && <Text style={styles.note}>{t('wordGame.statsPositionHint')}</Text>}
            <View style={styles.activityHeader}>
              <Text style={styles.subtitle}>{t('wordGame.statsActivity')}</Text>
              <Text style={styles.note}>{t('wordGame.statsYear')}</Text>
            </View>
            <ScrollView horizontal ref={calendar} showsHorizontalScrollIndicator
              onContentSizeChange={() => calendar.current?.scrollToEnd({ animated: false })}
              contentContainerStyle={styles.months}>
              {activityMonths(data.today).map(({ month, cells }) => (
                <View key={month} style={styles.month} accessible accessibilityLabel={`${
                  new Date(month).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
                }. ${t('wordGame.statsMonthCount', { n: cells.filter((day) => day && completed.has(day)).length })}`}>
                  <Text style={styles.monthLabel}>{new Date(month).toLocaleDateString(locale, {
                    month: 'short', year: '2-digit', timeZone: 'UTC',
                  })}</Text>
                  <View style={styles.cells}>
                    {cells.map((day, index) => <View key={day ?? index} style={[
                      styles.cell, day && completed.has(day) && styles.cellCompleted,
                      (!day || day > data.today) && styles.cellHidden,
                    ]} />)}
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={styles.legend}>
              <View style={[styles.cell, styles.cellCompleted]} />
              <Text style={styles.note}>{t('wordGame.statsCompleted')}</Text>
            </View>
            <Text style={styles.note}>{t('wordGame.statsActivityHint')}</Text>
            {data.completedCount === 0 && <Text style={styles.empty}>{t('wordGame.statsEmpty')}</Text>}
          </>
        )}
      </View>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  section: { marginTop: 22, marginBottom: 20 },
  heading: { fontFamily: fonts.bold, fontSize: 13, color: colors.inkSoft, marginBottom: 10, letterSpacing: 0.6 },
  card: { backgroundColor: colors.white, borderRadius: 22, padding: 18, borderWidth: 1, borderColor: colors.border, gap: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink, flexShrink: 1 },
  loading: { margin: 24 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.accentLight, borderRadius: 16, padding: 16 },
  streakBody: { flex: 1, gap: 3 },
  streakValue: { fontFamily: fonts.bold, fontSize: 30, color: colors.accent },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  note: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: colors.inkSoft },
  subtitle: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  positions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  lockedPositions: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.accentLight },
  lockedText: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  position: { flexGrow: 1, flexBasis: '45%', padding: 12, borderRadius: 14, backgroundColor: colors.paper, gap: 3 },
  rank: { fontFamily: fonts.bold, fontSize: 26, color: colors.ink },
  provisional: { fontFamily: fonts.medium, fontSize: 11, color: colors.accent },
  activityHeader: { gap: 3, marginTop: 6 },
  months: { gap: 20, paddingBottom: 12 },
  month: { width: 108, gap: 8 },
  monthLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.inkSoft },
  cells: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  cell: { width: 12, height: 12, borderRadius: 3, backgroundColor: colors.border },
  cellCompleted: { backgroundColor: colors.accent },
  cellHidden: { opacity: 0 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  retryText: { fontFamily: fonts.semibold, color: colors.accent },
  empty: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
});
