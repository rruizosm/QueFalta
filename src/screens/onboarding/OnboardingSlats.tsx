import { StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const BOTTOM_LINES = Array.from({ length: 26 }, (_, index) => {
  const y = ((index + 1) * 100) / 27 + 0.18;
  return `M0 ${y}H100`;
}).join(' ');

/** Fondo compartido: un trazo SVG sustituye 26 Views por pantalla. */
export default function OnboardingSlats() {
  return (
    <Svg
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFillObject}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <Path d={BOTTOM_LINES} stroke="rgba(13,53,101,0.18)" strokeWidth={0.16} />
    </Svg>
  );
}
