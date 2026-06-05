import React from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';

type RightVariant = 'chevron' | 'switch';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress?: () => void;
  right?: RightVariant;
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  danger?: boolean;
  last?: boolean;
}

export default function ProfileRow({
  icon, label, value, onPress,
  right = 'chevron', switchValue, onSwitchChange,
  danger = false, last = false,
}: Props) {
  const iconColor = danger ? '#d6452b' : colors.accent;
  const iconBg    = danger ? 'rgba(214,69,43,0.10)' : colors.accentLight;
  const labelColor = danger ? '#d6452b' : colors.ink;

  const inner = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      {value ? <Text style={styles.value}>{value}</Text> : null}
      {right === 'switch' ? (
        <Switch
          value={switchValue ?? false}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.white}
        />
      ) : !danger ? (
        <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }
  return inner;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 13,
  },
  rowBorder: {
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBox: {
    width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    flex: 1, fontSize: 14, fontFamily: fonts.semibold,
  },
  value: {
    fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft,
  },
});
