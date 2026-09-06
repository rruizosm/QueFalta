/** Modal obligatorio para cuentas ya incorporadas sin código postal. */
import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from '../../context/LanguageContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { updateProfile } from '../../api/profile';
import RegionPicker, { type RegionSelection } from '../../components/RegionPicker';

export default function RegionGateScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { applyProfile } = useProfile();
  const toast = useToast();
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const userId = session?.user.id ?? '';

  const [selection, setSelection] = useState<RegionSelection>({ region: null, postalCode: null, lidlStoreId: null });
  const [saving, setSaving] = useState(false);
  const canContinue = !!selection.region && !!selection.postalCode && !saving;

  const handleContinue = async () => {
    if (!userId || !selection.region || !selection.postalCode || saving) return;
    setSaving(true);
    try {
      await updateProfile(userId, { region: selection.region, postalCode: selection.postalCode, lidlStoreId: null });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      applyProfile({ region: selection.region, postalCode: selection.postalCode, lidlStoreId: null });
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      visible transparent animationType="fade" presentationStyle="overFullScreen"
      statusBarTranslucent navigationBarTranslucent onRequestClose={() => {}}
    >
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: Math.max(insets.top, 20), paddingBottom: Math.max(insets.bottom, 20) },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card} accessibilityViewIsModal>
            <View style={styles.heroIcon}>
              <Ionicons name="location" size={27} color={colors.white} />
            </View>
            <Text style={styles.required}>{t('onboarding.regionGateRequired')}</Text>
            <Text style={styles.title}>{t('onboarding.regionGateTitle')}</Text>
            <Text style={styles.subtitle}>{t('onboarding.regionGateSubtitle')}</Text>

            <View style={styles.benefits}>
              <View style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <Ionicons name="pricetag-outline" size={18} color={colors.accent} />
                </View>
                <Text style={styles.benefitText}>{t('onboarding.regionGatePrices')}</Text>
              </View>
              <View style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <Ionicons name="git-compare-outline" size={18} color={colors.accent} />
                </View>
                <Text style={styles.benefitText}>{t('onboarding.regionGateCompare')}</Text>
              </View>
            </View>

            <RegionPicker
              region={selection.region}
              postalCode={selection.postalCode}
              lidlStoreId={selection.lidlStoreId}
              onChange={setSelection}
              autoFocus
              allowAll={false}
              showLidlStorePicker={false}
              helperText={t('onboarding.postalCodeReason')}
            />

            <TouchableOpacity
              style={[styles.button, !canContinue && styles.buttonDisabled]}
              onPress={handleContinue}
              disabled={!canContinue}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.regionGateCta')}
              accessibilityState={{ disabled: !canContinue, busy: saving }}
            >
              {saving ? <ActivityIndicator color={colors.white} /> : (
                <>
                  <Text style={styles.buttonText}>{t('onboarding.regionGateCta')}</Text>
                  <Ionicons name="arrow-forward" size={17} color={colors.white} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(18, 24, 35, 0.58)' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 18 },
  card: {
    width: '100%', maxWidth: 520, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20,
    borderRadius: 28, backgroundColor: colors.paper, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border, shadowColor: '#000000', shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2, shadowRadius: 26, elevation: 12,
  },
  heroIcon: {
    width: 56, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', backgroundColor: colors.accent, marginBottom: 13,
  },
  required: {
    alignSelf: 'center', fontSize: 11, lineHeight: 15, fontFamily: fonts.bold,
    color: colors.accent, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 5,
  },
  title: { fontSize: 25, lineHeight: 30, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  subtitle: {
    fontSize: 14, lineHeight: 20, fontFamily: fonts.medium, color: colors.inkSoft,
    textAlign: 'center', marginTop: 9,
  },
  benefits: { gap: 9, marginTop: 18, marginBottom: 18 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitIcon: {
    width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  benefitText: {
    flex: 1, fontSize: 13.5, lineHeight: 18, fontFamily: fonts.semibold, color: colors.ink,
  },
  button: {
    minHeight: 52, marginTop: 18, paddingHorizontal: 18, borderRadius: 18,
    backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 7,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
});
