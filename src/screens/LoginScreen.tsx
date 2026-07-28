import React, { type ComponentProps, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '../constants/colors';
import { CATALOG_STORES } from '../constants/stores';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import HardShadow from '../components/HardShadow';

const LOGO = require('../../assets/quefalta-logo-blue.png');

const FEATURES: Array<{
  icon: ComponentProps<typeof Ionicons>['name'];
  labelKey:
    | 'login.sharedCartTitle'
    | 'login.newTitle'
    | 'login.offersTitle'
    | 'login.pricesTitle';
}> = [
  { icon: 'people-outline', labelKey: 'login.sharedCartTitle' },
  { icon: 'sparkles-outline', labelKey: 'login.newTitle' },
  { icon: 'pricetag-outline', labelKey: 'login.offersTitle' },
  { icon: 'swap-vertical-outline', labelKey: 'login.pricesTitle' },
];

export default function LoginScreen() {
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'android'
    ? Math.max(insets.bottom + 12, 28)
    : Math.max(insets.bottom + 10, 24);
  const { t } = useTranslation();
  const { signInWithGoogle, signInWithApple } = useAuth();
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const handleGoogleSignIn = async () => {
    setBusy('google');
    try {
      await signInWithGoogle();
    } finally {
      setBusy(null);
    }
  };

  const handleAppleSignIn = async () => {
    setBusy('apple');
    try {
      await signInWithApple();
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 10, paddingBottom: bottomPad },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Image source={LOGO} resizeMode="contain" style={styles.logo} />
            </View>
            <Text style={styles.brandName}>QuéFalta</Text>
          </View>

          <View style={styles.heroCard}>
            <View pointerEvents="none" style={styles.heroOrbLarge} />
            <View pointerEvents="none" style={styles.heroOrbSmall} />

            <View style={styles.heroHeading}>
              <Text style={styles.title}>{t('login.title')}</Text>
              <View style={styles.heroIcon}>
                <Ionicons name="basket-outline" size={30} color="#ffffff" />
              </View>
            </View>

            <View style={styles.featurePanel}>
              {FEATURES.map((feature) => (
                <View key={feature.labelKey} style={styles.featureItem}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={feature.icon} size={17} color="#ffffff" />
                  </View>
                  <Text style={styles.featureLabel}>{t(feature.labelKey)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.storeCard}>
            <View style={styles.storeHeader}>
              <Text style={styles.storeTitle}>{t('login.storesTitle')}</Text>
              <View style={styles.storeCount}>
                <Text style={styles.storeCountText}>{CATALOG_STORES.length}</Text>
              </View>
            </View>

            <View style={styles.storeLogos}>
              {CATALOG_STORES.map((store) => (
                <View key={store.key} style={styles.storeLogoBox}>
                  {store.icon != null && (
                    <Image source={store.icon} resizeMode="contain" style={styles.storeLogo} />
                  )}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.actions}>
            {appleAvailable && (
              <TouchableOpacity
                onPress={handleAppleSignIn}
                disabled={busy !== null}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <HardShadow
                  style={busy !== null
                    ? { ...styles.appleButton, ...styles.buttonDisabled }
                    : styles.appleButton}
                >
                  {busy === 'apple' ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="logo-apple" size={19} color="#ffffff" />
                      <Text style={styles.appleButtonText}>{t('login.continueApple')}</Text>
                    </>
                  )}
                </HardShadow>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={handleGoogleSignIn}
              disabled={busy !== null}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <HardShadow
                style={busy !== null
                  ? { ...styles.googleButton, ...styles.buttonDisabled }
                  : styles.googleButton}
              >
                {busy === 'google' ? (
                  <ActivityIndicator color={colors.ink} size="small" />
                ) : (
                  <>
                    <Text style={styles.googleIcon}>G</Text>
                    <Text style={styles.googleButtonText}>{t('login.continueGoogle')}</Text>
                  </>
                )}
              </HardShadow>
            </TouchableOpacity>

            <Text style={styles.legal}>{t('login.legal')}</Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
  },
  content: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  logo: {
    width: 38,
    height: 34,
  },
  brandName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    marginTop: 18,
    padding: 18,
    borderRadius: 26,
    backgroundColor: colors.blue,
  },
  heroOrbLarge: {
    position: 'absolute',
    top: -54,
    right: -34,
    width: 156,
    height: 156,
    borderRadius: 78,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  heroOrbSmall: {
    position: 'absolute',
    top: 57,
    right: 55,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroHeading: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 14,
  },
  title: {
    flex: 1,
    maxWidth: 310,
    fontSize: 29,
    lineHeight: 33,
    fontFamily: fonts.bold,
    color: '#ffffff',
    letterSpacing: -0.9,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  featurePanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 17,
    padding: 11,
    rowGap: 10,
    columnGap: 8,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  featureItem: {
    width: '48%',
    minHeight: 31,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureIcon: {
    width: 29,
    height: 29,
    flexShrink: 0,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.17)',
  },
  featureLabel: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    fontFamily: fonts.semibold,
    color: '#ffffff',
  },
  storeCard: {
    marginTop: 14,
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  storeTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  storeCount: {
    minWidth: 27,
    height: 22,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  storeCountText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fonts.bold,
    color: colors.accent,
  },
  storeLogos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 11,
    gap: 7,
  },
  storeLogoBox: {
    width: 37,
    height: 37,
    borderRadius: 12,
    padding: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
  },
  storeLogo: {
    width: '100%',
    height: '100%',
  },
  actions: {
    gap: 10,
    marginTop: 16,
  },
  googleButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 12,
    borderRadius: 17,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  appleButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
    gap: 10,
    borderRadius: 17,
    borderColor: '#000000',
    backgroundColor: '#000000',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  googleIcon: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  appleButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#ffffff',
  },
  legal: {
    marginTop: 2,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 10.5,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
});
