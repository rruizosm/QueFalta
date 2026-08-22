/**
 * Texto de un aviso de la bandeja en el idioma ACTUAL de la app.
 *
 * El servidor (send-push) guarda en cada fila los datos ESTRUCTURADOS del aviso
 * dentro de `data` (tipo + actor/product/more/group…), no solo el texto ya
 * traducido. Aquí los componemos con `t()` en cada render, de modo que el panel
 * sigue siempre el idioma elegido (y cambia al instante al cambiar de idioma).
 *
 * Las filas ANTIGUAS (creadas antes de este cambio) no traen `actor` en `data`:
 * para esas caemos al texto que guardó el servidor (`title`/`body`), tal cual.
 */
import type { InboxNotification } from '../context/NotificationsContext';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v : undefined;

export function renderNotification(
  n: InboxNotification,
  t: Translate,
): { title: string; body?: string } {
  const d = n.data ?? {};

  if (n.type === 'price_alert') {
    const rule = str(d.rule) || n.title;
    const product = str(d.product) || t('notifications.msg.aProduct');
    const count = typeof d.count === 'number' ? d.count : 1;
    const kinds = Array.isArray(d.eventTypes) ? d.eventTypes : [];
    const hasDrops = kinds.includes('price_drop');
    const hasOffers = kinds.includes('new_offer');
    const hasNewArrivals = kinds.includes('new_arrival');
    const body = count === 1
      ? t(hasNewArrivals ? 'notifications.msg.alertOneNew' : hasDrops && hasOffers ? 'notifications.msg.alertOneMixed' : hasDrops ? 'notifications.msg.alertOneDrop' : 'notifications.msg.alertOneOffer', { product })
      : t(hasNewArrivals ? 'notifications.msg.alertManyNew' : hasDrops && hasOffers ? 'notifications.msg.alertManyMixed' : hasDrops ? 'notifications.msg.alertManyDrop' : 'notifications.msg.alertManyOffer', { count });
    return { title: rule, body };
  }

  // Sin datos estructurados → texto del servidor (filas antiguas / 'general').
  if (d.actor === undefined) return { title: n.title, body: n.body };

  const actor = str(d.actor) || t('notifications.msg.someone');

  switch (n.type) {
    case 'friend':
      return {
        title: t('notifications.msg.friendTitle'),
        body: t('notifications.msg.friend', { actor }),
      };
    case 'cart': {
      const product = str(d.product) || t('notifications.msg.aProduct');
      const more = typeof d.more === 'number' ? d.more : 0;
      const body = more > 0
        ? t('notifications.msg.cartMore', { actor, product, more })
        : t('notifications.msg.cart', { actor, product });
      return { title: str(d.group) || n.title, body };
    }
    case 'group_invite': {
      const group = str(d.group) || n.title || t('notifications.msg.yourGroup');
      return { title: group, body: t('notifications.msg.invite', { actor, group }) };
    }
    default:
      return { title: n.title, body: n.body };
  }
}
