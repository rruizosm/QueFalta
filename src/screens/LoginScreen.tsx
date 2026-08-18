import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '../constants/colors';
import { CATALOG_STORES, prefetchStoreIcons } from '../constants/stores';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import HardShadow from '../components/HardShadow';

const LOGO = require('../../assets/quefalta-logo-blue.png');
const TERMS_URL = 'https://quefalta.es/condiciones';
const PRIVACY_URL = 'https://quefalta.es/privacidad';

const FALLING_STORES = [
  ...CATALOG_STORES.filter((store) => store.icon != null),
  { key: 'hipercor', icon: require('../../assets/stores/hipercor.png') },
];

const LOGO_SLOTS = [
  { left: '4%',  top: '4%',  size: 54, rotate: '-8deg' },
  { left: '27%', top: '1%',  size: 46, rotate: '5deg' },
  { left: '48%', top: '7%',  size: 58, rotate: '-3deg' },
  { left: '76%', top: '2%',  size: 48, rotate: '8deg' },
  { left: '13%', top: '34%', size: 48, rotate: '5deg' },
  { left: '36%', top: '29%', size: 56, rotate: '-7deg' },
  { left: '65%', top: '34%', size: 52, rotate: '4deg' },
  { left: '84%', top: '30%', size: 43, rotate: '-5deg' },
  { left: '1%',  top: '65%', size: 46, rotate: '7deg' },
  { left: '21%', top: '62%', size: 55, rotate: '-4deg' },
  { left: '45%', top: '67%', size: 46, rotate: '6deg' },
  { left: '65%', top: '61%', size: 57, rotate: '-6deg' },
  { left: '87%', top: '64%', size: 42, rotate: '4deg' },
  { left: '7%',  top: '55%', size: 43, rotate: '3deg' },
  { left: '76%', top: '52%', size: 45, rotate: '-3deg' },
  { left: '2%',  top: '81%', size: 43, rotate: '-5deg' },
  { left: '36%', top: '50%', size: 46, rotate: '4deg' },
  { left: '84%', top: '80%', size: 42, rotate: '-4deg' },
] as const;

const CLOUD_SLOTS = [
  { left: '14%', top: '5%', scale: 0.40 },
  { left: '5%', top: '14%', scale: 0.62 },
  { left: '72%', top: '17%', scale: 0.46 },
  { left: '58%', top: '49%', scale: 0.58 },
  { left: '8%', top: '74%', scale: 0.42 },
] as const;

export default function LoginScreen() {
  const styles = useThemedStyles(themedStyles);
  const { fontScale, height, width } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const reducedMotion = useReducedMotion();
  const heroHeight = height < 720 ? 300 : Math.min(370, height * 0.43);
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
  const logoProgress = useRef(LOGO_SLOTS.map(() => new Animated.Value(0))).current;
  const logoFloat = useRef(LOGO_SLOTS.map(() => new Animated.Value(0))).current;

  const revealEmailInput = useCallback(() => {
    // Espera a que el panel se haya montado y a la animación del teclado: así
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
    prefetchStoreIcons();

    if (reducedMotion) {
      logoProgress.forEach((progress) => progress.setValue(1));
      logoFloat.forEach((float) => float.setValue(0));
      return;
    }

    logoProgress.forEach((progress) => progress.setValue(0));
    logoFloat.forEach((float) => float.setValue(0));
    const animation = Animated.stagger(
      65,
      logoProgress.map((progress) => Animated.spring(progress, {
        toValue: 1,
        damping: 14,
        stiffness: 125,
        mass: 0.8,
        useNativeDriver: true,
      })),
    );
    const floatingAnimations = logoFloat.map((float, index) => Animated.loop(
      Animated.sequence([
        Animated.delay(index * 85),
        Animated.timing(float, {
          toValue: 1,
          duration: 1650 + (index % 4) * 180,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 1650 + (index % 4) * 180,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ));
    animation.start();
    floatingAnimations.forEach((floatingAnimation) => floatingAnimation.start());
    return () => {
      animation.stop();
      floatingAnimations.forEach((floatingAnimation) => floatingAnimation.stop());
    };
  }, [logoFloat, logoProgress, reducedMotion]);

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
      <StatusBar barStyle="light-content" backgroundColor={colors.accent} />

      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={[styles.hero, { minHeight: heroHeight, paddingTop: insets.top + 10 }]}>
            <View style={styles.heroInner}>
              <View style={styles.cloudLayer} pointerEvents="none" accessible={false}>
                {CLOUD_SLOTS.map((cloud, index) => (
                  <View
                    key={index}
                    style={[
                      styles.cloud,
                      {
                        left: cloud.left,
                        top: cloud.top,
                        transform: [{ scale: cloud.scale }],
                      },
                    ]}
                  >
                    <View style={styles.cloudBase} />
                    <View style={styles.cloudPuffLeft} />
                    <View style={styles.cloudPuffCenter} />
                    <View style={styles.cloudPuffRight} />
                  </View>
                ))}
              </View>
              <View style={styles.logoStage} pointerEvents="none" accessible={false}>
                {FALLING_STORES.map((store, index) => {
                  const slot = LOGO_SLOTS[index];
                  const progress = logoProgress[index];
                  return (
                    <Animated.View
                      key={store.key}
                      style={[
                        styles.fallingLogoCard,
                        {
                          left: slot.left,
                          top: slot.top,
                          width: slot.size,
                          height: slot.size,
                          opacity: progress,
                          transform: [
                            {
                              translateY: progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: [-220 - (index % 4) * 28, 0],
                              }),
                            },
                            {
                              translateY: logoFloat[index].interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -5 - (index % 3)],
                              }),
                            },
                            { rotate: slot.rotate },
                            {
                              scale: progress.interpolate({
                                inputRange: [0, 0.78, 1],
                                outputRange: [0.78, 1.04, 1],
                              }),
                            },
                          ],
                        },
                      ]}
                    >
                      <Image
                        source={store.icon!}
                        contentFit="contain"
                        transition={0}
                        style={styles.fallingLogo}
                        accessible={false}
                      />
                    </Animated.View>
                  );
                })}
              </View>
            </View>
            <Svg
              pointerEvents="none"
              width={width}
              height={96}
              viewBox={`0 0 ${width} 96`}
              style={styles.heroCurve}
            >
              <Path d={`M 0 96 Q ${width / 2} 0 ${width} 96 L ${width} 96 L 0 96 Z`} fill={colors.paper} />
            </Svg>
            <View style={styles.heroBrand}>
              <View style={styles.brand}>
                <View style={styles.logoBox}>
                  <Image source={LOGO} contentFit="contain" style={styles.logo} accessible={false} />
                </View>
                <Text style={styles.brandName} maxFontSizeMultiplier={2}>QuéFalta</Text>
              </View>
            </View>
          </View>

          <View style={[styles.authContent, largeText && styles.authContentLarge, { paddingBottom: bottomPad }]}>
            <Text
              style={styles.valueTitle}
              maxFontSizeMultiplier={2}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.76}
            >
              {t('login.valueTitle')}
            </Text>
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
                  <Ionicons name="mail-outline" size={19} color={colors.accent} />
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
    backgroundColor: colors.paper,
  },
  hero: {
    position: 'relative',
    overflow: 'visible',
    paddingHorizontal: 18,
    backgroundColor: colors.accent,
  },
  heroInner: {
    flex: 1,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  brand: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroBrand: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -19,
    alignItems: 'center',
    zIndex: 3,
  },
  logoBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: {
    width: 36,
    height: 32,
  },
  brandName: {
    fontSize: 21,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  logoStage: {
    flex: 1,
    position: 'relative',
    minHeight: 215,
    zIndex: 1,
  },
  cloudLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  cloud: {
    position: 'absolute',
    width: 68,
    height: 28,
    opacity: 0.24,
  },
  cloudBase: {
    position: 'absolute',
    left: 4,
    bottom: 0,
    width: 60,
    height: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  cloudPuffLeft: {
    position: 'absolute',
    left: 10,
    bottom: 7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  cloudPuffCenter: {
    position: 'absolute',
    left: 23,
    bottom: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  cloudPuffRight: {
    position: 'absolute',
    left: 43,
    bottom: 6,
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#ffffff',
  },
  fallingLogoCard: {
    position: 'absolute',
    padding: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(43,37,33,0.10)',
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  fallingLogo: {
    width: '100%',
    height: '100%',
  },
  heroCurve: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  authContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    marginTop: 0,
    paddingTop: 0,
    paddingHorizontal: 20,
    zIndex: 2,
  },
  authContentLarge: {
    marginTop: 0,
  },
  valueTitle: {
    maxWidth: 500,
    alignSelf: 'center',
    marginTop: 42,
    fontSize: 27,
    lineHeight: 31,
    fontFamily: fonts.bold,
    color: colors.ink,
    letterSpacing: -0.8,
    textAlign: 'center',
  },
  actions: {
    gap: 10,
    marginTop: 14,
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
