import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { colors } from '../constants/colors';
import { useThemedStyles } from '../context/ThemeContext';

const BUBBLES = [
  ['8%', '13%', 12], ['89%', '20%', 7], ['4%', '31%', 16],
  ['94%', '43%', 9.5], ['14%', '58%', 13.5], ['88%', '83%', 8],
  ['6%', '96%', 17], ['72%', '14%', 9], ['24%', '25%', 14.5],
  ['76%', '36%', 6.5], ['36%', '51%', 11], ['96%', '66%', 15],
  ['5%', '74%', 7.5], ['72%', '90%', 12.5], ['91%', '8%', 26],
  ['40%', '20%', 10.5], ['70%', '39%', 30], ['10%', '48%', 8.5],
  ['41%', '61%', 22.5], ['95%', '79%', 11.5], ['66%', '98%', 34],
] as const;

/**
 * Fondo ambiental compartido por Inicio y Carrito. Se mantiene fuera del
 * árbol de accesibilidad, no intercepta gestos y sigue el accent del usuario.
 */
const AmbientBubbleBackdrop = memo(function AmbientBubbleBackdrop({
  showGradient = true,
}: {
  showGradient?: boolean;
}) {
  const styles = useThemedStyles(themedStyles);

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
      <View style={styles.halo} />
      <View style={styles.ring} />
      <View style={styles.lowerWash} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="ambient-bubble" cx="38%" cy="34%" rx="62%" ry="62%">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.2} />
            <Stop offset="0.5" stopColor={colors.accent} stopOpacity={0.1} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {BUBBLES.map(([cx, cy, radius], index) => (
          <Circle key={index} cx={cx} cy={cy} r={radius} fill="url(#ambient-bubble)" />
        ))}
      </Svg>
    </View>
  );
});

const themedStyles = () => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    width: 280, height: 280, borderRadius: 140,
    top: -190, left: -100,
    backgroundColor: colors.accentLight,
  },
  ring: {
    position: 'absolute',
    width: 270, height: 270, borderRadius: 135,
    top: 105, right: -205,
    borderWidth: 1.5, borderColor: colors.accentMid,
    opacity: 0.42,
  },
  lowerWash: {
    position: 'absolute',
    width: 340, height: 340, borderRadius: 170,
    top: '62%', left: -270,
    backgroundColor: colors.accentLight,
    opacity: 0.38,
  },
});

export default AmbientBubbleBackdrop;
