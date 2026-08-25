interface RevenueCatEntitlement {
  expires_date?: unknown;
  grace_period_expires_date?: unknown;
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

/** Extrae únicamente una expiración Plus todavía vigente de CustomerInfo v1. */
export function activePlusExpirationFromRevenueCat(
  payload: unknown,
  now = Date.now(),
): string | null {
  const root = payload as RevenueCatCustomerPayload | null;
  const subscriber = root?.subscriber ?? root?.value?.subscriber;
  const entitlement = subscriber?.entitlements?.plus;
  if (!entitlement) return null;

  const candidates = [
    futureIso(entitlement.expires_date, now),
    futureIso(entitlement.grace_period_expires_date, now),
  ].filter((value): value is string => value !== null);

  if (!candidates.length) return null;
  return candidates.reduce((latest, value) => (
    new Date(value).getTime() > new Date(latest).getTime() ? value : latest
  ));
}
