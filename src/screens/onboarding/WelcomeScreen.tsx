/** Paso 0 — Bienvenida. Presenta el valor de la app antes del alta. */
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useProfile } from '../../context/ProfileContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import OnboardingLayout from './OnboardingLayout';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; titleKey: string; textKey: string }[] = [
  { icon: 'grid-outline',   titleKey: 'onboarding.featCatalogTitle', textKey: 'onboarding.featCatalogText' },
  { icon: 'people-outline', titleKey: 'onboarding.featListTitle',    textKey: 'onboarding.featListText' },
  { icon: 'map-outline',    titleKey: 'onboarding.featZonesTitle',   textKey: 'onboarding.featZonesText' },
];

export default function WelcomeScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { profile } = useProfile();
  const firstName = profile?.name?.split(' ')[0];

  return (
    <OnboardingLayout
      title={firstName ? t('onboarding.welcomeTitleNamed', { name: firstName }) : t('onboarding.welcomeTitle')}
      subtitle={t('onboarding.welcomeSubtitle')}
      continueLabel={t('onboarding.welcomeCta')}
      onContinue={() => {
        Haptics.selectionAsync();
        navigation.navigate('Username');
      }}
    >
      <View style={styles.list}>
        {FEATURES.map((f) => (
          <View key={f.titleKey} style={styles.row}>
            <View style={styles.iconBox}>
              <Ionicons name={f.icon} size={20} color={colors.accent} />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.rowTitle}>{t(f.titleKey)}</Text>
              <Text style={styles.rowText}>{t(f.textKey)}</Text>
            </View>
          </View>
        ))}
      </View>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  list: { gap: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 14,
  },
  iconBox: {
    width: 44, height: 44, flexShrink: 0,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  textCol: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.ink },
  rowText: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
});
