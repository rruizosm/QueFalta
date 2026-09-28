import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Pattern, Rect } from 'react-native-svg';
import type { WordRank, WordRankingWindow } from '../api/wordGame';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { WORD_RANKING_GLASS } from '../constants/wordRankingGlass';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import UserAvatar from './UserAvatar';
import WordRankingPodium from './WordRankingPodium';

interface Props {
  ranking: WordRankingWindow | null;
  dates: string | null;
  closed: boolean;
  allTime: boolean;
  unavailableGroup: boolean;
  error: boolean;
  locked: boolean;
  onUnlock: () => void;
  previousLabel: string;
  onPrevious?: () => void;
  onCurrent?: () => void;
  onRefresh: () => void;
}

/** Fixed, very low contrast grain breaks gradient banding without muddying the material. */
function GlassGrain({ color }: { color: string }) {
  return <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false}>
    <Defs>
      <Pattern id="rankingGlassGrain" patternUnits="userSpaceOnUse" width={9} height={9}>
        <Rect x={1} y={2} width={1} height={1} fill={color} opacity={0.018} />
        <Rect x={6} y={5} width={1} height={1} fill={color} opacity={0.012} />
        <Rect x={3} y={7} width={1} height={1} fill={color} opacity={0.015} />
      </Pattern>
    </Defs>
    <Rect width="100%" height="100%" fill="url(#rankingGlassGrain)" />
  </Svg>;
}

/** Only visible rows mount avatars. Game clock updates do not rerender this list. */
function RankingRow({ row, height, locked, onUnlock }: { row: WordRank; height: number; locked: boolean; onUnlock: () => void }) {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const { t, lang } = useTranslation();
  const targetRef = useRef<View>(null);
  const [hovered, setHovered] = useState(false);
  const hidden = locked && row.rank >= 4;
  const glass = WORD_RANKING_GLASS[scheme];
  return <View style={[styles.row, { height }, row.isMe && !locked && styles.myRow]}>
    <Text accessible={!hidden} numberOfLines={1} style={[styles.rank, { width: Math.max(38, 18 + String(row.rank).length * 9) }]}>
      <Text style={styles.rankHash}>#</Text>{row.rank}
    </Text>
    <Pressable
      onPress={hidden ? onUnlock : undefined} disabled={!hidden}
      onHoverIn={hidden ? () => setHovered(true) : undefined}
      onHoverOut={hidden ? () => setHovered(false) : undefined}
      accessible={hidden} accessibilityRole={hidden ? 'button' : undefined}
      accessibilityLabel={hidden ? `#${row.rank}` : undefined}
      accessibilityHint={hidden ? t('wordGame.positionRequiresPlus') : undefined}
      style={({ pressed }) => [styles.identity, hidden && styles.glassShadow,
        hidden && { backgroundColor: glass.surface, shadowColor: glass.shadow, shadowOpacity: glass.shadowOpacity + (hovered ? 0.03 : 0) },
        hovered && styles.glassHovered, pressed && styles.glassPressed]}>
      <View style={[styles.identityClip, hidden && styles.glassClip, hidden && { borderColor: glass.border }]}>
        <BlurTargetView ref={targetRef} style={[styles.identityContent, hidden && styles.glassContent]}
          accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}>
          <UserAvatar avatarUrl={row.avatarUrl} initials={row.username?.slice(0, 2).toUpperCase() ?? '?'} color={colors.accent} size={34} />
          <View style={styles.nameWrap}>
            <Text numberOfLines={1} style={styles.name}>{row.username ? `@${row.username}` : t('wordGame.player')}{row.isMe && !locked ? ` · ${t('wordGame.you')}` : ''}</Text>
            <Text numberOfLines={1} style={styles.wins}>{t('wordGame.wins', { n: row.wins })}</Text>
          </View>
          <Text style={styles.score}>{row.score.toLocaleString(lang)}</Text>
        </BlurTargetView>
        {hidden && <>
          <BlurView pointerEvents="none" blurTarget={targetRef} blurMethod="dimezisBlurView"
            blurReductionFactor={WORD_RANKING_GLASS.blurReductionFactor}
            intensity={WORD_RANKING_GLASS.blurIntensity}
            tint={scheme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
            style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: glass.surface }]} />
          <LinearGradient pointerEvents="none" colors={glass.gradient} locations={[0, 0.42, 1]}
            start={{ x: 0, y: 0.3 }} end={{ x: 1, y: 0.7 }} style={StyleSheet.absoluteFill} />
          <LinearGradient pointerEvents="none" colors={glass.highlight} locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <GlassGrain color={glass.grain} />
          <View pointerEvents="none" style={[styles.glassEdge, { backgroundColor: glass.edge }]} />
        </>}
      </View>
    </Pressable>
  </View>;
}

function WordRankingList({ ranking, dates, closed, allTime, unavailableGroup, error, locked, onUnlock, previousLabel, onPrevious, onCurrent, onRefresh }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const rowHeight = Math.max(72, Math.ceil(35 * fontScale + 25));
  const list = useRef<FlatList<WordRank>>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const rows = useMemo(() => {
    if (!ranking || unavailableGroup || error) return [];
    const rest = ranking.leaders.slice(3);
    if (!locked && ranking.me && !ranking.leaders.some((row) => row.isMe)) rest.push(ranking.me);
    return rest;
  }, [ranking, unavailableGroup, error, locked]);
  const ownIndex = rows.findIndex((row) => row.isMe);
  const showMe = useCallback(() => {
    list.current?.scrollToOffset({ offset: ownIndex < 0 ? 0 : Math.max(0, 8 + headerHeight + ownIndex * rowHeight - 8), animated: true });
  }, [ownIndex, headerHeight, rowHeight]);
  const renderItem = useCallback(({ item: row }: { item: WordRank }) =>
    <RankingRow row={row} height={rowHeight} locked={locked} onUnlock={onUnlock} />, [rowHeight, locked, onUnlock]);

  return <View style={[styles.frame, { marginLeft: Math.max(16, insets.left), marginRight: Math.max(16, insets.right) }]}>
    <FlatList
    ref={list} data={rows} renderItem={renderItem}
    keyExtractor={(row, index) => `${row.rank}:${index}`}
    initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5}
    getItemLayout={(_, index) => ({ index, length: rowHeight, offset: 8 + headerHeight + index * rowHeight })}
    style={styles.list}
    contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={colors.accent} />}
    ListHeaderComponent={<View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
      <View style={styles.header}>
        {dates && !allTime && <Text style={styles.date}>{t(closed ? 'wordGame.closedPeriod' : 'wordGame.currentPeriod')}: {dates}</Text>}
        {unavailableGroup ? <Text style={styles.subtitle}>{t('wordGame.noActiveGroup')}</Text>
          : error ? <TouchableOpacity onPress={onRefresh} style={styles.empty} accessibilityRole="button"><Text style={styles.subtitle}>{t('wordGame.loadError')}</Text><Text style={styles.actionText}>{t('common.retry')}</Text></TouchableOpacity>
            : !ranking ? <ActivityIndicator style={styles.empty} color={colors.accent} />
              : ranking.leaders.length ? <>
                <WordRankingPodium leaders={ranking.leaders.slice(0, 3)} highlightMe={!locked} />
                <View style={styles.actions}>
                  {(onPrevious || onCurrent) && <TouchableOpacity onPress={onPrevious ?? onCurrent} style={styles.action} accessibilityRole="button">
                    <Ionicons name={onPrevious ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.accent} />
                    <Text style={styles.actionText}>{onPrevious ? previousLabel : t('wordGame.currentPeriodButton')}</Text>
                  </TouchableOpacity>}
                  <TouchableOpacity onPress={locked ? onUnlock : showMe} disabled={!locked && !ranking.me}
                    style={[styles.action, !locked && !ranking.me && styles.disabled]} accessibilityRole="button"
                    accessibilityState={{ disabled: !locked && !ranking.me }}
                    accessibilityHint={locked ? t('wordGame.positionRequiresPlus') : undefined}>
                    <Ionicons name={locked ? 'lock-closed-outline' : 'locate-outline'} size={16} color={colors.accent} /><Text style={styles.actionText}>{t('wordGame.myPosition')}</Text>
                  </TouchableOpacity>
                </View>
                {rows.length > 0 && <View style={styles.divider} />}
              </> : <View style={styles.empty}><Ionicons name="podium-outline" size={44} color={colors.accent} /><Text style={styles.title}>{t('wordGame.emptyRanking')}</Text><Text style={styles.subtitle}>{t('wordGame.emptyRankingBody')}</Text></View>}
      </View>
    </View>}
    />
  </View>;
}
export default memo(WordRankingList);

const themedStyles = () => StyleSheet.create({
  frame: { flex: 1, paddingVertical: 8, backgroundColor: colors.white, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  list: { flex: 1, overflow: 'hidden' },
  content: { paddingHorizontal: 16, paddingVertical: 8 },
  header: { gap: 16, paddingBottom: 16 },
  date: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: colors.inkSoft },
  title: { fontFamily: fonts.bold, fontSize: 21, textAlign: 'center', color: colors.ink },
  empty: { paddingVertical: 32, alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', gap: 8 },
  action: { flex: 1, minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8, borderRadius: 10, backgroundColor: colors.accentLight },
  actionText: { fontFamily: fonts.semibold, fontSize: 11, color: colors.accent },
  disabled: { opacity: 0.45 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, borderRadius: 10 },
  myRow: { backgroundColor: colors.accentLight },
  identity: { flex: 1, minWidth: 0 },
  identityClip: { flex: 1, minWidth: 0 },
  identityContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  glassShadow: { borderRadius: WORD_RANKING_GLASS.radius, shadowOffset: { width: 0, height: 6 }, shadowRadius: 18, elevation: 3 },
  glassClip: { minHeight: WORD_RANKING_GLASS.minHeight, borderRadius: WORD_RANKING_GLASS.radius, borderWidth: 1, overflow: 'hidden' },
  glassContent: { paddingHorizontal: WORD_RANKING_GLASS.insetX, paddingVertical: 6 },
  glassEdge: { position: 'absolute', top: 1, left: 12, width: '45%', height: 1, borderRadius: 1 },
  glassHovered: { transform: [{ translateY: -1 }] },
  glassPressed: { transform: [{ translateY: 1 }], opacity: 0.96 },
  rank: { fontFamily: fonts.bold, fontSize: 18, fontVariant: ['tabular-nums'], letterSpacing: -0.35, color: colors.ink },
  rankHash: { fontFamily: fonts.medium, color: colors.inkSoft },
  nameWrap: { flex: 1, gap: 3 },
  name: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 18, color: colors.ink },
  wins: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 14, color: colors.inkSoft },
  score: { fontFamily: fonts.bold, fontSize: 19, color: colors.accent },
});
