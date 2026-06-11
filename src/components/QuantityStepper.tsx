import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';

interface Props {
  value: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
}

export default function QuantityStepper({ value, onIncrement, onDecrement, min = 0 }: Props) {
  const styles = useThemedStyles(themedStyles);
  const atMin = value <= min;
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.btn, atMin && styles.btnDisabled]}
        onPress={onDecrement}
        disabled={atMin}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={[styles.btnText, atMin && styles.btnTextDisabled]}>−</Text>
      </TouchableOpacity>
      <Text style={styles.value}>{value}</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={onIncrement}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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
});
