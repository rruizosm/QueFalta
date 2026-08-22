import { useEffect } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';
import { useAuth } from '../context/AuthContext';

const REVIEW_STATE_PREFIX = '@native_store_review:';
const MINIMUM_INSTALL_AGE_MS = 24 * 60 * 60 * 1000;

function reviewStateKey(userId: string, state: 'firstOpenAt' | 'requested') {
  return `${REVIEW_STATE_PREFIX}${state}:${userId}`;
}

/**
 * Solicita una única vez el diálogo oficial de valoración de App Store o
 * Google Play. La primera apertura autenticada inicia el plazo local; la
 * solicitud solo puede ocurrir al montar de nuevo la app pasadas 24 horas.
 *
 * La tienda decide finalmente si muestra el diálogo y no comunica si el
 * usuario lo ha enviado. Por eso guardamos el intento, no una valoración.
 */
export default function NativeStoreReviewPrompt() {
  const { session } = useAuth();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const userId = session?.user.id;
    if (!userId) return;

    const firstOpenAtKey = reviewStateKey(userId, 'firstOpenAt');
    const requestedKey = reviewStateKey(userId, 'requested');
    let cancelled = false;

    async function requestReviewWhenEligible() {
      try {
        const [[, storedFirstOpenAt], [, alreadyRequested]] = await AsyncStorage.multiGet([
          firstOpenAtKey,
          requestedKey,
        ]);

        if (cancelled || alreadyRequested) return;

        const firstOpenAt = Number(storedFirstOpenAt);
        if (!storedFirstOpenAt || !Number.isFinite(firstOpenAt)) {
          await AsyncStorage.setItem(firstOpenAtKey, String(Date.now()));
          return;
        }

        if (Date.now() - firstOpenAt < MINIMUM_INSTALL_AGE_MS) return;

        const available = await StoreReview.isAvailableAsync();
        if (cancelled || !available) return;

        // Se marca antes de invocar la API para impedir solicitudes duplicadas
        // si el componente se vuelve a montar mientras la tienda responde.
        await AsyncStorage.setItem(requestedKey, String(Date.now()));
        if (cancelled) return;

        await StoreReview.requestReview();
      } catch {
        // La valoración nunca debe interrumpir el arranque ni la navegación.
      }
    }

    void requestReviewWhenEligible();

    return () => {
      cancelled = true;
    };
  }, [session?.user.id]);

  return null;
}
