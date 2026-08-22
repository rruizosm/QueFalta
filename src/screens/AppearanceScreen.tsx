import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Pressable,
  StyleSheet, StatusBar,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import ColorPicker, { BrightnessSlider, HueSlider, Panel1 } from 'reanimated-color-picker';
import {
  colors, ACCENT_OPTIONS, type AccentKey,
  THEME_OPTIONS, type ThemeMode,
} from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useProfile } from '../context/ProfileContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';
import PaywallModal from '../components/PaywallModal';
import { limitsApply } from '../constants/limits';

export default function AppearanceScreen() {
  const { accentKey, customAccent, setAccentKey, setCustomAccent, themeMode, setThemeMode } = useTheme();
  const { isPremium, loading: profileLoading } = useProfile();
  const { t } = useTranslation();
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const [headerH, setHeaderH] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [pendingColor, setPendingColor] = useState(customAccent ?? '#2F6CB5');
  const glassInset = glassAvailable ? headerH : 0;
  const customLocked = !profileLoading && limitsApply(isPremium);

  useEffect(() => {
    if (pickerVisible) setPendingColor(customAccent ?? colors.accent);
  }, [customAccent, pickerVisible]);

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

  const openCustomPicker = () => {
    if (profileLoading) return;
    if (customLocked) {
      setPaywallVisible(true);
      return;
    }
    setPickerVisible(true);
  };

  const saveCustomAccent = () => {
    setCustomAccent(pendingColor);
    Haptics.selectionAsync();
    setPickerVisible(false);
  };

  const customAccentRow = (
    <TouchableOpacity
      activeOpacity={0.78}
      disabled={profileLoading}
      onPress={openCustomPicker}
      style={[styles.premiumRow, customLocked && styles.premiumRowLocked]}
      accessibilityRole="button"
      accessibilityLabel={t('appearance.customAccent')}
      accessibilityHint={customLocked ? t('appearance.customAccentLocked') : t('appearance.customAccentHint')}
      accessibilityState={{ disabled: profileLoading }}
    >
      <View style={[styles.swatch, styles.customSwatch, { backgroundColor: customAccent ?? colors.surfaceAlt }]}>
        {!customAccent ? <Ionicons name="color-palette-outline" size={16} color={colors.inkSoft} /> : null}
      </View>
      <View style={styles.customLabelWrap}>
        <Text style={styles.rowLabel}>{t('appearance.customAccent')}</Text>
        <Text style={styles.customHint}>
          {customLocked ? t('appearance.plusOnly') : t('appearance.customAccentHint')}
        </Text>
      </View>
      {customLocked ? (
        <View style={styles.plusBadge}>
          <Ionicons name="lock-closed" size={12} color={styles.plusBadgeText.color} />
          <Text style={styles.plusBadgeText}>Plus</Text>
        </View>
      ) : (
        <Ionicons
          name={accentKey === 'custom' ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={accentKey === 'custom' ? colors.accent : colors.inkFaint}
        />
      )}
    </TouchableOpacity>
  );

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
          <View style={styles.premiumBackground}>{customAccentRow}</View>

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

      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerVisible(false)} accessible={false} />
          <View style={styles.pickerSheet} accessibilityViewIsModal>
            <View style={styles.grabber} />
            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerTitle}>{t('appearance.customPickerTitle')}</Text>
                <Text style={styles.pickerSubtitle}>{t('appearance.customPickerSubtitle')}</Text>
              </View>
              <View style={[styles.pickerPreview, { backgroundColor: pendingColor }]} />
            </View>
            <ColorPicker
              value={pendingColor}
              onChangeJS={(value) => setPendingColor(value.hex.toUpperCase())}
              sliderThickness={22}
              thumbSize={24}
              thumbShape="ring"
              boundedThumb
              style={styles.colorPicker}
              colorAnnouncementFormat="hex"
            >
              <Panel1 style={styles.colorPanel} accessibilityLabel={t('appearance.colorSpectrum')} />
              <HueSlider style={styles.colorSlider} accessibilityLabel={t('appearance.hueSlider')} />
              <BrightnessSlider style={styles.colorSlider} accessibilityLabel={t('appearance.brightnessSlider')} />
            </ColorPicker>
            <Text style={styles.hexValue}>{pendingColor}</Text>
            <View style={styles.pickerActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setPickerVisible(false)}>
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmButton} onPress={saveCustomAccent}>
                <Text style={styles.confirmButtonText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
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
  premiumBackground: {
    borderRadius: 16,
    marginVertical: 9,
  },
  premiumRow: {
    flexDirection: 'row', alignItems: 'center',
    minHeight: 58, paddingHorizontal: 11, paddingVertical: 10, gap: 12,
    borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  premiumRowLocked: { backgroundColor: colors.surfaceAlt },
  themeIcon: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  customSwatch: { alignItems: 'center', justifyContent: 'center' },
  customLabelWrap: { flex: 1 },
  customHint: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  plusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, backgroundColor: colors.accentLight,
  },
  plusBadgeText: { fontSize: 11, fontFamily: fonts.bold, color: colors.accent },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  modalRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24, 19, 15, 0.42)' },
  pickerSheet: {
    backgroundColor: colors.white, padding: 20, paddingBottom: 34,
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 18 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  pickerTitle: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  pickerSubtitle: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3 },
  pickerPreview: { width: 42, height: 42, borderRadius: 14, borderWidth: 2, borderColor: colors.white },
  colorPicker: { gap: 14 },
  colorPanel: { height: 220, borderRadius: 16 },
  colorSlider: { height: 22, borderRadius: 11 },
  hexValue: { alignSelf: 'center', marginTop: 16, fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  pickerActions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: colors.surfaceAlt },
  cancelButtonText: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  confirmButton: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 14, backgroundColor: colors.accent },
  confirmButtonText: { fontSize: 14, fontFamily: fonts.bold, color: colors.white },
});
