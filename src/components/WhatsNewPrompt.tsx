import { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

const WHATS_NEW_VERSION = '1.3.0';
const WHATS_NEW_STORAGE_PREFIX = '@whats_new_seen:';

type FeatureIcon = React.ComponentProps<typeof Ionicons>['name'];

function whatsNewStorageKey(userId: string) {
  return `${WHATS_NEW_STORAGE_PREFIX}${WHATS_NEW_VERSION}:${userId}`;
}

/**
 * Bienvenida compacta a la 1.3 para cuentas anteriores a esta versión.
 *
 * `legacyAllStoresAccess` es la señal de servidor que distingue esas cuentas:
 * una instalación nueva no tiene ningún marcador local previo que permita
 * saber si reemplazó a la 1.2. El cierre sí se recuerda por usuario y
 * dispositivo para no compartir estado entre cuentas del mismo móvil.
 */
export default function WhatsNewPrompt() {
  const { profile } = useProfile();
  const { t } = useTranslation();
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const [visible, setVisible] = useState(false);

  const eligibleUserId = profile?.legacyAllStoresAccess ? profile.id : null;
  const seenKey = eligibleUserId ? whatsNewStorageKey(eligibleUserId) : null;

  useEffect(() => {
    let cancelled = false;
    setVisible(false);
    if (!seenKey) return () => { cancelled = true; };

    AsyncStorage.getItem(seenKey)
      .then((seenAt) => {
        if (!cancelled && !seenAt) setVisible(true);
      })
      .catch(() => {
        // Si el almacenamiento local no está disponible, no arriesgamos
        // mostrar el popup en cada arranque.
      });

    return () => { cancelled = true; };
  }, [seenKey]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (seenKey) AsyncStorage.setItem(seenKey, String(Date.now())).catch(() => {});
  }, [seenKey]);

  const features: { icon: FeatureIcon; title: string; body: string }[] = [
    {
      icon: 'storefront-outline',
      title: t('whatsNew.storesTitle'),
      body: t('whatsNew.storesBody'),
    },
    {
      icon: 'search-outline',
      title: t('whatsNew.searchTitle'),
      body: t('whatsNew.searchBody'),
    },
    {
      icon: 'trending-down-outline',
      title: t('whatsNew.radarTitle'),
      body: t('whatsNew.radarBody'),
    },
    {
      icon: 'people-outline',
      title: t('whatsNew.groupsTitle'),
      body: t('whatsNew.groupsBody'),
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={dismiss}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessible={false}
          testID="whats-new-backdrop"
        />
        <View
          style={[styles.card, { maxHeight: Math.max(320, Math.min(height - 48, 720)) }]}
          accessibilityViewIsModal
        >
          <View style={styles.accentBar} />
          <View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.versionPill}>
                <Ionicons name="sparkles" size={14} color={colors.accent} />
                <Text style={styles.versionText}>{t('whatsNew.version')}</Text>
              </View>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={dismiss}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <Ionicons name="close" size={22} color={colors.ink} />
              </TouchableOpacity>
            </View>
            <Text style={styles.title} accessibilityRole="header">{t('whatsNew.title')}</Text>
            <Text style={styles.intro}>{t('whatsNew.intro')}</Text>
          </View>

          <ScrollView
            style={styles.featureScroll}
            contentContainerStyle={styles.features}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {features.map((feature) => (
              <View key={feature.title} style={styles.featureRow}>
                <View style={styles.featureIcon}>
                  <Ionicons name={feature.icon} size={21} color={colors.accent} />
                </View>
                <View style={styles.featureCopy}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureBody}>{feature.body}</Text>
                </View>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.more}>{t('whatsNew.more')}</Text>
            <TouchableOpacity
              style={styles.cta}
              onPress={dismiss}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>{t('whatsNew.cta')}</Text>
              <Ionicons name="arrow-forward" size={18} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: 'rgba(16, 13, 11, 0.55)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 18,
  },
  accentBar: { height: 5, backgroundColor: colors.accent },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    minHeight: 30,
    borderRadius: 15,
    backgroundColor: colors.accentLight,
  },
  versionText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  title: {
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.5,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  intro: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  featureScroll: { flexShrink: 1 },
  features: {
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 16,
    gap: 15,
  },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  featureCopy: { flex: 1, minWidth: 0, paddingTop: 1 },
  featureTitle: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.ink },
  featureBody: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 13,
    paddingBottom: 18,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.paper,
  },
  more: {
    marginBottom: 11,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  cta: {
    minHeight: 48,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
  },
  ctaText: { fontSize: 15, fontFamily: fonts.bold, color: '#ffffff' },
});
