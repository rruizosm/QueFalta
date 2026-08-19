/** Paso 1 (OBLIGATORIO) — Elegir @usuario y zona por código postal. No se puede
 *  avanzar sin un @ válido/libre y una región resuelta. */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { isUsernameAvailable, updateProfile } from '../../api/profile';
import { prefetchStoreIcons } from '../../constants/stores';
import RegionPicker, { type RegionSelection } from '../../components/RegionPicker';
import OnboardingShutter from './OnboardingShutter';

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
  const [regionSelection, setRegionSelection] = useState<RegionSelection>({
    region: profile?.region ?? null,
    postalCode: profile?.postalCode ?? null,
  });
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const usernameInput = useRef<TextInput>(null);

  const focusUsername = useCallback(() => {
    usernameInput.current?.focus();
  }, []);

  // Empieza a cargar los logos desde el primer paso para que estén listos al
  // llegar a la selección de supermercados.
  useEffect(() => { prefetchStoreIcons(); }, []);

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
    if (state !== 'ok' || !regionSelection.region) return;
    setSaving(true);
    try {
      await updateProfile(userId, {
        username: raw,
        region: regionSelection.region,
        postalCode: regionSelection.postalCode,
      });
      applyProfile({
        username: raw,
        region: regionSelection.region,
        postalCode: regionSelection.postalCode,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('Stores');
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
    <OnboardingShutter onSettled={focusUsername}>
        <Text style={styles.fieldLabel}>{t('onboarding.usernameFieldLabel')}</Text>
        <View style={[styles.inputBox, state === 'taken' && styles.inputBoxError]}>
          <Text style={styles.at}>@</Text>
          <TextInput
            ref={usernameInput}
            style={styles.input}
            value={username}
            onChangeText={(v) => setUsername(v.toLowerCase())}
            placeholder={t('onboarding.usernamePlaceholder')}
            placeholderTextColor="#7a6f64"
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={handleContinue}
          />
          {state === 'checking' && <ActivityIndicator size="small" color="#7a6f64" />}
          {state === 'ok' && <Ionicons name="checkmark-circle" size={20} color={colors.ok} />}
          {state === 'taken' && <Ionicons name="close-circle" size={20} color="#d6452b" />}
        </View>
        <Text style={[
          styles.helper,
          helper.tone === 'ok' && styles.helperOk,
          helper.tone === 'bad' && styles.helperBad,
        ]}>
          {helper.text}
        </Text>

        <Text style={[styles.fieldLabel, styles.regionLabel]}>{t('onboarding.postalCodeFieldLabel')}</Text>
        <RegionPicker
          region={regionSelection.region}
          postalCode={regionSelection.postalCode}
          onChange={setRegionSelection}
          helperText={t('onboarding.postalCodeReason')}
          inverse
          inlineDetected
        />

        <TouchableOpacity
          style={[
            styles.continueBtn,
            (state !== 'ok' || !regionSelection.region || saving) && styles.continueBtnDisabled,
          ]}
          onPress={handleContinue}
          disabled={state !== 'ok' || !regionSelection.region || saving}
          activeOpacity={0.86}
        >
          {saving ? (
            <ActivityIndicator color={colors.blue} />
          ) : (
            <>
              <Text style={styles.continueText}>{t('onboarding.continue')}</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.blue} />
            </>
          )}
        </TouchableOpacity>
    </OnboardingShutter>
  );
}

const themedStyles = () => StyleSheet.create({
  fieldLabel: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#ffffff',
    marginBottom: 7,
  },
  regionLabel: { marginTop: 18 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.72)',
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: 18,
  },
  inputBoxError: { borderColor: '#d6452b' },
  at: { fontSize: 17, fontFamily: fonts.bold, color: '#7a6f64' },
  input: { flex: 1, fontSize: 16, fontFamily: fonts.semibold, color: '#2b2521', padding: 0 },
  helper: {
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: 'rgba(255,255,255,0.84)',
    marginTop: 10,
  },
  helperOk: { color: '#d9f6df' },
  helperBad: { color: '#ffe0d8' },
  continueBtn: {
    minHeight: 54,
    marginTop: 28,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  continueBtnDisabled: { opacity: 0.48 },
  continueText: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.blue },
});
