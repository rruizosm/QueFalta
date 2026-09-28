import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import VerifiedBadge from './VerifiedBadge';

/** Reward hierarchy is editorial, not animated: all surfaces remain opaque. */
export default function WordGamePrizes() {
  const styles = useThemedStyles(themedStyles);
  const { scheme } = useTheme();
  const { t } = useTranslation();
  const dark = scheme === 'dark';
  const goldSurface = dark ? '#382E1E' : '#F8ECCD';
  const goldInk = dark ? '#F1D58D' : '#745014';
  const medals = dark ? ['#F1D58D', '#CCD6E4', '#E7B591'] : ['#8B631C', '#52657C', '#925C36'];
  return <View style={styles.layout}>
    <View style={styles.welcome}>
      <Text style={styles.intro}>{t('wordGame.prizesIntroCompact')}</Text>
      <View style={styles.plus}><VerifiedBadge size={18} marginLeft={0} /><Text style={styles.plusText}>QuéFalta Plus</Text></View>
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons name="calendar-outline" size={20} color={colors.ink} />
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('wordGame.monthlyPrizes')}</Text>
      </View>
      <Text style={styles.caption}>{t('wordGame.monthlyPrizesTiming')}</Text>
      <View style={[styles.monthlyCard, { backgroundColor: goldSurface }]}>
        <View style={styles.winnerLabel}>
          <Ionicons name="trophy-outline" size={19} color={goldInk} />
          <Text style={[styles.rankLabel, { color: goldInk }]}>{t('wordGame.prizePlace', { n: 1 })}</Text>
        </View>
        <Text style={[styles.monthReward, { color: goldInk }]}>{t('wordGame.prizeMonth')}</Text>
      </View>
    </View>

    <View style={styles.section}>
      <View style={styles.sectionHeading}>
        <Ionicons name="ribbon-outline" size={20} color={colors.ink} />
        <Text accessibilityRole="header" style={styles.sectionTitle}>{t('wordGame.annualPrizes')}</Text>
      </View>
      <Text style={styles.caption}>{t('wordGame.annualPrizesTiming')}</Text>
      <View style={styles.annualCard}>
        {[1, 2, 3].map((rank) => <View key={rank} style={styles.annualRow}>
          <View style={[styles.medal, { backgroundColor: rank === 1 ? goldSurface : colors.surfaceAlt }]}>
            <Text style={[styles.medalNumber, { color: medals[rank - 1] }]}>{rank}</Text>
          </View>
          <View style={styles.annualCopy}>
            <Text style={[styles.annualReward, rank === 1 && { color: goldInk }]}>
              {rank === 1 ? t('wordGame.prizeYear') : t('wordGame.prizeMonths', { n: rank === 2 ? 6 : 3 })}
            </Text>
          </View>
        </View>)}
      </View>
    </View>
    <Text style={styles.caption}>{t('wordGame.allPrizesFreePlus')}</Text>
  </View>;
}

const themedStyles = () => StyleSheet.create({
  layout: { gap: 14 },
  welcome: { gap: 7 },
  intro: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
  plus: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  plusText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  section: { gap: 5 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 18, letterSpacing: -0.3, color: colors.ink },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.inkSoft },
  monthlyCard: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 3, padding: 13, borderRadius: 16 },
  winnerLabel: { flex: 1, minWidth: 90, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankLabel: { flex: 1, fontFamily: fonts.semibold, fontSize: 14 },
  monthReward: { fontFamily: fonts.bold, fontSize: 29, letterSpacing: -0.6 },
  annualCard: { flexDirection: 'row', gap: 7, marginTop: 3 },
  annualRow: { flex: 1, minWidth: 0, alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 16, backgroundColor: colors.white },
  medal: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  medalNumber: { fontFamily: fonts.bold, fontSize: 17 },
  annualCopy: { alignSelf: 'stretch', minWidth: 0 },
  annualReward: { textAlign: 'center', fontFamily: fonts.bold, fontSize: 19, letterSpacing: -0.4, color: colors.ink },
});
