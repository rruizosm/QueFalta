/**
 * Suscripciones (RevenueCat) — Fase 3 de MONETIZACION.md.
 *
 * Degrada con elegancia: sin la clave RevenueCat de la plataforma en el entorno o
 * sin módulo nativo (Expo Go), todo devuelve null/false y PaywallModal cae al
 * comportamiento placeholder. El estado premium REAL lo escribe el webhook de
 * RevenueCat en profiles.premium_until. Tras una compra/restauración, una Edge
 * Function autenticada confirma el estado al instante; el webhook mantiene el
 * ciclo posterior de renovación, cancelación y expiración.
 */
import { Linking, Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import { supabase } from './supabase';

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

/** Entitlement Plus que RevenueCat ya ha validado contra la tienda. */
export interface ActivePlusEntitlement {
  expirationDate: string | null;
}

/** Estado necesario para representar y abrir la gestión de la suscripción.
 *  `none` permite distinguir un Plus de cortesía (solo en Supabase) de una
 *  suscripción real de tienda. `unavailable` evita confundir un fallo de red o
 *  Expo Go con ese caso. */
export type PlusSubscriptionManagement =
  | {
      kind: 'store';
      managementURL: string | null;
      productIdentifier: string;
      productPlanIdentifier: string | null;
      expirationDate: string | null;
      willRenew: boolean;
      periodType: string;
    }
  | { kind: 'none' }
  | { kind: 'unavailable' };

function activePlusEntitlement(
  info: import('react-native-purchases').CustomerInfo,
): ActivePlusEntitlement | null {
  const entitlement = info.entitlements.active[PLUS_ENTITLEMENT];
  return entitlement ? { expirationDate: entitlement.expirationDate } : null;
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

/** Compra un paquete. Devuelve el entitlement solo si quedó activo.
 *  La cancelación del usuario devuelve null (no es un error). */
export async function purchasePlus(pkg: PurchasesPackage): Promise<ActivePlusEntitlement | null> {
  if (!Purchases) return null;
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const entitlement = activePlusEntitlement(customerInfo);
    // Una compra que la tienda da por terminada pero no activa `plus` indica
    // un producto mal vinculado en RevenueCat. No debe parecer una cancelación
    // silenciosa ni mostrar la celebración.
    if (!entitlement) throw new Error('Purchase completed without active plus entitlement');
    return entitlement;
  } catch (e: any) {
    if (e?.userCancelled) return null;
    throw e;
  }
}

/** Restaura compras previas (cambio de dispositivo). */
export async function restorePlus(): Promise<ActivePlusEntitlement | null> {
  if (!Purchases) return null;
  const info = await Purchases.restorePurchases();
  return activePlusEntitlement(info);
}

/**
 * Pide al servidor que consulte directamente a RevenueCat para el uid derivado
 * de la sesión. La fecha nunca procede del cliente, por lo que esta ruta puede
 * persistir premium_until con seguridad antes de que llegue el webhook.
 */
export async function confirmPlusSubscription(): Promise<ActivePlusEntitlement> {
  const { data, error } = await supabase.functions.invoke('sync-plus-subscription', {
    method: 'POST',
  });
  if (error) throw error;

  const expirationDate = typeof data?.premiumUntil === 'string'
    ? data.premiumUntil
    : null;
  const expirationTime = expirationDate ? new Date(expirationDate).getTime() : NaN;
  if (!Number.isFinite(expirationTime) || expirationTime <= Date.now()) {
    throw new Error('Server did not confirm an active Plus entitlement');
  }
  return { expirationDate };
}

/** Consulta RevenueCat para saber si el Plus activo procede de App Store o
 *  Google Play. CustomerInfo se sirve también desde caché, por lo que abrir
 *  Perfil no depende siempre de una petición de red. */
export async function getPlusSubscriptionManagement(): Promise<PlusSubscriptionManagement> {
  if (!Purchases || !configured) return { kind: 'unavailable' };
  try {
    const info = await Purchases.getCustomerInfo();
    const entitlement = info.entitlements.active[PLUS_ENTITLEMENT];
    if (!entitlement) return { kind: 'none' };
    return {
      kind: 'store',
      managementURL: info.managementURL,
      productIdentifier: entitlement.productIdentifier,
      productPlanIdentifier: entitlement.productPlanIdentifier,
      expirationDate: entitlement.expirationDate,
      willRenew: entitlement.willRenew,
      periodType: entitlement.periodType,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

/** Abre la gestión oficial de la tienda. RevenueCat suele entregar la URL
 *  exacta; los destinos genéricos cubren una caché antigua o un fallo puntual
 *  de CustomerInfo sin construir una pantalla de cancelación propia. */
export async function openPlusSubscriptionManagement(
  managementURL: string | null,
): Promise<boolean> {
  if (managementURL) {
    await Linking.openURL(managementURL);
    return true;
  }

  if (Platform.OS === 'ios' && Purchases && configured) {
    try {
      await Purchases.showManageSubscriptions();
      return true;
    } catch {
      // Continúa con la página general de suscripciones de Apple.
    }
  }

  const fallbackURL = Platform.select({
    ios: 'https://apps.apple.com/account/subscriptions',
    android: 'https://play.google.com/store/account/subscriptions?package=com.quefalta.app',
  });
  if (!fallbackURL) return false;
  await Linking.openURL(fallbackURL);
  return true;
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
