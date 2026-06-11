/**
 * Suscripciones (RevenueCat) — Fase 3 de MONETIZACION.md.
 *
 * Degrada con elegancia: sin EXPO_PUBLIC_REVENUECAT_IOS_KEY en el entorno o
 * sin módulo nativo (Expo Go), todo devuelve null/false y PaywallModal cae al
 * comportamiento placeholder. El estado premium REAL lo escribe el webhook de
 * RevenueCat en profiles.premium_until (functions/revenuecat-webhook); aquí
 * solo se configura el SDK y se compra/restaura.
 */
import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

// require en try/catch: en Expo Go no existe el módulo nativo y un import
// normal rompería el bundle entero (mismo caso que push/Universal Links).
let Purchases: typeof import('react-native-purchases').default | null = null;
try {
  Purchases = require('react-native-purchases').default;
} catch {
  Purchases = null;
}

/** Identificador del entitlement de RevenueCat que representa QuéFalta Plus. */
export const PLUS_ENTITLEMENT = 'plus';

const API_KEY =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  }) ?? null;

let configured = false;

/** true si hay SDK nativo y API key (dev build con .env completo). */
export function purchasesAvailable(): boolean {
  return !!Purchases && !!API_KEY;
}

/** Configura el SDK con el uid de Supabase como appUserID — así los eventos
 *  del webhook traen el id de la fila de profiles a actualizar. Llamar al
 *  tener sesión (AuthContext); idempotente entre cambios de usuario. */
export async function configurePurchases(userId: string): Promise<void> {
  if (!Purchases || !API_KEY) return;
  try {
    if (!configured) {
      Purchases.configure({ apiKey: API_KEY, appUserID: userId });
      configured = true;
    } else {
      await Purchases.logIn(userId);
    }
  } catch {
    // Sin red o módulo a medias: la app sigue, solo sin compras reales.
  }
}

/** Desliga el dispositivo del usuario al cerrar sesión. */
export async function logOutPurchases(): Promise<void> {
  if (!Purchases || !configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Ya era anónimo: nada que hacer.
  }
}

export interface PlusOfferings {
  monthly: PurchasesPackage | null;
  annual: PurchasesPackage | null;
}

/** Paquetes mensual/anual de la offering actual de RevenueCat.
 *  null = nada montado todavía (o sin red) → PaywallModal usa el placeholder. */
export async function getPlusOfferings(): Promise<PlusOfferings | null> {
  if (!Purchases || !configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;
    return {
      monthly: current.monthly ?? null,
      annual: current.annual ?? null,
    };
  } catch {
    return null;
  }
}

/** Compra un paquete. true = el entitlement Plus quedó activo.
 *  La cancelación del usuario devuelve false (no es un error). */
export async function purchasePlus(pkg: PurchasesPackage): Promise<boolean> {
  if (!Purchases) return false;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return PLUS_ENTITLEMENT in customerInfo.entitlements.active;
  } catch (e: any) {
    if (e?.userCancelled) return false;
    throw e;
  }
}

/** Restaura compras previas (cambio de dispositivo). true = Plus activo. */
export async function restorePlus(): Promise<boolean> {
  if (!Purchases) return false;
  const info = await Purchases.restorePurchases();
  return PLUS_ENTITLEMENT in info.entitlements.active;
}

/** El webhook tarda unos segundos en escribir premium_until tras la compra:
 *  reintenta el refresh del perfil para que isPremium se encienda sin
 *  reabrir la app. Fire-and-forget. */
export function refreshProfileSoon(refresh: () => Promise<void>): void {
  for (const ms of [2000, 6000, 15000]) {
    setTimeout(() => {
      refresh().catch(() => {});
    }, ms);
  }
}
