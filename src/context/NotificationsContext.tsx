import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import type { PushData } from '../lib/notifications';

/** Un aviso en la bandeja del usuario (fila de la tabla `notifications`). */
export interface InboxNotification {
  /** id de la fila en Supabase. Único. */
  id: string;
  type: NonNullable<PushData['type']> | 'general';
  /** Texto renderizado en servidor (idioma del envío). Solo FALLBACK: el panel
   *  re-renderiza con `data` + el idioma actual (ver NotificationsSheet). */
  title: string;
  body?: string;
  /** Piezas para re-traducir en el cliente (actor, product, more, group…) +
   *  deep-link (type, groupId). Las guarda send-push. */
  data: Record<string, unknown>;
  /** epoch ms (de created_at). */
  createdAt: number;
  read: boolean;
}

interface NotificationsContextValue {
  items: InboxNotification[];
  unreadCount: number;
  /** Borra un aviso de la bandeja (en Supabase). */
  remove: (id: string) => void;
  /** Vacía la bandeja entera (en Supabase) y descarta lo presentado por el SO. */
  clearAll: () => void;
  /** Marca todos como leídos (al abrir el panel). */
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  items: [],
  unreadCount: 0,
  remove: () => {},
  clearAll: () => {},
  markAllRead: () => {},
});

const MAX_ITEMS = 50;

/** Convierte una fila de `notifications` en un item de la bandeja. */
function fromRow(r: {
  id: string;
  type: string | null;
  title: string | null;
  body: string | null;
  data: Record<string, unknown> | null;
  read: boolean | null;
  created_at: string;
}): InboxNotification {
  return {
    id: r.id,
    type: (r.type as InboxNotification['type']) || 'general',
    title: r.title?.trim() || 'Notificación',
    body: r.body?.trim() || undefined,
    data: r.data ?? {},
    createdAt: new Date(r.created_at).getTime(),
    read: !!r.read,
  };
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [items, setItems] = useState<InboxNotification[]>([]);

  // Carga la bandeja del usuario desde Supabase. La rellena el servidor
  // (send-push) por cada destinatario, así que aquí solo se lee/actualiza.
  const load = useCallback(async () => {
    if (!userId) { setItems([]); return; }
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, data, read, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_ITEMS);
    setItems((data ?? []).map(fromRow));
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  // Refresca la bandeja cuando la app vuelve a primer plano (capta lo entregado
  // en SEGUNDO PLANO) y cuando llega/se toca una notificación con la app abierta.
  // El proyecto no usa realtime de Supabase: refrescamos como el resto (refetch).
  useEffect(() => {
    if (!userId) return;
    const app = AppState.addEventListener('change', (s) => { if (s === 'active') load(); });
    const recv = Notifications.addNotificationReceivedListener(() => { load(); });
    const resp = Notifications.addNotificationResponseReceivedListener(() => { load(); });
    return () => { app.remove(); recv.remove(); resp.remove(); };
  }, [userId, load]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));   // optimista
    if (userId) {
      supabase.from('notifications').delete().eq('id', id).eq('user_id', userId).then(() => {});
    }
  }, [userId]);

  const clearAll = useCallback(() => {
    setItems([]);   // optimista
    if (userId) {
      supabase.from('notifications').delete().eq('user_id', userId).then(() => {});
    }
    // Vacía también el centro de notificaciones del SO.
    Notifications.dismissAllNotificationsAsync().catch(() => {});
  }, [userId]);

  const markAllRead = useCallback(() => {
    setItems((prev) => {
      if (prev.every((p) => p.read)) return prev;
      return prev.map((p) => (p.read ? p : { ...p, read: true }));
    });
    if (userId) {
      supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
        .then(() => {});
    }
  }, [userId]);

  const unreadCount = items.reduce((n, i) => (i.read ? n : n + 1), 0);

  return (
    <NotificationsContext.Provider value={{ items, unreadCount, remove, clearAll, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  return useContext(NotificationsContext);
}
