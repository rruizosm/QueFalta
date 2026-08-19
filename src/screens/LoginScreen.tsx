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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import { colors } from '../constants/colors';
import { prefetchStoreIcons } from '../constants/stores';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import HardShadow from '../components/HardShadow';
import LoginBubbleIntro, { getLoginBubbleTargetY } from '../components/LoginBubbleIntro';

const TERMS_URL = 'https://quefalta.es/condiciones';
const PRIVACY_URL = 'https://quefalta.es/privacidad';

export default function LoginScreen() {
  const styles = useThemedStyles(themedStyles);
  const { fontScale, height, width } = useWindowDimensions();
  const largeText = fontScale >= 1.6;
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const bubbleTargetY = getLoginBubbleTargetY(height, insets.top);
  const stageHeight = bubbleTargetY + (largeText ? 108 : 82);
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
  const [revealed, setRevealed] = useState(false);
  const revealStarted = useRef(false);
  const contentReveal = useRef(new Animated.Value(0)).current;
  const scrollViewRef = useRef<ScrollView>(null);
  const emailInputRef = useRef<TextInput>(null);

  const revealLogin = useCallback(() => {
    if (revealStarted.current) return;
    revealStarted.current = true;
    setRevealed(true);

    if (reducedMotion) {
      contentReveal.setValue(1);
      return;
    }

    Animated.sequence([
      Animated.delay(390),
      Animated.timing(contentReveal, {
        toValue: 1,
        duration: 440,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentReveal, reducedMotion]);

  const revealEmailInput = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (!authCallbackError) return;
    // Un enlace inválido debe enseñar su explicación directamente, sin obligar
    // a repetir el gesto de entrada para poder solicitar uno nuevo.
    revealLogin();
    setEmailExpanded(true);
    setEmailError('link');
    clearAuthCallbackError();
  }, [authCallbackError, clearAuthCallbackError, revealLogin]);

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

  const contentAnimatedStyle = {
    opacity: contentReveal,
    transform: [{
      translateY: contentReveal.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }),
    }],
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
          pointerEvents={revealed ? 'auto' : 'none'}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          <View style={{ height: stageHeight }} />

          <Animated.View
            accessibilityElementsHidden={!revealed}
            importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
            style={[
              styles.authContent,
              largeText && styles.authContentLarge,
              contentAnimatedStyle,
            ]}
          >
            <View style={styles.loginCopy}>
              <Text style={styles.loginTitle} maxFontSizeMultiplier={2}>
                {t('login.title')}
              </Text>
              <Text style={styles.loginSubtitle} maxFontSizeMultiplier={2}>
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
                    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
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
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Animated.View
        pointerEvents={revealed ? 'auto' : 'none'}
        accessibilityElementsHidden={!revealed}
        importantForAccessibility={revealed ? 'auto' : 'no-hide-descendants'}
        style={[styles.legalFooter, { paddingBottom: bottomPad, opacity: contentReveal }]}
      >
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
      </Animated.View>

      <LoginBubbleIntro
        accentColor={colors.accent}
        accentLightColor={colors.accentLight}
        accentMidColor={colors.accentMid}
        finalVisualsVisible={!emailExpanded}
        height={height}
        inkColor={colors.ink}
        inkSoftColor={colors.inkSoft}
        paperColor={colors.paper}
        reducedMotion={reducedMotion}
        revealed={revealed}
        safeAreaTop={insets.top}
        swipeHint={t('login.swipeUp')}
        title={t('login.openingTitle')}
        width={width}
        onReveal={revealLogin}
      />
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
    paddingBottom: 12,
    backgroundColor: colors.paper,
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
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 10.5,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  legalFooter: {
    flexShrink: 0,
    paddingTop: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.paper,
  },
  legalLink: {
    color: colors.blue,
    fontFamily: fonts.semibold,
    textDecorationLine: 'underline',
  },
});
