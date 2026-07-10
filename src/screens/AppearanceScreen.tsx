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

export default function AppearanceScreen() {
  const navigation = useNavigation<any>();
  const { accentKey, setAccentKey, themeMode, setThemeMode } = useTheme();
  const { t } = useTranslation();
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);

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

      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('appearance.title')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>
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
  sectionLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4,
    marginBottom: 4,
  },
  sectionLabelGap: { marginTop: 22 },
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
  themeIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
});