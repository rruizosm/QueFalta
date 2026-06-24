/** Paso 0 — Bienvenida. Presenta el valor de la app antes del alta. */
import { View, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import OnboardingLayout from './OnboardingLayout';

const FEATURES: { icon: keyof typeof Ionicons.glyphMap; titleKey: string; textKey: string }[] = [
  { icon: 'grid-outline',          titleKey: 'onboarding.featCatalogTitle', textKey: 'onboarding.featCatalogText' },
  { icon: 'people-outline',        titleKey: 'onboarding.featListTitle',    textKey: 'onboarding.featListText' },
  { icon: 'notifications-outline', titleKey: 'onboarding.featNotifTitle',   textKey: 'onboarding.featNotifText' },
  { icon: 'repeat-outline',        titleKey: 'onboarding.featZonesTitle',   textKey: 'onboarding.featZonesText' },
];

export default function WelcomeScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  // "QuéFalta" se resalta en el azul de marca (fijo, no sigue al accent elegido).
  const [titleBefore, titleAfter] = t('onboarding.welcomeTitle').split('QuéFalta');

  return (
    <OnboardingLayout
      title={
        <>
          {titleBefore}
          <Text style={{ color: colors.blue }}>QuéFalta</Text>
          {titleAfter}
        </>
      }
      subtitle={t('onboarding.welcomeSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={t('onboarding.welcomeCta')}
      onContinue={() => {
        Haptics.selectionAsync();
        navigation.navigate('Name');
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
