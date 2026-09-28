import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Platform, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { limitsApply } from '../constants/limits';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';
import AmbientBubbleBackdrop from '../components/AmbientBubbleBackdrop';
import { fetchWordProfileStats, type LetterState, type RankingPeriod } from '../api/wordGame';
import { useWordRanking } from '../hooks/useWordRanking';
import { useWordGame } from '../hooks/useWordGame';
import { useReducedMotion } from '../hooks/useReducedMotion';
import DailyWordTile, { wordTileColors as tileColors } from '../components/DailyWordTile';
import WordRankingList from '../components/WordRankingList';
import WordGameInfoModal from '../components/WordGameInfoModal';
import WordGamePrizes from '../components/WordGamePrizes';
import WordGameScoringCarousel from '../components/WordGameScoringCarousel';
import WordKeyboardKey from '../components/WordKeyboardKey';
import WordStreakBanner from '../components/WordStreakBanner';
import PaywallModal from '../components/PaywallModal';
import { buildWordGameShareMessage } from '../lib/wordGameShare';
import { WORD_GAME_SHARE_URL } from '../lib/appLinks';

const priority: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };
const periods: RankingPeriod[] = ['daily', 'weekly', 'monthly', 'yearly', 'all'];
const languageNoticeKey = (userId: string) => `@word_game_spanish_notice:${userId}`;
type GameTab = 'play' | 'ranking' | 'group';
interface PendingReveal { id: number; userId: string; gameId: string; row: number; word: string }
interface PendingStreak { userId: string; gameId: string }
function formatRankingDate(day: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}
function resultHaptic(status: 'playing' | 'won' | 'lost') {
  if (status === 'playing') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else void Haptics.notificationAsync(status === 'won' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
function keyboardHaptic() {
  const feedback = Platform.OS === 'android'
    ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Keyboard_Tap)
    : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  void feedback.catch(() => {});
}

export default function DailyWordScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t, lang } = useTranslation();
  const { session } = useAuth();
  const { isPremium, loading: profileLoading } = useProfile();
  const { activeCart, hydrated: cartHydrated } = useCart();
  const navigation = useNavigation();
  const top = useHeaderTopPadding(56);
  const insets = useSafeAreaInsets();
  const bottom = Math.max(16, insets.bottom);
  const { width, height } = useWindowDimensions();
  const userId = session?.user.id;
  const [noticeAcceptedBy, setNoticeAcceptedBy] = useState<string | null>(null);
  const noticeShownFor = useRef<string | null>(null);
  const canPlay = lang !== 'ca' || (userId != null && noticeAcceptedBy === userId);
  useFocusEffect(useCallback(() => {
    if (lang !== 'ca' || !userId || noticeAcceptedBy === userId) return;
    let active = true;
    AsyncStorage.getItem(languageNoticeKey(userId))
      .catch(() => null)
      .then((accepted) => {
        if (!active) return;
        if (accepted === 'true') {
          setNoticeAcceptedBy(userId);
          return;
        }
        if (noticeShownFor.current === userId) return;
        noticeShownFor.current = userId;
        Alert.alert(t('wordGame.languageNoticeTitle'), t('wordGame.languageNoticeBody'), [
          { text: t('wordGame.languageNoticeContinue'), onPress: () => {
            setNoticeAcceptedBy(userId);
            void AsyncStorage.setItem(languageNoticeKey(userId), 'true').catch(() => {});
          } },
        ], { cancelable: false });
      });
    return () => { active = false; };
  }, [lang, userId, noticeAcceptedBy, t]));
  const { game, draft, cursor, loading, starting, sending, uncertain, error: errorCode, remaining, elapsed, controller } = useWordGame(userId, canPlay);
  const error = errorCode ? t(`wordGame.${errorCode}`, { n: game?.length ?? 5 }) : '';
  const load = () => { if (canPlay) return controller.refresh(); };
  const [tab, setTab] = useState<GameTab>('play');
  const [infoPopup, setInfoPopup] = useState<'rules' | 'prizes' | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const openRankingPaywall = useCallback(() => setPaywallVisible(true), []);
  const [period, setPeriod] = useState<RankingPeriod>('daily');
  const [periodOffset, setPeriodOffset] = useState(0);
  const activeGroupId = cartHydrated ? activeCart?.groupId : undefined;
  const { ranking, error: rankError, refresh: refreshRanking } = useWordRanking({
    userId, day: game?.day, revision: `${game?.status}:${game?.score}`, groupId: activeGroupId,
    groupReady: cartHydrated, tab, period, offset: periodOffset,
  });
  const [chromeHeight, setChromeHeight] = useState(top + 112);
  const playScroll = useRef<ScrollView>(null);
  const [playViewportHeight, setPlayViewportHeight] = useState(0);
  const [keyboardHeight, setKeyboardHeight] = useState(230 + bottom);
  const reducedMotion = useReducedMotion();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(null);
  const [pendingStreak, setPendingStreak] = useState<PendingStreak | null>(null);
  const [streakBanner, setStreakBanner] = useState<number | null>(null);
  const pendingRef = useRef<PendingReveal | null>(null);
  const revealSequence = useRef(0);
  const [revealedColumns, setRevealedColumns] = useState(0);
  const reveal = pendingReveal && !reducedMotion && pendingReveal.userId === userId &&
    pendingReveal.gameId === game?.id && game.guesses[pendingReveal.row]?.word === pendingReveal.word
    ? pendingReveal : null;
  const revealing = reveal !== null;
  const cancelReveal = useCallback(() => {
    pendingRef.current = null;
    setPendingReveal(null);
    setRevealedColumns(0);
  }, []);

  useEffect(() => { cancelReveal(); }, [controller, game?.id, reducedMotion, cancelReveal]);
  useEffect(() => {
    setPendingStreak(null);
    setStreakBanner(null);
  }, [controller, game?.id]);
  useFocusEffect(useCallback(() => {
    setAppActive(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state !== 'active') cancelReveal();
    });
    return () => { sub.remove(); cancelReveal(); };
  }, [cancelReveal]));

  const onTileRevealed = useCallback((id: number, column: number) => {
    const pending = pendingRef.current;
    if (!pending || pending.id !== id) return;
    setRevealedColumns(column + 1);
    if (column === pending.word.length - 1) {
      cancelReveal();
      const status = controller.state.game?.status;
      if (status) resultHaptic(status);
    }
  }, [cancelReveal, controller]);
  const selectTab = (value: GameTab) => { cancelReveal(); setPeriodOffset(0); setTab(value); };
  const selectPeriod = (value: RankingPeriod) => { setPeriodOffset(0); setPeriod(value); };


  const send = async () => {
    if (!canPlay || pendingRef.current || !game || !userId || sending || loading || game.status !== 'playing') return;
    // Mark the submitted slot before requesting it, so no frame shows all the
    // result colors (or the final score) before the native flip has started.
    const pending = { id: ++revealSequence.current, userId, gameId: game.id, row: game.guesses.length, word: draft };
    pendingRef.current = pending;
    setPendingReveal(pending);
    setRevealedColumns(0);
    const status = await controller.send();
    const current = controller.state.game;
    if (status && status !== 'playing' && current?.id === pending.gameId) {
      setPendingStreak({ userId, gameId: current.id });
    }
    if (pendingRef.current !== pending) return;
    if (!status || reducedMotion || current?.id !== pending.gameId || current.guesses[pending.row]?.word !== pending.word) {
      cancelReveal();
      if (status) resultHaptic(status);
    }
  };

  const keyStates = useMemo(() => {
    const result: Record<string, LetterState> = {};
    game?.guesses.forEach(({ word, feedback }, row) => Array.from(word).forEach((letter, i) => {
      if (reveal?.row === row && i >= revealedColumns) return;
      const state = feedback[i];
      if (state && (result[letter] === undefined || priority[state] > priority[result[letter]])) result[letter] = state;
    }));
    return result;
  }, [game, reveal, revealedColumns]);

  const key = (letter: string) => { if (canPlay && !pendingRef.current) controller.key(letter); };
  const share = async () => {
    if (!game || game.status === 'playing') return;
    const message = buildWordGameShareMessage({
      title: t('wordGame.shareTitle'),
      day: game.day,
      scoreLine: t('wordGame.shareScore', { n: game.status === 'won' ? game.guesses.length : 'X', score: game.score }),
      feedbackRows: game.guesses.map((guess) => guess.feedback),
      url: WORD_GAME_SHARE_URL,
    });
    try {
      await Share.share({ title: t('wordGame.shareTitle'), message });
    } catch { /* Dismissal of the share sheet does not affect the saved game. */ }
  };

  const completed = !!game && game.status !== 'playing' && !revealing;
  useEffect(() => {
    if (!pendingStreak || !completed || revealing || !isFocused || !appActive ||
      pendingStreak.userId !== userId || pendingStreak.gameId !== game?.id) return;
    let active = true;
    const request = new AbortController();
    fetchWordProfileStats(request.signal).then((stats) => {
      if (active && !request.signal.aborted && stats.currentStreak > 0) setStreakBanner(stats.currentStreak);
    }).catch(() => {
      // The saved result remains valid; a transient statistics failure should
      // not replace it with an invented streak.
    }).finally(() => {
      if (active) setPendingStreak((value) => value?.gameId === pendingStreak.gameId ? null : value);
    });
    return () => { active = false; request.abort(); };
  }, [appActive, completed, game?.id, isFocused, pendingStreak, revealing, userId]);
  const dismissStreakBanner = useCallback(() => setStreakBanner(null), []);
  const availableHeight = playViewportHeight || height - chromeHeight;
  useEffect(() => {
    if (completed && tab === 'play') playScroll.current?.scrollTo({ y: 0, animated: false });
  }, [completed, tab]);
  const cellSize = Math.min(height >= 900 ? 54 : 44, Math.floor((Math.min(width - insets.left - insets.right - 64, 430) - 5 * 7) / (game?.length ?? 5)));
  const keyboardVisible = ((game?.status === 'playing' && !!game.startedAt) || revealing) && tab === 'play';
  const inputDisabled = !canPlay || !game?.startedAt || sending || loading || remaining === 0 || pendingReveal !== null;
  const submitDisabled = inputDisabled || !game || draft.length !== game.length || !/^[A-ZÑ]+$/.test(draft);
  const countdown = [Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60].map((n) => String(n).padStart(2, '0')).join(':');
  const playTime = [Math.floor(elapsed / 60), elapsed % 60].map((n) => String(n).padStart(2, '0')).join(':');
  const rankingDates = ranking && (ranking.periodStart === ranking.periodEnd
    ? formatRankingDate(ranking.periodStart, lang)
    : `${formatRankingDate(ranking.periodStart, lang)} – ${formatRankingDate(ranking.periodEnd, lang)}`);
  const previousPeriodLabel = period === 'daily' ? t('wordGame.yesterday')
    : period === 'weekly' ? t('wordGame.lastWeek')
      : period === 'monthly' ? t('wordGame.lastMonth')
        : t('wordGame.lastYear');
  const showPreviousPeriod = Boolean(ranking?.hasPrevious && periodOffset === 0 && period !== 'all');
  const showNextPeriod = periodOffset > 0;
  const previousPeriod = useCallback(() => setPeriodOffset(1), []);
  const currentPeriod = useCallback(() => setPeriodOffset(0), []);
  const header = (
      <View style={[styles.header, { paddingTop: top, paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('wordGame.title')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => setInfoPopup('prizes')} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={t('wordGame.prizes')}>
            <Ionicons name="gift-outline" size={23} color={colors.ink} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setInfoPopup('rules')} style={styles.iconButton} accessibilityRole="button" accessibilityLabel={t('wordGame.rules')}>
            <Ionicons name="help-circle-outline" size={24} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>
  );

  return (
    <View style={styles.screen}>
      <WordGameInfoModal visible={infoPopup !== null} compact={infoPopup === 'prizes'}
        title={t(infoPopup === 'prizes' ? 'wordGame.prizes' : 'wordGame.rules')}
        body={infoPopup === 'rules' ? t('wordGame.rulesBody') : ''}
        closeLabel={t(infoPopup === 'prizes' ? 'wordGame.prizesClose' : 'wordGame.rulesClose')}
        onClose={() => setInfoPopup(null)}>
        {infoPopup === 'prizes' ? <WordGamePrizes /> : infoPopup === 'rules' ? <WordGameScoringCarousel /> : null}
      </WordGameInfoModal>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      {streakBanner !== null && <WordStreakBanner
        streak={streakBanner} label={t('wordGame.streakBannerLabel')}
        dayLabel={t(streakBanner === 1 ? 'wordGame.streakBannerDayOne' : 'wordGame.streakBannerDayMany')}
        onDismiss={dismissStreakBanner} />}
      {glassAvailable && <AmbientBubbleBackdrop />}
      {(tab === 'play' || !game) && <ScrollView ref={playScroll}
        onLayout={(event) => setPlayViewportHeight(event.nativeEvent.layout.height)}
        style={{ marginTop: chromeHeight }}
        scrollIndicatorInsets={{ bottom: glassAvailable && keyboardVisible ? keyboardHeight : 0 }}
        contentContainerStyle={[styles.scroll, {
          paddingTop: completed ? 8 : 12,
          paddingBottom: keyboardVisible ? (glassAvailable ? keyboardHeight + 12 : 12) : bottom,
          paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right),
        }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => { void load(); refreshRanking(); }} tintColor={colors.accent} />}>
        <View style={[styles.content, completed && [styles.completedContent, { minHeight: Math.max(0, availableHeight - bottom - 8) }]]}>
          {!game && loading && <ActivityIndicator style={styles.loader} size="large" color={colors.accent} />}
          {!game && !loading && <View style={styles.card}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.primary} onPress={() => void load()} accessibilityRole="button"><Text style={styles.primaryText}>{t('common.retry')}</Text></TouchableOpacity></View>}
          {game && !!error && errorCode !== 'startError' && (!keyboardVisible || remaining === 0) && <TouchableOpacity style={styles.card} onPress={() => void load()} accessibilityRole="button"><Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text><Text style={styles.accent}>{t('common.retry')}</Text></TouchableOpacity>}
          {game && tab === 'play' && <>
            <View style={[styles.card, styles.boardCard]}>
              <Text style={styles.muted}>{t('wordGame.attempts', { n: game.guesses.length })}</Text>
              {game.startedAt && game.status === 'playing' && <Text style={styles.playTime}>{t('wordGame.elapsed')}: {playTime}</Text>}
              <View style={styles.board}>
                {Array.from({ length: 6 }, (_, row) => {
                  const guess = game.guesses[row];
                  const active = !guess && row === game.guesses.length && game.status === 'playing' && !!game.startedAt && !revealing;
                  return <View key={row} style={styles.tileRow}>{Array.from({ length: game.length }, (_, col) => {
                    const letter = guess?.word[col] ?? (active ? draft[col]?.trim() : '') ?? '';
                    const state = guess?.feedback[col];
                    const revealId = reveal?.row === row ? reveal.id : undefined;
                    const labelValues = { row: row + 1, col: col + 1, letter: letter || t('wordGame.blank') };
                    const selected = active && cursor === col && !inputDisabled && !uncertain;
                    return <DailyWordTile key={`${col}-${revealId ?? 'static'}`} letter={letter} state={state} active={active} selected={selected}
                      onSelect={active && !inputDisabled && !uncertain ? () => controller.selectCell(col) : undefined} size={cellSize}
                      label={`${t('wordGame.cell', { ...labelValues, state: t(`wordGame.${state ?? 'draft'}`) })}${selected ? `, ${t('wordGame.selectedCell')}` : ''}`}
                      pendingLabel={t('wordGame.cell', { ...labelValues, state: t('wordGame.revealing') })}
                      column={col} revealId={revealId} onRevealed={onTileRevealed} />;
                  })}</View>;
                })}
              </View>
              {game.status === 'playing' && !!game.startedAt && <Text style={styles.cellHint}>{t('wordGame.tapCellHint')}</Text>}
              {!completed && <View style={styles.legend}>{(['correct', 'present', 'absent'] as const).map((state) => <View key={state} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: tileColors[state] }]} /><Text style={styles.legendText}>{t(`wordGame.${state}`)}</Text></View>)}</View>}
              {game.status === 'playing' && !game.startedAt && remaining > 0 && <>
                <Text style={styles.cellHint}>{t('wordGame.startHint')}</Text>
                {errorCode === 'startError' && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
                <TouchableOpacity onPress={() => void controller.start()} disabled={starting || loading || !canPlay} style={[styles.primary, (starting || loading || !canPlay) && styles.disabled]} accessibilityRole="button" accessibilityState={{ disabled: starting || loading || !canPlay }}>
                  {starting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('wordGame.start')}</Text>}
                </TouchableOpacity>
              </>}
            </View>
            {completed && <View style={styles.result} accessibilityLiveRegion="polite">
              {game.status === 'won' && <View style={styles.resultHeading}>
                <Ionicons name="trophy" size={22} color={colors.accent} />
                <Text style={styles.resultTitle}>{t('wordGame.won')}</Text>
              </View>}
              {game.status === 'lost' && <Text style={styles.subtitle}>{t('wordGame.solution')} <Text style={styles.bold}>{game.solution}</Text></Text>}
              <View style={styles.scoreGroup} accessible accessibilityLabel={`${game.score.toLocaleString(lang)} ${t('wordGame.points')}`}>
                <Text style={styles.bigScore}>{game.score.toLocaleString(lang)}</Text>
                <Text style={styles.scoreLabel}>{t('wordGame.points')}</Text>
              </View>
              <View style={styles.timeBlock}>
                <Ionicons name="time-outline" size={16} color={colors.inkSoft} />
                <Text style={styles.resultTime}>{t('wordGame.elapsed')}: <Text style={styles.bold}>{playTime}</Text></Text>
              </View>
              <Text style={styles.muted}>{t('wordGame.saved')}</Text>
              <TouchableOpacity onPress={() => void share()} style={styles.primary} accessibilityRole="button"><Ionicons name="share-outline" size={18} color="#fff" /><Text style={styles.primaryText}>{t('wordGame.share')}</Text></TouchableOpacity>
            </View>}
            <View style={styles.next}><Ionicons name="time-outline" size={16} color={colors.inkSoft} /><Text style={styles.muted}>{t('wordGame.next')} <Text style={styles.bold}>{countdown}</Text></Text></View>
          </>}
        </View>
      </ScrollView>}
      {game && tab !== 'play' && <View style={{ flex: 1, marginTop: chromeHeight + 12, paddingBottom: bottom }}>
        <WordRankingList key={`${userId}:${game.day}:${tab}:${activeGroupId}:${period}:${periodOffset}`}
          ranking={ranking} dates={rankingDates} closed={periodOffset > 0} allTime={period === 'all'}
          unavailableGroup={tab === 'group' && cartHydrated && !activeCart}
          error={rankError} locked={tab === 'ranking' && (profileLoading || limitsApply(isPremium))}
          onUnlock={openRankingPaywall} previousLabel={previousPeriodLabel}
          onPrevious={showPreviousPeriod ? previousPeriod : undefined}
          onCurrent={showNextPeriod ? currentPeriod : undefined}
          onRefresh={refreshRanking} />
      </View>}
      <View style={styles.chrome} onLayout={(event) => setChromeHeight(event.nativeEvent.layout.height)}>
        <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
          {header}
          <View style={[styles.chromeSegments, { paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}>
            <SlidingSegments<GameTab> emphasized opaqueSelection={!glassAvailable} value={tab} onChange={selectTab}
              segments={[
                { key: 'play', label: t('wordGame.play'), icon: 'grid-outline' },
                { key: 'ranking', label: t('wordGame.ranking'), icon: 'trophy-outline' },
                { key: 'group', label: t('wordGame.group'), icon: 'people-outline' },
              ]} />
            {game && tab !== 'play' && <SlidingSegments<RankingPeriod> condensed emphasized transparentTrack={glassAvailable} opaqueSelection={!glassAvailable} value={period} onChange={selectPeriod}
              segments={periods.map((value) => ({ key: value, label: t(`wordGame.${value}`) }))} />}
          </View>
        </GlassSurface>
      </View>
      {keyboardVisible && game && <View
        onLayout={(event) => setKeyboardHeight(event.nativeEvent.layout.height)}
        style={[
          styles.keyboardDock,
          glassAvailable && styles.keyboardDockFloating,
          { paddingBottom: bottom, paddingLeft: Math.max(6, insets.left), paddingRight: Math.max(6, insets.right) },
        ]}>
        {glassAvailable && <GlassSurface pointerEvents="none" style={[
          styles.keyboardGlass,
          { bottom: Math.max(8, bottom - 8), left: Math.max(6, insets.left - 6), right: Math.max(6, insets.right - 6) },
        ]} />}
        {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        <View style={styles.keyboard}>
          {['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM⌫'].map((row) => <View key={row} style={styles.keyRow}>{Array.from(row).map((letter) => {
            const state = keyStates[letter];
            return <WordKeyboardKey key={letter} onPress={() => key(letter)} onPressIn={keyboardHaptic} disabled={inputDisabled || uncertain} reducedMotion={reducedMotion} style={[
              styles.key,
              letter === '⌫' && styles.deleteKey,
              state && { backgroundColor: tileColors[state], borderColor: tileColors[state] },
            ]}
              label={letter === '⌫' ? t('wordGame.erase') : `${letter}${state ? `, ${t(`wordGame.${state}`)}` : ''}`}>
              <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={1} style={[styles.keyLetter, letter === '⌫' && styles.deleteLetter, state && styles.white]}>{letter}</Text>
            </WordKeyboardKey>;
          })}</View>)}
          <TouchableOpacity onPress={() => void send()} onPressIn={keyboardHaptic} disabled={submitDisabled} style={[styles.primary, submitDisabled && styles.disabled]} accessibilityRole="button" accessibilityState={{ disabled: submitDisabled }}>
            {sending ? <ActivityIndicator color="#fff" /> : <><Ionicons name="arrow-forward" color="#fff" size={18} /><Text style={styles.primaryText}>{t(revealing ? 'wordGame.revealing' : uncertain ? 'wordGame.retrySend' : 'wordGame.enter')}</Text></>}
          </TouchableOpacity>
        </View>
      </View>}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  chromeSegments: { paddingBottom: 12, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, color: colors.ink, fontFamily: fonts.bold },
  scroll: { paddingTop: 4 }, content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 12 },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  card: { backgroundColor: colors.white, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.border, gap: 16 },
  boardCard: { padding: 12, gap: 12 },
  completedContent: { gap: 8, justifyContent: 'space-between' },
  muted: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12 },
  board: { gap: 7, alignItems: 'center' }, tileRow: { flexDirection: 'row', gap: 7 },
  cellHint: { textAlign: 'center', fontFamily: fonts.medium, fontSize: 11, color: colors.inkSoft },
  playTime: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 13, color: colors.accent },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 }, legendText: { fontFamily: fonts.regular, fontSize: 10, color: colors.inkSoft },
  keyboardDock: { paddingTop: 10, backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 8 },
  keyboardDockFloating: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 11, backgroundColor: 'transparent', borderTopWidth: 0 },
  keyboardGlass: { ...StyleSheet.absoluteFill, borderRadius: 26, overflow: 'hidden' },
  keyboard: { gap: 8, maxWidth: 560, width: '100%', alignSelf: 'center' }, keyRow: { flexDirection: 'row', gap: 3, justifyContent: 'center' },
  key: { flex: 1, minHeight: 56, maxWidth: 52, backgroundColor: '#fff', borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#cbd0d8', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 1, elevation: 2 },
  deleteKey: { backgroundColor: '#d7dbe3', borderColor: '#b7bdc8' },
  keyLetter: { fontSize: 22, fontWeight: '400', color: '#232832', includeFontPadding: false, maxWidth: '100%', textAlign: 'center' },
  deleteLetter: { fontSize: 25 },
  primary: { minHeight: 48, backgroundColor: colors.accent, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 12, alignSelf: 'stretch' },
  primaryText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 }, disabled: { opacity: 0.45 },
  error: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  result: { backgroundColor: colors.accentLight, borderRadius: 24, padding: 18, alignItems: 'center', gap: 10 }, resultTitle: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 20, textAlign: 'center', color: colors.ink },
  resultHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  scoreGroup: { alignItems: 'center' },
  scoreLabel: { marginTop: -4, fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  timeBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  resultTime: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft },
  bigScore: { fontFamily: fonts.bold, fontSize: 42, lineHeight: 48, color: colors.accent, fontVariant: ['tabular-nums'] }, bold: { fontFamily: fonts.bold }, white: { color: '#fff' }, accent: { color: colors.accent },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  loader: { padding: 40 },
});
