/** Paso 3 (OBLIGATORIO) — Código postal → comunidad autónoma. Filtra qué
 *  supermercados se ofrecen en el paso siguiente (Stores) y en el catálogo:
 *  los regionales solo en su zona. "Toda España" (sentinel 'ES', sin CP) es la
 *  opción válida para no filtrar — el paso siempre deja region no-nula. El CP
 *  se guarda además en profiles.postal_code para futuras features de zona
 *  exacta. Ver COMUNIDAD-AUTONOMA.md. */
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateProfile } from '../../api/profile';
import RegionPicker, { type RegionSelection } from '../../components/RegionPicker';
import OnboardingLayout from './OnboardingLayout';

export default function RegionScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [sel, setSel] = useState<RegionSelection>({
    region: profile?.region ?? null,
    postalCode: profile?.postalCode ?? null,
  });
  const [saving, setSaving] = useState(false);

  // Guarda ya (no difiere a Done): el paso Stores lee profile.region para
  // pre-filtrar su grid.
  const handleContinue = async () => {
    if (!sel.region) return;
    setSaving(true);
    try {
      await updateProfile(userId, { region: sel.region, postalCode: sel.postalCode });
      applyProfile({ region: sel.region, postalCode: sel.postalCode });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('Stores');
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      step={4}
      totalSteps={8}
      eyebrow={t('onboarding.required')}
      title={t('onboarding.regionTitle')}
      subtitle={t('onboarding.regionSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={t('onboarding.continue')}
      continueDisabled={!sel.region}
      continueLoading={saving}
      onContinue={handleContinue}
    >
      <RegionPicker
        region={sel.region}
        postalCode={sel.postalCode}
        onChange={setSel}
        autoFocus
      />
    </OnboardingLayout>
  );
}
