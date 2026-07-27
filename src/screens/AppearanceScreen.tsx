import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  colors, ACCENT_OPTIONS, type AccentKey,
  THEME_OPTIONS, type ThemeMode,
} from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';

export default function AppearanceScreen() {
  const navigation = useNavigation<any>();
  const { accentKey, setAccentKey, themeMode, setThemeMode } = useTheme();
  const { t } = useTranslation();
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;

  const selectAccent = (key: AccentKey) => {
    if (key === accentKey) return;
    setAccentKey(key);
    Haptics.selectionAsync();
  };

  const selectTheme = (mode: ThemeMode) => {
    if (mode === themeMode) return;
    setThemeMode(mode);
    Haptics.selectionAsync();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ProfileSubscreenHeader title={t('appearance.title')} icon="color-palette-outline" headerTop={headerTop} onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad, paddingTop: glassInset ? glassInset + 12 : 6 }]}>
        <Text style={styles.hint}>{t('appearance.hint')}</Text>

        <Text style={styles.sectionLabel}>{t('appearance.themeSection')}</Text>
        <View style={styles.section}>
          {THEME_OPTIONS.map((opt, i) => {
            const on = opt.key === themeMode;
            const last = i === THEME_OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={opt.key}
                activeOpacity={0.7}
                onPress={() => selectTheme(opt.key)}
                style={[styles.row, !last && styles.rowBorder]}
              >
                <View style={styles.themeIcon}>
                  <Ionicons name={opt.icon as any} size={18} color={colors.inkSoft} />
                </View>
                <Text style={styles.rowLabel}>{t(`appearance.themes.${opt.key}`)}</Text>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={on ? colors.accent : colors.inkFaint}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, styles.sectionLabelGap]}>{t('appearance.colorSection')}</Text>
        <View style={styles.section}>
          {ACCENT_OPTIONS.map((opt, i) => {
            const on = opt.key === accentKey;
            const last = i === ACCENT_OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={opt.key}
                activeOpacity={0.7}
                onPress={() => selectAccent(opt.key)}
                style={[styles.row, !last && styles.rowBorder]}
              >
                <View style={[styles.swatch, { backgroundColor: opt.hex }]} />
                <Text style={styles.rowLabel}>{t(`appearance.accents.${opt.key}`)}</Text>
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
    marginBottom: 16, lineHeight: 18,
  },
  sectionLabel: {
    fontSize: 15, fontFamily: fonts.bold, color: colors.ink,
    marginBottom: 8,
  },
  sectionLabelGap: { marginTop: 22 },
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
  themeIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
});
