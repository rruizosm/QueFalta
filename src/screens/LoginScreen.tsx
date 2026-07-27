import React, { useEffect, useState } from 'react';
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

          <View style={styles.hero}>
            <Text style={styles.title}>{t('login.title')}</Text>
          </View>

          <View style={styles.storeCard}>
            <View style={styles.storeCopy}>
              <Text style={styles.storeTitle}>{t('login.storesTitle')}</Text>
              <Text style={styles.storeText}>
                {t('login.storesText', { count: CATALOG_STORES.length })}
              </Text>
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
            <Text style={styles.actionTitle}>{t('login.actionTitle')}</Text>

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
  hero: {
    marginTop: 24,
  },
  eyebrow: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.bold,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
    marginBottom: 7,
  },
  title: {
    maxWidth: 440,
    fontSize: 26,
    lineHeight: 31,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.7,
  },
  storeCard: {
    marginTop: 20,
    padding: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
  },
  storeCopy: {
    gap: 2,
    alignItems: 'center',
  },
  storeTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  storeText: {
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  storeLogos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 13,
    gap: 8,
  },
  storeLogoBox: {
    width: 39,
    height: 39,
    borderRadius: 13,
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
    marginTop: 24,
  },
  actionTitle: {
    marginBottom: 2,
    textAlign: 'center',
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink,
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
