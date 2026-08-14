/** Idioma de la app (castellà / català) — PRIMERA pantalla del asistente, antes
 *  del Welcome, para que TODO el onboarding se vea ya en el idioma elegido. Por
 *  defecto, castellano. Aplica el idioma AL INSTANTE (setLang → applyLanguage
 *  síncrono + re-render). La preferencia se guarda en AsyncStorage (no en el
 *  perfil), igual que en Apariencia → Idioma; por eso no hace falta guardar. */
import { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { LANGUAGE_OPTIONS, type AppLanguage } from '../../i18n';
import { prefetchStoreIcons } from '../../constants/stores';
import OnboardingLayout from './OnboardingLayout';

export default function LanguageStepScreen() {
  const styles = useThemedStyles(themedStyles);
  const { lang, setLang, t } = useTranslation();
  const navigation = useNavigation<any>();

  // Precarga los logos de los súpers ya en el 1er paso: para cuando el usuario
  // llegue a "Supermercados" (paso 3) estarán en caché y se verán al instante.
  useEffect(() => { prefetchStoreIcons(); }, []);

  const select = (key: AppLanguage) => {
    if (key === lang) return;
    setLang(key);
    Haptics.selectionAsync();
  };

  return (
    <OnboardingLayout
      title={t('onboarding.languageTitle')}
      subtitle={t('onboarding.languageSubtitle')}
      step={1}
      totalSteps={8}
      continueLabel={t('onboarding.continue')}
      onContinue={() => {
        Haptics.selectionAsync();
        navigation.navigate('Name');
      }}
    >
      <View style={styles.list}>
        {LANGUAGE_OPTIONS.map((opt) => {
          const on = opt.key === lang;
          return (
            <TouchableOpacity
              key={opt.key}
              activeOpacity={0.8}
              onPress={() => select(opt.key)}
              style={[styles.card, on && styles.cardOn]}
            >
              <View style={styles.langIcon}>
                <Ionicons name="language-outline" size={18} color={on ? colors.accent : colors.inkSoft} />
              </View>
              <Text style={styles.cardName}>{t(`language.options.${opt.key}`)}</Text>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={on ? colors.accent : colors.inkFaint}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  list: { gap: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 16,
    borderRadius: 18,
  },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  langIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  cardName: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
});
