import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';

const DEFAULT_BUBBLES = [
  ['8%', '13%', 12], ['89%', '20%', 7], ['4%', '31%', 16],
  ['94%', '43%', 9.5], ['14%', '58%', 13.5], ['88%', '83%', 8],
  ['6%', '96%', 17], ['72%', '14%', 9], ['24%', '25%', 14.5],
  ['76%', '36%', 6.5], ['36%', '51%', 11], ['96%', '66%', 15],
  ['5%', '74%', 7.5], ['72%', '90%', 12.5], ['91%', '8%', 26],
  ['40%', '20%', 10.5], ['70%', '39%', 30], ['10%', '48%', 8.5],
  ['41%', '61%', 22.5], ['95%', '79%', 11.5], ['66%', '98%', 34],
] as const;

const GROUPS_BUBBLES = [
  ['18%', '8%', 8], ['78%', '12%', 18], ['97%', '24%', 12.5],
  ['9%', '27%', 25], ['53%', '22%', 6], ['69%', '34%', 13],
  ['25%', '43%', 10.5], ['91%', '48%', 27], ['5%', '57%', 14],
  ['56%', '53%', 19.5], ['76%', '64%', 8.5], ['16%', '70%', 30],
  ['42%', '76%', 7], ['96%', '82%', 16.5], ['63%', '88%', 11],
  ['31%', '94%', 21], ['82%', '99%', 36], ['4%', '89%', 6.5],
] as const;

type BackdropVariant = 'default' | 'groups';

/**
 * Fondo ambiental compartido por las pestañas principales. Se mantiene fuera
 * del árbol de accesibilidad, no intercepta gestos y sigue el accent del usuario.
 */
const AmbientBubbleBackdrop = memo(function AmbientBubbleBackdrop({
  showGradient = true,
  onBlue = false,
  variant = 'default',
}: {
  showGradient?: boolean;
  onBlue?: boolean;
  variant?: BackdropVariant;
}) {
  const styles = useThemedStyles(themedStyles);
  const isGroups = variant === 'groups';
  const bubbles = isGroups ? GROUPS_BUBBLES : DEFAULT_BUBBLES;
  const gradientId = `ambient-bubble-${variant}`;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.backdrop}
    >
      {showGradient && (
        <LinearGradient
          colors={[colors.accentLight, colors.paper, colors.paper]}
          locations={[0, 0.42, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.82, y: 0.72 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={[styles.halo, isGroups && styles.groupsHalo, onBlue && styles.haloOnBlue]} />
      <View style={[styles.ring, isGroups && styles.groupsRing, onBlue && styles.ringOnBlue]} />
      <View style={[styles.lowerWash, isGroups && styles.groupsLowerWash, onBlue && styles.lowerWashOnBlue]} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={gradientId} cx="38%" cy="34%" rx="62%" ry="62%">
            <Stop offset="0" stopColor={onBlue ? '#ffffff' : colors.accent} stopOpacity={onBlue ? 0.14 : 0.2} />
            <Stop offset="0.5" stopColor={onBlue ? '#ffffff' : colors.accent} stopOpacity={onBlue ? 0.06 : 0.1} />
            <Stop offset="1" stopColor={onBlue ? '#ffffff' : colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {bubbles.map(([cx, cy, radius], index) => (
          <Circle key={index} cx={cx} cy={cy} r={radius} fill={`url(#${gradientId})`} />
        ))}
      </Svg>
    </View>
  );
});

const themedStyles = () => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    width: 280, height: 280, borderRadius: 140,
    top: -190, left: -100,
    backgroundColor: colors.accentLight,
  },
  groupsHalo: {
    width: 220, height: 220, borderRadius: 110,
    top: -135, left: undefined, right: -72,
  },
  haloOnBlue: { backgroundColor: 'rgba(255,255,255,0.08)' },
  ring: {
    position: 'absolute',
    width: 270, height: 270, borderRadius: 135,
    top: 105, right: -205,
    borderWidth: 1.5, borderColor: colors.accentMid,
    opacity: 0.42,
  },
  groupsRing: {
    width: 340, height: 340, borderRadius: 170,
    top: 175, right: undefined, left: -280,
  },
  ringOnBlue: { borderColor: 'rgba(255,255,255,0.18)', opacity: 1 },
  lowerWash: {
    position: 'absolute',
    width: 340, height: 340, borderRadius: 170,
    top: '62%', left: -270,
    backgroundColor: colors.accentLight,
    opacity: 0.38,
  },
  groupsLowerWash: {
    width: 260, height: 260, borderRadius: 130,
    top: '70%', left: undefined, right: -205,
  },
  lowerWashOnBlue: { backgroundColor: 'rgba(255,255,255,0.07)', opacity: 1 },
});

export default AmbientBubbleBackdrop;
