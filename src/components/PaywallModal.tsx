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

const BENEFITS: { icon: IoniconName; key: string }[] = [
  { icon: 'people', key: 'groups' },
  { icon: 'pricetags', key: 'comparator' },
  { icon: 'receipt', key: 'history' },
  { icon: 'notifications', key: 'soon' },
];

type Plan = 'annual' | 'monthly';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Línea contextual bajo el título: cada gate explica su límite. */
  subtitle?: string;
}

export default function PaywallModal({ visible, onClose, subtitle }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const toast = useToast();
  const { refresh } = useProfile();
  const [plan, setPlan] = useState<Plan>('annual');
  const [offerings, setOfferings] = useState<PlusOfferings | null>(null);
  const [busy, setBusy] = useState(false);

  // Offerings reales de RevenueCat al abrir; null → modo placeholder.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getPlusOfferings().then((o) => { if (!cancelled) setOfferings(o); });
    return () => { cancelled = true; };
  }, [visible]);

  // Precio localizado de la tienda si existe; si no, el estático de MONETIZACION.md.
  const annualPrice = offerings?.annual?.product.priceString ?? '12,99 €';
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
        <View style={styles.sheet}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            {/* Cabecera */}
            <View style={styles.header}>
              <View style={styles.iconBox}>
                <Ionicons name="sparkles" size={22} color={colors.white} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>QuéFalta Plus</Text>
                <Text style={styles.subtitle}>
                  {subtitle ?? t('paywall.defaultSubtitle')}
                </Text>
              </View>
              <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
                <Ionicons name="close" size={18} color={colors.inkSoft} />
              </TouchableOpacity>
            </View>

            {/* Beneficios */}
            <View style={styles.benefits}>
              {BENEFITS.map((b) => (
                <View key={b.key} style={styles.benefitRow}>
                  <View style={styles.benefitIcon}>
                    <Ionicons name={b.icon} size={16} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.benefitTitle}>{t(`paywall.benefits.${b.key}Title`)}</Text>
                    <Text style={styles.benefitText}>{t(`paywall.benefits.${b.key}Text`)}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Planes */}
            <View style={styles.plans}>
              <TouchableOpacity
                style={[styles.planCard, plan === 'annual' && styles.planCardActive]}
                onPress={() => setPlan('annual')}
                activeOpacity={0.85}
              >
                <View style={styles.planBadge}>
                  <Text style={styles.planBadgeText}>{t('paywall.freeTrialBadge')}</Text>
                </View>
                <Text style={styles.planName}>{t('paywall.annual')}</Text>
                <Text style={styles.planPrice}>{annualPrice}</Text>
                <Text style={styles.planPer}>{t('paywall.annualPer')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.planCard, plan === 'monthly' && styles.planCardActive]}
                onPress={() => setPlan('monthly')}
                activeOpacity={0.85}
              >
                <Text style={styles.planName}>{t('paywall.monthly')}</Text>
                <Text style={styles.planPrice}>{monthlyPrice}</Text>
                <Text style={styles.planPer}>{t('paywall.monthlyPer')}</Text>
              </TouchableOpacity>
            </View>

            {/* CTA */}
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

            {/* Pie legal */}
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
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.ink,
    maxHeight: '88%',
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBox: {
    width: 44, height: 44,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },

  benefits: { paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: {
    width: 34, height: 34,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  benefitTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  benefitText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },

  plans: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 18 },
  planCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, gap: 2,
  },
  planCardActive: { borderColor: colors.accent, borderWidth: 2 },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentLight,
    paddingHorizontal: 7, paddingVertical: 3, marginBottom: 4,
  },
  planBadgeText: { fontSize: 10, fontFamily: fonts.bold, color: colors.accent },
  planName: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6 },
  planPrice: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink },
  planPer: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft },

  ctaWrap: { paddingHorizontal: 20, marginTop: 18 },
  ctaBtn: {
    backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 15,
  },
  ctaText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },

  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 16,
  },
  footerLink: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, textDecorationLine: 'underline' },
  footerDot: { fontSize: 12, color: colors.inkFaint },
});
