/**
 * PaywallModal — hoja de venta de "QuéFalta Plus" (MONETIZACION.md).
 * Es un Modal anidable (no pantalla de stack) a propósito: el comparador vive
 * dentro de los modales de producto, y ahí navegar a una pantalla quedaría
 * tapado; el patrón de la app es apilar modales (ver SimilarProductsSection).
 * Compra/restore vía RevenueCat (lib/purchases); sin SDK o sin offerings
 * (Expo Go, API key sin configurar) cae a un toast placeholder.
 */
import { useEffect, useState, type ComponentProps } from 'react';
import {
  View, Text, Modal, Pressable, TouchableOpacity,
  ScrollView, StyleSheet, Platform, Linking, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useProfile } from '../context/ProfileContext';
import {
  getPlusOfferings, purchasePlus, restorePlus, purchasesAvailable,
  refreshProfileSoon, type PlusOfferings,
} from '../lib/purchases';
import HardShadow from './HardShadow';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Páginas legales que Apple exige enlazar en todo paywall.
// Crearlas en quefalta-web es tarea de Fase 0 (MONETIZACION.md).
const TERMS_URL = 'https://quefalta.es/condiciones';
const PRIVACY_URL = 'https://quefalta.es/privacidad';

const BENEFITS: { icon: IoniconName; key: string; color: string; background: string }[] = [
  { icon: 'swap-vertical-outline', key: 'unitPrice', color: colors.blue, background: 'rgba(47,108,181,0.13)' },
  { icon: 'options-outline', key: 'filters', color: colors.orange, background: 'rgba(217,131,36,0.14)' },
  { icon: 'storefront-outline', key: 'stores', color: colors.teal, background: 'rgba(31,138,143,0.14)' },
  { icon: 'notifications-outline', key: 'alerts', color: colors.purple, background: 'rgba(122,79,181,0.14)' },
  { icon: 'pie-chart-outline', key: 'statistics', color: colors.blue, background: 'rgba(47,108,181,0.13)' },
];

type Plan = 'annual' | 'monthly';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Línea contextual bajo el título. null la oculta y compacta la cabecera. */
  subtitle?: string | null;
}

export default function PaywallModal({ visible, onClose, subtitle }: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const toast = useToast();
  const { refresh } = useProfile();
  const [plan, setPlan] = useState<Plan>('annual');
  const [offerings, setOfferings] = useState<PlusOfferings | null>(null);
  const [busy, setBusy] = useState(false);
  const headerSubtitle = subtitle ?? null;

  // Offerings reales de RevenueCat al abrir; null → modo placeholder.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getPlusOfferings().then((o) => { if (!cancelled) setOfferings(o); });
    return () => { cancelled = true; };
  }, [visible]);

  // Precio localizado de la tienda si existe; si no, el estático de MONETIZACION.md.
  const annualPrice = offerings?.annual?.product.priceString ?? '11,99 €';
  const monthlyPrice = offerings?.monthly?.product.priceString ?? '1,99 €';

  const handleSubscribe = async () => {
    const pkg = plan === 'annual' ? offerings?.annual : offerings?.monthly;
    if (!pkg) {
      toast.show(t('paywall.comingSoon'));
      return;
    }
    setBusy(true);
    try {
      const ok = await purchasePlus(pkg);
      if (ok) {
        // El webhook escribe premium_until en unos segundos; reintenta el perfil.
        refreshProfileSoon(refresh);
        toast.show(t('paywall.welcome'));
        onClose();
      }
    } catch {
      toast.show(t('paywall.purchaseError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!purchasesAvailable()) {
      toast.show(t('paywall.comingSoon'));
      return;
    }
    setBusy(true);
    try {
      const ok = await restorePlus();
      if (ok) {
        refreshProfileSoon(refresh);
        toast.show(t('paywall.restored'));
        onClose();
      } else {
        toast.show(t('paywall.noPrevious'));
      }
    } catch {
      toast.show(t('paywall.restoreError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 30 : Math.max(insets.bottom, 20) }]}>
          <View style={styles.grabber} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={[styles.header, !headerSubtitle && styles.headerCompact]}>
              <View style={styles.heroGlowLarge} />
              <View style={styles.heroGlowSmall} />
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('paywall.close')}
              >
                <Ionicons name="close" size={19} color={colors.inkSoft} />
              </TouchableOpacity>

              <View style={styles.heroTopline}>
                <View style={styles.heroMark}>
                  <Ionicons name="sparkles" size={22} color={colors.white} />
                </View>
                <View style={styles.plusBadge}>
                  <Text style={styles.plusBadgeText}>{t('paywall.heroLead')}</Text>
                </View>
              </View>

              <Text style={styles.title}>QuéFalta Plus</Text>
              {headerSubtitle ? (
                <View style={styles.contextPill}>
                  <Ionicons name="checkmark-circle" size={17} color={colors.accent} />
                  <Text style={styles.subtitle}>{headerSubtitle}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>{t('paywall.benefitsHeading')}</Text>
              <View style={styles.includedBadge}>
                <Ionicons name="sparkles" size={12} color={colors.accent} />
                <Text style={styles.includedText}>{t('paywall.included')}</Text>
              </View>
            </View>

            <View style={styles.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.key} style={styles.benefitRow}>
                  <View style={[styles.benefitIcon, { backgroundColor: b.background }]}>
                    <Ionicons name={b.icon} size={20} color={b.color} />
                  </View>
                  <View style={styles.benefitCopy}>
                    <Text style={styles.benefitTitle}>{t(`paywall.benefits.${b.key}Title`)}</Text>
                    <Text style={styles.benefitText}>{t(`paywall.benefits.${b.key}Text`)}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                </View>
              ))}
            </View>

            <Text style={styles.planHeading}>{t('paywall.choosePlan')}</Text>
            <View style={styles.plans}>
              <TouchableOpacity
                style={[styles.planCard, styles.annualPlanCard, plan === 'annual' && styles.planCardActive]}
                onPress={() => setPlan('annual')}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ checked: plan === 'annual' }}
              >
                <View style={styles.planBadgeAnchor} pointerEvents="none">
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>{t('paywall.bestValue')}</Text>
                  </View>
                </View>
                <View style={[styles.planRadio, plan === 'annual' && styles.planRadioActive]}>
                  {plan === 'annual' && <View style={styles.planRadioDot} />}
                </View>
                <View style={styles.planCopy}>
                  <Text style={styles.planName}>{t('paywall.annual')}</Text>
                  <Text style={styles.planPer}>{t('paywall.annualPer')}</Text>
                  <Text style={styles.trialText}>{t('paywall.freeTrialBadge')}</Text>
                </View>
                <View style={styles.planPriceWrap}>
                  <Text style={styles.planPrice}>{annualPrice}</Text>
                  <Text style={styles.planPricePeriod}>{t('paywall.year')}</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.planCard, plan === 'monthly' && styles.planCardActive]}
                onPress={() => setPlan('monthly')}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ checked: plan === 'monthly' }}
              >
                <View style={[styles.planRadio, plan === 'monthly' && styles.planRadioActive]}>
                  {plan === 'monthly' && <View style={styles.planRadioDot} />}
                </View>
                <View style={styles.planCopy}>
                  <Text style={styles.planName}>{t('paywall.monthly')}</Text>
                  <Text style={styles.planPer}>{t('paywall.monthlyPer')}</Text>
                </View>
                <View style={styles.planPriceWrap}>
                  <Text style={styles.planPrice}>{monthlyPrice}</Text>
                  <Text style={styles.planPricePeriod}>{t('paywall.month')}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={handleSubscribe}
              activeOpacity={0.85}
              style={styles.ctaWrap}
              disabled={busy}
            >
              <HardShadow style={styles.ctaBtn}>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="sparkles" size={17} color={colors.white} />
                    <Text style={styles.ctaText}>
                      {plan === 'annual' ? t('paywall.ctaTrial') : t('paywall.ctaContinue')}
                    </Text>
                  </>
                )}
              </HardShadow>
            </TouchableOpacity>
            <View style={styles.ctaNoteRow}>
              <Ionicons name="shield-checkmark-outline" size={14} color={colors.inkSoft} />
              <Text style={styles.ctaNote}>{t('paywall.ctaNote')}</Text>
            </View>

            <View style={styles.footer}>
              <TouchableOpacity onPress={handleRestore} hitSlop={6} disabled={busy}>
                <Text style={styles.footerLink}>{t('paywall.restore')}</Text>
              </TouchableOpacity>
              <Text style={styles.footerDot}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)} hitSlop={6}>
                <Text style={styles.footerLink}>{t('paywall.terms')}</Text>
              </TouchableOpacity>
              <Text style={styles.footerDot}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)} hitSlop={6}>
                <Text style={styles.footerLink}>{t('paywall.privacy')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(18, 24, 29, 0.58)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: 30, borderTopRightRadius: 30,
    overflow: 'hidden', maxHeight: '94%',
    // paddingBottom inline: iOS 30 (como antes); Android, el inset del sistema.
  },
  grabber: {
    alignSelf: 'center', width: 38, height: 4, borderRadius: 2,
    backgroundColor: colors.inkFaint, opacity: 0.55, marginTop: 9, marginBottom: 3,
  },
  scrollContent: { paddingBottom: 2 },

  header: {
    marginHorizontal: 14, marginTop: 8, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18,
    borderRadius: 24, backgroundColor: colors.accentLight, overflow: 'hidden',
  },
  headerCompact: { paddingBottom: 15 },
  heroGlowLarge: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: colors.accentMid, right: -56, top: -70, opacity: 0.68,
  },
  heroGlowSmall: {
    position: 'absolute', width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.white, left: -32, bottom: -42, opacity: 0.5,
  },
  heroTopline: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 36 },
  heroMark: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center',
  },
  plusBadge: {
    flexShrink: 1,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  plusBadgeText: { flexShrink: 1, fontSize: 10.5, lineHeight: 14, fontFamily: fonts.bold, color: colors.accent },
  title: { fontSize: 30, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -1, marginTop: 14 },
  contextPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start', marginTop: 13, paddingHorizontal: 10, paddingVertical: 8,
    borderRadius: 12, backgroundColor: colors.white,
  },
  subtitle: { flexShrink: 1, fontSize: 12.5, fontFamily: fonts.bold, color: colors.ink, lineHeight: 17 },
  closeBtn: {
    position: 'absolute', top: 13, right: 13, zIndex: 2,
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },

  sectionHeadingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, marginTop: 19, marginBottom: 10,
  },
  sectionHeading: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.25 },
  includedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.accentLight, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 999,
  },
  includedText: { fontSize: 10.5, fontFamily: fonts.bold, color: colors.accent },
  benefits: { paddingHorizontal: 14, gap: 8 },
  benefitRow: {
    flexDirection: 'row', alignItems: 'center', padding: 11, gap: 11,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18,
  },
  benefitIcon: {
    width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  benefitCopy: { flex: 1 },
  benefitTitle: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.ink, lineHeight: 18 },
  benefitText: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2, lineHeight: 16 },

  planHeading: {
    fontSize: 17, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.25,
    paddingHorizontal: 18, marginTop: 20, marginBottom: 10,
  },
  plans: { gap: 9, paddingHorizontal: 14 },
  planCard: {
    position: 'relative', flexDirection: 'row', alignItems: 'center', minHeight: 78,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
    paddingHorizontal: 13, paddingVertical: 12, gap: 11,
  },
  annualPlanCard: { marginTop: 8, paddingTop: 16 },
  planCardActive: { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.accentLight },
  planRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.inkFaint,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  planRadioActive: { borderColor: colors.accent },
  planRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  planCopy: { flex: 1 },
  planBadgeAnchor: {
    position: 'absolute', top: -11, left: 0, right: 0, zIndex: 2,
    alignItems: 'center',
  },
  planBadge: {
    backgroundColor: colors.yellow, borderColor: colors.accent, borderWidth: 1,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  planBadgeText: { fontSize: 9.5, fontFamily: fonts.bold, color: colors.white, letterSpacing: 0.25 },
  planName: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  planPer: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3 },
  trialText: { fontSize: 11, fontFamily: fonts.bold, color: colors.accent, marginTop: 4 },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.4 },
  planPricePeriod: { fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },

  ctaWrap: { paddingHorizontal: 14, marginTop: 16 },
  ctaBtn: {
    backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, gap: 8, paddingVertical: 17,
  },
  ctaText: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.white },
  ctaNoteRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 10 },
  ctaNote: { fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 15,
  },
  footerLink: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, textDecorationLine: 'underline' },
  footerDot: { fontSize: 12, color: colors.inkFaint },
});
