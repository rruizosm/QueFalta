/**
 * OnboardingLayout — chrome compartido por todas las pantallas del asistente de
 * bienvenida: barra de progreso arriba, título grande, cuerpo y, abajo, el botón
 * primario (accent) + un "Omitir" opcional para los pasos no obligatorios.
 *
 * Mantiene la estética del resto de la app (papel crema plano, sin radios,
 * Space Grotesk) y respeta el patrón useThemedStyles (accent mutable).
 */
import type { ReactNode } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  StatusBar, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import ProgressBar from '../../components/ProgressBar';

interface Props {
  /** Paso 1-based. Si se pasa junto a totalSteps, pinta la barra de progreso. */
  step?: number;
  totalSteps?: number;
  /** Etiqueta pequeña sobre el título (ej. "OBLIGATORIO" / "OPCIONAL"). */
  eyebrow?: string;
  /** String o nodo (p. ej. con un tramo resaltado en color). */
  title: ReactNode;
  subtitle?: string;
  children?: ReactNode;
  onBack?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
  continueDisabled?: boolean;
  continueLoading?: boolean;
  /** Si se pasa, muestra el botón de texto "Omitir" bajo el principal. */
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
  const { t } = useTranslation();
  const continueText = continueLabel ?? t('onboarding.continue');
  const skipText = skipLabel ?? t('onboarding.skipDefault');
  const showProgress = typeof step === 'number' && typeof totalSteps === 'number';

  return (
    // Sin KeyboardAvoidingView a propósito: el footer (Continuar / Omitir) queda
    // anclado abajo y el teclado simplemente lo tapa; al cerrarlo reaparece, en
    // vez de subir con el teclado. El cuerpo es scroll y `on-drag` cierra el
    // teclado al arrastrar para volver a ver el footer.
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {/* Top bar: back + progreso */}
      <View style={styles.topBar}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.ink} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        {showProgress ? (
          <View style={styles.progressCol}>
            <ProgressBar progress={step! / totalSteps!} height={6} />
            <Text style={styles.progressText}>{t('onboarding.step', { step: step!, total: totalSteps! })}</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children ? <View style={styles.body}>{children}</View> : null}
      </ScrollView>

      {/* Footer: botón principal + omitir */}
      {(onContinue || onSkip) && (
        <View style={styles.footer}>
          {onContinue && (
            <TouchableOpacity
              style={[styles.primaryBtn, (continueDisabled || continueLoading) && styles.primaryBtnDisabled]}
              onPress={onContinue}
              disabled={continueDisabled || continueLoading}
              activeOpacity={0.85}
            >
              {continueLoading
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.primaryBtnText}>{continueText}</Text>}
            </TouchableOpacity>
          )}
          {onSkip && (
            <TouchableOpacity onPress={onSkip} style={styles.skipBtn} hitSlop={8}>
              <Text style={styles.skipText}>{skipText}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10,
  },
  backBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  progressCol: { flex: 1, gap: 6 },
  progressText: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.2, textAlign: 'center',
  },

  scroll: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 24, flexGrow: 1 },
  eyebrow: {
    fontSize: 11, fontFamily: fonts.bold, color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 10,
  },
  title: { fontSize: 27, lineHeight: 32, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14.5, lineHeight: 21, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 10 },
  body: { marginTop: 22 },

  footer: {
    paddingHorizontal: 24, paddingTop: 10, paddingBottom: 30,
    gap: 4,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.paper,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 15, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.4 },
  primaryBtnText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white, letterSpacing: 0.2 },
  skipBtn: { paddingVertical: 13, alignItems: 'center' },
  skipText: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.inkSoft },
});
