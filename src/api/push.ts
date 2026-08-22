import { supabase } from '../lib/supabase';

/**
 * Dispara la Edge Function `send-push` para avisar a otros usuarios.
 *
 * Best-effort: NUNCA lanza. La notificación es un extra; si falla (función sin
 * desplegar, sin red, destinatarios sin token…) la acción que la originó
 * (añadir al carrito, enviar solicitud…) no se ve afectada. Amistad espera a
 * que esta promesa termine; carrito/grupo la lanzan en segundo plano.
 *
 * El cliente solo manda IDs: el contenido y los destinatarios los deriva la
 * función en servidor a partir del JWT (ver supabase/functions/send-push).
 */
async function notify(body: Record<string, unknown>): Promise<void> {
  try {
    // Mantiene viva la invocacion hasta recibir respuesta de la Edge Function.
    // Los callers siguen tratandola como best-effort: un fallo de push nunca
    // deshace la accion principal que ya se guardo en Supabase.
    await supabase.functions.invoke('send-push', { body });
  } catch {
    // Sin red, funcion no desplegada o destinatario sin token: la app sigue.
  }
}

/** "Ana añadió Leche" a los demás miembros del grupo de la lista. */
export function notifyCartItemAdded(listId: string, productName: string, count: number): void {
  void notify({ event: 'cart_item', listId, productName, count });
}

/** "Ana te ha enviado una solicitud de amistad" al destinatario. */
export function notifyFriendRequest(friendshipId: string, addresseeId: string): Promise<void> {
  return notify({ event: 'friend_request', friendshipId, addresseeId });
}

/** "Ana te añadió al grupo Casa" al nuevo miembro. */
export function notifyGroupInvite(groupId: string, memberId: string): void {
  void notify({ event: 'group_invite', groupId, memberId });
}
