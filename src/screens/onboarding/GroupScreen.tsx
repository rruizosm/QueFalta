/** Paso 5 (OPCIONAL) — Crear el primer grupo. Reutiliza createGroup. */
import { useRef, useState } from 'react';
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
import { useCart } from '../../context/CartContext';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from '../../context/LanguageContext';
import { createGroup, createGroupRequestKey } from '../../api/groups';
import { completeOnboarding } from '../../api/profile';
import OnboardingSlats from './OnboardingSlats';

const GROUP_MASCOT = require('../../../assets/mascot/berenjena-grupo.png');
const APP_BLUE = colors.blue;

export default function GroupScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { activateCart } = useCart();
  const toast = useToast();
  const userId = session?.user.id ?? '';
  const suggestions = [
    t('onboarding.ideaHome'),
    t('onboarding.ideaFlat'),
    t('onboarding.ideaFamily'),
    t('onboarding.ideaMates'),
  ];

  const [name, setName] = useState('');
  const [createdGroup, setCreatedGroup] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const requestKey = useRef(createGroupRequestKey(userId));

  const trimmed = name.trim();

  const handleContinue = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    let group = createdGroup;
    if (!group && trimmed) {
      try {
        const id = await createGroup(trimmed, userId, requestKey.current);
        group = { id, name: trimmed };
        setCreatedGroup(group);
        toast.show(t('onboarding.groupCreated', { name: trimmed }));
      } catch {
        toast.show(t('onboarding.groupCreateError'), 'error');
        savingRef.current = false;
        setSaving(false);
        return;
      }
    }

    if (group) {
      try {
        await activateCart(group.id, group.name);
      } catch {
        // El grupo ya existe: conservar su id permite reintentar sin duplicarlo.
        toast.show(t('onboarding.groupActivateError'), 'error');
        savingRef.current = false;
        setSaving(false);
        return;
      }
    }

    try {
      const onboardedAt = await completeOnboarding();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('Done', { onboardedAt });
      savingRef.current = false;
      setSaving(false);
    } catch {
      toast.show(t('onboarding.finishError'), 'error');
      savingRef.current = false;
      setSaving(false);
    }
  };

  const shellWidth = Math.min(width - 40, 560);
  const compactHeight = height < 700;
  const mascotWidth = Math.min(
    width - 100,
    width >= 620 ? 220 : compactHeight ? 150 : 185,
    height < 560 ? 118 : 220,
  );
  const mascotHeight = mascotWidth * 1.23;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={APP_BLUE} />

      <OnboardingSlats />

      <TouchableOpacity
        onPress={() => navigation.navigate('Friends')}
        style={[styles.backButton, { top: insets.top + 8 }]}
        hitSlop={8}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="arrow-back" size={20} color={APP_BLUE} />
      </TouchableOpacity>

      <View
        style={[styles.header, { paddingTop: insets.top + 60, width: shellWidth }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${t('onboarding.groupTitle')}. ${t('onboarding.groupSubtitle')}`}
      >
        <Text
          style={[styles.title, compactHeight && styles.titleCompact]}
          maxFontSizeMultiplier={1.5}
        >
          {t('onboarding.groupTitle')}
        </Text>
        <Text style={styles.subtitle}>{t('onboarding.groupSubtitle')}</Text>
        <Image
          source={GROUP_MASCOT}
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
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { width: shellWidth }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.inputCard}>
            <View style={styles.inputIcon}>
              <Ionicons name="people-outline" size={19} color={APP_BLUE} />
            </View>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('onboarding.groupPlaceholder')}
              placeholderTextColor="#7a6f64"
              maxLength={40}
              returnKeyType="done"
              onSubmitEditing={handleContinue}
              editable={!saving && !createdGroup}
              accessibilityLabel={t('onboarding.groupPlaceholder')}
              accessibilityHint={t('onboarding.groupSubtitle')}
            />
          </View>

          <Text style={styles.suggestionLabel}>{t('onboarding.groupIdeas')}</Text>
          <View style={styles.suggestionRow}>
            {suggestions.map((suggestion) => {
              const selected = trimmed.toLowerCase() === suggestion.toLowerCase();
              return (
                <TouchableOpacity
                  key={suggestion}
                  style={[styles.suggestionChip, selected && styles.suggestionChipSelected]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setName(suggestion);
                  }}
                  disabled={saving || !!createdGroup}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityState={{ selected, disabled: saving || !!createdGroup }}
                >
                  <Text style={[styles.suggestionText, selected && styles.suggestionTextSelected]}>
                    {suggestion}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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
                  {trimmed ? t('onboarding.groupCreateContinue') : t('onboarding.laterSkip')}
                </Text>
                <Ionicons name="arrow-forward" size={18} color={APP_BLUE} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
  scroll: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    alignSelf: 'center',
    paddingTop: 4,
    paddingBottom: 16,
  },
  inputCard: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.76)',
    backgroundColor: '#ffffff',
  },
  inputIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(44,111,187,0.1)',
  },
  input: {
    flex: 1,
    padding: 0,
    color: '#2b2521',
    fontSize: 16,
    fontFamily: fonts.semibold,
    letterSpacing: -0.25,
  },
  suggestionLabel: {
    marginTop: 17,
    marginBottom: 10,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10.5,
    fontFamily: fonts.bold,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.44)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  suggestionChipSelected: {
    borderColor: '#ffffff',
    backgroundColor: '#ffffff',
  },
  suggestionText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: fonts.semibold,
  },
  suggestionTextSelected: {
    color: APP_BLUE,
  },
  footer: {
    width: '100%',
    flexShrink: 0,
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
  continueButtonDisabled: {
    opacity: 0.72,
  },
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
  bottomRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    height: 14,
    backgroundColor: '#255b9c',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.36)',
  },
});
