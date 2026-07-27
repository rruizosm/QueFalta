import type { ReactNode } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { useHeaderTopPadding } from '../../hooks/useHeaderTopPadding';
import ProgressBar from '../../components/ProgressBar';
import GlassSurface, { glassAvailable } from '../../components/GlassSurface';

interface Props {
  step?: number;
  totalSteps?: number;
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
}

export default function OnboardingLayout({
  step,
  totalSteps,
  eyebrow,
  title,
  subtitle,
  children,
  onBack,
  onContinue,
  continueLabel,
  continueDisabled = false,
  continueLoading = false,
  onSkip,
  skipLabel,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const topBarTop = useHeaderTopPadding(54);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const footerBottom = Platform.OS === 'android' ? Math.max(insets.bottom + 12, 30) : 30;
  const { t } = useTranslation();
  const continueText = continueLabel ?? t('onboarding.continue');
  const skipText = skipLabel ?? t('onboarding.skipDefault');
  const showProgress = typeof step === 'number' && typeof totalSteps === 'number';
  const shellWidth = Math.min(width - 32, 560);

  const topBar = (
    <View style={[styles.topBar, { paddingTop: topBarTop }]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8} activeOpacity={0.82}>
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
        </TouchableOpacity>
      ) : (
        <View style={styles.backBtnGhost} />
      )}

      {showProgress ? (
        <View style={styles.progressCol}>
          <ProgressBar progress={step! / totalSteps!} height={5} />
          <Text style={styles.progressText}>{t('onboarding.step', { step: step!, total: totalSteps! })}</Text>
        </View>
      ) : (
        <View style={{ flex: 1 }} />
      )}

      <View style={styles.backBtnGhost} />
    </View>
  );

  const footer = (onContinue || onSkip) ? (
    <View style={[styles.footerInner, { paddingBottom: footerBottom }]}>
      {onContinue ? (
        <TouchableOpacity
          style={[styles.primaryBtn, (continueDisabled || continueLoading) && styles.primaryBtnDisabled]}
          onPress={onContinue}
          disabled={continueDisabled || continueLoading}
          activeOpacity={0.85}
        >
          {continueLoading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <>
              <Text style={styles.primaryBtnText}>{continueText}</Text>
              <Ionicons name="arrow-forward" size={17} color={colors.white} />
            </>
          )}
        </TouchableOpacity>
      ) : null}

      {onSkip ? (
        <TouchableOpacity onPress={onSkip} style={styles.skipBtn} hitSlop={8} activeOpacity={0.75}>
          <Text style={styles.skipText}>{skipText}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {glassAvailable ? (
        <GlassSurface fallbackColor={colors.paper} style={styles.chromeGlass}>
          {topBar}
        </GlassSurface>
      ) : topBar}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.shell, { width: shellWidth }]}>
          {eyebrow ? (
            <View style={styles.eyebrowPill}>
              <View style={styles.eyebrowDot} />
              <Text style={styles.eyebrow}>{eyebrow}</Text>
            </View>
          ) : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children ? <View style={styles.body}>{children}</View> : null}
        </View>
      </ScrollView>

      {footer ? (
        glassAvailable ? (
          <GlassSurface fallbackColor={colors.paper} style={styles.footerGlass}>
            {footer}
          </GlassSurface>
        ) : (
          <View style={styles.footer}>{footer}</View>
        )
      ) : null}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  chromeGlass: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backBtnGhost: { width: 38, height: 38 },
  progressCol: { flex: 1, gap: 6 },
  progressText: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: colors.inkSoft,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  scroll: {
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 24,
    flexGrow: 1,
    alignItems: 'center',
  },
  shell: { flexGrow: 1 },
  eyebrowPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.accentLight,
    marginBottom: 12,
  },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  eyebrow: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 29,
    lineHeight: 34,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    marginTop: 10,
  },
  body: { marginTop: 22 },

  footerGlass: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.paper,
  },
  footerInner: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 4,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
  },
  primaryBtn: {
    minHeight: 52,
    backgroundColor: colors.accent,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    borderRadius: 18,
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  skipBtn: { paddingVertical: 13, alignItems: 'center' },
  skipText: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.inkSoft },
});
