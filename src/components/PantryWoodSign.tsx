import { memo, useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

/** A chipped plank that keeps its splinters the same size as the label grows. */
function PantryWoodSign({ dark, ropeLength }: { dark: boolean; ropeLength: number }) {
  const [width, setWidth] = useState(0);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const grainId = `sign-grain-${id}`;
  const clipId = `sign-clip-${id}`;
  const w = Math.max(width, 58);
  const outline = `M 6 2 L ${w * 0.25} 3 L ${w * 0.43} 1.5 L ${w * 0.66} 3
    L ${w - 7} 2 L ${w - 3} 5 L ${w - 6} 10 L ${w - 1} 13
    L ${w - 5} 18 L ${w - 2} 24 L ${w - 6} 27 L ${w - 3} 32
    L ${w - 10} 34 L ${w * 0.72} 33 L ${w * 0.48} 34.5 L ${w * 0.3} 33
    L 5 34 L 7 29 L 2 26 L 5 20 L 1 16 L 6 12 L 3 7 Z`;

  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}
    onLayout={({ nativeEvent: { layout } }) => setWidth(layout.width)}>
    {width > 0 && <Svg width="100%" height={36 + ropeLength}
      style={{ position: 'absolute', top: -ropeLength }}
      viewBox={`0 0 ${w} ${36 + ropeLength}`} preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={grainId} x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0" stopColor={dark ? '#E0C49A' : '#F2DCB7'} />
          <Stop offset="0.45" stopColor={dark ? '#D0AD7C' : '#E8CDA3'} />
          <Stop offset="1" stopColor={dark ? '#BD9565' : '#DAB88A'} />
        </LinearGradient>
        <ClipPath id={clipId}><Path d={outline} transform={`translate(0 ${ropeLength})`} /></ClipPath>
      </Defs>
      {ropeLength > 0 && <G fill="none" strokeLinecap="round">
        <Path d={`M 10 0 L 10 ${ropeLength + 1} M ${w - 10} 0 L ${w - 10} ${ropeLength + 1}`}
          stroke="#82582E" strokeWidth={3.4} />
        <Path d={`M 10 0 L 10 ${ropeLength + 1} M ${w - 10} 0 L ${w - 10} ${ropeLength + 1}`}
          stroke="#D7B681" strokeWidth={1.2} />
      </G>}
      <Path d={outline} fill="#432B16" opacity={0.18} transform={`translate(0 ${ropeLength + 1.5})`} />
      <Path d={outline} fill={`url(#${grainId})`} stroke="#AC8051" strokeWidth={0.8} strokeLinejoin="round"
        transform={`translate(0 ${ropeLength})`} />
      <G clipPath={`url(#${clipId})`} transform={`translate(0 ${ropeLength})`} fill="none" strokeLinecap="round">
        <Path d={`M 0 8 C ${w * 0.25} 5 ${w * 0.45} 12 ${w} 7
          M 0 26 C ${w * 0.3} 23 ${w * 0.65} 30 ${w} 25
          M 15 30 C ${w * 0.4} 28 ${w * 0.6} 32 ${w - 12} 29`}
          stroke="#9B703F" strokeWidth={0.65} opacity={0.22} />
        <Path d={`M 8 5 C ${w * 0.35} 7 ${w * 0.7} 3 ${w - 7} 5
          M 10 32 C ${w * 0.4} 30 ${w * 0.7} 34 ${w - 9} 31`}
          stroke="#FFF3D8" strokeWidth={0.8} opacity={0.6} />
        <Path d={`M 3 16 L 13 14 L 8 17 M ${w - 4} 24 L ${w - 15} 22 L ${w - 10} 25`}
          stroke="#94683A" strokeWidth={0.8} opacity={0.55} />
      </G>
    </Svg>}
  </View>;
}

export default memo(PantryWoodSign);
