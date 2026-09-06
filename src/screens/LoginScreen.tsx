import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import HardShadow from '../components/HardShadow';

const TERMS_URL = 'https://quefalta.es/condiciones';
const PRIVACY_URL = 'https://quefalta.es/privacidad';
const QUEFALTA_LOGO = require('../../assets/quefalta-logo-blue.png');

function GoogleLogo() {
  return (
    <Svg width={19} height={19} viewBox="0 0 18 18" accessible={false}>
      <Path fill="#4285F4" d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844c-.209 1.125-.843 2.078-1.797 2.716v2.259h2.909c1.702-1.567 2.684-3.874 2.684-6.616Z" />
      <Path fill="#34A853" d="M9 18c2.43 0 4.468-.806 5.956-2.179l-2.909-2.259c-.806.54-1.835.86-3.047.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z" />
      <Path fill="#FBBC05" d="M3.963 10.708A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.281-1.708V4.96H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.04l3.007-2.332Z" />
      <Path fill="#EA4335" d="M9 3.578c1.321 0 2.508.454 3.442 1.346l2.582-2.582C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.96l3.007 2.332C4.672 5.163 6.656 3.578 9 3.578Z" />
    </Svg>
  );
}

function LoginBubbleBackdrop({
  styles,
  width,
  height,
}: {
  styles: ReturnType<typeof themedStyles>;
  width: number;
  height: number;
}) {
  const bubbles = [
    [30, 38, 18], [width - 39, 99, 34], [-16, height * 0.18, 52],
    [width - 100, height * 0.23, 15], [42, height * 0.31, 26],
    [width + 4, height * 0.35, 68], [16, height * 0.43, 20],
    [96, height * 0.49, 42], [width - 44, height * 0.54, 16],
    [-20, height * 0.62, 58], [width - 88, height * 0.68, 24],
    [52, height * 0.75, 13], [width - 37, height - 131, 38],
    [28, height - 63, 21], [width - 142, height + 14, 76],
  ] as const;

  return (
    <Svg
      width={width}
      height={height}
      pointerEvents="none"
      accessible={false}
      style={styles.loginBackdrop}
    >
      <Defs>
        <RadialGradient id="login-bubble" cx="36%" cy="32%" rx="64%" ry="64%">
          <Stop offset="0" stopColor={colors.blue} stopOpacity={0.22} />
          <Stop offset="0.55" stopColor={colors.blue} stopOpacity={0.11} />
          <Stop offset="1" stopColor={colors.blue} stopOpacity={0.01} />
        </RadialGradient>
      </Defs>
      {bubbles.map(([cx, cy, size], index) => (
        <Circle key={index} cx={cx} cy={cy} r={size / 2} fill="url(#login-bubble)" />
      ))}
    </Svg>
  );
}

export default function LoginScreen() {
  const styles = useThemedStyles(themedStyles);
  const { width, height, fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const reducedMotion = useReducedMotion();
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
  const [appleAvailable, setAppleAvailable] = useState(Platform.OS === 'ios');
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [emailPanelAttached, setEmailPanelAttached] = useState(false);
  const [emailPanelHeight, setEmailPanelHeight] = useState(0);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<null | 'invalid' | 'rate' | 'generic' | 'link'>(null);
  const [providerError, setProviderError] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const emailTransition = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (emailExpanded) setEmailPanelAttached(true);

    if (reducedMotion) {
      emailTransition.setValue(emailExpanded ? 1 : 0);
      setEmailPanelAttached(emailExpanded);
      return;
    }

    const animation = Animated.timing(emailTransition, {
      toValue: emailExpanded ? 1 : 0,
      duration: emailExpanded ? 280 : 220,
      easing: emailExpanded ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished && !emailExpanded) setEmailPanelAttached(false);
    });

    return () => animation.stop();
  }, [emailExpanded, emailTransition, reducedMotion]);

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

  const contentTop = largeText
    ? Math.max(insets.top + 12, 24)
    : Math.max(insets.top + 24, Math.min(190, height * 0.22));

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <LoginBubbleBackdrop styles={styles} width={width} height={height} />

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
            { paddingTop: contentTop, paddingBottom: bottomPad },
          ]}
        >
          <View style={[styles.authContent, largeText && styles.authContentLarge]}>
            <View style={styles.loginCopy}>
              <Image
                source={QUEFALTA_LOGO}
                resizeMode="contain"
                style={[styles.loginLogo, largeText && styles.loginLogoLargeText]}
                accessibilityLabel="QuéFalta"
              />
              <Text style={styles.loginTitle} maxFontSizeMultiplier={1.45}>
                {t('login.title')}
              </Text>
              <Text style={styles.loginSubtitle} maxFontSizeMultiplier={1.4}>
                {t('login.subtitle')}
              </Text>
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
                        <Text style={styles.appleButtonText} maxFontSizeMultiplier={1.55}>
                          {t('login.continueApple')}
                        </Text>
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
                      <GoogleLogo />
                      <Text style={styles.googleButtonText} maxFontSizeMultiplier={1.55}>
                        {t('login.continueGoogle')}
                      </Text>
                    </>
                  )}
                </HardShadow>
              </TouchableOpacity>

              <View style={styles.emailAccordion}>
                <TouchableOpacity
                  onPress={() => {
                    if (emailExpanded) {
                      Keyboard.dismiss();
                      setEmailExpanded(false);
                      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
                    } else {
                      setEmailExpanded(true);
                    }
                    setEmailError(null);
                  }}
                  disabled={busy !== null}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: emailExpanded }}
                >
                  <HardShadow
                    style={[
                      styles.emailToggleButton,
                      emailPanelAttached && styles.emailToggleButtonExpanded,
                      busy !== null && styles.buttonDisabled,
                    ]}
                  >
                    <Ionicons name="mail-outline" size={19} color={colors.accent} />
                    <Text style={styles.emailToggleText} maxFontSizeMultiplier={1.55}>
                      {t('login.continueEmail')}
                    </Text>
                    <Ionicons
                      name={emailExpanded ? 'chevron-up' : 'chevron-down'}
                      size={17}
                      color={colors.inkSoft}
                    />
                  </HardShadow>
                </TouchableOpacity>

                <Animated.View
                  pointerEvents={emailExpanded ? 'auto' : 'none'}
                  accessibilityElementsHidden={!emailExpanded}
                  importantForAccessibility={emailExpanded ? 'auto' : 'no-hide-descendants'}
                  style={[
                    styles.emailPanelClip,
                    {
                      height: emailPanelHeight === 0
                        ? 0
                        : emailTransition.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, emailPanelHeight],
                        }),
                      opacity: emailTransition,
                    },
                  ]}
                >
                  <View
                    style={styles.emailPanel}
                    onLayout={(event) => setEmailPanelHeight(event.nativeEvent.layout.height)}
                  >
                    <TextInput
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
                      maxFontSizeMultiplier={1.6}
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
                            <Text style={styles.emailButtonText} maxFontSizeMultiplier={1.55}>
                              {t('login.sendMagicLink')}
                            </Text>
                          )}
                        </HardShadow>
                      </TouchableOpacity>
                    )}
                  </View>
                </Animated.View>
              </View>
            </View>
          </View>

          <View style={styles.legalFooter}>
            <Text style={styles.legal} maxFontSizeMultiplier={1.5}>
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
  loginBackdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  scrollContent: {
    flexGrow: 1,
  },
  authContent: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  authContentLarge: {
    paddingHorizontal: 16,
  },
  loginCopy: {
    alignItems: 'center',
    gap: 7,
    marginBottom: 22,
    paddingHorizontal: 10,
  },
  loginLogo: {
    width: 104,
    height: 86,
    marginBottom: 5,
  },
  loginLogoLargeText: {
    width: 82,
    height: 68,
    marginBottom: 1,
  },
  loginTitle: {
    textAlign: 'center',
    fontSize: 25,
    lineHeight: 30,
    letterSpacing: -0.65,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  loginSubtitle: {
    maxWidth: 390,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  actions: {
    gap: 10,
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
  emailToggleButtonExpanded: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  emailToggleText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  emailAccordion: {
    overflow: 'hidden',
    borderRadius: 17,
  },
  emailPanelClip: {
    overflow: 'hidden',
  },
  emailPanel: {
    padding: 13,
    gap: 10,
    borderBottomLeftRadius: 17,
    borderBottomRightRadius: 17,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: colors.border,
    backgroundColor: colors.white,
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
  googleButtonText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  appleButtonText: {
    flexShrink: 1,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#ffffff',
  },
  legal: {
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  legalFooter: {
    flexShrink: 0,
    marginTop: 'auto',
    paddingTop: 28,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  legalLink: {
    color: colors.blue,
    fontFamily: fonts.semibold,
    textDecorationLine: 'underline',
  },
});
