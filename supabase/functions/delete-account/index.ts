// Edge Function: delete-account
//
// Borra por completo la cuenta del usuario autenticado:
//   1. Identifica al usuario a partir de su JWT (cabecera Authorization).
//   2. Borra su fila de `profiles` (las tablas dependientes deben tener
//      ON DELETE CASCADE sobre profiles/auth.users).
//   3. Borra el usuario de Auth con la service-role key.
//
// Despliegue:
//   supabase functions deploy delete-account
// La service-role key se inyecta automáticamente como SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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
