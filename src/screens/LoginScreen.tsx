import React, { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
const TERMS_URL = 'https://quefalta.es/condiciones';
const PRIVACY_URL = 'https://quefalta.es/privacidad';

const FEATURES: {
  icon: ComponentProps<typeof Ionicons>['name'];
  labelKey:
    | 'login.sharedCartTitle'
    | 'login.newTitle'
    | 'login.offersTitle'
    | 'login.pricesTitle';
}[] = [
  { icon: 'people-outline', labelKey: 'login.sharedCartTitle' },
  { icon: 'sparkles-outline', labelKey: 'login.newTitle' },
  { icon: 'pricetag-outline', labelKey: 'login.offersTitle' },
  { icon: 'swap-vertical-outline', labelKey: 'login.pricesTitle' },
];

export default function LoginScreen() {
  const styles = useThemedStyles(themedStyles);
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const insets = useSafeAreaInsets();
  const bottomPad = Platform.OS === 'android'
    ? Math.max(insets.bottom + 12, 28)
    : Math.max(insets.bottom + 10, 24);
  const { t } = useTranslation();
  const {
    signInWithGoogle,
    signInWithEmail,
    signInWithApple,
    authCallbackError,
    clearAuthCallbackError,
  } = useAuth();
  const [busy, setBusy] = useState<null | 'google' | 'apple' | 'email'>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<null | 'invalid' | 'rate' | 'generic' | 'link'>(null);
  const [providerError, setProviderError] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const emailInputRef = useRef<TextInput>(null);

  const revealEmailInput = useCallback(() => {
    // Espera a que el panel se haya montado y a la animaciÃ³n del teclado: asÃ­
    // el campo queda por encima del teclado tanto en iOS como en Android.
    requestAnimationFrame(() => {
      emailInputRef.current?.focus();
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 180);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  useEffect(() => {
    if (!authCallbackError) return;
    setEmailExpanded(true);
    setEmailError('link');
    clearAuthCallbackError();
  }, [authCallbackError, clearAuthCallbackError]);

  const handleGoogleSignIn = async () => {
    setBusy('google');
    setProviderError(false);
    try {
      await signInWithGoogle();
    } catch {
      setProviderError(true);
    } finally {
      setBusy(null);
    }
  };

  const handleAppleSignIn = async () => {
    setBusy('apple');
    setProviderError(false);
    try {
      await signInWithApple();
    } catch {
      setProviderError(true);
    } finally {
      setBusy(null);
    }
  };

  const handleEmailSignIn = async () => {
    const normalizedEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setEmailError('invalid');
      return;
    }

    setBusy('email');
    setEmailError(null);
    try {
      await signInWithEmail(normalizedEmail);
      Keyboard.dismiss();
      setEmailSent(true);
    } catch (error: unknown) {
      const status = typeof error === 'object' && error != null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : null;
      const message = error instanceof Error ? error.message : '';
      setEmailError(status === 429 || /rate limit|60 seconds|security purposes/i.test(message)
        ? 'rate'
        : 'generic');
    } finally {
      setBusy(null);
    }
  };

  const emailErrorText = emailError === 'invalid'
    ? t('login.emailInvalid')
    : emailError === 'rate'
      ? t('login.emailRateLimit')
      : emailError === 'link'
        ? t('login.emailLinkError')
        : emailError === 'generic'
          ? t('login.emailSendError')
          : null;

  const openLegalUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 10, paddingBottom: bottomPad },
        ]}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <View style={styles.logoBox}>
              <Image source={LOGO} resizeMode="contain" style={styles.logo} accessible={false} />
            </View>
            <Text style={styles.brandName} maxFontSizeMultiplier={2}>QuéFalta</Text>
          </View>

          <View style={styles.heroCard}>
            <View pointerEvents="none" style={styles.heroOrbLarge} />
            <View pointerEvents="none" style={styles.heroOrbSmall} />

            <View style={[styles.heroHeading, largeText && styles.heroHeadingLarge]}>
              <Text style={styles.title} maxFontSizeMultiplier={2}>{t('login.title')}</Text>
              {!largeText && <View style={styles.heroIcon}>
                <Ionicons name="basket-outline" size={30} color="#ffffff" />
              </View>}
            </View>

            <View style={[styles.featurePanel, largeText && styles.featurePanelLarge]}>
              {FEATURES.map((feature) => (
                <View key={feature.labelKey} style={[styles.featureItem, largeText && styles.featureItemLarge]}>
                  <View style={styles.featureIcon}>
                    <Ionicons name={feature.icon} size={17} color="#ffffff" />
                  </View>
                  <Text style={styles.featureLabel} maxFontSizeMultiplier={2}>{t(feature.labelKey)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.storeCard}>
            <View style={styles.storeHeader}>
              <Text style={styles.storeTitle} maxFontSizeMultiplier={2}>{t('login.storesTitle')}</Text>
              <View style={styles.storeCount}>
                <Text style={styles.storeCountText}>{CATALOG_STORES.length}</Text>
              </View>
            </View>

            <View style={styles.storeLogos}>
              {CATALOG_STORES.map((store) => (
                <View key={store.key} style={styles.storeLogoBox}>
                  {store.icon != null && (
                    <Image source={store.icon} resizeMode="contain" style={styles.storeLogo} accessible={false} />
                  )}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.actions}>
            {providerError && (
              <View style={styles.providerFeedback} accessibilityRole="alert">
                <Ionicons name="alert-circle-outline" size={17} color={colors.red} />
                <Text style={styles.providerFeedbackText}>{t('login.providerError')}</Text>
              </View>
            )}

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

            <TouchableOpacity
              onPress={() => {
                if (emailExpanded) {
                  Keyboard.dismiss();
                  setEmailExpanded(false);
                } else {
                  setEmailExpanded(true);
                  revealEmailInput();
                }
                setEmailError(null);
              }}
              disabled={busy !== null}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ expanded: emailExpanded }}
            >
              <HardShadow
                style={busy !== null
                  ? { ...styles.emailToggleButton, ...styles.buttonDisabled }
                  : styles.emailToggleButton}
              >
                <Ionicons name="mail-outline" size={19} color={colors.blue} />
                <Text style={styles.emailToggleText}>{t('login.continueEmail')}</Text>
                <Ionicons
                  name={emailExpanded ? 'chevron-up' : 'chevron-down'}
                  size={17}
                  color={colors.inkSoft}
                />
              </HardShadow>
            </TouchableOpacity>

            {emailExpanded && (
              <View style={styles.emailPanel}>
                <Text style={styles.emailHint}>{t('login.emailHint')}</Text>
                <TextInput
                  ref={emailInputRef}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    setEmailSent(false);
                    setEmailError(null);
                  }}
                  onSubmitEditing={() => {
                    if (busy === null && !emailSent) handleEmailSignIn();
                  }}
                  onFocus={() => {
                    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 180);
                  }}
                  editable={busy === null}
                  placeholder={t('login.emailPlaceholder')}
                  placeholderTextColor={colors.inkSoft}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="send"
                  style={[styles.emailInput, emailErrorText ? styles.emailInputError : null]}
                  accessibilityLabel={t('login.emailPlaceholder')}
                />

                {emailErrorText && (
                  <View style={styles.emailFeedbackRow}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.red} />
                    <Text style={styles.emailErrorText}>{emailErrorText}</Text>
                  </View>
                )}

                {emailSent ? (
                  <View style={styles.emailSuccess}>
                    <Ionicons name="checkmark-circle" size={21} color={colors.ok} />
                    <View style={styles.emailSuccessCopy}>
                      <Text style={styles.emailSuccessTitle}>{t('login.emailSentTitle')}</Text>
                      <Text style={styles.emailSuccessText}>
                        {t('login.emailSentText', { email: email.trim() })}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleEmailSignIn}
                    disabled={busy !== null}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                  >
                    <HardShadow
                      style={busy !== null
                        ? { ...styles.emailButton, ...styles.buttonDisabled }
                        : styles.emailButton}
                    >
                      {busy === 'email' ? (
                        <ActivityIndicator color="#ffffff" size="small" />
                      ) : (
                        <Text style={styles.emailButtonText}>{t('login.sendMagicLink')}</Text>
                      )}
                    </HardShadow>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.legal}>
              {t('login.legalPrefix')}
              <Text
                style={styles.legalLink}
                accessibilityRole="link"
                onPress={() => openLegalUrl(TERMS_URL)}
              >
                {t('login.terms')}
              </Text>
              {t('login.legalMiddle')}
              <Text
                style={styles.legalLink}
                accessibilityRole="link"
                onPress={() => openLegalUrl(PRIVACY_URL)}
              >
                {t('login.privacyPolicy')}
              </Text>
              {t('login.legalSuffix')}
            </Text>
          </View>
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
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
  heroHeadingLarge: { minHeight: 0, alignItems: 'flex-start' },
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
  featurePanelLarge: { flexDirection: 'column' },
  featureItem: {
    width: '48%',
    minHeight: 31,
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  featureItemLarge: { width: '100%', minHeight: 44 },
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
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
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
  providerFeedback: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(214,69,43,0.30)',
    backgroundColor: 'rgba(214,69,43,0.08)',
  },
  providerFeedbackText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.red,
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
  emailToggleButton: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 10,
    borderRadius: 17,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  emailToggleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  emailPanel: {
    padding: 13,
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  emailHint: {
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  emailInput: {
    minHeight: 50,
    paddingHorizontal: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.paper,
    fontSize: 15,
    fontFamily: fonts.medium,
    color: colors.ink,
  },
  emailInputError: {
    borderColor: colors.red,
  },
  emailFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  emailErrorText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.red,
  },
  emailButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 20,
    borderRadius: 15,
    borderColor: colors.blue,
    backgroundColor: colors.blue,
  },
  emailButtonText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#ffffff',
  },
  emailSuccess: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 11,
    borderRadius: 14,
    backgroundColor: 'rgba(63,143,79,0.12)',
  },
  emailSuccessCopy: {
    flex: 1,
    gap: 2,
  },
  emailSuccessTitle: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  emailSuccessText: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
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
  legalLink: {
    color: colors.blue,
    fontFamily: fonts.semibold,
    textDecorationLine: 'underline',
  },
});
