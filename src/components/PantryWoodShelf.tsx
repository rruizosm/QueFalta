import { memo, useId } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, G, Image, RadialGradient, Rect, Stop } from 'react-native-svg';

const OAK_SHELF = require('../../assets/pantry/oak-shelf-source.png');
const VIEWBOX_WIDTH = 2000;
const VIEWBOX_HEIGHT = 210;
const BOARD_TOP = 307;
const VIEWBOX_TOP = 280;
export const PANTRY_SHELF_WIDTH_RATIO = 1.12;

/** Shared front-facing board and supports; wood texture or a flat blue fridge finish. */
function PantryWoodShelf({ width, surfaceY, finish = 'wood', dark = false }: {
  width: number;
  surfaceY: number;
  finish?: 'wood' | 'ice';
  dark?: boolean;
}) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = `oak-wood-${id}`;
  const shadowId = `oak-shadow-${id}`;
  const scale = width / VIEWBOX_WIDTH;
  const shelfWidth = width * PANTRY_SHELF_WIDTH_RATIO;
  const ice = finish === 'ice';
  const shadowColor = ice ? '#24618E' : '#49301c';
  return <View pointerEvents="none" accessible={false} testID="pantry-wood-shelf" style={{
    position: 'absolute', left: (width - shelfWidth) / 2, top: surfaceY - (BOARD_TOP - VIEWBOX_TOP) * scale,
    width: shelfWidth, height: VIEWBOX_HEIGHT * scale,
  }}>
    <Svg width={shelfWidth} height={VIEWBOX_HEIGHT * scale}
      viewBox={`40 ${VIEWBOX_TOP} ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} preserveAspectRatio="none">
      <Defs>
        <ClipPath id={clipId}>
          <Rect x={70} y={BOARD_TOP} width={1942} height={58} rx={16} />
          <Rect x={109} y={355} width={120} height={59} rx={22} />
          <Rect x={1847} y={355} width={121} height={59} rx={22} />
        </ClipPath>
        <RadialGradient id={shadowId} cx="50%" cy="30%" rx="50%" ry="65%">
          <Stop offset="0" stopColor={shadowColor} stopOpacity={0.23} />
          <Stop offset="0.5" stopColor={shadowColor} stopOpacity={0.09} />
          <Stop offset="1" stopColor={shadowColor} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x={58} y={350} width={1966} height={114} fill={`url(#${shadowId})`} />
      <G clipPath={`url(#${clipId})`}>
        {ice ? <>
          <Rect x={0} y={0} width={2079} height={756} fill={dark ? '#548DB0' : '#85BADB'} />
          <Rect x={70} y={BOARD_TOP} width={1942} height={58} rx={16}
            fill={dark ? '#77AFD1' : '#A1CFEC'} />
          <Rect x={84} y={BOARD_TOP + 3} width={1914} height={6} rx={3}
            fill={dark ? '#B8DEF4' : '#E2F3FD'} />
        </> : <Image href={OAK_SHELF} x={0} y={0} width={2079} height={756} preserveAspectRatio="none" />}
      </G>
    </Svg>
  </View>;
}

export default memo(PantryWoodShelf);
