// Edge Function: revenuecat-webhook
//
// Recibe los eventos de suscripción de RevenueCat y mantiene
// profiles.premium_until (fuente de verdad del acceso QuéFalta Plus) y su
// reflejo público profiles.verified (insignia dorada).
//
// Para suscripciones, premium_until = expiration_at_ms del evento. Para el
// producto vitalicio, RevenueCat envía una compra no renovable sin expiración y
// se persiste el sentinel máximo compartido con la confirmación bajo demanda.
// Eso cubre todo el ciclo:
//   - INITIAL_PURCHASE / RENEWAL / UNCANCELLATION → fecha futura → Plus activo.
//   - CANCELLATION solo apaga la auto-renovación: expiration sigue en el
//     futuro → el usuario conserva Plus hasta el final del periodo pagado.
//   - EXPIRATION llega con la fecha ya en pasado → free automáticamente.
//   - BILLING_ISSUE conserva la expiración del periodo de gracia.
// El UPDATE corre con service_role: el trigger profiles_protect_premium
// (profile_premium.sql) bloquea a anon/authenticated pero deja pasar esto.
//
// Configuración en RevenueCat → Project → Integrations → Webhooks:
//   URL:                  https://<proyecto>.supabase.co/functions/v1/revenuecat-webhook
//   Authorization header: el MISMO valor que el secret RC_WEBHOOK_TOKEN
//
// Despliegue:
//   supabase secrets set RC_WEBHOOK_TOKEN=<token aleatorio largo>
//   supabase functions deploy revenuecat-webhook --no-verify-jwt
// (--no-verify-jwt: RevenueCat no manda un JWT de Supabase; autenticamos
//  comparando la cabecera Authorization con el token secreto.)

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { LIFETIME_PREMIUM_UNTIL } from '../_shared/revenuecat-subscription.ts';

// Comparación en tiempo constante (patrón double-HMAC): no filtra ni el
// contenido ni la longitud del token por timing. Web Crypto va nativo en Deno.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const k = await crypto.subtle.importKey(
    'raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.sign('HMAC', k, enc.encode(a)),
    crypto.subtle.sign('HMAC', k, enc.encode(b)),
  ]);
  const da = new Uint8Array(ha);
  const db = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

// Tipos de evento que mueven la ventana de acceso. Los pagos únicos llegan como
// NON_RENEWING_PURCHASE y los reembolsos revertidos como REFUND_REVERSED; el
// resto (TEST, TRANSFER…) se ignora con 200 para evitar reintentos.
const RELEVANT = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'CANCELLATION',
  'UNCANCELLATION',
  'EXPIRATION',
  'BILLING_ISSUE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'NON_RENEWING_PURCHASE',
  'REFUND_REVERSED',
]);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const token = Deno.env.get('RC_WEBHOOK_TOKEN');
  const provided = req.headers.get('Authorization') ?? '';
  if (!token || !(await safeEqual(provided, token))) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const { event } = await req.json();
    const type: string = event?.type ?? '';
    const userId: string | null = event?.app_user_id ?? null;

    // appUserID = uid de Supabase (configurePurchases en lib/purchases.ts).
    // Los alias anónimos de RevenueCat no corresponden a ninguna fila.
    if (!userId || userId.startsWith('$RCAnonymousID')) {
      return json({ ignored: 'anonymous or missing app_user_id' }, 200);
    }
    if (!RELEVANT.has(type)) {
      return json({ ignored: type }, 200);
    }

    const expirationMs: number | null = event?.expiration_at_ms ?? null;
    const entitlementIds = Array.isArray(event?.entitlement_ids)
      ? event.entitlement_ids.filter((id: unknown): id is string => typeof id === 'string')
      : [];
    const isLifetimeGrantEvent = type === 'NON_RENEWING_PURCHASE' || type === 'REFUND_REVERSED';
    const relatesToPlus = entitlementIds.includes('plus') || event?.entitlement_id === 'plus';
    if (isLifetimeGrantEvent && !relatesToPlus) {
      return json({ ignored: 'non-plus non-renewing purchase' }, 200);
    }
    const grantsLifetime = isLifetimeGrantEvent
      && expirationMs == null
      && relatesToPlus;
    const premiumUntil = grantsLifetime
      ? LIFETIME_PREMIUM_UNTIL
      : expirationMs != null
        ? new Date(expirationMs).toISOString()
        : null;
    const verified = grantsLifetime || (expirationMs != null && expirationMs > Date.now());

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await admin
      .from('profiles')
      .update({ premium_until: premiumUntil, verified })
      .eq('id', userId);

    if (error) {
      // 500 → RevenueCat reintenta el evento más tarde.
      return json({ error: error.message }, 500);
    }

    return json({ success: true, type, premium_until: premiumUntil, verified }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
