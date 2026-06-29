import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Linking, Platform, Alert,
} from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useGuidedTour } from '../context/GuidedTourContext';
import ProfileRow from '../components/ProfileRow';

const SUPPORT_EMAIL = 'contacto@quefalta.es';
const FAQ_KEYS = ['faq1', 'faq2', 'faq3', 'faq4', 'faq5', 'faq6'] as const;

export default function HelpScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { startTour } = useGuidedTour();
  const [open, setOpen] = useState<string | null>(null);

  // Abre el correo con asunto y un pie de datos del dispositivo (versión + SO)
  // para que los reportes lleguen ya con contexto de depuración.
  const openMail = (subject: string) => {
    const version = Constants.expoConfig?.version ?? '1.0.0';
    const footer = `\n\n\n— — —\nQuéFalta v${version}\n${Platform.OS} ${Platform.Version}`;
    const url =
      `mailto:${SUPPORT_EMAIL}` +
      `?subject=${encodeURIComponent(subject)}` +
      `&body=${encodeURIComponent(footer)}`;
    Linking.openURL(url).catch(() =>
      Alert.alert(t('help.title'), t('help.emailError')),
    );
  };

  const replayTutorial = () => {
    navigation.navigate('HomeMain');
    startTour();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('help.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* PREGUNTAS FRECUENTES */}
        <Text style={styles.sectionLabel}>{t('help.sectionFaq')}</Text>
        <View style={styles.section}>
          {FAQ_KEYS.map((key, i) => {
            const expanded = open === key;
            return (
              <View key={key} style={[styles.faqItem, i < FAQ_KEYS.length - 1 && styles.faqBorder]}>
                <TouchableOpacity
                  style={styles.faqQRow}
                  activeOpacity={0.7}
                  onPress={() => setOpen(expanded ? null : key)}
                >
                  <Text style={styles.faqQ}>{t(`help.${key}Q`)}</Text>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color={colors.inkFaint}
                  />
                </TouchableOpacity>
                {expanded ? <Text style={styles.faqA}>{t(`help.${key}A`)}</Text> : null}
              </View>
            );
          })}
        </View>

        {/* CONTACTO */}
        <Text style={styles.sectionLabel}>{t('help.sectionContact')}</Text>
        <View style={styles.section}>
          <ProfileRow
            icon="play-circle-outline"
            label={t('help.watchTutorial')}
            onPress={replayTutorial}
          />
          <ProfileRow
            icon="chatbubble-ellipses-outline"
            label={t('help.contact')}
            onPress={() => openMail('QuéFalta — Comentarios')}
          />
          <ProfileRow
            icon="bug-outline"
            label={t('help.reportProblem')}
            onPress={() => openMail('QuéFalta — Problema')}
          />
          <ProfileRow
            icon="bulb-outline"
            label={t('help.suggestFeature')}
            onPress={() => openMail('QuéFalta — Sugerencia')}
            last
          />
        </View>
        <Text style={styles.hint}>{t('help.contactHint')}</Text>

      </ScrollView>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, gap: 12,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

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
  hint: {
    fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 6, lineHeight: 16,
  },

  faqItem: { paddingVertical: 4 },
  faqBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  faqQRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11,
  },
  faqQ: { flex: 1, fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 19 },
  faqA: {
    fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft,
    lineHeight: 19, paddingBottom: 12, paddingRight: 4,
  },
});
