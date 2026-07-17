/** Paso 4 (OBLIGATORIO) — Elegir supermercados del catálogo. Mínimo uno.
 *  El grid solo ofrece los súpers disponibles en la comunidad autónoma elegida
 *  en el paso anterior (storeInRegion; con "Toda España" se ven todos) y
 *  arranca con todos ellos pre-marcados: el usuario ya declaró comprar en esa
 *  zona, así que desmarcar es la excepción. Mínimo uno para continuar. */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
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
import { updateProfile } from '../../api/profile';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../../constants/stores';
import { storeInRegion } from '../../constants/regions';
import OnboardingLayout from './OnboardingLayout';

export default function StoresScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  // Solo los súpers de la CCAA elegida en el paso anterior ('ES' = todos).
  const region = profile?.region ?? null;
  const shown = CATALOG_STORES.filter((s) => storeInRegion(s.key, region));

  // Arranca con los súpers de la región pre-marcados (el usuario ya declaró
  // comprar ahí); puede desmarcar los que no use. (No sembramos desde
  // profile.catalogStores porque ahí "vacío" se normaliza a "todos".)
  const [selected, setSelected] = useState<CatalogStore[]>(() => shown.map((s) => s.key));
  const [saving, setSaving] = useState(false);

  const toggle = (key: CatalogStore) => {
    Haptics.selectionAsync();
    const isOn = selected.includes(key);
    const next = isOn ? selected.filter((s) => s !== key) : [...selected, key];
    setSelected(CATALOG_STORE_KEYS.filter((k) => next.includes(k)));
  };

  const handleContinue = async () => {
    setSaving(true);
    try {
      await updateProfile(userId, { catalogStores: selected });
      applyProfile({ catalogStores: selected });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('Avatar');
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingLayout
      step={4}
      totalSteps={7}
      eyebrow={t('onboarding.required')}
      title={t('onboarding.storesTitle')}
      subtitle={t('onboarding.storesSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={t('onboarding.continue')}
      continueDisabled={selected.length === 0}
      continueLoading={saving}
      onContinue={handleContinue}
    >
      <View style={styles.grid}>
        {shown.map((s) => {
          const on = selected.includes(s.key);
          return (
            <TouchableOpacity
              key={s.key}
              activeOpacity={0.8}
              onPress={() => toggle(s.key)}
              style={[styles.card, on && styles.cardOn]}
            >
              {s.icon ? (
                <Image
                  source={s.icon}
                  style={styles.icon}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={0}
                />
              ) : (
                <View style={[styles.icon, styles.iconEmpty]}>
                  <Ionicons name="storefront" size={18} color={colors.inkSoft} />
                </View>
              )}
              <Text style={styles.cardName} numberOfLines={1}>{s.name}</Text>
              <Ionicons
                name={on ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '47.8%',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  icon: { width: 26, height: 26, flexShrink: 0 },
  iconEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  cardName: { flex: 1, fontSize: 13, fontFamily: fonts.semibold, color: colors.ink },
});
