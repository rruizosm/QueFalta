/** Paso 3 (OPCIONAL) — Foto de perfil. Reutiliza expo-image-picker + uploadAvatar. */
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateProfile, uploadAvatar } from '../../api/profile';
import OnboardingSlats from './OnboardingSlats';

const SELFIE_MASCOT = require('../../../assets/mascot/berenjena-selfie.png');
const APP_BLUE = colors.blue;

export default function AvatarScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
    try {
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
    } catch {
      toast.show(t('onboarding.avatarPickerError'), 'error');
    }
  };

  const goNext = () => navigation.navigate('Friends');

  const handleSkip = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateProfile(userId, { onboardingStep: 3 });
      applyProfile({ onboardingStep: 3 });
      goNext();
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    if (!pickedUri) { await handleSkip(); return; }
    setSaving(true);
    try {
      const url = await uploadAvatar(userId, pickedUri);
      await updateProfile(userId, { avatarUrl: url, onboardingStep: 3 });
      applyProfile({ avatarUrl: url, onboardingStep: 3 });
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
  const bg = profile?.color ?? APP_BLUE;
  const shellWidth = Math.min(width - 40, 560);
  const compactHeight = height < 700;
  const mascotBaseWidth = Math.min(
    width - 160,
    width >= 620 ? 140 : 112,
    height < 560 ? 72 : height < 700 ? 88 : 112,
  );
  const mascotWidth = mascotBaseWidth + 50;
  const mascotHeight = mascotBaseWidth * 1.5 + 50;
  const avatarSize = compactHeight ? 118 : 136;
  const avatarLabel = preview ? t('editProfile.changePhoto') : t('onboarding.avatarPick');

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={APP_BLUE} />

      <OnboardingSlats />

      <TouchableOpacity
        onPress={() => navigation.navigate('Stores')}
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
        accessibilityLabel={t('onboarding.avatarTitle')}
      >
        <Text
          style={[styles.title, compactHeight && styles.titleCompact]}
          maxFontSizeMultiplier={1.5}
        >
          {t('onboarding.avatarTitle')}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { width: shellWidth },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity
          onPress={pick}
          activeOpacity={0.86}
          style={styles.photoCard}
          accessibilityRole="button"
          accessibilityLabel={avatarLabel}
        >
          <View style={styles.avatarWrap}>
            {preview ? (
              <Image
                source={{ uri: preview }}
                style={[styles.avatar, { width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}
                accessible={false}
              />
            ) : (
              <View
                style={[
                  styles.avatar,
                  {
                    width: avatarSize,
                    height: avatarSize,
                    borderRadius: avatarSize / 2,
                    backgroundColor: bg,
                  },
                ]}
              >
                <Text style={styles.initials}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={18} color="#ffffff" />
            </View>
          </View>
          <Text style={styles.pickText}>{avatarLabel}</Text>
        </TouchableOpacity>
        <ExpoImage
          source={SELFIE_MASCOT}
          style={[styles.mascot, { width: mascotWidth, height: mascotHeight }]}
          contentFit="contain"
          transition={0}
          accessible={false}
        />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
        <TouchableOpacity
          style={[styles.continueButton, saving && styles.continueButtonDisabled]}
          onPress={handleContinue}
          disabled={saving}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving, busy: saving }}
        >
          {saving ? (
            <ActivityIndicator color={APP_BLUE} />
          ) : (
            <>
              <Text style={styles.continueText}>
                {pickedUri
                  ? t('onboarding.avatarSaveContinue')
                  : preview
                    ? t('onboarding.continue')
                    : t('onboarding.avatarSkip')}
              </Text>
              <Ionicons name="arrow-forward" size={18} color={APP_BLUE} />
            </>
          )}
        </TouchableOpacity>
        {pickedUri ? (
          <TouchableOpacity
            onPress={handleSkip}
            disabled={saving}
            activeOpacity={0.78}
            style={styles.skipButton}
            accessibilityRole="button"
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.skipText}>{t('onboarding.avatarSkip')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.bottomRail} pointerEvents="none" />
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
    paddingHorizontal: 64,
    paddingBottom: 12,
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
  scroll: {
    flex: 1,
    width: '100%',
    zIndex: 2,
  },
  scrollContent: {
    flexGrow: 1,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 10,
  },
  photoCard: {
    width: '100%',
    minHeight: 176,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 18,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.76)',
    backgroundColor: '#ffffff',
  },
  mascot: {
    marginTop: 12,
  },
  avatarWrap: { position: 'relative' },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#d9d2c7',
  },
  initials: { fontSize: 46, fontFamily: fonts.bold, color: '#ffffff' },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: APP_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  pickText: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: APP_BLUE,
  },
  footer: {
    width: '100%',
    zIndex: 3,
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
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
  },
  continueButtonDisabled: { opacity: 0.55 },
  continueText: {
    fontSize: 15.5,
    fontFamily: fonts.bold,
    color: APP_BLUE,
  },
  skipButton: {
    minHeight: 42,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipText: {
    fontSize: 13.5,
    fontFamily: fonts.semibold,
    color: 'rgba(255,255,255,0.9)',
  },
  bottomRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    height: 14,
    backgroundColor: '#255b9c',
  },
});
