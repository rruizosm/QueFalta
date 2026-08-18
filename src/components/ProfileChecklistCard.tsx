/**
 * ProfileChecklistCard — recupera la conversión de los pasos OPCIONALES que el
 * usuario se saltó en el onboarding (foto, amigos, primer grupo). Aparece en el
 * Home mientras quede alguno pendiente; se puede descartar (persistido) y
 * desaparece solo al completarse los tres.
 *
 * `groupCount` lo pasa HomeScreen (que ya carga los grupos); los amigos se
 * cuentan aquí y se refrescan al volver a la pantalla.
 */
import { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchFriends } from '../api/friends';

const DISMISS_KEY = '@checklist_dismissed_v1';

interface Item {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  done: boolean;
  go: () => void;
}

export default function ProfileChecklistCard({ groupCount }: { groupCount: number | null }) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile } = useProfile();
  const userId = session?.user.id ?? '';
  // Por usuario: que el descarte de una cuenta no oculte la checklist a otra.
  const dismissKey = userId ? `${DISMISS_KEY}:${userId}` : DISMISS_KEY;

  const [friendCount, setFriendCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const v = await AsyncStorage.getItem(dismissKey);
      if (!alive) return;
      if (v) { setDismissed(true); return; }   // descartada → ni consultamos amigos
      setDismissed(false);
      if (!userId) return;
      try {
        const f = await fetchFriends(userId);
        if (alive) setFriendCount(f.length);
      } catch {
        if (alive) setFriendCount(0);
      }
    })();
    return () => { alive = false; };
  }, [dismissKey, userId]));

  // Espera a conocer ambos estados para no parpadear.
  if (dismissed === null || friendCount === null || groupCount === null || !profile) return null;
  if (dismissed) return null;

  const items: Item[] = [
    { key: 'avatar', icon: 'camera-outline', label: t('checklist.addPhoto'), done: !!profile.avatarUrl, go: () => navigation.navigate('EditProfile') },
    { key: 'friends', icon: 'person-add-outline', label: t('checklist.addFriends'),     done: friendCount > 0, go: () => navigation.navigate('Friends') },
    { key: 'group',  icon: 'people-outline',    label: t('checklist.createGroup'),     done: groupCount > 0,  go: () => navigation.navigate('Groups') },
  ];

  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;   // todo hecho → desaparece

  const dismiss = () => {
    setDismissed(true);
    AsyncStorage.setItem(dismissKey, '1').catch(() => {});
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{t('checklist.title')}</Text>
          <Text style={styles.sub}>{t('checklist.progress', { done: doneCount, total: items.length })}</Text>
        </View>
        <TouchableOpacity onPress={dismiss} hitSlop={8} style={styles.closeBtn}>
          <Ionicons name="close" size={16} color={colors.inkSoft} />
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {items.map((it) => (
          <TouchableOpacity
            key={it.key}
            style={styles.row}
            onPress={it.done ? undefined : it.go}
            activeOpacity={it.done ? 1 : 0.7}
            disabled={it.done}
          >
            <View style={[styles.check, it.done && styles.checkOn]}>
              {it.done
                ? <Ionicons name="checkmark" size={14} color={colors.white} />
                : <Ionicons name={it.icon} size={15} color={colors.accent} />}
            </View>
            <Text style={[styles.label, it.done && styles.labelDone]} numberOfLines={1}>{it.label}</Text>
            {!it.done && <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 20, borderRadius: 18,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  sub: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  closeBtn: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },

  list: { marginTop: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  check: {
    width: 26, height: 26, borderRadius: 9, flexShrink: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  checkOn: { backgroundColor: colors.ok },
  label: { flex: 1, fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  labelDone: { color: colors.inkFaint, textDecorationLine: 'line-through' },
});
