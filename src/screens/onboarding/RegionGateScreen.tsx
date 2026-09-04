/** Gate de zona para usuarios YA registrados (onboarded_at no nulo pero region
 *  NULL — la columna es nueva y nace sin backfill): una sola pregunta (código
 *  postal, o "Toda España") al entrar, sin re-hacer el onboarding. Al guardar,
 *  applyProfile re-renderiza Navigation, la condición del gate pasa a false y
 *  entra al Home (la propia region no-nula es el sello; no hay nada más que
 *  sellar). Sin barra de progreso ni botón atrás. Ver COMUNIDAD-AUTONOMA.md §6. */
import { useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateProfile } from '../../api/profile';
import RegionPicker, { type RegionSelection } from '../../components/RegionPicker';
import OnboardingLayout from './OnboardingLayout';

export default function RegionGateScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [sel, setSel] = useState<RegionSelection>({ region: null, postalCode: null, lidlStoreId: null });
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    if (!sel.region) return;
    setSaving(true);
    try {
      await updateProfile(userId, { region: sel.region, postalCode: sel.postalCode, lidlStoreId: sel.lidlStoreId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Desmonta el gate: Navigation re-evalúa `!profile.region` y entra al Home.
      applyProfile({ region: sel.region, postalCode: sel.postalCode, lidlStoreId: sel.lidlStoreId });
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      title={t('onboarding.regionGateTitle')}
      subtitle={t('onboarding.regionGateSubtitle')}
      continueLabel={t('onboarding.continue')}
      continueDisabled={!sel.region}
      continueLoading={saving}
      onContinue={handleContinue}
    >
      <RegionPicker region={sel.region} postalCode={sel.postalCode} lidlStoreId={sel.lidlStoreId} onChange={setSel} />
    </OnboardingLayout>
  );
}
