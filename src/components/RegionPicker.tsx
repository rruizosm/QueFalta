/**
 * RegionPicker — selector de zona por CÓDIGO POSTAL: input de 5 dígitos que
 * deriva y confirma la comunidad autónoma (provincia = 2 primeros dígitos,
 * regionFromPostalCode), más la opción "Toda España" (sentinel 'ES', sin CP)
 * para quien no quiere darlo. Lo comparten el primer paso de onboarding
 * (UsernameScreen), el gate de usuarios existentes (RegionGateScreen) y
 * Ajustes (RegionSettingsScreen). Ver COMUNIDAD-AUTONOMA.md.
 *
 * Contrato: emite `{ region, postalCode }`. region null = selección incompleta
 * o CP inválido (el padre deshabilita Continuar / no guarda). "Toda España"
 * emite region 'ES' con postalCode null.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { REGION_ALL, regionFromPostalCode, type RegionValue } from '../constants/regions';
import { useReducedMotion } from '../hooks/useReducedMotion';

export interface RegionSelection {
  region: RegionValue | null;
  postalCode: string | null;
}

interface Props {
  /** Región actual (null = ninguna todavía). */
  region: RegionValue | null;
  /** CP actual guardado (semilla del input; null si no hay o eligió España). */
  postalCode: string | null;
  onChange: (next: RegionSelection) => void;
  autoFocus?: boolean;
  helperText?: string;
  /** Ajusta los textos que quedan fuera de las tarjetas para fondos oscuros. */
  inverse?: boolean;
  /** En onboarding, revela la comunidad a la derecha y reparte la fila al 50 %. */
  inlineDetected?: boolean;
}

export default function RegionPicker({
  region,
  postalCode,
  onChange,
  autoFocus,
  helperText,
  inverse = false,
  inlineDetected = false,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  // El texto en edición vive aquí (puede ser un CP a medias); el padre solo
  // recibe estados completos (CP válido o "Toda España") o null.
  const [cp, setCp] = useState(postalCode ?? '');

  const cpRegion = regionFromPostalCode(cp);
  const inlineProgress = useRef(new Animated.Value(inlineDetected && cpRegion ? 1 : 0)).current;
  const [displayRegion, setDisplayRegion] = useState(cpRegion);
  const invalid = cp.length === 5 && !cpRegion;
  const allOn = region === REGION_ALL && cp.length === 0;
  const activeColor = inverse ? colors.blue : colors.accent;

  useEffect(() => {
    if (!inlineDetected) return undefined;
    if (cpRegion) setDisplayRegion(cpRegion);

    if (reducedMotion) {
      inlineProgress.setValue(cpRegion ? 1 : 0);
      if (!cpRegion) setDisplayRegion(null);
      return undefined;
    }

    const animation = Animated.timing(inlineProgress, {
      toValue: cpRegion ? 1 : 0,
      duration: 360,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished && !cpRegion) setDisplayRegion(null);
    });
    return () => animation.stop();
  }, [cpRegion, inlineDetected, inlineProgress, reducedMotion]);

  const handleCpChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 5);
    setCp(digits);
    const next = regionFromPostalCode(digits);
    if (next) {
      Haptics.selectionAsync();
      onChange({ region: next, postalCode: digits });
    } else {
      // Incompleto o inválido: deselecciona (también anula un "Toda España" previo).
      onChange({ region: null, postalCode: null });
    }
  };

  const selectAll = () => {
    if (allOn) return;
    Haptics.selectionAsync();
    setCp('');
    onChange({ region: REGION_ALL, postalCode: null });
  };

  const postalCodeCard = (
    <View style={[
      styles.inputBox,
      inlineDetected && styles.inlineCard,
      inverse && styles.surfaceInverse,
      invalid && styles.inputBoxError,
      !!cpRegion && (inverse ? styles.surfaceOnInverse : styles.inputBoxOn),
    ]}>
      <View style={[styles.iconWrap, inverse && styles.iconWrapInverse]}>
        <Ionicons name="location-outline" size={18} color={cpRegion ? activeColor : colors.inkSoft} />
      </View>
      <TextInput
        style={[styles.input, inverse && styles.inputInverse]}
        value={cp}
        onChangeText={handleCpChange}
        placeholder={t('region.postalCodePlaceholder')}
        placeholderTextColor={colors.inkFaint}
        keyboardType="number-pad"
        maxLength={5}
        autoFocus={autoFocus}
        returnKeyType="done"
        accessibilityLabel={t('region.postalCodePlaceholder')}
        accessibilityHint={helperText}
        accessibilityValue={{
          text: cpRegion ? `${cp}. ${t(`region.names.${cpRegion}`)}` : cp,
        }}
      />
      {cpRegion ? <Ionicons name="checkmark-circle" size={22} color={activeColor} /> : null}
    </View>
  );

  const detectedRegion = inlineDetected ? displayRegion : cpRegion;
  const detectedCard = detectedRegion ? (
    <View
      style={[
        styles.detected,
        inlineDetected && styles.detectedInline,
        inverse && styles.detectedInverse,
      ]}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`${t('region.detected')}: ${t(`region.names.${detectedRegion}`)}`}
    >
      <Text
        style={[styles.detectedLabel, inverse && styles.detectedLabelInverse]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {t('region.detected')}
      </Text>
      <Text
        style={[styles.detectedName, inverse && styles.inverseText]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {t(`region.names.${detectedRegion}`)}
      </Text>
    </View>
  ) : null;

  return (
    <View style={styles.list}>
      {/* Input de código postal */}
      {inlineDetected ? (
        <View style={styles.inlineRow}>
          <View style={styles.inlinePostalWrap}>{postalCodeCard}</View>
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden={!cpRegion}
            importantForAccessibility={cpRegion ? 'auto' : 'no-hide-descendants'}
            style={[
              styles.inlineDetectedWrap,
              {
                flexGrow: inlineProgress,
                marginLeft: inlineProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 10],
                }),
                opacity: inlineProgress,
                transform: [{
                  translateX: inlineProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                }],
              },
            ]}
          >
            {detectedCard}
          </Animated.View>
        </View>
      ) : postalCodeCard}
      {helperText ? <Text style={[styles.helperText, inverse && styles.inverseText]}>{helperText}</Text> : null}
      {invalid ? <Text style={styles.errorText}>{t('region.postalCodeInvalid')}</Text> : null}

      {/* Comunidad derivada (confirmación) */}
      {!inlineDetected ? detectedCard : null}

      {/* Escape: sin CP → toda España (sin filtro) */}
      <Text style={[styles.orAll, inverse && styles.inverseText]}>{t('region.orAll')}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={selectAll}
        accessibilityRole="button"
        accessibilityLabel={t('region.all')}
        accessibilityState={{ selected: allOn }}
        style={[
          styles.card,
          inverse && styles.surfaceInverse,
          allOn && (inverse ? styles.surfaceOnInverse : styles.cardOn),
        ]}
      >
        <View style={[styles.iconWrap, inverse && styles.iconWrapInverse]}>
          <Ionicons name="earth-outline" size={18} color={allOn ? activeColor : colors.inkSoft} />
        </View>
        <Text style={[styles.cardName, inverse && styles.cardNameInverse]} numberOfLines={1}>{t('region.all')}</Text>
        <Ionicons
          name={allOn ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={allOn ? activeColor : colors.inkFaint}
        />
      </TouchableOpacity>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  list: { gap: 10 },

  inlineRow: { flexDirection: 'row', alignItems: 'stretch' },
  inlinePostalWrap: { flexBasis: 0, flexGrow: 1, flexShrink: 1, minWidth: 0 },
  inlineDetectedWrap: { flexBasis: 0, flexShrink: 1, minWidth: 0, overflow: 'hidden' },
  inlineCard: { flex: 1, minHeight: 60 },

  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 18,
  },
  inputBoxOn: { borderColor: colors.accent },
  inputBoxError: { borderColor: colors.red },
  input: {
    flex: 1, minWidth: 0, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink,
    padding: 0,
  },
  inputInverse: { color: '#2b2521' },
  errorText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.red, marginTop: -2 },
  helperText: { fontSize: 12.5, lineHeight: 17, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: -2 },

  detected: {
    backgroundColor: colors.accentLight,
    borderWidth: 1, borderColor: colors.accent,
    paddingHorizontal: 14, paddingVertical: 12, gap: 2, borderRadius: 16,
  },
  detectedInline: {
    flex: 1,
    minHeight: 60,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 1,
  },
  detectedLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  detectedName: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  detectedInverse: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderColor: 'rgba(255,255,255,0.48)',
  },
  detectedLabelInverse: { color: '#ffffff' },
  inverseText: { color: 'rgba(255,255,255,0.9)' },

  orAll: {
    fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 8, marginBottom: -2,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 18,
  },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  surfaceInverse: { backgroundColor: '#ffffff', borderColor: 'rgba(255,255,255,0.72)' },
  surfaceOnInverse: { backgroundColor: '#edf4fc', borderColor: colors.blue },
  iconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapInverse: { backgroundColor: '#f6efe3' },
  cardName: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  cardNameInverse: { color: '#2b2521' },
});
