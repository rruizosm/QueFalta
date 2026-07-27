/**
 * RegionPicker — selector de zona por CÓDIGO POSTAL: input de 5 dígitos que
 * deriva y confirma la comunidad autónoma (provincia = 2 primeros dígitos,
 * regionFromPostalCode), más la opción "Toda España" (sentinel 'ES', sin CP)
 * para quien no quiere darlo. Lo comparten el paso de onboarding
 * (RegionScreen), el gate de usuarios existentes (RegionGateScreen) y Ajustes
 * (RegionSettingsScreen). Ver COMUNIDAD-AUTONOMA.md.
 *
 * Contrato: emite `{ region, postalCode }`. region null = selección incompleta
 * o CP inválido (el padre deshabilita Continuar / no guarda). "Toda España"
 * emite region 'ES' con postalCode null.
 */
import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { REGION_ALL, regionFromPostalCode, type RegionValue } from '../constants/regions';

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
}

export default function RegionPicker({ region, postalCode, onChange, autoFocus }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();

  // El texto en edición vive aquí (puede ser un CP a medias); el padre solo
  // recibe estados completos (CP válido o "Toda España") o null.
  const [cp, setCp] = useState(postalCode ?? '');

  const cpRegion = regionFromPostalCode(cp);
  const invalid = cp.length === 5 && !cpRegion;
  const allOn = region === REGION_ALL && cp.length === 0;

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

  return (
    <View style={styles.list}>
      {/* Input de código postal */}
      <View style={[styles.inputBox, invalid && styles.inputBoxError, !!cpRegion && styles.inputBoxOn]}>
        <View style={styles.iconWrap}>
          <Ionicons name="location-outline" size={18} color={cpRegion ? colors.accent : colors.inkSoft} />
        </View>
        <TextInput
          style={styles.input}
          value={cp}
          onChangeText={handleCpChange}
          placeholder={t('region.postalCodePlaceholder')}
          placeholderTextColor={colors.inkFaint}
          keyboardType="number-pad"
          maxLength={5}
          autoFocus={autoFocus}
          returnKeyType="done"
        />
        {cpRegion ? <Ionicons name="checkmark-circle" size={22} color={colors.accent} /> : null}
      </View>
      {invalid ? <Text style={styles.errorText}>{t('region.postalCodeInvalid')}</Text> : null}

      {/* Comunidad derivada (confirmación) */}
      {cpRegion ? (
        <View style={styles.detected}>
          <Text style={styles.detectedLabel}>{t('region.detected')}</Text>
          <Text style={styles.detectedName}>{t(`region.names.${cpRegion}`)}</Text>
        </View>
      ) : null}

      {/* Escape: sin CP → toda España (sin filtro) */}
      <Text style={styles.orAll}>{t('region.orAll')}</Text>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={selectAll}
        style={[styles.card, allOn && styles.cardOn]}
      >
        <View style={styles.iconWrap}>
          <Ionicons name="earth-outline" size={18} color={allOn ? colors.accent : colors.inkSoft} />
        </View>
        <Text style={styles.cardName} numberOfLines={1}>{t('region.all')}</Text>
        <Ionicons
          name={allOn ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={allOn ? colors.accent : colors.inkFaint}
        />
      </TouchableOpacity>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  list: { gap: 10 },

  inputBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 18,
  },
  inputBoxOn: { borderColor: colors.accent },
  inputBoxError: { borderColor: colors.red },
  input: {
    flex: 1, fontSize: 18, fontFamily: fonts.semibold, color: colors.ink,
    padding: 0, letterSpacing: 2,
  },
  errorText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.red, marginTop: -2 },

  detected: {
    backgroundColor: colors.accentLight,
    borderWidth: 1, borderColor: colors.accent,
    paddingHorizontal: 14, paddingVertical: 12, gap: 2, borderRadius: 16,
  },
  detectedLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.accent,
    textTransform: 'uppercase', letterSpacing: 1.2,
  },
  detectedName: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },

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
  iconWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  cardName: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
});
