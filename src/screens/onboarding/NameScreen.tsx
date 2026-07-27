/** Paso 1 (OBLIGATORIO) — Nombre visible. Es lo primero que se pide tras la
 *  bienvenida, antes del @usuario. Se prefija con el nombre que trae el proveedor
 *  (Google, o Apple vía credential.fullName); el usuario lo confirma o lo cambia. */
import { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateProfile } from '../../api/profile';
import { initialsFromName } from '../../lib/pendingProfileName';
import OnboardingLayout from './OnboardingLayout';

export default function NameScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [name, setName] = useState(profile?.name ?? '');
  const [saving, setSaving] = useState(false);

  const valid = name.trim().length > 0;

  const handleContinue = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.show(t('onboarding.nameEmpty'), 'error'); return; }
    setSaving(true);
    try {
      const initials = initialsFromName(trimmed);
      await updateProfile(userId, { name: trimmed, initials });
      applyProfile({ name: trimmed, initials });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('Username');
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      step={2}
      totalSteps={8}
      eyebrow={t('onboarding.required')}
      title={t('onboarding.nameTitle')}
      subtitle={t('onboarding.nameSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={t('onboarding.continue')}
      continueDisabled={!valid}
      continueLoading={saving}
      onContinue={handleContinue}
    >
      <View style={styles.inputBox}>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.namePlaceholder')}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="words"
          autoCorrect={false}
          autoFocus
          maxLength={50}
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />
      </View>
      <Text style={styles.helper}>{t('onboarding.nameHint')}</Text>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: 18,
  },
  input: { flex: 1, fontSize: 16, fontFamily: fonts.semibold, color: colors.ink, padding: 0 },
  helper: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 10 },
});
