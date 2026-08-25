import { hasActivePremium } from '../constants/limits';

export const OPTIMISTIC_PREMIUM_CONFIRMATION_MS = 60_000;

export interface OptimisticPremiumConfirmation {
  expirationDate: string;
  keepUntil: number;
}

export function createOptimisticPremiumConfirmation(
  expirationDate: string,
  now = Date.now(),
): OptimisticPremiumConfirmation | null {
  if (!hasActivePremium(expirationDate, now)) return null;
  return {
    expirationDate,
    keepUntil: now + OPTIMISTIC_PREMIUM_CONFIRMATION_MS,
  };
}

/**
 * Evita que una lectura de Supabase anterior al webhook deshaga una compra que
 * RevenueCat ya ha validado. En cuanto el servidor devuelve cualquier Plus
 * activo, su fecha vuelve a ser la autoridad. Si no llega a confirmarse en un
 * minuto, también prevalece el servidor para no conservar acceso indefinido.
 */
export function reconcileOptimisticPremium<
  T extends { premiumUntil: string | null; verified: boolean },
>(
  serverProfile: T,
  pending: OptimisticPremiumConfirmation | null,
  now = Date.now(),
): { profile: T; pending: OptimisticPremiumConfirmation | null } {
  if (!pending || pending.keepUntil <= now || !hasActivePremium(pending.expirationDate, now)) {
    return { profile: serverProfile, pending: null };
  }

  if (hasActivePremium(serverProfile.premiumUntil, now)) {
    return { profile: serverProfile, pending: null };
  }

  return {
    profile: {
      ...serverProfile,
      premiumUntil: pending.expirationDate,
      verified: true,
    },
    pending,
  };
}
