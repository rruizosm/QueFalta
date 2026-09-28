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
  readStoreReleaseAnswer,
  storeReleaseCatalogKey,
  writeStoreReleaseAnswer,
  type StoreReleaseAnswer,
  type StoreReleasePromptStore,
} from '../lib/storeReleasePrompt';

const STORE_LOGOS: Record<StoreReleasePromptStore, number> = {
  bm: require('../../assets/stores/bm.png'),
  eljamon: require('../../assets/stores/eljamon.png'),
};

interface Props {
  store: StoreReleasePromptStore;
  available: boolean;
  onResolved: () => void;
}

/** Pregunta de incorporación de una cadena, con respuesta y estado separados por tienda. */
export default function StoreReleasePrompt({ store, available, onResolved }: Props) {
  const { profile, applyProfile } = useProfile();
  const { t } = useTranslation();
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState<StoreReleaseAnswer | null>(null);
  const [saveError, setSaveError] = useState(false);
  const userId = profile?.id ?? null;
  const copy = store === 'bm' ? 'bmRelease' : 'eljamonRelease';

  useEffect(() => {
    let cancelled = false;
    setVisible(false);
    setSaveError(false);

    if (!userId || !profile?.onboardedAt) return () => { cancelled = true; };
    if (!available) {
      onResolved();
      return () => { cancelled = true; };
    }

    readStoreReleaseAnswer(store, userId)
      .then(async (answer) => {
        if (cancelled) return;
        if (answer) {
          onResolved();
          return;
        }
        // Si la cadena ya figura elegida en el perfil, no hace falta preguntar.
        if (profile.catalogStores.includes(storeReleaseCatalogKey(store))) {
          await writeStoreReleaseAnswer(store, userId, 'yes').catch(() => {});
          if (!cancelled) onResolved();
          return;
        }
        setVisible(true);
      })
      .catch(() => {
        // La respuesta es obligatoria: ante un fallo de almacenamiento se pregunta.
        if (!cancelled) setVisible(true);
      });

    return () => { cancelled = true; };
  }, [available, onResolved, profile?.catalogStores, profile?.onboardedAt, store, userId]);

  const answer = useCallback(async (choice: StoreReleaseAnswer) => {
    if (!profile || saving) return;

    setSaving(choice);
    setSaveError(false);
    const storeKey = storeReleaseCatalogKey(store);
    const withoutStore = profile.catalogStores.filter((key) => key !== storeKey);
    const requested = choice === 'yes' ? [...withoutStore, storeKey] : withoutStore;
    const orderedRequest = CATALOG_STORE_KEYS.filter((key) => requested.includes(key));
    const catalogStores = orderedRequest.length > 0
      ? orderedRequest
      : CATALOG_STORE_KEYS.filter((key) => key !== storeKey);

    try {
      await updateProfile(profile.id, { catalogStores });
      applyProfile({ catalogStores });
      await writeStoreReleaseAnswer(store, profile.id, choice).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisible(false);
      onResolved();
    } catch {
      setSaveError(true);
    } finally {
      setSaving(null);
    }
  }, [applyProfile, onResolved, profile, saving, store]);

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
              source={STORE_LOGOS[store]}
              style={styles.logo}
              contentFit="contain"
              transition={0}
              accessibilityLabel={store === 'bm' ? 'BM' : 'El Jamón'}
            />
          </View>

          <Text style={styles.eyebrow}>{t(`${copy}.required`)}</Text>
          <Text style={styles.title} accessibilityRole="header">{t(`${copy}.title`)}</Text>
          <Text style={styles.body}>{t(`${copy}.body`)}</Text>

          {saveError ? (
            <View style={styles.error} accessibilityRole="alert">
              <Ionicons name="alert-circle-outline" size={18} color={colors.red} />
              <Text style={styles.errorText}>{t(`${copy}.saveError`)}</Text>
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
              {saving === 'yes' ? <ActivityIndicator color="#ffffff" /> : (
                <>
                  <Ionicons name="checkmark" size={20} color="#ffffff" />
                  <Text style={styles.primaryText}>{t(`${copy}.yes`)}</Text>
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
              {saving === 'no' ? <ActivityIndicator color={colors.inkSoft} /> : (
                <Text style={styles.secondaryText}>{t(`${copy}.no`)}</Text>
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
