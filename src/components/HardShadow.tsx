import React from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';

interface Props extends ViewProps {
  style?: StyleProp<ViewStyle>;
  offset?: number;
}

// `offset` se mantiene en la firma por compatibilidad con las llamadas, pero ya
// no se usa: se quitó la capa de sombra desplazada (se conserva solo el borde).
export default function HardShadow({ children, style, offset: _offset = 3, ...rest }: Props) {
  return (
    <View
      {...rest}
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
