import React from 'react';
import { View, ViewStyle } from 'react-native';
import { colors } from '../constants/colors';

interface Props {
  children: React.ReactNode;
  style?: ViewStyle;
  offset?: number;
}

export default function HardShadow({ children, style, offset = 3 }: Props) {
  return (
    <View style={{ position: 'relative' }}>
      {/* offset shadow layer */}
      <View
        style={[
          {
            position: 'absolute',
            left: offset,
            top: offset,
            right: -offset,
            bottom: -offset,
            backgroundColor: colors.ink,
          },
        ]}
      />
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
    </View>
  );
}
