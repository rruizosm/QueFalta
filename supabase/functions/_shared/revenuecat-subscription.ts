interface RevenueCatEntitlement {
  expires_date?: unknown;
  grace_period_expires_date?: unknown;
  purchase_date?: unknown;
  refunded_at?: unknown;
}

interface RevenueCatSubscriber {
  entitlements?: Record<string, RevenueCatEntitlement>;
}

interface RevenueCatCustomerPayload {
  subscriber?: RevenueCatSubscriber;
  value?: { subscriber?: RevenueCatSubscriber };
}

function futureIso(value: unknown, now: number): string | null {
  if (typeof value !== 'string') return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time > now ? new Date(time).toISOString() : null;
}

/** Sentinel persistible para un entitlement sin caducidad. PostgreSQL acepta
 * el año 9999 y el cliente actual mantiene así su gate temporal sin otro campo. */
export const LIFETIME_PREMIUM_UNTIL = '9999-12-31T23:59:59.999Z';

/** Extrae únicamente una expiración Plus todavía vigente de CustomerInfo v1. */
export function activePlusExpirationFromRevenueCat(
  payload: unknown,
  now = Date.now(),
): string | null {
  const root = payload as RevenueCatCustomerPayload | null;
  const subscriber = root?.subscriber ?? root?.value?.subscriber;
  const entitlement = subscriber?.entitlements?.plus;
  if (!entitlement) return null;

  // CustomerInfo v1 incluye también entitlements caducados. Un acceso vitalicio
  // válido tiene expires_date=null, fecha de compra y no consta reembolsado.
  if (
    entitlement.expires_date === null
    && typeof entitlement.purchase_date === 'string'
    && entitlement.refunded_at == null
  ) {
    return LIFETIME_PREMIUM_UNTIL;
  }

  const candidates = [
    futureIso(entitlement.expires_date, now),
    futureIso(entitlement.grace_period_expires_date, now),
  ].filter((value): value is string => value !== null);

  if (!candidates.length) return null;
  return candidates.reduce((latest, value) => (
    new Date(value).getTime() > new Date(latest).getTime() ? value : latest
  ));
}
