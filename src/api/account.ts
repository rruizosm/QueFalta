import { supabase } from '../lib/supabase';

/**
 * Elimina la cuenta del usuario por completo.
 *
 * El borrado del usuario de Supabase Auth requiere la service-role key, que NO
 * puede vivir en el cliente. Por eso se delega en una Edge Function
 * (`delete-account`) que borra el perfil + datos y luego el usuario de Auth.
 *
 * Ver supabase/functions/delete-account/index.ts y la guía de despliegue en
 * PRIVACIDAD-SEGURIDAD.md.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });
  if (error) throw error;
  // La sesión queda invalidada al borrarse el usuario; limpiamos el cliente.
  await supabase.auth.signOut();
}

/**
 * Envía el authorizationCode del login nativo de Apple a la Edge Function
 * `apple-link`, que lo canjea por un refresh_token y lo guarda para poder
 * revocarlo al borrar la cuenta (App Store 5.1.1(v)).
 *
 * Best-effort: si falla (función sin desplegar, Apple sin configurar…), el
 * login no se ve afectado. Por eso NO se lanza el error al llamador.
 */
export async function linkAppleCredential(authorizationCode: string): Promise<void> {
  await supabase.functions.invoke('apple-link', { body: { authorizationCode } });
}
