import { useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { limitsApply } from '../constants/limits';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { colors } from '../constants/colors';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import WordProfileStatistics from '../components/WordProfileStatistics';
import PaywallModal from '../components/PaywallModal';
import { glassAvailable } from '../components/GlassSurface';

export default function WordStatisticsScreen() {
  const styles = useThemedStyles(themedStyles);
  const { session } = useAuth();
  const { isPremium, loading: profileLoading } = useProfile();
  const { t } = useTranslation();
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const [headerHeight, setHeaderHeight] = useState(headerTop + 48);
  const [paywallVisible, setPaywallVisible] = useState(false);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader
        title={t('wordGame.myStats')}
        icon="stats-chart-outline"
        headerTop={headerTop}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
      />
      <ScrollView
        contentContainerStyle={[styles.content, {
          paddingTop: glassAvailable ? headerHeight : 0,
          paddingBottom: bottomPad,
        }]}
      >
        {session?.user.id && <WordProfileStatistics key={session.user.id} userId={session.user.id}
          positionsLocked={profileLoading || limitsApply(isPremium)} onUnlock={() => setPaywallVisible(true)} />}
      </ScrollView>
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 20 },
});
