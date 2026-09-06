/**
 * PaywallModal — hoja de venta de "QuéFalta Plus" (MONETIZACION.md).
 * Es un Modal anidable (no pantalla de stack) a propósito: el comparador vive
 * dentro de los modales de producto, y ahí navegar a una pantalla quedaría
 * tapado; el patrón de la app es apilar modales (ver SimilarProductsSection).
 * Compra/restore vía RevenueCat (lib/purchases); sin SDK o sin offerings
 * (Expo Go, API key sin configurar) cae a un toast placeholder.
 */
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  View, Text, Modal, TouchableOpacity, Animated, Easing,
  ScrollView, StyleSheet, Platform, Linking, ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { useProfile } from '../context/ProfileContext';
import {
  confirmPlusSubscription, getPlusOfferings, purchasePlus, restorePlus, purchasesAvailable,
  refreshProfileSoon, type PlusOfferings,
} from '../lib/purchases';
import HardShadow from './HardShadow';
import PremiumGoldBackground, { PREMIUM_GOLD_INK } from './PremiumGoldBackground';
import VerifiedBadge from './VerifiedBadge';
import PlusWelcomeTransition from './PlusWelcomeTransition';
import { useReducedMotion } from '../hooks/useReducedMotion';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// Páginas legales que Apple exige enlazar en todo paywall.
// Crearlas en quefalta-web es tarea de Fase 0 (MONETIZACION.md).
const TERMS_URL = 'https://quefalta.es/condiciones';
const PRIVACY_URL = 'https://quefalta.es/privacidad';

const BENEFITS: { icon: IoniconName; key: string; color: string; background: string }[] = [
  { icon: 'apps-outline', key: 'lidl', color: colors.blue, background: 'rgba(47,108,181,0.13)' },
  { icon: 'swap-vertical-outline', key: 'unitPrice', color: colors.blue, background: 'rgba(47,108,181,0.13)' },
  { icon: 'search-circle-outline', key: 'savingsRadar', color: '#3f8f4f', background: 'rgba(63,143,79,0.14)' },
  { icon: 'notifications-outline', key: 'alerts', color: colors.purple, background: 'rgba(122,79,181,0.14)' },
  { icon: 'link-outline', key: 'noteProducts', color: colors.teal, background: 'rgba(31,138,143,0.14)' },
  { icon: 'pie-chart-outline', key: 'statistics', color: colors.blue, background: 'rgba(47,108,181,0.13)' },
];

type Plan = 'annual' | 'monthly';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function PaywallModal({ visible, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const toast = useToast();
  const { refresh, applyPremiumEntitlement } = useProfile();
  const [plan, setPlan] = useState<Plan>('annual');
  const [offerings, setOfferings] = useState<PlusOfferings | null>(null);
  const [busy, setBusy] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const annualSweep = useRef(new Animated.Value(0)).current;

  // Offerings reales de RevenueCat al abrir; null → modo placeholder.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getPlusOfferings().then((o) => { if (!cancelled) setOfferings(o); });
    return () => { cancelled = true; };
  }, [visible]);

  // Mismo ritmo y desplazamiento diagonal del reflejo de QueCocinoTabIcon,
  // ampliado para recorrer la tarjeta completa del plan anual.
  useEffect(() => {
    annualSweep.stopAnimation();
    annualSweep.setValue(reducedMotion ? 0.35 : 0);
    if (!visible || reducedMotion) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(650),
        Animated.timing(annualSweep, {
          toValue: 1,
          duration: 1050,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1700),
        Animated.timing(annualSweep, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [annualSweep, reducedMotion, visible]);

  const annualSweepTranslateX = annualSweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-110, 430],
  });

  // Precio localizado de la tienda si existe; si no, el estático de MONETIZACION.md.
  const annualPrice = offerings?.annual?.product.priceString ?? '19,99 €';
  const monthlyPrice = offerings?.monthly?.product.priceString ?? '3,99 €';
  // Durante la carga, ante un error o si la tienda devuelve elegibilidad
  // desconocida se muestra el plan sin prometer una prueba gratuita.
  const annualFreeTrialEligible = offerings?.annualFreeTrialEligible === true;
  const subscriptionDisclosure = plan === 'annual'
    ? annualFreeTrialEligible
      ? t('paywall.trialRenewalDisclosure', { price: annualPrice })
      : t('paywall.annualRenewalDisclosure', { price: annualPrice })
    : t('paywall.monthlyRenewalDisclosure', { price: monthlyPrice });

  const activatePlus = (expirationDate: string | null) => {
    if (expirationDate) applyPremiumEntitlement(expirationDate);

    // Confirma desde servidor sin retrasar la bienvenida. El webhook queda como
    // respaldo y los refrescos toleran una lectura antigua durante un minuto.
    confirmPlusSubscription()
      .then(() => refresh())
      .catch(() => {});
    refreshProfileSoon(refresh);
  };

  const handleSubscribe = async () => {
    const pkg = plan === 'annual' ? offerings?.annual : offerings?.monthly;
    if (!pkg) {
      toast.show(t('paywall.comingSoon'));
      return;
    }
    setBusy(true);
    try {
      const entitlement = await purchasePlus(pkg);
      if (entitlement) {
        // RevenueCat ya ha validado la compra. Reflejarla inmediatamente evita
        // que el usuario cierre la celebración y siga viendo los gates mientras
        // el webhook termina de persistir premium_until en Supabase.
        activatePlus(entitlement.expirationDate);
        setWelcomeVisible(true);
      }
    } catch {
      toast.show(t('paywall.purchaseError'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const dismissWelcome = () => {
    setWelcomeVisible(false);
    onClose();
  };

  const handleRestore = async () => {
    if (!purchasesAvailable()) {
      toast.show(t('paywall.comingSoon'));
      return;
    }
    setBusy(true);
    try {
      const entitlement = await restorePlus();
      if (entitlement) {
        activatePlus(entitlement.expirationDate);
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
    <Modal
      visible={visible}
      transparent
      presentationStyle="overFullScreen"
      animationType={reducedMotion ? 'none' : 'slide'}
      allowSwipeDismissal={false}
      statusBarTranslucent
      onRequestClose={welcomeVisible ? dismissWelcome : onClose}
    >
      <View style={styles.root}>
        <View
          style={[
            styles.sheet,
            {
              paddingTop: insets.top,
              paddingBottom: Platform.OS === 'ios' ? 30 : Math.max(insets.bottom, 20),
            },
          ]}
          accessibilityViewIsModal
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.header}>
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

              <View style={styles.titleRow}>
                <VerifiedBadge size={34} marginLeft={0} />
                <Text style={styles.title}>QuéFalta Plus</Text>
              </View>
            </View>

            <View style={styles.sectionHeadingRow}>
              <Text style={styles.sectionHeading}>{t('paywall.benefitsHeading')}</Text>
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
                </View>
              ))}
            </View>

            <View style={styles.bottomSection}>
              <Text style={styles.planHeading}>{t('paywall.choosePlan')}</Text>
              <View style={styles.plans}>
              <TouchableOpacity
                style={[styles.planCard, plan === 'monthly' && styles.planCardActive]}
                onPress={() => setPlan('monthly')}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ checked: plan === 'monthly' }}
              >
                <View style={styles.planTopRow}>
                  <View style={[styles.planRadio, plan === 'monthly' && styles.planRadioActive]}>
                    {plan === 'monthly' && <View style={styles.planRadioDot} />}
                  </View>
                  <Text style={styles.planName}>{t('paywall.monthly')}</Text>
                </View>
                <View style={styles.planPriceWrap}>
                  <Text style={styles.planPrice}>{monthlyPrice}</Text>
                  <Text style={styles.planPricePeriod}>{t('paywall.month')}</Text>
                </View>
                <Text style={styles.planPer}>{t('paywall.monthlyPer')}</Text>
                {plan === 'monthly' ? <View pointerEvents="none" style={styles.planActiveBorder} /> : null}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.planCard, plan === 'annual' && styles.planCardActive]}
                onPress={() => setPlan('annual')}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ checked: plan === 'annual' }}
              >
                <View pointerEvents="none" style={styles.annualSweepClip} accessible={false}>
                  <Animated.View
                    style={[
                      styles.annualSweep,
                      { transform: [{ translateX: annualSweepTranslateX }, { rotate: '16deg' }] },
                    ]}
                  >
                    <LinearGradient
                      colors={[
                        'rgba(47,108,181,0)',
                        'rgba(47,108,181,0.10)',
                        'rgba(47,108,181,0.30)',
                        'rgba(47,108,181,0.14)',
                        'rgba(47,108,181,0)',
                      ]}
                      locations={[0, 0.24, 0.5, 0.72, 1]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.annualSweepGlowTop} />
                    <View style={styles.annualSweepGlowBottom} />
                  </Animated.View>
                </View>
                <View style={styles.planBadgeAnchor} pointerEvents="none">
                  <PremiumGoldBackground
                    active={visible}
                    baseOpacity={0.7}
                    style={styles.planBadgeBackground}
                  >
                    <View style={styles.planBadge}>
                      <Ionicons name="sparkles" size={10} color={PREMIUM_GOLD_INK} />
                      <Text style={styles.planBadgeText}>{t('paywall.bestValue')}</Text>
                    </View>
                  </PremiumGoldBackground>
                </View>
                <View style={styles.planTopRow}>
                  <View style={[styles.planRadio, plan === 'annual' && styles.planRadioActive]}>
                    {plan === 'annual' && <View style={styles.planRadioDot} />}
                  </View>
                  <Text style={styles.planName}>{t('paywall.annual')}</Text>
                </View>
                <View style={styles.planPriceWrap}>
                  <Text style={styles.planPrice}>{annualPrice}</Text>
                  <Text style={styles.planPricePeriod}>{t('paywall.year')}</Text>
                </View>
                <Text style={styles.planPer}>{t('paywall.annualPer')}</Text>
                {annualFreeTrialEligible ? (
                  <Text style={styles.trialText}>{t('paywall.freeTrialBadge')}</Text>
                ) : null}
                {plan === 'annual' ? <View pointerEvents="none" style={styles.planActiveBorder} /> : null}
              </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={handleSubscribe}
                activeOpacity={0.85}
                style={styles.ctaWrap}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ disabled: busy, busy }}
              >
                <HardShadow style={styles.ctaBtn}>
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={17} color={colors.white} />
                      <Text style={styles.ctaText}>
                        {plan === 'annual' && annualFreeTrialEligible
                          ? t('paywall.ctaTrial')
                          : t('paywall.ctaContinue')}
                      </Text>
                    </>
                  )}
                </HardShadow>
              </TouchableOpacity>
              <View style={styles.ctaNoteRow}>
                <Ionicons name="shield-checkmark-outline" size={14} color={colors.inkSoft} />
                <Text style={styles.ctaNote}>{subscriptionDisclosure}</Text>
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
            </View>
          </ScrollView>
          <PlusWelcomeTransition visible={welcomeVisible} onDismiss={dismissWelcome} />
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  sheet: {
    flex: 1, backgroundColor: colors.paper, overflow: 'hidden',
    // Insets inline: el fondo llega a los bordes y el contenido respeta las zonas seguras.
  },
  scrollContent: { flexGrow: 1, paddingBottom: 2 },

  header: {
    marginHorizontal: 14, marginTop: 8, paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14,
    borderRadius: 24, backgroundColor: colors.accentLight, overflow: 'hidden',
  },
  heroGlowLarge: {
    position: 'absolute', width: 150, height: 150, borderRadius: 75,
    backgroundColor: colors.accentMid, right: -56, top: -70, opacity: 0.68,
  },
  heroGlowSmall: {
    position: 'absolute', width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.white, left: -32, bottom: -42, opacity: 0.5,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingRight: 38, minHeight: 34 },
  title: { flexShrink: 1, fontSize: 26, lineHeight: 32, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.8 },
  closeBtn: {
    position: 'absolute', top: 13, right: 13, zIndex: 2,
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },

  sectionHeadingRow: {
    paddingHorizontal: 18, marginTop: 10, marginBottom: 6,
  },
  sectionHeading: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.25 },
  benefits: { paddingHorizontal: 14, gap: 6 },
  benefitRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, gap: 10,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18,
  },
  benefitIcon: {
    width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
  },
  benefitCopy: { flex: 1 },
  benefitTitle: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.ink, lineHeight: 18 },
  benefitText: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1, lineHeight: 15 },

  bottomSection: { marginTop: 'auto', paddingTop: 8 },
  planHeading: {
    fontSize: 17, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.25,
    paddingHorizontal: 18, marginBottom: 6,
  },
  plans: { flexDirection: 'row', alignItems: 'stretch', gap: 9, paddingHorizontal: 14, marginTop: 4 },
  planCard: {
    position: 'relative', flex: 1, minWidth: 0, minHeight: 125,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
    paddingHorizontal: 12, paddingTop: 15, paddingBottom: 10,
  },
  planCardActive: { backgroundColor: colors.accentLight },
  planActiveBorder: {
    ...StyleSheet.absoluteFill,
    zIndex: 1,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 18,
  },
  annualSweepClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: 17,
    overflow: 'hidden',
  },
  annualSweep: {
    position: 'absolute', top: -58, bottom: -58, left: 0, width: 104,
  },
  annualSweepGlowTop: {
    position: 'absolute', width: 62, height: 62, borderRadius: 31,
    top: 12, left: 10, backgroundColor: 'rgba(47,108,181,0.10)',
  },
  annualSweepGlowBottom: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    bottom: 18, right: 4, backgroundColor: 'rgba(47,108,181,0.13)',
  },
  planTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planRadio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.inkFaint,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  planRadioActive: { borderColor: colors.accent },
  planRadioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.accent },
  planBadgeAnchor: {
    position: 'absolute', top: -11, left: 0, right: 0, zIndex: 2,
    alignItems: 'center',
  },
  planBadgeBackground: { borderRadius: 999 },
  planBadge: {
    minHeight: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  planBadgeText: { fontSize: 9.5, fontFamily: fonts.bold, color: PREMIUM_GOLD_INK, letterSpacing: 0.25 },
  planName: { flexShrink: 1, fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  planPer: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 7 },
  trialText: { fontSize: 11, lineHeight: 15, fontFamily: fonts.bold, color: colors.accent, marginTop: 4 },
  planPriceWrap: { alignItems: 'flex-start', marginTop: 11 },
  planPrice: { fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.4 },
  planPricePeriod: { fontSize: 10.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },

  ctaWrap: { paddingHorizontal: 14, marginTop: 10 },
  ctaBtn: {
    backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 17, gap: 8, paddingVertical: 14,
  },
  ctaText: { fontSize: 15.5, fontFamily: fonts.bold, color: colors.white },
  ctaNoteRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start',
    gap: 6, marginTop: 9, paddingHorizontal: 20,
  },
  ctaNote: {
    flex: 1, fontSize: 12, lineHeight: 16, fontFamily: fonts.medium,
    color: colors.inkSoft, textAlign: 'center',
  },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 10,
  },
  footerLink: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, textDecorationLine: 'underline' },
  footerDot: { fontSize: 12, color: colors.inkFaint },
});
