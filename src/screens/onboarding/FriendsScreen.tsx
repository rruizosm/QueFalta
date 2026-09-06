/** Paso 4 (OPCIONAL) — Buscar amigos por @usuario y enviarles solicitud.
 *  Reutiliza searchUsersByUsername + sendFriendRequest. */
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useProfile } from '../../context/ProfileContext';
import { useTranslation } from '../../context/LanguageContext';
import type { SearchedUser } from '../../api/groups';
import { sendFriendRequest } from '../../api/friends';
import UserAvatar from '../../components/UserAvatar';
import { useUsernameSearch } from '../../hooks/useUsernameSearch';
import { updateProfile } from '../../api/profile';
import AmbientBubbleBackdrop from '../../components/AmbientBubbleBackdrop';

const FRIENDS_MASCOT = require('../../../assets/mascot/berenjena-amigos.png');
const APP_BLUE = colors.blue;

export default function FriendsScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const toast = useToast();
  const { applyProfile } = useProfile();
  const userId = session?.user.id ?? '';

  const [query, setQuery] = useState('');
  const [sentIds, setSentIds] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { cleanQuery, results, searching } = useUsernameSearch(query, userId);

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

  const goNext = async () => {
    if (saving || busyId) return;
    setSaving(true);
    try {
      await updateProfile(userId, { onboardingStep: 4 });
      applyProfile({ onboardingStep: 4 });
      navigation.navigate('Group');
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };
  const someSent = sentIds.length > 0;
  const shellWidth = Math.min(width - 40, 560);
  const compactHeight = height < 700;
  const mascotWidth = Math.min(
    width - 80,
    width >= 620 ? 300 : compactHeight ? 190 : 230,
    height < 560 ? 150 : 300,
  ) / 2;
  const mascotHeight = mascotWidth * 1.27;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={APP_BLUE} />
      <AmbientBubbleBackdrop showGradient={false} onBlue />

      <TouchableOpacity
        onPress={() => navigation.navigate('Avatar')}
        style={[styles.backButton, { top: insets.top + 8 }]}
        hitSlop={8}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="arrow-back" size={20} color={APP_BLUE} />
      </TouchableOpacity>

      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 60,
            width: shellWidth,
          },
        ]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${t('onboarding.friendsTitle')}. ${t('onboarding.friendsSubtitle')}`}
      >
        <Text
          style={[styles.title, compactHeight && styles.titleCompact]}
          maxFontSizeMultiplier={1.5}
        >
          {t('onboarding.friendsTitle')}
        </Text>
        <Text style={styles.subtitle}>{t('onboarding.friendsSubtitle')}</Text>
        <Image
          source={FRIENDS_MASCOT}
          style={{ width: mascotWidth, height: mascotHeight }}
          contentFit="cover"
          contentPosition="center"
          transition={0}
          accessible={false}
        />
      </View>

      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.fixedSearch, { width: shellWidth }]}>
          <View style={styles.searchWrap}>
            <Text style={styles.at}>@</Text>
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={(value) => setQuery(value.toLowerCase())}
              placeholder={t('onboarding.friendsPlaceholder')}
              placeholderTextColor="#7a6f64"
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={t('onboarding.friendsPlaceholder')}
              accessibilityHint={t('onboarding.friendsSubtitle')}
            />
            {searching && <ActivityIndicator size="small" color="#7a6f64" />}
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { width: shellWidth }]}
          showsVerticalScrollIndicator
          persistentScrollbar
          indicatorStyle="white"
          scrollIndicatorInsets={{ right: 2 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.results}>
            {cleanQuery.length < 2 ? (
              <View style={styles.emptyState}>
                <Ionicons name="search" size={17} color="rgba(255,255,255,0.9)" />
                <Text style={styles.hint}>{t('catalog.minLetters')}</Text>
              </View>
            ) : (!searching && results.length === 0) ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={18} color="rgba(255,255,255,0.9)" />
                <Text style={styles.hint}>{t('friends.noResults', { q: cleanQuery })}</Text>
              </View>
            ) : (
              results.map((u) => {
                const sent = sentIds.includes(u.id);
                return (
                  <View key={u.id} style={styles.row}>
                    <UserAvatar
                      avatarUrl={u.avatarUrl}
                      initials={u.initials}
                      color={u.color}
                      size={42}
                    />
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
                      <TouchableOpacity
                        style={styles.addButton}
                        onPress={() => send(u)}
                        disabled={busyId === u.id}
                        activeOpacity={0.84}
                        accessibilityRole="button"
                        accessibilityLabel={t('onboarding.addFriendA11y', { name: u.name })}
                        accessibilityState={{ disabled: busyId === u.id, busy: busyId === u.id }}
                      >
                        {busyId === u.id
                          ? <ActivityIndicator size="small" color="#ffffff" />
                          : <Text style={styles.addButtonText}>{t('group.add')}</Text>}
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
          <TouchableOpacity
            style={[styles.continueButton, (saving || !!busyId) && styles.continueButtonDisabled]}
            onPress={goNext}
            disabled={saving || !!busyId}
            activeOpacity={0.86}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || !!busyId, busy: saving }}
          >
            {saving ? (
              <ActivityIndicator color={APP_BLUE} />
            ) : (
              <>
                <Text style={styles.continueText}>
                  {someSent ? t('onboarding.continue') : t('onboarding.laterSkip')}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={APP_BLUE} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: APP_BLUE,
  },
  backButton: {
    position: 'absolute',
    left: 18,
    zIndex: 4,
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  header: {
    flexShrink: 0,
    zIndex: 2,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  titleCompact: {
    fontSize: 27,
    lineHeight: 32,
  },
  subtitle: {
    maxWidth: 430,
    marginTop: 5,
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13.5,
    lineHeight: 19,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  keyboardAvoider: {
    flex: 1,
    width: '100%',
    zIndex: 2,
  },
  fixedSearch: {
    flexShrink: 0,
    alignSelf: 'center',
    paddingBottom: 10,
  },
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    alignSelf: 'center',
    paddingBottom: 14,
  },
  searchWrap: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.76)',
    backgroundColor: '#ffffff',
  },
  at: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: '#7a6f64',
  },
  input: {
    flex: 1,
    padding: 0,
    color: '#2b2521',
    fontSize: 15,
    fontFamily: fonts.medium,
    letterSpacing: -0.3,
  },
  results: {
    gap: 8,
  },
  emptyState: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  hint: {
    flexShrink: 1,
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  row: {
    minHeight: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.76)',
    backgroundColor: '#ffffff',
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    color: '#2b2521',
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  username: {
    marginTop: 1,
    color: APP_BLUE,
    fontSize: 12.5,
    fontFamily: fonts.medium,
  },
  addButton: {
    minWidth: 76,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 15,
    backgroundColor: APP_BLUE,
  },
  addButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: fonts.bold,
  },
  sentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sentText: {
    color: colors.ok,
    fontSize: 12.5,
    fontFamily: fonts.bold,
  },
  footer: {
    width: '100%',
    alignItems: 'center',
    gap: 2,
    paddingTop: 10,
    paddingHorizontal: 20,
    backgroundColor: APP_BLUE,
  },
  continueButton: {
    width: '100%',
    maxWidth: 560,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    backgroundColor: '#ffffff',
  },
  continueButtonDisabled: { opacity: 0.55 },
  continueText: {
    color: APP_BLUE,
    fontSize: 15.5,
    fontFamily: fonts.bold,
  },
  skipButton: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  skipText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13.5,
    fontFamily: fonts.semibold,
  },
});
