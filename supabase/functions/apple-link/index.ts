// Edge Function: apple-link
//
// Tras un login nativo con "Iniciar sesión con Apple", la app envía aquí el
// `authorizationCode`. Esta función lo canjea (server-side, con la clave .p8)
// por un refresh_token de Apple y lo guarda en `apple_credentials`, para poder
// REVOCARLO cuando el usuario borre la cuenta (App Store 5.1.1(v)).
//
// Best-effort: si los secrets de Apple no están configurados, o Apple no da
// refresh_token, responde 200 sin guardar nada (no debe romper el login).
//
// Despliegue: supabase functions deploy apple-link

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { appleConfigured, exchangeAuthCodeForRefreshToken } from '../_shared/apple.ts';

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
    if (!authHeader) return json({ error: 'Missing Authorization header' }, 401);

    const { authorizationCode } = await req.json().catch(() => ({}));
    if (!authorizationCode || typeof authorizationCode !== 'string') {
      return json({ error: 'Missing authorizationCode' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

    // Resolver el usuario a partir de su JWT.
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Invalid session' }, 401);

    // Sin secrets de Apple no se puede canjear: no-op silencioso.
    if (!appleConfigured()) return json({ skipped: 'apple-not-configured' }, 200);

    const refreshToken = await exchangeAuthCodeForRefreshToken(authorizationCode);
    if (!refreshToken) return json({ skipped: 'no-refresh-token' }, 200);

    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { error: upsertErr } = await admin
      .from('apple_credentials')
      .upsert({ user_id: user.id, refresh_token: refreshToken, updated_at: new Date().toISOString() });
    if (upsertErr) return json({ error: `Store failed: ${upsertErr.message}` }, 500);

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
