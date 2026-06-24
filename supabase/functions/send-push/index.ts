// Edge Function: send-push
//
// Envía notificaciones push (Expo Push API) ante tres eventos de la app:
//   - cart_item     → "Ana añadió Leche" a los demás miembros del grupo
//   - friend_request→ "Ana te ha enviado una solicitud de amistad"
//   - group_invite  → "Ana te añadió al grupo Casa"
//
// El cliente envía SOLO identificadores; el contenido (texto, destinatarios) se
// deriva aquí en servidor a partir del JWT del que llama, así no se puede
// falsear ni spamear. La tabla push_tokens se lee con la service-role key
// (salta RLS: un usuario no puede leer los tokens de otro).
//
// Best-effort: cualquier fallo responde sin romper la acción del cliente (la
// app la invoca con fire-and-forget).
//
// Despliegue: supabase functions deploy send-push

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Cooldown anti-saturación: tras enviar una notificación con `throttleKey`, no
 *  se vuelve a enviar de esa clave hasta pasados estos ms (ver push_throttle). */
const THROTTLE_MS = 5 * 60 * 1000; // 5 minutos

interface PushTarget {
  recipients: string[];           // user_ids a notificar (sin el actor)
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Si está, se aplica el cooldown anti-saturación bajo esta clave. */
  throttleKey?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const payload = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Resuelve al actor (quien dispara la notificación) desde su JWT.
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid session' }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const target = await buildTarget(admin, user.id, payload);
    if (!target) return json({ skipped: 'not-authorized-or-no-target' }, 200);

    // Anti-saturación: si esta clave está en cooldown, no se envía nada.
    if (target.throttleKey && (await inCooldown(admin, target.throttleKey))) {
      return json({ skipped: 'throttled' }, 200);
    }

    // Excluye al actor y duplicados.
    const recipients = [...new Set(target.recipients)].filter((id) => id && id !== user.id);
    if (recipients.length === 0) return json({ sent: 0 }, 200);

    const { data: rows } = await admin
      .from('push_tokens')
      .select('token')
      .in('user_id', recipients);

    const tokens = (rows ?? []).map((r: { token: string }) => r.token).filter(Boolean);
    if (tokens.length === 0) return json({ sent: 0 }, 200);

    const sent = await sendExpoPush(tokens, target);
    // Inicia el cooldown SOLO cuando se ha enviado de verdad.
    if (target.throttleKey) await touchCooldown(admin, target.throttleKey);
    return json({ sent }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

/** Deriva destinatarios + contenido y VALIDA que el actor puede disparar el evento. */
async function buildTarget(
  admin: SupabaseClient,
  actorId: string,
  payload: any,
): Promise<PushTarget | null> {
  const actorName = await displayName(admin, actorId);

  switch (payload?.event) {
    case 'cart_item': {
      const listId = String(payload.listId ?? '');
      if (!listId) return null;

      const { data: list } = await admin
        .from('shopping_lists')
        .select('group_id')
        .eq('id', listId)
        .maybeSingle();
      const groupId = list?.group_id;
      if (!groupId) return null; // lista personal: nadie más a quien avisar

      const members = await groupMemberIds(admin, groupId);
      if (!members.includes(actorId)) return null; // el actor no es del grupo

      const groupName = await groupName_(admin, groupId);
      const product = typeof payload.productName === 'string' ? payload.productName : 'un producto';
      const count = Number(payload.count) || 1;
      const extra = count > 1 ? ` y ${count - 1} más` : '';

      return {
        recipients: members,
        title: groupName,
        body: `${actorName} añadió ${product}${extra}`,
        data: { type: 'cart', groupId },
        // Cooldown por carrito: un solo aviso cada 5 min por grupo (no por
        // producto), aunque añadan varios miembros.
        throttleKey: `cart:${groupId}`,
      };
    }

    case 'friend_request': {
      const addresseeId = String(payload.addresseeId ?? '');
      if (!addresseeId) return null;

      // Debe existir la solicitud que dice haber enviado.
      const { data: fr } = await admin
        .from('friendships')
        .select('id')
        .eq('requester_id', actorId)
        .eq('addressee_id', addresseeId)
        .maybeSingle();
      if (!fr) return null;

      return {
        recipients: [addresseeId],
        title: 'Solicitud de amistad',
        body: `${actorName} te ha enviado una solicitud de amistad`,
        data: { type: 'friend' },
      };
    }

    case 'group_invite': {
      const groupId = String(payload.groupId ?? '');
      const memberId = String(payload.memberId ?? '');
      if (!groupId || !memberId) return null;

      const members = await groupMemberIds(admin, groupId);
      if (!members.includes(actorId)) return null;  // el actor debe ser del grupo
      if (!members.includes(memberId)) return null;  // el invitado debe haber entrado

      const groupName = await groupName_(admin, groupId);
      return {
        recipients: [memberId],
        title: groupName,
        body: `${actorName} te añadió al grupo ${groupName}`,
        data: { type: 'group_invite', groupId },
      };
    }

    default:
      return null;
  }
}

async function displayName(admin: SupabaseClient, userId: string): Promise<string> {
  const { data } = await admin.from('profiles').select('name').eq('id', userId).maybeSingle();
  return data?.name?.trim() || 'Alguien';
}

async function groupName_(admin: SupabaseClient, groupId: string): Promise<string> {
  const { data } = await admin.from('groups').select('name').eq('id', groupId).maybeSingle();
  return data?.name?.trim() || 'tu grupo';
}

async function groupMemberIds(admin: SupabaseClient, groupId: string): Promise<string[]> {
  const { data } = await admin.from('group_members').select('user_id').eq('group_id', groupId);
  return (data ?? []).map((m: { user_id: string }) => m.user_id);
}

/** ¿La clave envió hace menos de THROTTLE_MS? (anti-saturación) */
async function inCooldown(admin: SupabaseClient, key: string): Promise<boolean> {
  const { data } = await admin
    .from('push_throttle')
    .select('last_sent_at')
    .eq('key', key)
    .maybeSingle();
  if (!data?.last_sent_at) return false;
  return Date.now() - new Date(data.last_sent_at).getTime() < THROTTLE_MS;
}

/** Marca la clave como recién enviada (reinicia el cooldown). */
async function touchCooldown(admin: SupabaseClient, key: string): Promise<void> {
  await admin
    .from('push_throttle')
    .upsert({ key, last_sent_at: new Date().toISOString() }, { onConflict: 'key' });
}

/** Envía a la Expo Push API. Devuelve cuántos tokens se intentaron enviar. */
async function sendExpoPush(tokens: string[], target: PushTarget): Promise<number> {
  const message = {
    to: tokens,
    title: target.title,
    body: target.body,
    data: target.data,
    sound: 'default',
    channelId: 'default',
    priority: 'high',
  };

  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`Expo push failed: ${res.status} ${await res.text()}`);
  return tokens.length;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
