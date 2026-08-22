import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  // Filas de listado (catálogo, ofertas, novedades, cambios de precio): pila
  // vertical +/cantidad/− en cápsula redondeada. Las fichas de producto
  // (footer junto al botón "Añadir") siguen con el layout horizontal.
  vertical?: boolean;
}

export default function QuantityStepper({ value, onIncrement, onDecrement, min = 0, vertical = false }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const atMin = value <= min;

  if (vertical) {
    return (
      <View style={styles.vContainer}>
        <TouchableOpacity
          style={styles.vBtn}
          onPress={onIncrement}
          hitSlop={{ top: 6, bottom: 2, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.increaseQuantity')}
        >
          <Text style={styles.vBtnText}>+</Text>
        </TouchableOpacity>
        <Text style={styles.vValue} accessibilityLabel={t('common.quantityValue', { n: value })}>{value}</Text>
        <TouchableOpacity
          style={[styles.vBtn, atMin && styles.vBtnDisabled]}
          onPress={onDecrement}
          disabled={atMin}
          hitSlop={{ top: 2, bottom: 6, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={t('common.decreaseQuantity')}
          accessibilityState={{ disabled: atMin }}
        >
          <Text style={[styles.vBtnText, atMin && styles.vBtnTextDisabled]}>−</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, atMin && styles.btnDisabled]}
        onPress={onDecrement}
        disabled={atMin}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.decreaseQuantity')}
        accessibilityState={{ disabled: atMin }}
      >
        <Text style={[styles.btnText, atMin && styles.btnTextDisabled]}>−</Text>
      </TouchableOpacity>
      <Text style={styles.value} accessibilityLabel={t('common.quantityValue', { n: value })}>{value}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={onIncrement}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.increaseQuantity')}
      >
        <Text style={styles.btnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 17,
    overflow: 'hidden',
  },
  btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  btnDisabled: {
    backgroundColor: colors.border,
    borderColor: colors.border,
  },
  btnText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.white,
    lineHeight: 20,
    fontFamily: fonts.bold,
  },
  btnTextDisabled: {
    color: colors.inkSoft,
  },
  value: {
    minWidth: 32,
    textAlign: 'center',
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
  },

  // ── Variante vertical (+ / cantidad / −), cápsula redondeada ──────────
  vContainer: {
    alignItems: 'center',
    width: 34,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 17,
    overflow: 'hidden',
  },
  vBtn: {
    width: '100%',
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  vBtnDisabled: {
    backgroundColor: colors.border,
  },
  vBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    lineHeight: 18,
    fontFamily: fonts.bold,
  },
  vBtnTextDisabled: {
    color: colors.inkSoft,
  },
  vValue: {
    width: '100%',
    textAlign: 'center',
    paddingVertical: 5,
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
});
