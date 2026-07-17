/** Paso 1 (OBLIGATORIO) — Elegir @usuario. No se puede avanzar sin uno válido y
 *  libre. Reutiliza la validación en vivo de EditProfileScreen. */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { isUsernameAvailable, updateProfile } from '../../api/profile';
import OnboardingLayout from './OnboardingLayout';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
type UState = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';

export default function UsernameScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [username, setUsername] = useState(profile?.username ?? '');
  const [state, setState] = useState<UState>(profile?.username ? 'ok' : 'idle');
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raw = username.trim().toLowerCase();
    if (!raw) { setState('idle'); return; }
    if (!USERNAME_RE.test(raw)) { setState('invalid'); return; }
    if (raw === (profile?.username ?? '')) { setState('ok'); return; }

    setState('checking');
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(raw);
        setState(free ? 'ok' : 'taken');
      } catch {
        setState('idle');
      }
    }, 400);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [username, profile?.username]);

  const handleContinue = async () => {
    const raw = username.trim().toLowerCase();
    if (state !== 'ok') return;
    setSaving(true);
    try {
      await updateProfile(userId, { username: raw });
      applyProfile({ username: raw });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('Region');
    } catch (e: any) {
      const dup = e?.message?.includes('unique') || e?.code === '23505';
      if (dup) setState('taken');
      toast.show(dup ? t('onboarding.usernameTaken') : t('onboarding.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const helper =
    state === 'invalid' ? { text: t('onboarding.usernameInvalid'), tone: 'bad' as const }
    : state === 'taken' ? { text: t('onboarding.usernameUnavailable'), tone: 'bad' as const }
    : state === 'ok'    ? { text: t('onboarding.usernameOk'), tone: 'ok' as const }
    : { text: t('onboarding.usernameHint'), tone: 'muted' as const };

  return (
    <OnboardingLayout
      step={2}
      totalSteps={7}
      eyebrow={t('onboarding.required')}
      title={t('onboarding.usernameTitle')}
      subtitle={t('onboarding.usernameSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={t('onboarding.continue')}
      continueDisabled={state !== 'ok'}
      continueLoading={saving}
      onContinue={handleContinue}
    >
      <View style={[styles.inputBox, state === 'taken' && styles.inputBoxError]}>
        <Text style={styles.at}>@</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase())}
          placeholder={t('onboarding.usernamePlaceholder')}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={20}
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />
        {state === 'checking' && <ActivityIndicator size="small" color={colors.inkFaint} />}
        {state === 'ok' && <Ionicons name="checkmark-circle" size={20} color={colors.ok} />}
        {state === 'taken' && <Ionicons name="close-circle" size={20} color="#d6452b" />}
      </View>
      <Text style={[
        styles.helper,
        helper.tone === 'ok' && { color: colors.ok },
        helper.tone === 'bad' && { color: '#d6452b' },
      ]}>
        {helper.text}
      </Text>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  inputBoxError: { borderColor: '#d6452b' },
  at: { fontSize: 17, fontFamily: fonts.bold, color: colors.inkFaint },
  input: { flex: 1, fontSize: 16, fontFamily: fonts.semibold, color: colors.ink, padding: 0 },
  helper: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 10 },
});
