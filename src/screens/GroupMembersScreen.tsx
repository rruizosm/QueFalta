import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { GroupsStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { fetchGroupDetail, removeGroupMember, type GroupSummary } from '../api/groups';

type MembersRouteProp = RouteProp<GroupsStackParamList, 'GroupMembers'>;

export default function GroupMembersScreen() {
  const navigation = useNavigation<any>();
  const { groupId } = useRoute<MembersRouteProp>().params;
  const { session } = useAuth();
  const { activeCart, deactivateCart } = useCart();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchGroupDetail(groupId)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setLoading(false));
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const adminId = group?.createdBy ?? null;
  const isAdmin = !!adminId && adminId === userId;

  const handleRemove = (memberId: string, memberName: string) => {
    Alert.alert(
      'Eliminar miembro',
      `¿Seguro que quieres eliminar a ${memberName} del grupo?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setBusyId(memberId);
            try {
              await removeGroupMember(groupId, memberId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.show(`${memberName} eliminado del grupo`);
              load();
            } catch {
              toast.show('No se pudo eliminar al miembro.', 'error');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const handleLeave = () => {
    Alert.alert(
      'Abandonar grupo',
      `¿Seguro que quieres abandonar "${group?.name ?? ''}"? Dejarás de ver su lista compartida.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Abandonar',
          style: 'destructive',
          onPress: async () => {
            setBusyId(userId);
            try {
              await removeGroupMember(groupId, userId);
              if (activeCart?.groupId === groupId) await deactivateCart();
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toast.show('Has abandonado el grupo');
              navigation.navigate('GroupsHome');
            } catch {
              toast.show('No se pudo abandonar el grupo.', 'error');
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Miembros</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : !group ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>No se pudo cargar el grupo.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
          <Text style={styles.countLabel}>
            {group.members.length} {group.members.length === 1 ? 'miembro' : 'miembros'}
          </Text>

          <View style={styles.section}>
            {group.members.map((m, i) => {
              const isMemberAdmin = m.id === adminId;
              const isMe = m.id === userId;
              const canRemove = isAdmin && !isMemberAdmin;
              return (
                <View key={m.id} style={[styles.row, i < group.members.length - 1 && styles.rowBorder]}>
                  <View style={[styles.avatar, { backgroundColor: m.color }]}>
                    <Text style={styles.avatarText}>{m.initials}</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {m.name}{isMe ? ' (tú)' : ''}
                    </Text>
                    {isMemberAdmin && (
                      <View style={styles.adminBadge}>
                        <Ionicons name="star" size={10} color={colors.accent} />
                        <Text style={styles.adminBadgeText}>Administrador</Text>
                      </View>
                    )}
                  </View>
                  {canRemove && (
                    busyId === m.id ? (
                      <ActivityIndicator size="small" color={colors.inkSoft} />
                    ) : (
                      <TouchableOpacity onPress={() => handleRemove(m.id, m.name)} hitSlop={8} style={styles.removeBtn}>
                        <Ionicons name="person-remove-outline" size={19} color="#d6452b" />
                      </TouchableOpacity>
                    )
                  )}
                </View>
              );
            })}
          </View>

          {/* Leave / admin note */}
          {isAdmin ? (
            <Text style={styles.adminNote}>
              Eres el administrador del grupo. Para salir, primero deberías transferir la administración o eliminar el grupo.
            </Text>
          ) : (
            <TouchableOpacity
              style={styles.leaveBtn}
              onPress={handleLeave}
              disabled={busyId === userId}
            >
              {busyId === userId ? (
                <ActivityIndicator size="small" color="#d6452b" />
              ) : (
                <>
                  <Ionicons name="exit-outline" size={18} color="#d6452b" />
                  <Text style={styles.leaveText}>Abandonar grupo</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, gap: 12,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  groupName: { fontSize: 22, fontFamily: fonts.bold, color: colors.ink, marginTop: 6, letterSpacing: -0.4 },
  countLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2, marginBottom: 16 },

  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  memberInfo: { flex: 1, minWidth: 0, gap: 3 },
  memberName: { fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adminBadgeText: { fontSize: 11, fontFamily: fonts.bold, color: colors.accent },
  removeBtn: {
    width: 34, height: 34,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(214,69,43,0.08)',
  },

  adminNote: {
    fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 18, lineHeight: 18,
  },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 22,
    paddingVertical: 13,
    borderWidth: 1, borderColor: 'rgba(214,69,43,0.5)',
    backgroundColor: 'rgba(214,69,43,0.06)',
  },
  leaveText: { fontSize: 14, fontFamily: fonts.bold, color: '#d6452b' },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft },
});
