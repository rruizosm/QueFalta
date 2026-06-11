import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { searchUsersByUsername, type SearchedUser } from '../api/groups';
import {
  fetchFriends, fetchIncomingRequests, fetchOutgoingRequests,
  sendFriendRequest, acceptFriendRequest, removeFriendship, type FriendProfile,
} from '../api/friends';
import UserAvatar from '../components/UserAvatar';

function Avatar({ color, initials, avatarUrl }: { color: string; initials: string; avatarUrl?: string | null }) {
  return <UserAvatar avatarUrl={avatarUrl} initials={initials} color={color} size={42} />;
}

export default function FriendsScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [incoming, setIncoming] = useState<FriendProfile[]>([]);
  const [outgoing, setOutgoing] = useState<FriendProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    if (!userId) return Promise.resolve();
    return Promise.all([
      fetchFriends(userId).then(setFriends),
      fetchIncomingRequests(userId).then(setIncoming),
      fetchOutgoingRequests(userId).then(setOutgoing),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Debounced @username search.
  useEffect(() => {
    const q = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.replace(/^@/, '').length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const r = await searchUsersByUsername(q);
        setResults(r.filter((u) => u.id !== userId));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query, userId]);

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
      toast.show('Algo salió mal. Inténtalo de nuevo.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const cleanQ = query.trim().replace(/^@/, '');
  const isSearchMode = cleanQ.length >= 2;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Amigos</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.atPrefix}>@</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(t) => setQuery(t.toLowerCase())}
          placeholder="buscar usuarios por @"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={colors.inkFaint} />}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {isSearchMode ? (
            // ── Search results ──
            (!searching && results.length === 0) ? (
              <Text style={styles.empty}>Sin resultados para “@{cleanQ}”.</Text>
            ) : (
              results.map((u) => {
                const incomingFid = incomingById.get(u.id);
                return (
                  <View key={u.id} style={styles.row}>
                    <Avatar color={u.color} initials={u.initials} avatarUrl={u.avatarUrl} />
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                      {u.username ? <Text style={styles.username}>@{u.username}</Text> : null}
                    </View>
                    {friendIds.has(u.id) ? (
                      <Text style={styles.tagMuted}>Amigo</Text>
                    ) : incomingFid ? (
                      <TouchableOpacity style={styles.btnPrimary} disabled={busyId === u.id}
                        onPress={() => run(u.id, () => acceptFriendRequest(incomingFid), `Ahora sois amigos`)}>
                        {busyId === u.id ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.btnPrimaryText}>Aceptar</Text>}
                      </TouchableOpacity>
                    ) : outgoingIds.has(u.id) ? (
                      <Text style={styles.tagMuted}>Pendiente</Text>
                    ) : (
                      <TouchableOpacity style={styles.btnPrimary} disabled={busyId === u.id}
                        onPress={() => run(u.id, () => sendFriendRequest(u.id, userId), 'Solicitud enviada')}>
                        {busyId === u.id ? <ActivityIndicator size="small" color={colors.white} /> : <Text style={styles.btnPrimaryText}>Añadir</Text>}
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
                  <Text style={styles.sectionLabel}>Solicitudes ({incoming.length})</Text>
                  {incoming.map((f) => (
                    <View key={f.friendshipId} style={styles.row}>
                      <Avatar color={f.color} initials={f.initials} avatarUrl={f.avatarUrl} />
                      <View style={styles.info}>
                        <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
                        {f.username ? <Text style={styles.username}>@{f.username}</Text> : null}
                      </View>
                      {busyId === f.friendshipId ? (
                        <ActivityIndicator size="small" color={colors.inkSoft} />
                      ) : (
                        <View style={styles.reqActions}>
                          <TouchableOpacity style={styles.btnPrimary}
                            onPress={() => run(f.friendshipId, () => acceptFriendRequest(f.friendshipId), `Ahora sois amigos`)}>
                            <Text style={styles.btnPrimaryText}>Aceptar</Text>
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

              <Text style={styles.sectionLabel}>Amigos ({friends.length})</Text>
              {friends.length === 0 ? (
                <Text style={styles.empty}>Aún no tienes amigos. Busca por @ arriba y envía una solicitud.</Text>
              ) : (
                friends.map((f) => (
                  <View key={f.friendshipId} style={styles.row}>
                    <Avatar color={f.color} initials={f.initials} avatarUrl={f.avatarUrl} />
                    <View style={styles.info}>
                      <Text style={styles.name} numberOfLines={1}>{f.name}</Text>
                      {f.username ? <Text style={styles.username}>@{f.username}</Text> : null}
                    </View>
                    {busyId === f.friendshipId ? (
                      <ActivityIndicator size="small" color={colors.inkSoft} />
                    ) : (
                      <TouchableOpacity style={styles.btnGhost} hitSlop={6}
                        onPress={() => run(f.friendshipId, () => removeFriendship(f.friendshipId), 'Amigo eliminado')}>
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
  atPrefix: { fontSize: 15, fontFamily: fonts.bold, color: colors.inkFaint },
  input: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: colors.ink, padding: 0 },

  scroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginTop: 10, marginBottom: 8,
  },
  empty: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 10, lineHeight: 20 },

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

  reqActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnPrimary: { backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 9, minWidth: 78, alignItems: 'center' },
  btnPrimaryText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  btnGhost: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  tagMuted: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.inkSoft },
});
