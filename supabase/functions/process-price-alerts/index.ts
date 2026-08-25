// Procesador servidor de alertas personalizadas de QuéFalta Plus.
// Lo invoca pg_cron con un secreto dedicado. Reclama una outbox deduplicada,
// agrupa todos los eventos de una regla+sync y escribe primero la bandeja.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Evaluación controlada del 24-08-2026. Este despliegue no puede reclamar
// entregas de ninguna otra cuenta.
const EVALUATION_USER_ID = '8ab94ac7-e321-4162-8ccc-b6edd8dbe6a6';
type Lang = 'es' | 'ca';

interface Delivery {
  delivery_id: string; user_id: string; rule_id: string; rule_label: string;
  event_id: string; batch_key: string; event_type: 'price_drop' | 'new_offer' | 'new_arrival';
  store: string; product_id: string; display_name: string; thumbnail: string | null;
  previous_price: number | null; current_price: number | null;
  price_delta_pct: number | null; promo_name: string | null; promo_price: number | null;
}

const EVENT_PRIORITY: Record<Delivery['event_type'], number> = {
  price_drop: 1,
  new_offer: 2,
  new_arrival: 3,
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const normLang = (value: unknown): Lang => value === 'ca' ? 'ca' : 'es';

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object') {
    try {
      return JSON.stringify(cause);
    } catch {
      return 'Unknown object error';
    }
  }
  return String(cause);
}

function cleanRuleLabel(value: string): string {
  return value.replace(/^TEST\s+\d+\s*·\s*/iu, '').trim();
}

function ruleEmoji(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '🛒';
}

function pushTitle(emoji: string, label: string): string {
  return `${emoji} ${label}`.trim();
}

/** Un mismo producto puede generar bajada y oferta durante el mismo sync.
 *  Conservamos un solo resultado y la oferta prevalece sobre la bajada. */
function effectiveDeliveries(group: Delivery[]): Delivery[] {
  const products = new Map<string, Delivery>();
  for (const item of group) {
    const key = `${item.store}:${item.product_id}`;
    const current = products.get(key);
    if (!current || EVENT_PRIORITY[item.event_type] > EVENT_PRIORITY[current.event_type]) {
      products.set(key, item);
    }
  }
  return [...products.values()];
}

function render(group: Delivery[], lang: Lang, title: string): { title: string; body: string } {
  const first = group[0];
  const count = new Set(group.map((item) => `${item.store}:${item.product_id}`)).size;
  const hasDrops = group.some((item) => item.event_type === 'price_drop');
  const hasOffers = group.some((item) => item.event_type === 'new_offer');
  const hasNewArrivals = group.some((item) => item.event_type === 'new_arrival');
  const pct = first.price_delta_pct == null ? null : Math.abs(Number(first.price_delta_pct));
  if (lang === 'ca') {
    if (hasNewArrivals && count === 1) return { title, body: `${first.display_name} és una novetat al catàleg` };
    if (hasNewArrivals) return { title, body: `${count} productes nous han arribat al catàleg` };
    if (count === 1 && hasDrops && !hasOffers) return { title, body: pct == null ? `${first.display_name} ha baixat de preu` : `${first.display_name} ha baixat un ${pct.toFixed(1).replace('.', ',')}%` };
    if (count === 1 && hasOffers && !hasDrops) return { title, body: `${first.display_name} té una oferta nova` };
    if (hasDrops && hasOffers) return { title, body: `${count} productes tenen baixades o ofertes noves` };
    if (hasDrops) return { title, body: `${count} productes han baixat de preu` };
    return { title, body: `${count} productes tenen una oferta nova` };
  }
  if (hasNewArrivals && count === 1) return { title, body: `${first.display_name} es una novedad en el catálogo` };
  if (hasNewArrivals) return { title, body: `${count} productos nuevos han llegado al catálogo` };
  if (count === 1 && hasDrops && !hasOffers) return { title, body: pct == null ? `${first.display_name} ha bajado de precio` : `${first.display_name} ha bajado un ${pct.toFixed(1).replace('.', ',')}%` };
  if (count === 1 && hasOffers && !hasDrops) return { title, body: `${first.display_name} tiene una oferta nueva` };
  if (hasDrops && hasOffers) return { title, body: `${count} productos tienen bajadas u ofertas nuevas` };
  if (hasDrops) return { title, body: `${count} productos han bajado de precio` };
  return { title, body: `${count} productos tienen una oferta nueva` };
}

async function sendExpoPush(tokens: string[], content: { title: string; body: string; data: Record<string, unknown> }) {
  for (let offset = 0; offset < tokens.length; offset += 100) {
    const messages = tokens.slice(offset, offset + 100).map((to) => ({
      to, sound: 'default', channelId: 'default', priority: 'high', ...content,
    }));
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`Expo push failed: ${response.status} ${await response.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  // Durante el despliegue inicial se puede reutilizar el secreto interno del
  // worker de embeddings, que ya existe tanto en Edge Secrets como en Vault.
  // PROCESS_PRICE_ALERTS_SECRET toma precedencia en cuanto se configure uno
  // dedicado, sin exigir redesplegar la función.
  const expectedSecret = Deno.env.get('PROCESS_PRICE_ALERTS_SECRET')
    ?? Deno.env.get('EMBEDDING_WORKER_TOKEN');
  const providedSecret = req.headers.get('x-alert-secret')
    ?? req.headers.get('x-embedding-worker-token');
  if (!expectedSecret || providedSecret !== expectedSecret) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc('claim_price_alert_deliveries_for_user', {
    p_user_id: EVALUATION_USER_ID,
    p_limit: 200,
  });
  if (error) return json({ error: error.message }, 500);
  const deliveries = (data ?? []) as Delivery[];
  if (deliveries.length === 0) return json({ claimed: 0, groups: 0 });

  const groups = new Map<string, Delivery[]>();
  for (const delivery of deliveries) {
    const key = `${delivery.user_id}:${delivery.rule_id}:${delivery.batch_key}`;
    groups.set(key, [...(groups.get(key) ?? []), delivery]);
  }

  let sentGroups = 0;
  let failedGroups = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const deliveryIds = group.map((item) => item.delivery_id);
    try {
      const { data: ruleRow, error: ruleError } = await admin
        .from('price_alert_rules')
        .select('label, emoji')
        .eq('id', first.rule_id)
        .eq('user_id', first.user_id)
        .single();
      if (ruleError) throw ruleError;
      const label = cleanRuleLabel(ruleRow?.label ?? first.rule_label);
      const emoji = ruleEmoji(ruleRow?.emoji);
      const title = pushTitle(emoji, label);
      const { data: tokenRows, error: tokenError } = await admin.from('push_tokens').select('token, lang').eq('user_id', first.user_id);
      if (tokenError) throw tokenError;
      const effective = effectiveDeliveries(group);
      const localized = render(effective, normLang(tokenRows?.[0]?.lang), title);
      const structuredData = {
        type: 'price_alert', ruleId: first.rule_id, rule: label, emoji,
        count: effective.length,
        product: effective[0].display_name,
        eventTypes: [...new Set(effective.map((item) => item.event_type))],
      };
      const { data: notificationRows, error: inboxError } = await admin.rpc('create_price_alert_notification', {
        p_user_id: first.user_id, p_rule_id: first.rule_id, p_batch_key: first.batch_key,
        p_title: localized.title, p_body: localized.body, p_data: structuredData,
      });
      if (inboxError) throw inboxError;
      const notification = notificationRows?.[0] as { notification_id: string; created: boolean } | undefined;
      if (!notification?.notification_id) throw new Error('No se pudo crear la notificación agrupada');

      // Enlaza primero los eventos con la entrada de bandeja. De este modo, un
      // tap inmediato en el push ya puede resolver la lista exacta de productos.
      const { error: linkError } = await admin.from('price_alert_deliveries').update({
        notification_id: notification.notification_id,
      }).in('id', deliveryIds);
      if (linkError) throw linkError;

      // Un reintento recupera la misma entrada de bandeja y no vuelve a emitir
      // push: evita duplicados si el proceso cayó después del envío externo.
      if (notification.created) {
        const pushData = { ...structuredData, notificationId: notification.notification_id };
        const tokensByLang = new Map<Lang, string[]>();
        for (const row of tokenRows ?? []) {
          if (!row.token) continue;
          const lang = normLang(row.lang);
          tokensByLang.set(lang, [...(tokensByLang.get(lang) ?? []), row.token]);
        }
        for (const [lang, tokens] of tokensByLang) {
          await sendExpoPush(tokens, { ...render(effective, lang, title), data: pushData });
        }
      }

      const { error: deliveryError } = await admin.from('price_alert_deliveries').update({
        status: 'sent', sent_at: new Date().toISOString(),
        last_error: null, next_retry_at: null,
      }).in('id', deliveryIds);
      if (deliveryError) throw deliveryError;
      sentGroups += 1;
    } catch (cause) {
      const message = errorMessage(cause);
      await admin.from('price_alert_deliveries').update({
        status: 'failed', last_error: message.slice(0, 500),
        next_retry_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      }).in('id', deliveryIds);
      failedGroups += 1;
    }
  }
  return json({ claimed: deliveries.length, groups: groups.size, sentGroups, failedGroups });
});
