import {
  View, Text, ScrollView, TouchableOpacity, Image, Share,
  StyleSheet, StatusBar, Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileRow from '../components/ProfileRow';

const LOGO = require('../../assets/quefalta-blue.png');

const PRIVACY_URL = 'https://quefalta.es/privacidad';
const TERMS_URL   = 'https://quefalta.es/condiciones';
const COOKIES_URL = 'https://quefalta.es/cookies';
const NEWS_URL    = 'https://quefalta.es/novedades';
const SITE_URL    = 'https://quefalta.es';
const SUPPORT_URL = 'https://quefalta.es/apoyar';
// Aún no hay ficha en la App Store (CONTEXTO: pendiente). Cuando exista, poner la
// URL aquí y la fila "Valorar" aparecerá automáticamente.
const APP_STORE_URL = '';

export default function AboutScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();

  const version = Constants.expoConfig?.version ?? '1.0.0';
  const build =
    Constants.expoConfig?.ios?.buildNumber ??
    String(Constants.expoConfig?.android?.versionCode ?? '');
  const versionText = build
    ? `${t('about.versionLabel')} ${version} (${build})`
    : `${t('about.versionLabel')} ${version}`;

  const handleShare = () => {
    Share.share({ message: t('about.shareMessage') }).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('about.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>

        {/* MARCA */}
        <View style={styles.brand}>
          <Image source={LOGO} style={styles.logo} resizeMode="cover" />
          <Text style={styles.brandName}>QuéFalta</Text>
          <Text style={styles.version}>{versionText}</Text>
          <Text style={styles.tagline}>{t('about.tagline')}</Text>
        </View>

        {/* LEGAL */}
        <Text style={styles.sectionLabel}>{t('about.sectionLegal')}</Text>
        <View style={styles.section}>
          <ProfileRow
            icon="document-text-outline"
            label={t('about.privacyPolicy')}
            onPress={() => Linking.openURL(PRIVACY_URL)}
          />
          <ProfileRow
            icon="reader-outline"
            label={t('about.terms')}
            onPress={() => Linking.openURL(TERMS_URL)}
          />
          <ProfileRow
            icon="shield-outline"
            label={t('about.cookies')}
            onPress={() => Linking.openURL(COOKIES_URL)}
            last
          />
        </View>

        {/* APLICACIÓN */}
        <Text style={styles.sectionLabel}>{t('about.sectionApp')}</Text>
        <View style={styles.section}>
          <ProfileRow
            icon="sparkles-outline"
            label={t('about.whatsNew')}
            onPress={() => Linking.openURL(NEWS_URL)}
          />
          {APP_STORE_URL ? (
            <ProfileRow
              icon="star-outline"
              label={t('about.rate')}
              onPress={() => Linking.openURL(APP_STORE_URL)}
            />
          ) : null}
          <ProfileRow
            icon="share-social-outline"
            label={t('about.share')}
            onPress={handleShare}
          />
          <ProfileRow
            icon="globe-outline"
            label={t('about.website')}
            onPress={() => Linking.openURL(SITE_URL)}
          />
          <ProfileRow
            icon="heart-outline"
            label={t('about.support')}
            onPress={() => Linking.openURL(SUPPORT_URL)}
            last
          />
        </View>

        {/* CRÉDITOS */}
        <Text style={styles.sectionLabel}>{t('about.sectionCredits')}</Text>
        <View style={styles.section}>
          <Text style={styles.credits}>{t('about.credits')}</Text>
        </View>

        <Text style={styles.footer}>{t('about.madeWith')}</Text>
        <Text style={styles.footer}>{t('about.copyright', { year: new Date().getFullYear() })}</Text>

      </ScrollView>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 12,
    // paddingTop inline (useHeaderTopPadding)
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  brand: { alignItems: 'center', paddingTop: 20, paddingBottom: 8 },
  logo: { width: 88, height: 88, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  brandName: {
    fontSize: 22, fontFamily: fonts.bold, color: colors.ink,
    letterSpacing: -0.4, marginTop: 12,
  },
  version: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3 },
  tagline: {
    fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft,
    textAlign: 'center', lineHeight: 19, marginTop: 10, paddingHorizontal: 12,
  },

  sectionLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4,
    marginTop: 18, marginBottom: 4,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },
  credits: {
    fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft,
    lineHeight: 18, paddingVertical: 12,
  },

  footer: {
    fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkFaint,
    textAlign: 'center', marginTop: 14,
  },
});
