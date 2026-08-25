// Confirma bajo demanda una compra/restauración que el SDK de RevenueCat ya
// terminó. El usuario se deriva exclusivamente de su JWT de Supabase; la app no
// puede enviar ni su uid ni una fecha premium. El webhook sigue manteniendo el
// ciclo posterior de renovaciones, cancelaciones, reembolsos y expiraciones.
//
// Secret requerido:
//   supabase secrets set REVENUECAT_REST_API_KEY=<api-key-v1-de-RevenueCat>
// Despliegue:
//   supabase functions deploy sync-plus-subscription

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { activePlusExpirationFromRevenueCat } from '../_shared/revenuecat-subscription.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing_authorization' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: 'invalid_session' }, 401);

    const revenueCatKey = Deno.env.get('REVENUECAT_REST_API_KEY');
    if (!revenueCatKey) return json({ error: 'revenuecat_not_configured' }, 503);

    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      {
        headers: {
          Authorization: `Bearer ${revenueCatKey}`,
          'Content-Type': 'application/json',
        },
      },
    );
    if (!response.ok) {
      return json({ error: 'revenuecat_unavailable', status: response.status }, 502);
    }

    const premiumUntil = activePlusExpirationFromRevenueCat(await response.json());
    if (!premiumUntil) {
      // Este endpoint confirma altas; nunca revoca una concesión existente ante
      // una respuesta todavía propagándose o incompleta de RevenueCat.
      return json({ error: 'active_plus_not_found' }, 409);
    }

    const admin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: profile, error: updateError } = await admin
      .from('profiles')
      .update({ premium_until: premiumUntil, verified: true })
      .eq('id', user.id)
      .select('premium_until, verified')
      .single();
    if (updateError) return json({ error: 'profile_update_failed' }, 500);

    return json({
      premiumUntil: profile.premium_until,
      verified: profile.verified === true,
    }, 200);
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
