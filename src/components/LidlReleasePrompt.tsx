import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { updateProfile } from '../api/profile';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { CATALOG_STORE_KEYS } from '../constants/stores';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  readLidlReleaseAnswer,
  writeLidlReleaseAnswer,
  type LidlReleaseAnswer,
} from '../lib/lidlReleasePrompt';

const LIDL_LOGO = require('../../assets/stores/lidl.png');

interface Props {
  onResolved: () => void;
}

/**
 * Decisión obligatoria para las cuentas que llegan a 1.3.1 desde una versión
 * anterior. La respuesta se persiste en el perfil y se recuerda por usuario en
 * este dispositivo; un error mantiene el diálogo abierto para poder reintentar.
 */
export default function LidlReleasePrompt({ onResolved }: Props) {
  const { profile, applyProfile } = useProfile();
  const { t } = useTranslation();
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState<LidlReleaseAnswer | null>(null);
  const [saveError, setSaveError] = useState(false);
  const userId = profile?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    setVisible(false);
    setSaveError(false);

    if (!userId || !profile?.onboardedAt) return () => { cancelled = true; };

    readLidlReleaseAnswer(userId)
      .then((answer) => {
        if (cancelled) return;
        if (answer) {
          onResolved();
        } else {
          setVisible(true);
        }
      })
      .catch(() => {
        // Es una pregunta obligatoria: un fallo del almacenamiento local no
        // puede convertirlo silenciosamente en un aviso descartado.
        if (!cancelled) setVisible(true);
      });

    return () => { cancelled = true; };
  }, [onResolved, profile?.onboardedAt, userId]);

  const answer = useCallback(async (choice: LidlReleaseAnswer) => {
    if (!profile || saving) return;

    setSaving(choice);
    setSaveError(false);
    const withoutLidl = profile.catalogStores.filter((store) => store !== 'lidl');
    const requested = choice === 'yes' ? [...withoutLidl, 'lidl' as const] : withoutLidl;
    const orderedRequest = CATALOG_STORE_KEYS.filter((store) => requested.includes(store));
    // `catalog_stores` debe conservar al menos una opción. El caso normal
    // mantiene exactamente la selección previa; si una cuenta de pruebas solo
    // tenía Lidl y responde que no, recupera el conjunto legacy sin Lidl.
    const catalogStores = orderedRequest.length > 0
      ? orderedRequest
      : CATALOG_STORE_KEYS.filter((store) => store !== 'lidl');

    try {
      await updateProfile(profile.id, { catalogStores });
      applyProfile({ catalogStores });
      // La preferencia de servidor es la fuente de verdad. Si el almacenamiento
      // local falla, no bloqueamos una respuesta que ya quedó guardada.
      await writeLidlReleaseAnswer(profile.id, choice).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisible(false);
      onResolved();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(null);
    }
  }, [applyProfile, onResolved, profile, saving]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reducedMotion ? 'none' : 'fade'}
      onRequestClose={() => {}}
    >
      <View style={styles.overlay}>
        <View style={styles.card} accessibilityViewIsModal>
          <View style={styles.logoShell}>
            <Image
              source={LIDL_LOGO}
              style={styles.logo}
              contentFit="contain"
              transition={0}
              accessibilityLabel="Lidl"
            />
          </View>

          <Text style={styles.eyebrow}>{t('lidlRelease.required')}</Text>
          <Text style={styles.title} accessibilityRole="header">
            {t('lidlRelease.title')}
          </Text>
          <Text style={styles.body}>{t('lidlRelease.body')}</Text>

          {saveError ? (
            <View style={styles.error} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
              <Text style={styles.errorText}>{t('lidlRelease.saveError')}</Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={() => answer('yes')}
              disabled={saving !== null}
              activeOpacity={0.84}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving !== null, busy: saving === 'yes' }}
            >
              {saving === 'yes' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color="#ffffff" />
                  <Text style={styles.primaryText}>{t('lidlRelease.yes')}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryButton, saving && styles.buttonDisabled]}
              onPress={() => answer('no')}
              disabled={saving !== null}
              activeOpacity={0.78}
              accessibilityRole="button"
              accessibilityState={{ disabled: saving !== null, busy: saving === 'no' }}
            >
              {saving === 'no' ? (
                <ActivityIndicator color={colors.inkSoft} />
              ) : (
                <Text style={styles.secondaryText}>{t('lidlRelease.no')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 28,
    backgroundColor: 'rgba(16, 13, 11, 0.62)',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    borderRadius: 28,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 18,
  },
  logoShell: {
    width: 92,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logo: { width: 72, height: 72 },
  eyebrow: {
    marginTop: 17,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.bold,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  title: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.4,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  body: {
    marginTop: 9,
    textAlign: 'center',
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  error: {
    width: '100%',
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.accentLight,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.red,
  },
  actions: { width: '100%', marginTop: 20, gap: 10 },
  primaryButton: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 25,
    backgroundColor: colors.accent,
  },
  primaryText: { fontSize: 15, fontFamily: fonts.bold, color: '#ffffff' },
  secondaryButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.inkSoft },
  buttonDisabled: { opacity: 0.65 },
});
