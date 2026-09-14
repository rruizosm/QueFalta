import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { WordRank } from '../api/wordGame';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import VerifiedBadge from './VerifiedBadge';

const metals = [
  { accent: '#BA8B28', light: '#F9E8B7', dark: '#44371D' },
  { accent: '#8998AD', light: '#E8EDF4', dark: '#2C3543' },
  { accent: '#BC8965', light: '#F3DFD0', dark: '#413025' },
];

function ProfilePhoto({ uri, size }: { uri?: string | null; size: number }) {
  const [failed, setFailed] = useState(false);
  return uri && /^https:\/\//i.test(uri) && !failed
    ? <Image source={{ uri }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <Ionicons name="person" size={size * 0.55} color={colors.inkSoft} />;
}

/** Server order is stable for ties. Show the actual shared rank, never invent a tiebreaker. */
export default function WordRankingPodium({ leaders }: { leaders: WordRank[] }) {
  const styles = useThemedStyles(themedStyles);
  const { t, lang } = useTranslation();
  const { scheme } = useTheme();
  const [width, setWidth] = useState(300);
  const dark = scheme === 'dark';
  return <View style={styles.podium} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
    {[1, 0, 2].map((index) => {
      const user = leaders[index];
      if (!user) return <View key={index} style={styles.column} />;
      const metal = metals[Math.min(user.rank, 3) - 1];
      const winner = user.rank === 1;
      const third = user.rank === 3;
      const size = Math.max(32, Math.min(winner ? 68 : 54, Math.max(32, (width - 16) / 3 - 24)) - (third ? 8 : 0));
      const name = user.username ? `@${user.username}` : t('wordGame.player');
      return <View key={index} style={[styles.column, winner && styles.winnerColumn]} accessible accessibilityLabel={t('wordGame.podiumPlayer', {
        rank: user.rank, name, score: user.score, plus: user.isPlus ? 'QuéFalta Plus' : '',
      })}>
        <LinearGradient colors={dark ? [metal.dark, colors.paper] : [metal.light, colors.paper]}
          start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }}
          style={[styles.card, { borderColor: `${metal.accent}45` }, winner && styles.winnerCard, third && styles.thirdCard]}>
        <View style={styles.honour}>
          <Ionicons name={winner ? 'trophy-outline' : 'medal-outline'} size={winner ? 23 : 18} color={dark ? metal.light : metal.accent} />
        </View>
        <View style={styles.nameRow}>
          <Text numberOfLines={1} ellipsizeMode="tail" maxFontSizeMultiplier={1.3} style={[styles.name, user.isMe && styles.me]}>{name}</Text>
          {user.isPlus && <VerifiedBadge size={13} marginLeft={3} />}
        </View>
        <View style={styles.portrait}>
        <View style={[styles.avatar, { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderColor: `${metal.accent}80` }]}>
          <ProfilePhoto key={user.avatarUrl ?? 'empty'} uri={user.avatarUrl} size={size} />
        </View>
        <View style={[styles.medal, { backgroundColor: dark ? metal.dark : metal.light, borderColor: colors.paper }]}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.position, { color: dark ? metal.light : metal.dark }]}>{user.rank}</Text>
        </View>
        </View>
        <View style={[styles.divider, { backgroundColor: `${metal.accent}40` }]} />
        <Text numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3} style={[styles.score, winner && styles.winnerScore]}>{user.score.toLocaleString(lang)}</Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.points}>{t('wordGame.points')}</Text>
        </LinearGradient>
      </View>;
    })}
  </View>;
}

const themedStyles = () => StyleSheet.create({
  podium: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, paddingBottom: 14, width: '100%', maxWidth: 430, alignSelf: 'center' },
  column: { flex: 1, minWidth: 0, alignItems: 'center' },
  winnerColumn: { flex: 1.12 },
  card: { width: '100%', alignItems: 'center', borderRadius: 24, borderWidth: 1, paddingHorizontal: 6, paddingTop: 10, paddingBottom: 12 },
  winnerCard: { paddingTop: 12, paddingBottom: 14, shadowColor: '#A77B26', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 3 },
  thirdCard: { paddingTop: 6, paddingBottom: 8 },
  honour: { height: 24, justifyContent: 'center', marginBottom: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', marginBottom: 7, minHeight: 20 },
  name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 11, color: colors.ink },
  me: { color: colors.accent },
  portrait: { alignItems: 'center', marginBottom: 10 },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, backgroundColor: colors.paper },
  medal: { position: 'absolute', bottom: -9, minWidth: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  position: { fontFamily: fonts.bold, fontSize: 12 },
  divider: { width: 22, height: 1, marginTop: 5, marginBottom: 7 },
  score: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink, paddingHorizontal: 2, fontVariant: ['tabular-nums'] },
  winnerScore: { fontSize: 25 },
  points: { fontFamily: fonts.medium, fontSize: 10, color: colors.inkSoft, marginTop: 2 },
});
