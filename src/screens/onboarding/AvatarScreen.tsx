/** Paso 3 (OPCIONAL) — Foto de perfil. Reutiliza expo-image-picker + uploadAvatar. */
import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useThemedStyles } from '../../context/ThemeContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateProfile, uploadAvatar } from '../../api/profile';
import OnboardingLayout from './OnboardingLayout';

export default function AvatarScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = async () => {
    // El selector del sistema (PHPicker/UIImagePickerController) no necesita
    // permiso de fototeca: no pedirlo evita el diálogo de "acceso completo".
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      Haptics.selectionAsync();
      setPickedUri(result.assets[0].uri);
    }
  };

  const goNext = () => navigation.navigate('Friends');

  const handleContinue = async () => {
    if (!pickedUri) { goNext(); return; }
    setSaving(true);
    try {
      const url = await uploadAvatar(userId, pickedUri);
      await updateProfile(userId, { avatarUrl: url });
      applyProfile({ avatarUrl: url });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      goNext();
    } catch {
      toast.show(t('onboarding.avatarUploadError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const preview = pickedUri ?? profile?.avatarUrl ?? null;
  const initials = profile?.initials ?? '??';
  const bg = profile?.color ?? colors.accent;

  return (
    <OnboardingLayout
      step={6}
      totalSteps={8}
      eyebrow={t('onboarding.optional')}
      title={t('onboarding.avatarTitle')}
      subtitle={t('onboarding.avatarSubtitle')}
      onBack={() => navigation.goBack()}
      continueLabel={pickedUri ? t('onboarding.avatarSaveContinue') : t('onboarding.continue')}
      continueLoading={saving}
      onContinue={handleContinue}
      onSkip={goNext}
      skipLabel={t('onboarding.avatarSkip')}
    >
      <View style={styles.center}>
        <TouchableOpacity onPress={pick} activeOpacity={0.85} style={styles.avatarWrap}>
          {preview ? (
            <Image source={{ uri: preview }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: bg }]}>
              <Text style={styles.initials}>{initials}</Text>
            </View>
          )}
          <View style={styles.cameraBadge}>
            <Ionicons name="camera" size={18} color={colors.white} />
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={pick} hitSlop={8}>
          <Text style={styles.pickText}>{preview ? t('editProfile.changePhoto') : t('onboarding.avatarPick')}</Text>
        </TouchableOpacity>
      </View>
    </OnboardingLayout>
  );
}

const themedStyles = () => StyleSheet.create({
  center: { alignItems: 'center', gap: 14, marginTop: 16 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 132, height: 132, borderRadius: 66,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  initials: { fontSize: 46, fontFamily: fonts.bold, color: colors.white },
  cameraBadge: {
    position: 'absolute', right: 2, bottom: 2,
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: colors.paper,
  },
  pickText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
});
