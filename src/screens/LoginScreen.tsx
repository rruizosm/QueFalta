import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import HardShadow from '../components/HardShadow';

const LOGO = require('../../assets/quefalta-blue.png');

// Fondo de marca: mismo azul claro que el cuadrado del logo (quefalta-blue.png),
// para que el logo se funda con la pantalla. Login es una pantalla de marca con
// apariencia fija: todo el texto va en tinta casi negra (BRAND_INK) para que se
// lea bien sobre el azul claro, en lugar de seguir el tema claro/oscuro.
const LOGO_BG = '#E1EBF7';
const BRAND_INK = '#2b2521';

export default function LoginScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { signInWithGoogle, signInWithApple } = useAuth();
  // Qué proveedor está autenticando (deshabilita ambos botones y muestra spinner).
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
  // Sign in with Apple solo existe en iOS 13+ y en build real (no Expo Go).
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const handleGoogleSignIn = async () => {
    setBusy('google');
    await signInWithGoogle();
    setBusy(null);
  };

  const handleAppleSignIn = async () => {
    setBusy('apple');
    await signInWithApple();
    setBusy(null);
  };

  return (
    <View style={styles.container}>

      {/* Hero */}
      <View style={styles.hero}>
        <HardShadow style={styles.iconBox}>
          <Image source={LOGO} resizeMode="cover" style={styles.logo} />
        </HardShadow>

        <View style={styles.heroText}>
          <Text style={styles.title}>QuéFalta</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {/* Apple va primero: Apple exige que su botón sea al menos tan prominente
            como el resto de opciones de login (App Store Review 4.8). */}
        {appleAvailable && (
          <TouchableOpacity
            onPress={handleAppleSignIn}
            disabled={busy !== null}
            activeOpacity={0.85}
          >
            <HardShadow style={busy !== null ? { ...styles.appleButton, ...styles.buttonDisabled } : styles.appleButton}>
              {busy === 'apple' ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="logo-apple" size={18} color="#ffffff" />
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
        >
          <HardShadow style={busy !== null ? { ...styles.googleButton, ...styles.buttonDisabled } : styles.googleButton}>
            {busy === 'google' ? (
              <ActivityIndicator color={BRAND_INK} size="small" />
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
  );
}

const themedStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LOGO_BG,
    paddingHorizontal: 26,
    paddingTop: 30,
    paddingBottom: 36,
    justifyContent: 'space-between',
  },

  // ── Hero ──────────────────────────────────────────────────────
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  iconBox: {
    width: 112,
    height: 112,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  heroText: {
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 38,
    fontFamily: fonts.bold,
    color: BRAND_INK,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: fonts.medium,
    color: BRAND_INK,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 260,
  },

  // ── Actions ───────────────────────────────────────────────────
  actions: {
    gap: 16,
    alignItems: 'stretch',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 12,
    backgroundColor: '#ffffff', // tarjeta blanca fija sobre el fondo de marca
  },
  buttonDisabled: { opacity: 0.6 },
  googleIcon: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#4285F4',
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: BRAND_INK,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 10,
    backgroundColor: '#000000', // negro Apple sobre el fondo de marca
  },
  appleButtonText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#ffffff',
  },
  legal: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: BRAND_INK,
    textAlign: 'center',
    lineHeight: 17,
  },
});
