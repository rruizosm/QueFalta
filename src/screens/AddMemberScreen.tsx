import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { GroupsStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { addMemberToGroup, fetchGroupMembers } from '../api/groups';
import { fetchFriends, type FriendProfile } from '../api/friends';

type AddMemberRouteProp = RouteProp<GroupsStackParamList, 'AddMember'>;

export default function AddMemberScreen() {
  const navigation = useNavigation<any>();
  const { groupId } = useRoute<AddMemberRouteProp>().params;
  const { session } = useAuth();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!userId) return;
    Promise.all([
      fetchFriends(userId).then(setFriends),
      fetchGroupMembers(groupId).then((ms) => setMemberIds(new Set(ms.map((m) => m.id)))),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [userId, groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '');
    if (!q) return friends;
    return friends.filter(
      (f) => f.name.toLowerCase().includes(q) || (f.username ?? '').includes(q),
    );
  }, [friends, query]);

  const handleAdd = async (f: FriendProfile) => {
    setAddingId(f.id);
    try {
      await addMemberToGroup(groupId, f.id);
      setAddedIds((ids) => [...ids, f.id]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`${f.name} añadido al grupo`);
    } catch {
      toast.show('No se pudo añadir al usuario.', 'error');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Añadir miembro</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder="filtrar entre tus amigos"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : friends.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="people-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>No tienes amigos todavía</Text>
          <Text style={styles.emptyText}>
            Añade amigos desde Perfil → Amigos y aquí podrás invitarlos al grupo.
          </Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>Ningún amigo coincide.</Text>
          ) : (
            filtered.map((f) => {
              const isMember = memberIds.has(f.id) || addedIds.includes(f.id);
              return (
                <View key={f.id} style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: f.color }]}>
                    <Text style={styles.avatarText}>{f.initials}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
                    {f.username ? <Text style={styles.username}>@{f.username}</Text> : null}
                  </View>
                  {isMember ? (
                    <View style={styles.addedBadge}>
                      <Ionicons name="checkmark" size={15} color={colors.ok} />
                      <Text style={styles.addedText}>En el grupo</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => handleAdd(f)} disabled={addingId === f.id}>
                      {addingId === f.id
                        ? <ActivityIndicator size="small" color={colors.white} />
                        : <Text style={styles.addBtnText}>Añadir</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
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
    width: 38, height: 38, backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 13, paddingVertical: 11,
  },
  input: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: colors.ink, padding: 0 },

  scroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  empty: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', marginTop: 24 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  username: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.accent, marginTop: 1 },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 9 },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  addedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addedText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.ok },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
});
