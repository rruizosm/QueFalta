import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useUsernameSearch } from '../hooks/useUsernameSearch';
import {
  fetchFriends, fetchIncomingRequests, fetchOutgoingRequests,
  sendFriendRequest, acceptFriendRequest, removeFriendship, type FriendProfile,
} from '../api/friends';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import UserAvatar from '../components/UserAvatar';
import VerifiedBadge from '../components/VerifiedBadge';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import { glassAvailable } from '../components/GlassSurface';

function Avatar({ color, initials, avatarUrl }: { color: string; initials: string; avatarUrl?: string | null }) {
  return <UserAvatar avatarUrl={avatarUrl} initials={initials} color={color} size={42} />;
}

export default function FriendsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const { session } = useAuth();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendProfile[]>([]);
  const [outgoing, setOutgoing] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const { cleanQuery, results, searching } = useUsernameSearch(query, userId);
  const [headerH, setHeaderH] = useState(0);
  const glassInset = glassAvailable ? headerH : 0;

  const load = useCallback(() => {
    if (!userId) return Promise.resolve();
    return Promise.all([
      fetchFriends(userId).then(setFriends),
      fetchIncomingRequests(userId).then(setIncoming),
      fetchOutgoingRequests(userId).then(setOutgoing),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);
  const outgoingIds = useMemo(() => new Set(outgoing.map((f) => f.id)), [outgoing]);
  const incomingById = useMemo(
    () => new Map(incoming.map((f) => [f.id, f.friendshipId])),
    [incoming],
  );

  const run = async (id: string, fn: () => Promise<void>, okMsg: string) => {
    setBusyId(id);
    try {
      await fn();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (okMsg) toast.show(okMsg);
      await load();
    } catch {
      toast.show(t('friends.genericError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const isSearchMode = cleanQuery.length >= 2;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <ProfileSubscreenHeader title={t('profile.friends')} icon="people-circle-outline" headerTop={headerTop} onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)} />

      <View style={[styles.searchWrap, glassInset ? { marginTop: glassInset + 8 } : null]}>
        <Text style={styles.atPrefix}>@</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(v) => setQuery(v.toLowerCase())}
          placeholder={t('friends.searchPlaceholder')}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={colors.inkFaint} />}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}>
          {isSearchMode ? (
            // ── Search results ──
            (!searching && results.length === 0) ? (
              <Text style={styles.empty}>{t('friends.noResults', { q: cleanQuery })}</Text>
            ) : (
              results.map((u) => {
                const incomingFid = incomingById.get(u.id);
                return (
                  <View key={u.id} style={styles.row}>
                    <Avatar color={u.color} initials={u.initials} avatarUrl={u.avatarUrl} />
                    <View style={styles.info}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                        {u.verified ? <VerifiedBadge size={14} /> : null}
                      </View>
                      {u.username ? <Text style={styles.username}>@{u.username}</Text> : null}
                    </View>
                    {friendIds.has(u.id) ? (
                      <Text style={styles.tagMuted}>{t('friends.friendTag')}</Text>
                    ) : incomingFid ? (
                      <TouchableOpacity style={styles.btnPrimary} disabled={busyId === u.id}
                        onPress={() => run(u.id, () => acceptFriendRequest(incomingFid), t('friends.nowFriends'))}>
                        {busyId === u.id ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.btnPrimaryText}>{t('friends.accept')}</Text>}
                      </TouchableOpacity>
                    ) : outgoingIds.has(u.id) ? (
                      <Text style={styles.tagMuted}>{t('friends.pending')}</Text>
                    ) : (
                      <TouchableOpacity style={styles.btnPrimary} disabled={busyId === u.id}
                        onPress={() => run(u.id, () => sendFriendRequest(u.id, userId), t('friends.requestSent'))}>
                        {busyId === u.id ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.btnPrimaryText}>{t('group.add')}</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )
          ) : (
            // ── Requests + friends ──
            <>
              {incoming.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>{t('friends.requestsTitle', { n: incoming.length })}</Text>
                  {incoming.map((f) => (
                    <View key={f.friendshipId} style={styles.row}>
                      <Avatar color={f.color} initials={f.initials} avatarUrl={f.avatarUrl} />
                      <View style={styles.info}>
                        <View style={styles.nameRow}>
                          <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
                          {f.verified ? <VerifiedBadge size={14} /> : null}
                        </View>
                        {f.username ? <Text style={styles.username}>@{f.username}</Text> : null}
                      </View>
                      {busyId === f.friendshipId ? (
                        <ActivityIndicator size="small" color={colors.inkSoft} />
                      ) : (
                        <View style={styles.reqActions}>
                          <TouchableOpacity style={styles.btnPrimary}
                            onPress={() => run(f.friendshipId, () => acceptFriendRequest(f.friendshipId), t('friends.nowFriends'))}>
                            <Text style={styles.btnPrimaryText}>{t('friends.accept')}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.btnGhost}
                            onPress={() => run(f.friendshipId, () => removeFriendship(f.friendshipId), '')}>
                            <Ionicons name="close" size={18} color={colors.inkSoft} />
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  ))}
                </>
              )}

              <Text style={styles.sectionLabel}>{t('friends.friendsTitle', { n: friends.length })}</Text>
              {friends.length === 0 ? (
                <Text style={styles.empty}>{t('friends.empty')}</Text>
              ) : (
                friends.map((f) => (
                  <View key={f.friendshipId} style={styles.row}>
                    <Avatar color={f.color} initials={f.initials} avatarUrl={f.avatarUrl} />
                    <View style={styles.info}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
                        {f.verified ? <VerifiedBadge size={14} /> : null}
                      </View>
                      {f.username ? <Text style={styles.username}>@{f.username}</Text> : null}
                    </View>
                    {busyId === f.friendshipId ? (
                      <ActivityIndicator size="small" color={colors.inkSoft} />
                    ) : (
                      <TouchableOpacity style={styles.btnGhost} hitSlop={6}
                        onPress={() => run(f.friendshipId, () => removeFriendship(f.friendshipId), t('friends.removed'))}>
                        <Ionicons name="person-remove-outline" size={18} color={colors.inkSoft} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 13, paddingVertical: 12, borderRadius: 16,
  },
  atPrefix: { fontSize: 15, fontFamily: fonts.bold, color: colors.inkFaint },
  input: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: colors.ink, padding: 0 },

  scroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 15, fontFamily: fonts.bold, color: colors.ink,
    marginTop: 14, marginBottom: 8,
  },
  empty: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 10, lineHeight: 20 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 9, borderRadius: 18,
  },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  info: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { flexShrink: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  username: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.accent, marginTop: 1 },

  reqActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnPrimary: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 9, minWidth: 78, alignItems: 'center', borderRadius: 12 },
  btnPrimaryText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  btnGhost: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, borderRadius: 12,
  },
  tagMuted: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft },
});
