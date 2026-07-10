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

  const selected = profile?.catalogStores ?? [...CATALOG_STORE_KEYS];

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

      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('profile.stores')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>
        <Text style={styles.hint}>{t('catalogStores.hint')}</Text>

        <View style={styles.section}>
          {CATALOG_STORES.map((s, i) => {
            const on = selected.includes(s.key);
            const last = i === CATALOG_STORES.length - 1;
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

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 12,
    // paddingTop inline (useHeaderTopPadding)
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  hint: {
    fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 6, marginBottom: 14, lineHeight: 17,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  storeIcon: { width: 26, height: 26 },
  storeIconEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
});
