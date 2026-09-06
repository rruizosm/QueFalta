/** Ajustes → Comunidad autónoma. Cambia profiles.region + postal_code después
 *  del alta (Perfil → fila "Comunidad autónoma"). El catálogo se re-filtra
 *  solo al guardar (deriva de profile.region vía ProfileContext); si la tienda
 *  activa deja de estar disponible, el auto-salto de CatalogScreen la corrige.
 *  Guardado optimista con revert, como CatalogStoresScreen. Solo se guardan
 *  estados completos (CP válido); un CP a medias no toca nada. */
import { useRef, useState } from 'react';
import {
  View, Text, ScrollView,
  StyleSheet, StatusBar,
} from 'react-native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { updateProfile } from '../api/profile';
import RegionPicker, { type RegionSelection } from '../components/RegionPicker';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';

export default function RegionSettingsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;

  const region = profile?.region ?? null;
  const postalCode = profile?.postalCode ?? null;
  const lidlStoreId = profile?.lidlStoreId ?? null;

  // El picker mantiene el CP en edición en estado local; al revertir un fallo
  // de red se re-monta (key) para que vuelva a mostrar lo realmente guardado.
  const [pickerKey, setPickerKey] = useState(0);
  const saveSequence = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const handleChange = async (next: RegionSelection) => {
    if (!next.region) return; // CP a medias o inválido: no se guarda nada aún
    const sequence = ++saveSequence.current;
    const prev = { region, postalCode, lidlStoreId };
    // Optimista: el catálogo se re-filtra al instante. (El háptico lo pone el picker.)
    applyProfile({ region: next.region, postalCode: next.postalCode, lidlStoreId: next.lidlStoreId });
    try {
      const save = saveQueue.current
        .catch(() => undefined)
        .then(() => updateProfile(userId, {
          region: next.region,
          postalCode: next.postalCode,
          lidlStoreId: next.lidlStoreId,
        }));
      saveQueue.current = save;
      await save;
    } catch {
      if (saveSequence.current !== sequence) return;
      applyProfile(prev); // revierte si falla la red
      setPickerKey((k) => k + 1);
      toast.show(t('onboarding.saveError'), 'error');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ProfileSubscreenHeader title={t('region.title')} icon="location-outline" headerTop={headerTop} onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad, paddingTop: glassInset ? glassInset + 12 : 6 }]}>
        <Text style={styles.hint}>{t('region.hint')}</Text>
        <RegionPicker
          key={pickerKey}
          region={region}
          postalCode={postalCode}
          lidlStoreId={lidlStoreId}
          onChange={handleChange}
          allowAll={false}
        />
      </ScrollView>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  hint: {
    fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft,
    marginBottom: 14, lineHeight: 18,
  },
});
