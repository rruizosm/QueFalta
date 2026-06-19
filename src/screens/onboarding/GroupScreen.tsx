/** Paso 5 (OPCIONAL) — Crear el primer grupo. Reutiliza createGroup. */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { createGroup } from '../../api/groups';
import OnboardingLayout from './OnboardingLayout';

export default function GroupScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const SUGGESTIONS = [t('onboarding.ideaHome'), t('onboarding.ideaFlat'), t('onboarding.ideaFamily'), t('onboarding.ideaMates')];

  const [name, setName] = useState('');
  const [created, setCreated] = useState(false);
  const [saving, setSaving] = useState(false);

  const goNext = () => navigation.navigate('Done');
  const trimmed = name.trim();

  const handleContinue = async () => {
    if (created || !trimmed) { goNext(); return; }
    setSaving(true);
    try {
      await createGroup(trimmed, userId);
      setCreated(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('onboarding.groupCreated', { name: trimmed }));
      goNext();
    } catch {
      toast.show(t('onboarding.groupCreateError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      step={5}
      totalSteps={5}
      eyebrow={t('onboarding.optional')}
      title={t('onboarding.groupTitle')}
      subtitle={t('onboarding.groupSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={trimmed ? t('onboarding.groupCreateContinue') : t('onboarding.continue')}
      continueLoading={saving}
      onContinue={handleContinue}
      onSkip={trimmed ? undefined : goNext}
      skipLabel={t('onboarding.laterSkip')}
    >
      <View style={styles.inputBox}>
        <Ionicons name="people-outline" size={18} color={colors.inkFaint} />
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t('onboarding.groupPlaceholder')}
          placeholderTextColor={colors.inkFaint}
          maxLength={40}
          returnKeyType="done"
          onSubmitEditing={handleContinue}
        />
      </View>

      <Text style={styles.suggLabel}>{t('onboarding.groupIdeas')}</Text>
      <View style={styles.suggRow}>
        {SUGGESTIONS.map((s) => {
          const on = trimmed.toLowerCase() === s.toLowerCase();
          return (
            <TouchableOpacity
              key={s}
              style={[styles.suggChip, on && styles.suggChipOn]}
              onPress={() => { Haptics.selectionAsync(); setName(s); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.suggText, on && styles.suggTextOn]}>{s}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  input: { flex: 1, fontSize: 16, fontFamily: fonts.semibold, color: colors.ink, padding: 0 },

  suggLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginTop: 18, marginBottom: 10,
  },
  suggRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggChip: {
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  suggChipOn: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  suggText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.inkSoft },
  suggTextOn: { color: colors.accent },
});
