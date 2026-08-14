/** Paso final — Sella el alta (onboarded_at) y deja entrar a la app. El gate de
 *  navegación cambia al ver onboardedAt; los coach marks arrancan solos. */
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { completeOnboarding } from '../../api/profile';
import OnboardingLayout from './OnboardingLayout';

export default function DoneScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const firstName = profile?.name?.split(' ')[0];

  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      const onboardedAt = await completeOnboarding(userId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Cambiar la caché al final: el gate de navigation/index.tsx re-renderiza
      // y monta la app (Tab.Navigator + coach marks).
      applyProfile({ onboardedAt });
    } catch {
      toast.show(t('onboarding.doneError'), 'error');
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      title={firstName ? t('onboarding.doneTitleNamed', { name: firstName }) : t('onboarding.doneTitle')}
      subtitle={t('onboarding.doneSubtitle')}
      continueLabel={t('onboarding.doneCta')}
      continueLoading={saving}
      onContinue={finish}
    >
      <View style={styles.center}>
        <View style={styles.circle}>
          <Ionicons name="checkmark" size={64} color={colors.white} />
        </View>
      </View>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  center: { alignItems: 'center', marginTop: 24 },
  circle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: colors.ok,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 8, borderColor: colors.accentLight,
  },
});
