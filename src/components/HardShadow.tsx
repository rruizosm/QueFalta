import React from 'react';
import { View, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  offset?: number;
}

// `offset` se mantiene en la firma por compatibilidad con las llamadas, pero ya
// no se usa: se quitó la capa de sombra desplazada (se conserva solo el borde).
export default function HardShadow({ children, style, offset: _offset = 3 }: Props) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.white,
          borderWidth: 1,
          borderColor: colors.ink,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
