import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import { storeInRegion } from '../constants/regions';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';

export default function CatalogStoresScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;

  const selected = profile?.catalogStores ?? [...CATALOG_STORE_KEYS];

  // Solo se ofrecen los súpers de la comunidad autónoma del usuario ('ES' o
  // NULL = todos). Para activar uno de fuera: Perfil → Comunidad autónoma →
  // "Toda España". La preferencia guardada puede contener súpers de fuera de
  // la región (no se destruye al cambiar de CCAA); simplemente no se listan.
  const region = profile?.region ?? null;
  const shown = CATALOG_STORES.filter((s) => storeInRegion(s.key, region));

  const toggle = async (key: CatalogStore) => {
    const isOn = selected.includes(key);
    if (isOn && selected.length === 1) {
      toast.show(t('catalogStores.keepOne'), 'error');
      return;
    }
    const next = isOn ? selected.filter((s) => s !== key) : [...selected, key];
    // Guarda siempre en el orden canónico para una UI estable.
    const ordered = CATALOG_STORE_KEYS.filter((k) => next.includes(k));

    const prev = selected;
    applyProfile({ catalogStores: ordered });   // optimista: refleja al instante
    Haptics.selectionAsync();
    try {
      await updateProfile(userId, { catalogStores: ordered });
    } catch {
      applyProfile({ catalogStores: prev });     // revierte si falla la red
      toast.show(t('catalogStores.saveError'), 'error');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ProfileSubscreenHeader title={t('profile.stores')} icon="storefront-outline" headerTop={headerTop} onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad, paddingTop: glassInset ? glassInset + 12 : 6 }]}>
        <Text style={styles.hint}>{t('catalogStores.hint')}</Text>

        <View style={styles.section}>
          {shown.map((s, i) => {
            const on = selected.includes(s.key);
            const last = i === shown.length - 1;
            return (
              <TouchableOpacity
                key={s.key}
                activeOpacity={0.7}
                onPress={() => toggle(s.key)}
                style={[styles.row, !last && styles.rowBorder]}
              >
                {s.icon ? (
                  <Image source={s.icon} style={styles.storeIcon} resizeMode="cover" />
                ) : (
                  <View style={[styles.storeIcon, styles.storeIconEmpty]}>
                    <Ionicons name="storefront" size={16} color={colors.inkSoft} />
                  </View>
                )}
                <Text style={styles.rowLabel}>{s.name}</Text>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={on ? colors.accent : colors.inkFaint}
                />
              </TouchableOpacity>
            );
          })}
        </View>
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
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, borderRadius: 18, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  storeIcon: { width: 28, height: 28, borderRadius: 8 },
  storeIconEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
});
