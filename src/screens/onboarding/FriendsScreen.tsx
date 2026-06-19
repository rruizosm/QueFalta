/** Paso 4 (OPCIONAL) — Buscar amigos por @usuario y enviarles solicitud.
 *  Reutiliza searchUsersByUsername + sendFriendRequest. */
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { searchUsersByUsername, type SearchedUser } from '../../api/groups';
import { sendFriendRequest } from '../../api/friends';
import UserAvatar from '../../components/UserAvatar';
import OnboardingLayout from './OnboardingLayout';

export default function FriendsScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const send = async (u: SearchedUser) => {
    setBusyId(u.id);
    try {
      await sendFriendRequest(u.id, userId);
      setSentIds((ids) => [...ids, u.id]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('friends.requestSent'));
    } catch {
      toast.show(t('onboarding.requestError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const goNext = () => navigation.navigate('Group');
  const cleanQ = query.trim().replace(/^@/, '');
  const someSent = sentIds.length > 0;

  return (
    <OnboardingLayout
      step={4}
      totalSteps={5}
      eyebrow={t('onboarding.optional')}
      title={t('onboarding.friendsTitle')}
      subtitle={t('onboarding.friendsSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={t('onboarding.continue')}
      onContinue={goNext}
      onSkip={someSent ? undefined : goNext}
      skipLabel={t('onboarding.laterSkip')}
    >
      <View style={styles.searchWrap}>
        <Text style={styles.at}>@</Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={(v) => setQuery(v.toLowerCase())}
          placeholder={t('onboarding.friendsPlaceholder')}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searching && <ActivityIndicator size="small" color={colors.inkFaint} />}
      </View>

      <View style={styles.results}>
        {cleanQ.length < 2 ? (
          <Text style={styles.hint}>{t('catalog.minLetters')}</Text>
        ) : (!searching && results.length === 0) ? (
          <Text style={styles.hint}>{t('friends.noResults', { q: cleanQ })}</Text>
        ) : (
          results.map((u) => {
            const sent = sentIds.includes(u.id);
            return (
              <View key={u.id} style={styles.row}>
                <UserAvatar avatarUrl={u.avatarUrl} initials={u.initials} color={u.color} size={42} />
                <View style={styles.info}>
                  <Text style={styles.name} numberOfLines={1}>{u.name}</Text>
                  {u.username ? <Text style={styles.username}>@{u.username}</Text> : null}
                </View>
                {sent ? (
                  <View style={styles.sentBadge}>
                    <Ionicons name="checkmark" size={15} color={colors.ok} />
                    <Text style={styles.sentText}>{t('onboarding.sent')}</Text>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.addBtn} onPress={() => send(u)} disabled={busyId === u.id}>
                    {busyId === u.id
                      ? <ActivityIndicator size="small" color={colors.white} />
                      : <Text style={styles.addBtnText}>{t('group.add')}</Text>}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}
      </View>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 13, paddingVertical: 12,
  },
  at: { fontSize: 15, fontFamily: fonts.bold, color: colors.inkFaint },
  input: { flex: 1, fontSize: 14.5, fontFamily: fonts.medium, color: colors.ink, padding: 0 },

  results: { marginTop: 14, gap: 8 },
  hint: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 6, lineHeight: 18 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 11,
  },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  username: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.accent, marginTop: 1 },
  addBtn: { backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 9, minWidth: 76, alignItems: 'center' },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },
  sentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sentText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.ok },
});
