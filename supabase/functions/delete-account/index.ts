// Edge Function: delete-account
//
// Borra por completo la cuenta del usuario autenticado:
//   1. Identifica al usuario a partir de su JWT (cabecera Authorization).
//   2. Si entró con Apple, REVOCA su refresh_token en Apple (App Store 5.1.1(v):
//      borrar cuenta debe revocar los tokens del proveedor). Best-effort.
//   3. Borra su fila de `profiles` (las tablas dependientes deben tener
//      ON DELETE CASCADE sobre profiles/auth.users; apple_credentials cascada
//      desde auth.users).
//   4. Borra el usuario de Auth con la service-role key.
//
// Despliegue:
//   supabase functions deploy delete-account
// La service-role key se inyecta automáticamente como SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { appleConfigured, revokeAppleToken } from '../_shared/apple.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Missing Authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Cliente con el JWT del usuario, solo para resolver quién es.
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Invalid session' }, 401);
    }

    // Cliente admin (service role) para borrar perfil + usuario.
    const admin = createClient(supabaseUrl, serviceKey);

    // Revocar el token de Apple ANTES de borrar (lee apple_credentials, que
    // cascada al borrar el usuario). Best-effort: un fallo aquí NO impide el
    // borrado de la cuenta.
    try {
      if (appleConfigured()) {
        const { data: cred } = await admin
          .from('apple_credentials')
          .select('refresh_token')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cred?.refresh_token) {
          await revokeAppleToken(cred.refresh_token);
        }
      }
    } catch (_) {
      // Ignorado a propósito: no bloquear el borrado por un fallo de revocación.
    }

    const { error: profileErr } = await admin.from('profiles').delete().eq('id', user.id);
    if (profileErr) {
      return json({ error: `Profile delete failed: ${profileErr.message}` }, 500);
    }

    const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
    if (authErr) {
      return json({ error: `Auth delete failed: ${authErr.message}` }, 500);
    }

    return json({ success: true }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
