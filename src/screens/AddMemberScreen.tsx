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
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { addMemberToGroup, fetchGroupMembers } from '../api/groups';
import { fetchFriends, type FriendProfile } from '../api/friends';
import UserAvatar from '../components/UserAvatar';
import VerifiedBadge from '../components/VerifiedBadge';

type AddMemberRouteProp = RouteProp<GroupsStackParamList, 'AddMember'>;

export default function AddMemberScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
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
      toast.show(t('group.added', { name: f.name }));
    } catch {
      toast.show(t('group.addError'), 'error');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('group.addMember')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.inkFaint} />
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder={t('group.searchFriends')}
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
          <Text style={styles.emptyTitle}>{t('group.noFriendsTitle')}</Text>
          <Text style={styles.emptyText}>{t('group.noFriendsText')}</Text>
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>
          {filtered.length === 0 ? (
            <Text style={styles.empty}>{t('group.noFriendMatch')}</Text>
          ) : (
            filtered.map((f) => {
              const isMember = memberIds.has(f.id) || addedIds.includes(f.id);
              return (
                <View key={f.id} style={styles.row}>
                  <UserAvatar avatarUrl={f.avatarUrl} initials={f.initials} color={f.color} size={42} />
                  <View style={styles.info}>
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
                      {f.verified ? <VerifiedBadge size={14} /> : null}
                    </View>
                    {f.username ? <Text style={styles.username}>@{f.username}</Text> : null}
                  </View>
                  {isMember ? (
                    <View style={styles.addedBadge}>
                      <Ionicons name="checkmark" size={15} color={colors.ok} />
                      <Text style={styles.addedText}>{t('group.inGroup')}</Text>
                    </View>
                  ) : (
                    <TouchableOpacity style={styles.addBtn} onPress={() => handleAdd(f)} disabled={addingId === f.id}>
                      {addingId === f.id
                        ? <ActivityIndicator size="small" color={colors.white} />
                        : <Text style={styles.addBtnText}>{t('group.add')}</Text>}
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

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 12,
    // paddingTop inline (useHeaderTopPadding)
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
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { flexShrink: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  username: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.accent, marginTop: 1 },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 9 },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  addedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addedText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.ok },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
});
