import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { GroupsStackParamList } from '../types';
import { useToast } from '../context/ToastContext';
import { searchUsersByUsername, addMemberToGroup, type SearchedUser } from '../api/groups';

type AddMemberRouteProp = RouteProp<GroupsStackParamList, 'AddMember'>;

export default function AddMemberScreen() {
  const navigation = useNavigation<any>();
  const { groupId } = useRoute<AddMemberRouteProp>().params;
  const toast = useToast();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (q.replace(/^@/, '').length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        setResults(await searchUsersByUsername(q));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [query]);

  const handleAdd = async (user: SearchedUser) => {
    setAddingId(user.id);
    try {
      await addMemberToGroup(groupId, user.id);
      setAddedIds((ids) => [...ids, user.id]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(`${user.name} añadido al grupo`);
    } catch {
      toast.show('No se pudo añadir al usuario.', 'error');
    } finally {
      setAddingId(null);
    }
  };

  const cleanQ = query.trim().replace(/^@/, '');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.title}>Añadir miembro</Text>
          <View style={{ width: 38 }} />
        </View>

        {/* Search box */}
        <View style={styles.searchWrap}>
          <Text style={styles.atPrefix}>@</Text>
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={(t) => setQuery(t.toLowerCase())}
            placeholder="buscar por nombre de usuario"
            placeholderTextColor={colors.inkFaint}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
          {searching && <ActivityIndicator size="small" color={colors.inkFaint} />}
        </View>
        <Text style={styles.hint}>Solo aparecen usuarios que se han hecho visibles.</Text>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          {cleanQ.length < 2 ? null : (!searching && results.length === 0) ? (
            <Text style={styles.empty}>Sin resultados para “@{cleanQ}”.</Text>
          ) : (
            results.map((u) => {
              const added = addedIds.includes(u.id);
              return (
                <View key={u.id} style={styles.row}>
                  <View style={[styles.avatar, { backgroundColor: u.color }]}>
                    <Text style={styles.avatarText}>{u.initials}</Text>
                  </View>
                  <View style={styles.info}>
                    <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                    {u.username ? <Text style={styles.username}>@{u.username}</Text> : null}
                  </View>
                  {added ? (
                    <View style={styles.addedBadge}>
                      <Ionicons name="checkmark" size={15} color={colors.ok} />
                      <Text style={styles.addedText}>Añadido</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => handleAdd(u)}
                      disabled={addingId === u.id}
                    >
                      {addingId === u.id
                        ? <ActivityIndicator size="small" color={colors.white} />
                        : <Text style={styles.addBtnText}>Añadir</Text>}
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
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

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 13, paddingVertical: 11,
  },
  atPrefix: { fontSize: 15, fontFamily: fonts.bold, color: colors.inkFaint },
  input: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: colors.ink, padding: 0 },
  hint: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginHorizontal: 16, marginTop: 6 },

  scroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 40 },
  empty: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', marginTop: 24 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 8,
  },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  username: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.accent, marginTop: 1 },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16, paddingVertical: 9,
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  addedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addedText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.ok },
});
