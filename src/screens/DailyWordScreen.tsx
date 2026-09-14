import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import SlidingSegments from '../components/SlidingSegments';
import AmbientBubbleBackdrop from '../components/AmbientBubbleBackdrop';
import { fetchWordRanking, type LetterState, type RankingPeriod, type WordRanking, type WordRank } from '../api/wordGame';
import { useWordGame } from '../hooks/useWordGame';
import { useReducedMotion } from '../hooks/useReducedMotion';
import DailyWordTile, { wordTileColors as tileColors } from '../components/DailyWordTile';
import WordRankingPodium from '../components/WordRankingPodium';
import WordGameInfoModal from '../components/WordGameInfoModal';

const priority: Record<LetterState, number> = { absent: 0, present: 1, correct: 2 };
const periods: RankingPeriod[] = ['daily', 'weekly', 'monthly', 'all'];
interface PendingReveal { id: number; userId: string; gameId: string; row: number; word: string }
function resultHaptic(status: 'playing' | 'won' | 'lost') {
  if (status === 'playing') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else void Haptics.notificationAsync(status === 'won' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

export default function DailyWordScreen() {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const { t, lang } = useTranslation();
  const { session } = useAuth();
  const navigation = useNavigation();
  const top = useHeaderTopPadding(56);
  const insets = useSafeAreaInsets();
  const bottom = Math.max(16, insets.bottom);
  const { width, height } = useWindowDimensions();
  const userId = session?.user.id;
  const [noticeAcceptedBy, setNoticeAcceptedBy] = useState<string | null>(null);
  const noticeShownFor = useRef<string | null>(null);
  const noticeKey = userId ?? 'signed-out';
  const canPlay = lang !== 'ca' || noticeAcceptedBy === noticeKey;
  useFocusEffect(useCallback(() => {
    if (canPlay || noticeShownFor.current === noticeKey) return;
    noticeShownFor.current = noticeKey;
    Alert.alert(t('wordGame.languageNoticeTitle'), t('wordGame.languageNoticeBody'), [
      { text: t('wordGame.languageNoticeContinue'), onPress: () => setNoticeAcceptedBy(noticeKey) },
    ], { cancelable: false });
  }, [canPlay, noticeKey, t]));
  const { game, draft, loading, sending, uncertain, error: errorCode, remaining, controller } = useWordGame(userId, canPlay);
  const error = errorCode ? t(`wordGame.${errorCode}`, { n: game?.length ?? 5 }) : '';
  const load = () => { if (canPlay) return controller.refresh(); };
  const [tab, setTab] = useState<'play' | 'ranking'>('play');
  const [showRules, setShowRules] = useState(false);
  const [period, setPeriod] = useState<RankingPeriod>('daily');
  const [ranking, setRanking] = useState<WordRanking | null>(null);
  const [rankError, setRankError] = useState(false);
  const [rankLoading, setRankLoading] = useState(false);
  const [rankVersion, setRankVersion] = useState(0);
  const [chromeHeight, setChromeHeight] = useState(top + 112);
  const [keyboardHeight, setKeyboardHeight] = useState(230 + bottom);
  const reducedMotion = useReducedMotion();
  const [pendingReveal, setPendingReveal] = useState<PendingReveal | null>(null);
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
  useFocusEffect(useCallback(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state !== 'active') cancelReveal(); });
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
  const selectTab = (value: 'play' | 'ranking') => { cancelReveal(); setTab(value); };

  useEffect(() => {
    if (tab !== 'ranking' || !game) return;
    let cancelled = false;
    setRankLoading(true);
    setRankError(false);
    setRanking(null);
    fetchWordRanking(period).then((value) => {
      if (!cancelled) setRanking(value);
    }).catch(() => { if (!cancelled) setRankError(true); })
      .finally(() => { if (!cancelled) setRankLoading(false); });
    return () => { cancelled = true; };
  }, [tab, game, period, rankVersion, userId]);

  const send = async () => {
    if (!canPlay || pendingRef.current || !game || !userId || sending || loading || game.status !== 'playing') return;
    // Mark the submitted slot before requesting it, so no frame shows all the
    // result colors (or the final score) before the native flip has started.
    const pending = { id: ++revealSequence.current, userId, gameId: game.id, row: game.guesses.length, word: draft };
    pendingRef.current = pending;
    setPendingReveal(pending);
    setRevealedColumns(0);
    const status = await controller.send();
    if (pendingRef.current !== pending) return;
    const current = controller.state.game;
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
    const icons = { correct: '🟩', present: '🟨', absent: '⬜' };
    try {
      await Share.share({ message: `${t('wordGame.shareTitle')}\n${game.day} · ${game.language.toUpperCase()}\n${t('wordGame.shareScore', { n: game.status === 'won' ? game.guesses.length : 'X', score: game.score })}\n\n${game.guesses.map((guess) => guess.feedback.map((state) => icons[state]).join('')).join('\n')}\n\nhttps://quefalta.es` });
    } catch { /* Dismissal of the share sheet does not affect the saved game. */ }
  };

  const cellSize = Math.min(height >= 900 ? 50 : 40, Math.floor((Math.min(width - insets.left - insets.right - 64, 430) - 5 * 7) / (game?.length ?? 5)));
  const keyboardVisible = (game?.status === 'playing' || revealing) && tab === 'play';
  const inputDisabled = !canPlay || sending || loading || remaining === 0 || pendingReveal !== null;
  const submitDisabled = inputDisabled || draft.length !== game?.length;
  const countdown = [Math.floor(remaining / 3600), Math.floor(remaining % 3600 / 60), remaining % 60].map((n) => String(n).padStart(2, '0')).join(':');
  const rankRow = (row: WordRank) => (
    <View key={`${row.rank}-${row.username}-${row.isMe}`} style={[styles.rankRow, row.isMe && styles.myRow]}>
      <Text style={styles.rankNumber}>{row.rank <= 3 ? ['🥇', '🥈', '🥉'][row.rank - 1] : `#${row.rank}`}</Text>
      <View style={styles.rankNameWrap}>
        <Text numberOfLines={1} style={styles.rankName}>{row.username ? `@${row.username}` : t('wordGame.player')}{row.isMe ? ` · ${t('wordGame.you')}` : ''}</Text>
        <Text style={styles.muted}>{t('wordGame.wins', { n: row.wins })}</Text>
      </View>
      <Text style={styles.rankScore}>{row.score.toLocaleString(lang)}</Text>
    </View>
  );
  const header = (
      <View style={[styles.header, { paddingTop: top, paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.iconButton, glassAvailable && styles.glassIconButton]} accessibilityRole="button" accessibilityLabel={t('common.back')}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('wordGame.title')}</Text>
        <TouchableOpacity onPress={() => setShowRules(true)} style={[styles.iconButton, glassAvailable && styles.glassIconButton]} accessibilityRole="button" accessibilityLabel={t('wordGame.rules')}>
          <Ionicons name="help-circle-outline" size={24} color={colors.ink} />
        </TouchableOpacity>
      </View>
  );

  return (
    <View style={styles.screen}>
      <WordGameInfoModal visible={showRules}
        title={t('wordGame.rules')} body={t('wordGame.rulesBody')}
        closeLabel={t('wordGame.rulesClose')} onClose={() => setShowRules(false)} />
      {glassAvailable && <AmbientBubbleBackdrop />}
      {!glassAvailable && header}
      <ScrollView
        scrollIndicatorInsets={{ top: glassAvailable ? chromeHeight : 0, bottom: glassAvailable && keyboardVisible ? keyboardHeight : 0 }}
        contentContainerStyle={[styles.scroll, {
          paddingTop: glassAvailable ? chromeHeight + 12 : 4,
          paddingBottom: keyboardVisible ? (glassAvailable ? keyboardHeight + 12 : 12) : bottom,
          paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right),
        }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={colors.accent} progressViewOffset={glassAvailable ? chromeHeight : 0} />}>
        <View style={styles.content}>
          {!glassAvailable && <View style={styles.tabs}>
            {(['play', 'ranking'] as const).map((value) => <TouchableOpacity key={value} onPress={() => selectTab(value)} style={[styles.tab, tab === value && styles.tabActive]} accessibilityRole="button" accessibilityState={{ selected: tab === value }}>
              <Ionicons name={value === 'play' ? 'grid-outline' : 'trophy-outline'} size={18} color={tab === value ? colors.accent : colors.inkSoft} />
              <Text style={[styles.tabText, tab === value && styles.accent]}>{t(`wordGame.${value}`)}</Text>
            </TouchableOpacity>)}
          </View>}
          {!game && loading && <ActivityIndicator style={styles.loader} size="large" color={colors.accent} />}
          {!game && !loading && <View style={styles.card}><Text style={styles.error}>{error}</Text><TouchableOpacity style={styles.primary} onPress={() => void load()} accessibilityRole="button"><Text style={styles.primaryText}>{t('common.retry')}</Text></TouchableOpacity></View>}
          {game && !!error && (!keyboardVisible || remaining === 0) && <TouchableOpacity style={styles.card} onPress={() => void load()} accessibilityRole="button"><Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text><Text style={styles.accent}>{t('common.retry')}</Text></TouchableOpacity>}
          {game && tab === 'play' && <>
            <View style={[styles.card, styles.boardCard]}>
              <View style={styles.boardTop}><Text style={styles.sectionLabel}>{t('wordGame.eyebrow')}</Text><Text style={styles.muted}>{t('wordGame.attempts', { n: game.guesses.length })}</Text></View>
              <View style={styles.board}>
                {Array.from({ length: 6 }, (_, row) => {
                  const guess = game.guesses[row];
                  const active = !guess && row === game.guesses.length && game.status === 'playing' && !revealing;
                  return <View key={row} style={styles.tileRow}>{Array.from({ length: game.length }, (_, col) => {
                    const letter = guess?.word[col] ?? (active ? draft[col] : '') ?? '';
                    const state = guess?.feedback[col];
                    const revealId = reveal?.row === row ? reveal.id : undefined;
                    const labelValues = { row: row + 1, col: col + 1, letter: letter || t('wordGame.blank') };
                    return <DailyWordTile key={`${col}-${revealId ?? 'static'}`} letter={letter} state={state} active={active} size={cellSize}
                      label={t('wordGame.cell', { ...labelValues, state: t(`wordGame.${state ?? 'draft'}`) })}
                      pendingLabel={t('wordGame.cell', { ...labelValues, state: t('wordGame.revealing') })}
                      column={col} revealId={revealId} onRevealed={onTileRevealed} />;
                  })}</View>;
                })}
              </View>
              <View style={styles.legend}>{(['correct', 'present', 'absent'] as const).map((state) => <View key={state} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: tileColors[state] }]} /><Text style={styles.legendText}>{t(`wordGame.${state}`)}</Text></View>)}</View>
            </View>
            {game.status !== 'playing' && !revealing && <View style={styles.result} accessibilityLiveRegion="polite">
              <Ionicons name={game.status === 'won' ? 'trophy' : 'sunny-outline'} size={32} color={colors.accent} />
              <Text style={styles.resultTitle}>{t(game.status === 'won' ? 'wordGame.won' : 'wordGame.lost')}</Text>
              <Text style={styles.subtitle}>{t('wordGame.solution')} <Text style={styles.bold}>{game.solution}</Text></Text>
              <Text style={styles.bigScore}>{game.score.toLocaleString(lang)} <Text style={styles.subtitle}>{t('wordGame.points')}</Text></Text>
              <Text style={styles.muted}>{t('wordGame.saved')}</Text>
              <TouchableOpacity onPress={() => void share()} style={styles.primary} accessibilityRole="button"><Ionicons name="share-outline" size={18} color="#fff" /><Text style={styles.primaryText}>{t('wordGame.share')}</Text></TouchableOpacity>
            </View>}
            <View style={styles.next}><Ionicons name="time-outline" size={16} color={colors.inkSoft} /><Text style={styles.muted}>{t('wordGame.next')} <Text style={styles.bold}>{countdown}</Text></Text></View>
          </>}
          {game && tab === 'ranking' && <>
            {glassAvailable && <GlassSurface style={styles.periodGlass}>
              <SlidingSegments<RankingPeriod> emphasized transparentTrack value={period} onChange={setPeriod}
                segments={periods.map((value) => ({ key: value, label: t(`wordGame.${value}`) }))} />
            </GlassSurface>}
            <View style={styles.card}>
            {!glassAvailable && <View style={styles.periods}>{periods.map((value) => <TouchableOpacity key={value} onPress={() => setPeriod(value)} style={[styles.period, period === value && styles.periodActive]} accessibilityRole="button" accessibilityState={{ selected: period === value }}><Text style={[styles.periodText, period === value && styles.white]}>{t(`wordGame.${value}`)}</Text></TouchableOpacity>)}</View>}
            <Text style={styles.rankingNote}>{t('wordGame.rankingNote')}</Text>
            {rankLoading ? <ActivityIndicator style={styles.loader} color={colors.accent} /> : rankError ? <TouchableOpacity onPress={() => setRankVersion((n) => n + 1)} style={styles.empty} accessibilityRole="button"><Text style={styles.error}>{t('wordGame.loadError')}</Text><Text style={styles.accent}>{t('common.retry')}</Text></TouchableOpacity> : ranking?.leaders.length ? <>
              <WordRankingPodium leaders={ranking.leaders.slice(0, 3)} />
              {ranking.leaders.slice(3).map((row, index) => <View key={index}>{rankRow(row)}</View>)}
              {ranking.me && !ranking.leaders.some((row) => row.isMe) && <><Text style={styles.rankingNote}>{t('wordGame.yourPosition')}</Text>{rankRow(ranking.me)}</>}
            </> : <View style={styles.empty}><Ionicons name="podium-outline" size={44} color={colors.accent} /><Text style={styles.resultTitle}>{t('wordGame.emptyRanking')}</Text><Text style={styles.subtitle}>{t('wordGame.emptyRankingBody')}</Text></View>}
          </View></>}
        </View>
      </ScrollView>
      {glassAvailable && <View style={styles.chrome} onLayout={(event) => setChromeHeight(event.nativeEvent.layout.height)}>
        <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
          {header}
          <View style={[styles.chromeSegments, { paddingLeft: Math.max(16, insets.left), paddingRight: Math.max(16, insets.right) }]}>
            <SlidingSegments<'play' | 'ranking'> emphasized value={tab} onChange={selectTab}
              segments={[
                { key: 'play', label: t('wordGame.play'), icon: 'grid-outline' },
                { key: 'ranking', label: t('wordGame.ranking'), icon: 'trophy-outline' },
              ]} />
          </View>
        </GlassSurface>
      </View>}
      {keyboardVisible && game && <View
        onLayout={(event) => setKeyboardHeight(event.nativeEvent.layout.height)}
        style={[
          styles.keyboardDock,
          glassAvailable && styles.keyboardDockFloating,
          { paddingBottom: bottom, paddingLeft: Math.max(12, insets.left), paddingRight: Math.max(12, insets.right) },
        ]}>
        {glassAvailable && <GlassSurface pointerEvents="none" style={[
          styles.keyboardGlass,
          { bottom: Math.max(8, bottom - 8), left: Math.max(6, insets.left - 6), right: Math.max(6, insets.right - 6) },
        ]} />}
        {!!error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
        <View style={styles.keyboard}>
          {['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM⌫'].map((row) => <View key={row} style={styles.keyRow}>{Array.from(row).map((letter) => {
            const state = keyStates[letter];
            return <TouchableOpacity key={letter} onPress={() => key(letter)} disabled={inputDisabled || uncertain} style={[
              styles.key,
              glassAvailable && { backgroundColor: scheme === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.48)', borderColor: scheme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.7)', borderRadius: 12 },
              state && { backgroundColor: tileColors[state] },
            ]}
              accessibilityRole="button" accessibilityLabel={letter === '⌫' ? t('wordGame.erase') : `${letter}${state ? `, ${t(`wordGame.${state}`)}` : ''}`}>
              <Text style={[styles.keyLetter, state && styles.white]}>{letter}</Text>
            </TouchableOpacity>;
          })}</View>)}
          <TouchableOpacity onPress={() => void send()} disabled={submitDisabled} style={[styles.primary, submitDisabled && styles.disabled]} accessibilityRole="button" accessibilityState={{ disabled: submitDisabled }}>
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
  chromeSegments: { paddingBottom: 12 },
  periodGlass: { borderRadius: 25, padding: 4, overflow: 'hidden' },
  glassIconButton: { backgroundColor: 'transparent', borderWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  headerTitle: { flex: 1, fontSize: 20, color: colors.ink, fontFamily: fonts.bold },
  scroll: { paddingTop: 4 }, content: { width: '100%', maxWidth: 560, alignSelf: 'center', gap: 12 },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: 16, padding: 4, gap: 4 },
  tab: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 },
  tabActive: { backgroundColor: colors.white }, tabText: { fontFamily: fonts.bold, fontSize: 14, color: colors.inkSoft },
  card: { backgroundColor: colors.white, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: colors.border, gap: 16 },
  boardCard: { padding: 12, gap: 12 },
  boardTop: { gap: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }, sectionLabel: { color: colors.accent, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5 },
  muted: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12 },
  board: { gap: 7, alignItems: 'center' }, tileRow: { flexDirection: 'row', gap: 7 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }, legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 2 }, legendText: { fontFamily: fonts.regular, fontSize: 10, color: colors.inkSoft },
  keyboardDock: { paddingTop: 10, backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, gap: 8 },
  keyboardDockFloating: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 11, backgroundColor: 'transparent', borderTopWidth: 0 },
  keyboardGlass: { ...StyleSheet.absoluteFill, borderRadius: 26, overflow: 'hidden' },
  keyboard: { gap: 7, maxWidth: 560, width: '100%', alignSelf: 'center' }, keyRow: { flexDirection: 'row', gap: 4, justifyContent: 'center' },
  key: { flex: 1, minHeight: 48, maxWidth: 48, backgroundColor: colors.white, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  keyLetter: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  primary: { minHeight: 48, backgroundColor: colors.accent, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 12, alignSelf: 'stretch' },
  primaryText: { color: '#fff', fontFamily: fonts.bold, fontSize: 14 }, disabled: { opacity: 0.45 },
  error: { color: colors.ink, fontFamily: fonts.medium, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  result: { backgroundColor: colors.accentLight, borderRadius: 24, padding: 24, alignItems: 'center', gap: 10 }, resultTitle: { fontFamily: fonts.bold, fontSize: 21, textAlign: 'center', color: colors.ink },
  bigScore: { fontFamily: fonts.bold, fontSize: 38, color: colors.accent }, bold: { fontFamily: fonts.bold }, white: { color: '#fff' }, accent: { color: colors.accent },
  next: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  periods: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 }, period: { flex: 1, minWidth: 60, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  periodActive: { backgroundColor: colors.accent }, periodText: { fontFamily: fonts.bold, fontSize: 11, color: colors.inkSoft },
  rankingNote: { fontFamily: fonts.regular, fontSize: 11, color: colors.inkSoft, lineHeight: 17 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, borderRadius: 10 },
  myRow: { backgroundColor: colors.accentLight }, rankNumber: { width: 38, fontFamily: fonts.bold, fontSize: 18, color: colors.ink },
  rankNameWrap: { flex: 1, gap: 3 }, rankName: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink }, rankScore: { fontFamily: fonts.bold, fontSize: 19, color: colors.accent },
  empty: { paddingVertical: 32, alignItems: 'center', gap: 12 },
  loader: { padding: 40 },
});
