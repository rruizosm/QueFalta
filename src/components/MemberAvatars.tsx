import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GroupMember } from '../types';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';

interface Props {
  members: GroupMember[];
  maxVisible?: number;
  size?: number;
}

export default function MemberAvatars({ members, maxVisible = 4, size = 32 }: Props) {
  const visible = members.slice(0, maxVisible);
  const overflow = members.length - maxVisible;

  return (
    <View style={[styles.container, { height: size }]}>
      {visible.map((member, index) => (
        <View
          key={member.id}
          style={[
            styles.avatar,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: member.color,
              marginLeft: index === 0 ? 0 : -(size * 0.3),
              zIndex: visible.length - index,
            },
          ]}
        >
          <Text style={[styles.initials, { fontSize: size * 0.35 }]}>{member.initials}</Text>
        </View>
      ))}
      {overflow > 0 && (
        <View
          style={[
            styles.avatar,
            styles.overflow,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: -(size * 0.3),
            },
          ]}
        >
          <Text style={[styles.overflowText, { fontSize: size * 0.32 }]}>+{overflow}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  initials: {
    color: colors.white,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
  overflow: {
    backgroundColor: colors.surfaceAlt,
  },
  overflowText: {
    color: colors.inkSoft,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
});
