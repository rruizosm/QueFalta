import { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { updateProfile, uploadAvatar, isUsernameAvailable } from '../api/profile';

const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;

export default function EditProfileScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const email  = session?.user.email ?? '';
  // Proveedor con el que se inició sesión (para la etiqueta del correo).
  const isApple = session?.user.app_metadata?.provider === 'apple';

  // Prefill instantly from the cached profile (no empty-field flash).
  const [name, setName]             = useState(profile?.name ?? '');
  const [username, setUsername]     = useState(profile?.username ?? '');
  const [avatarUri, setAvatarUri]   = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl]   = useState<string | null>(profile?.avatarUrl ?? null);

  const [usernameState, setUsernameState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving]       = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the profile loads after this screen mounts, sync the fields once.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !profile) return;
    hydratedRef.current = true;
    setName(profile.name);
    setUsername(profile.username ?? '');
    setAvatarUrl(profile.avatarUrl);
  }, [profile]);

  // Debounced username availability check
  useEffect(() => {
    const raw = username.trim().toLowerCase();
    if (!raw) { setUsernameState('idle'); return; }
    if (!USERNAME_RE.test(raw)) { setUsernameState('invalid'); return; }
    if (raw === (profile?.username ?? '')) { setUsernameState('ok'); return; }

    setUsernameState('checking');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const free = await isUsernameAvailable(raw);
        setUsernameState(free ? 'ok' : 'taken');
      } catch {
        setUsernameState('idle');
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [username, profile?.username, userId]);

  const handlePickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('profile.notifPermTitle'), t('editProfile.galleryPerm'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarUri(null);
    setAvatarUrl(null);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedUsername = username.trim().toLowerCase();

    if (!trimmedName) { toast.show(t('editProfile.nameEmpty'), 'error'); return; }
    if (trimmedUsername && !USERNAME_RE.test(trimmedUsername)) {
      toast.show(t('editProfile.usernameRule'), 'error');
      return;
    }
    if (usernameState === 'taken') {
      toast.show(t('editProfile.usernameTaken'), 'error');
      return;
    }

    setSaving(true);
    try {
      let finalAvatarUrl = avatarUrl;

      if (avatarUri) {
        setUploading(true);
        finalAvatarUrl = await uploadAvatar(userId, avatarUri);
        setUploading(false);
      }

      await updateProfile(userId, {
        name: trimmedName,
        username: trimmedUsername || null,
        avatarUrl: finalAvatarUrl,
      });

      // Update the shared cache so Perfil reflects changes without a refetch.
      applyProfile({
        name: trimmedName,
        username: trimmedUsername || null,
        avatarUrl: finalAvatarUrl,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('editProfile.saved'));
      navigation.goBack();
    } catch (e: any) {
      const isDuplicate = e?.message?.includes('unique') || e?.code === '23505';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(isDuplicate ? t('editProfile.usernameTaken') : t('editProfile.saveError'), 'error');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  const displayAvatar = avatarUri ?? avatarUrl;
  const avatarBg      = profile?.color ?? colors.accent;
  const initials      = profile?.initials ?? '??';

  const usernameHelper = () => {
    if (usernameState === 'invalid') return { text: t('editProfile.usernameInvalid'), ok: false };
    if (usernameState === 'taken')   return { text: t('editProfile.unavailable'), ok: false };
    if (usernameState === 'ok')      return { text: t('editProfile.available'), ok: true };
    return { text: t('editProfile.usernameHint'), ok: false };
  };
  const helper = usernameHelper();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

        {/* Custom header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Text style={styles.headerCancel}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('editProfile.title')}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving} hitSlop={8}>
            {saving
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={styles.headerSave}>{t('common.save')}</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo */}
          <View style={styles.photoSection}>
            <View style={styles.avatarWrap}>
              {displayAvatar ? (
                <Image source={{ uri: displayAvatar }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                  {uploading
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={styles.avatarInitials}>{initials}</Text>}
                </View>
              )}
              <TouchableOpacity style={styles.cameraBadge} onPress={handlePickImage}>
                <Ionicons name="camera-outline" size={15} color={colors.white} />
              </TouchableOpacity>
            </View>
            <View style={styles.photoActions}>
              <TouchableOpacity onPress={handlePickImage}>
                <Text style={styles.photoActionPrimary}>{t('editProfile.changePhoto')}</Text>
              </TouchableOpacity>
              <View style={styles.photoSep} />
              <TouchableOpacity onPress={handleRemoveAvatar} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="trash-outline" size={13} color={colors.inkSoft} />
                <Text style={styles.photoActionSecondary}>{t('editProfile.remove')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Nombre */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('editProfile.nameLabel')}</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={t('editProfile.namePlaceholder')}
                placeholderTextColor={colors.inkFaint}
                maxLength={50}
              />
            </View>
          </View>

          {/* @usuario */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('editProfile.usernameLabel')}</Text>
            <View style={styles.inputBox}>
              <Text style={styles.atPrefix}>@</Text>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={username}
                onChangeText={(v) => setUsername(v.toLowerCase())}
                placeholder={t('editProfile.usernamePlaceholder')}
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
              />
              {usernameState === 'checking' && (
                <ActivityIndicator size="small" color={colors.inkFaint} />
              )}
              {usernameState === 'ok' && (
                <View style={styles.usernameOk}>
                  <Ionicons name="checkmark" size={13} color={colors.ok} />
                  <Text style={styles.usernameOkText}>{t('editProfile.available')}</Text>
                </View>
              )}
              {usernameState === 'taken' && (
                <Text style={styles.usernameTaken}>{t('editProfile.unavailable')}</Text>
              )}
            </View>
            <Text style={[styles.helper, helper.ok && styles.helperOk]}>
              {helper.ok && <Ionicons name="checkmark" size={12} color={colors.ok} />}
              {' '}{helper.text}
            </Text>
          </View>

          {/* Correo (read-only) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('editProfile.emailLabel')}</Text>
            <View style={[styles.inputBox, styles.inputBoxReadonly]}>
              <Text style={styles.inputReadonly} numberOfLines={1}>{email}</Text>
              <Ionicons name="lock-closed-outline" size={15} color={colors.inkFaint} />
            </View>
            <Text style={styles.helper}>
              {isApple
                ? <Ionicons name="logo-apple" size={13} color={colors.ink} />
                : <Text style={{ color: '#4285F4', fontFamily: fonts.bold }}>G</Text>}
              {'  '}{t(isApple ? 'editProfile.appleConnected' : 'editProfile.googleConnected')}
            </Text>
          </View>

          {/* Save button (thumb-reachable duplicate) */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={colors.white} />
              : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="checkmark" size={17} color={colors.white} />
                  <Text style={styles.saveBtnText}>{t('editProfile.saveChanges')}</Text>
                </View>
              )}
          </TouchableOpacity>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10,
  },
  headerCancel: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.inkSoft },
  headerTitle:  { fontSize: 17,   fontFamily: fonts.bold,    color: colors.ink },
  headerSave:   { fontSize: 13.5, fontFamily: fonts.bold,    color: colors.accent },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // ── Photo ─────────────────────────────────────────────────────
  photoSection: { alignItems: 'center', gap: 10, marginBottom: 20, marginTop: 8 },
  avatarWrap:   { position: 'relative' },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 30, fontFamily: fonts.bold, color: colors.white },
  cameraBadge: {
    position: 'absolute', right: -2, bottom: -2,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: colors.paper,
  },
  photoActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photoActionPrimary:   { fontSize: 13, fontFamily: fonts.bold,   color: colors.accent },
  photoActionSecondary: { fontSize: 13, fontFamily: fonts.semibold, color: colors.inkSoft },
  photoSep: { width: 1, height: 13, backgroundColor: colors.border },

  // ── Fields ────────────────────────────────────────────────────
  fieldGroup: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 13, paddingVertical: 11, gap: 8,
  },
  inputBoxReadonly: { backgroundColor: colors.surfaceAlt },
  input: { fontSize: 14.5, fontFamily: fonts.medium, color: colors.ink, flex: 1, padding: 0 },
  inputReadonly: { flex: 1, fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft },
  atPrefix: { fontSize: 15, fontFamily: fonts.bold, color: colors.inkFaint },

  // Username status
  usernameOk:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  usernameOkText: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.ok },
  usernameTaken: { fontSize: 11.5, fontFamily: fonts.bold, color: '#d6452b' },

  helper: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 5, lineHeight: 16 },
  helperOk: { color: colors.ok },

  // ── Save button ───────────────────────────────────────────────
  saveBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
  },
  saveBtnText: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.white },
});
