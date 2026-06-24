import { supabase } from '../lib/supabase';

/**
 * Dispara la Edge Function `send-push` para avisar a otros usuarios.
 *
 * Fire-and-forget: NUNCA lanza. La notificación es un extra; si falla (función
 * sin desplegar, sin red, destinatarios sin token…) la acción que la originó
 * (añadir al carrito, enviar solicitud…) no se ve afectada.
 *
 * El cliente solo manda IDs: el contenido y los destinatarios los deriva la
 * función en servidor a partir del JWT (ver supabase/functions/send-push).
 */
function notify(body: Record<string, unknown>): void {
  supabase.functions.invoke('send-push', { body }).catch(() => {});
}

/** "Ana añadió Leche" a los demás miembros del grupo de la lista. */
export function notifyCartItemAdded(listId: string, productName: string, count: number): void {
  notify({ event: 'cart_item', listId, productName, count });
}

/** "Ana te ha enviado una solicitud de amistad" al destinatario. */
export function notifyFriendRequest(addresseeId: string): void {
  notify({ event: 'friend_request', addresseeId });
}

/** "Ana te añadió al grupo Casa" al nuevo miembro. */
export function notifyGroupInvite(groupId: string, memberId: string): void {
  notify({ event: 'group_invite', groupId, memberId });
}
