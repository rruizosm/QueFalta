import { useEffect, useState } from 'react';
import {
  Linking, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import HardShadow from './HardShadow';

const IOS_STORE_URL = 'https://apps.apple.com/app/id6777720373';
const ANDROID_STORE_URL = 'https://play.google.com/store/apps/details?id=com.quefalta.app';
const REVIEW_PROMPT_STATE_PREFIX = '@review_prompt:';
const NEW_ACCOUNT_GRACE_MS = 24 * 60 * 60 * 1000;

function reviewStateKey(userId: string, state: 'eligible' | 'seen') {
  return `${REVIEW_PROMPT_STATE_PREFIX}${state}:${userId}`;
}

/**
 * Popup de reseña de una sola aparición por dispositivo.
 *
 * Las cuentas creadas antes de la OTA reciben el aviso al primer arranque. Las
 * recién creadas esperan a reabrir la app una vez, para no interrumpir el alta.
 */
export default function ReviewPrompt() {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const { session } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const userId = session?.user.id;
    if (!userId) return;

    // El estado es por cuenta, no global por dispositivo: si se cambia de
    // usuario en el mismo móvil, cada cuenta conserva su propio aviso.
    const eligibleKey = reviewStateKey(userId, 'eligible');
    const seenKey = reviewStateKey(userId, 'seen');
    setVisible(false);

    let cancelled = false;
    AsyncStorage.multiGet([eligibleKey, seenKey])
      .then(([eligible, seen]) => {
        if (cancelled || seen[1]) return;

        const createdAt = new Date(session?.user.created_at ?? '').getTime();
        const existingAccount = Number.isFinite(createdAt)
          && Date.now() - createdAt >= NEW_ACCOUNT_GRACE_MS;

        // Cuenta creada hace menos de 24 h: la primera apertura solo arma el
        // aviso. Las cuentas existentes lo ven directamente tras la OTA.
        if (!eligible[1] && !existingAccount) {
          return AsyncStorage.setItem(eligibleKey, '1');
        }

        return AsyncStorage.setItem(seenKey, '1').then(() => {
          if (!cancelled) setVisible(true);
        });
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [session?.user.created_at, session?.user.id]);

  const close = () => setVisible(false);

  const openStore = async () => {
    close();
    const url = Platform.OS === 'ios' ? IOS_STORE_URL : ANDROID_STORE_URL;
    await Linking.openURL(url).catch(() => {});
  };

  const content = (
    <>
      <View style={styles.stars} accessibilityRole="image" accessibilityLabel={t('review.stars')}>
        {[0, 1, 2, 3, 4].map((star) => (
          <Ionicons key={star} name="star" size={22} color={colors.accent} />
        ))}
      </View>
      <Text style={styles.title}>{t('review.title')}</Text>
      <Text style={styles.message}>{t('review.message')}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={openStore} activeOpacity={0.85} accessibilityRole="button">
        <Text style={styles.primaryButtonText}>{t('review.rate')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryButton} onPress={close} activeOpacity={0.7} accessibilityRole="button">
        <Text style={styles.secondaryButtonText}>{t('review.later')}</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessible={false} />
        <HardShadow style={styles.card} accessibilityViewIsModal>{content}</HardShadow>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  // Blanco fijo: este popup conserva el mismo fondo aunque el resto esté en modo oscuro.
  card: {
    width: '100%', alignItems: 'center', paddingHorizontal: 24,
    paddingVertical: 24, gap: 12,
    borderRadius: 24, backgroundColor: '#ffffff',
  },
  stars: { flexDirection: 'row', gap: 5, marginTop: 2, marginBottom: 2 },
  title: { fontSize: 21, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  message: {
    fontSize: 14, lineHeight: 20, fontFamily: fonts.medium,
    color: colors.inkSoft, textAlign: 'center', marginBottom: 4,
  },
  primaryButton: {
    width: '100%', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 14, backgroundColor: colors.accent,
  },
  primaryButtonText: { fontSize: 14, fontFamily: fonts.bold, color: colors.white },
  secondaryButton: { paddingVertical: 4 },
  secondaryButtonText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.inkSoft },
});
