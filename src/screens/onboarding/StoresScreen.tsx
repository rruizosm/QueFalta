/** Paso 4 (OBLIGATORIO) — Elegir supermercados del catálogo. Mínimo uno.
 *  El grid solo ofrece los súpers disponibles en la comunidad autónoma elegida
 *  en el paso anterior (storeInRegion; con "Toda España" se ven todos) y
 *  empieza sin ninguna selección. Mínimo uno para continuar. */
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, type DimensionValue } from 'react-native';
import { Image } from 'expo-image';
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
import { updateProfile } from '../../api/profile';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../../constants/stores';
import { storeInRegion } from '../../constants/regions';
import OnboardingLayout from './OnboardingLayout';

export default function StoresScreen() {
  const styles = useThemedStyles(themedStyles);
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  // Solo los súpers de la CCAA elegida en el paso anterior ('ES' = todos).
  const region = profile?.region ?? null;
  const shown = CATALOG_STORES.filter((s) => storeInRegion(s.key, region));

  // Cada cuenta elige expresamente sus súpers. Una selección vacía no se toma
  // del perfil, porque fuera del onboarding se normaliza como "todos".
  const [selected, setSelected] = useState<CatalogStore[]>([]);
  const [saving, setSaving] = useState(false);
  const columns = width >= 620 ? 3 : 2;
  const gap = 10;
  const cardWidth = `${(100 - ((columns - 1) * gap * 100) / Math.min(width - 32, 560)) / columns}%` as DimensionValue;

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
      step={5}
      totalSteps={8}
      eyebrow={t('onboarding.required')}
      title={t('onboarding.storesTitle')}
      subtitle={t('onboarding.storesSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={t('onboarding.continue')}
      continueDisabled={selected.length === 0}
      continueLoading={saving}
      onContinue={handleContinue}
    >
      <View style={styles.summary}>
        <Ionicons name="storefront" size={16} color={colors.accent} />
        <Text style={styles.summaryText}>{selected.length}/{shown.length}</Text>
      </View>
      <View style={styles.grid}>
        {shown.map((s) => {
          const on = selected.includes(s.key);
          return (
            <TouchableOpacity
              key={s.key}
              activeOpacity={0.8}
              onPress={() => toggle(s.key)}
              style={[styles.card, { width: cardWidth }, on && styles.cardOn]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
            >
              {s.icon ? (
                <Image
                  source={s.icon}
                  style={styles.icon}
                  contentFit="contain"
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
  summary: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accentLight,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: 999,
    marginBottom: 12,
  },
  summaryText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 14,
    borderRadius: 18,
    minHeight: 58,
  },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  icon: { width: 26, height: 26, flexShrink: 0 },
  iconEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 10 },
  cardName: { flex: 1, fontSize: 13, fontFamily: fonts.semibold, color: colors.ink },
});
