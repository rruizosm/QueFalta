import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GroupMember } from '../types';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import UserAvatar from './UserAvatar';

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
        <UserAvatar
          key={member.id}
          avatarUrl={member.avatarUrl}
          initials={member.initials}
          color={member.color}
          size={size}
          style={[
            styles.avatar,
            {
              marginLeft: index === 0 ? 0 : -(size * 0.3),
              zIndex: visible.length - index,
            },
          ]}
        />
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
  overflow: {
    backgroundColor: colors.surfaceAlt,
  },
  overflowText: {
    color: colors.inkSoft,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },
});
