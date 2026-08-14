import React from 'react';
import { View, Text, TouchableOpacity, Switch, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';

type RightVariant = 'chevron' | 'switch';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  /** Contador pendiente (p.ej. solicitudes de amistad). 0/undefined = sin badge. */
  badge?: number;
  onPress?: () => void;
  right?: RightVariant;
  switchValue?: boolean;
  onSwitchChange?: (v: boolean) => void;
  danger?: boolean;
  /** Muestra el acceso como una función Plus sin desactivar su pulsación. */
  locked?: boolean;
  last?: boolean;
  /** Esquinas suaves para las tarjetas modernas de Perfil. */
  rounded?: boolean;
}

export default function ProfileRow({
  icon, label, value, badge, onPress,
  right = 'chevron', switchValue, onSwitchChange,
  danger = false, locked = false, last = false, rounded = true,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const iconColor = danger ? '#d6452b' : colors.accent;
  const iconBg    = danger ? 'rgba(214,69,43,0.10)' : colors.accentLight;
  const labelColor = danger ? '#d6452b' : colors.ink;

  const inner = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.iconBox, rounded && styles.iconBoxRounded, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.label, { color: labelColor }]} numberOfLines={1}>{label}</Text>
      {value ? <Text style={styles.value} numberOfLines={1} ellipsizeMode="tail">{value}</Text> : null}
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.accent }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      ) : null}
      {right === 'switch' ? (
        <Switch
          value={switchValue ?? false}
          onValueChange={onSwitchChange}
          trackColor={{ false: colors.border, true: colors.accent }}
          thumbColor={colors.white}
        />
      ) : locked ? (
        <Ionicons name="lock-closed" size={15} color={colors.inkSoft} />
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

const themedStyles = () => StyleSheet.create({
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
  iconBoxRounded: { borderRadius: 11 },
  label: {
    flex: 1, fontSize: 14, fontFamily: fonts.semibold,
  },
  value: {
    fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft,
    flexShrink: 1, maxWidth: '55%', textAlign: 'right',
  },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 11, fontFamily: fonts.bold, color: colors.white },
});
