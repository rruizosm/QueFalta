-- Bandeja de notificaciones por usuario (inbox completo, server-side).
--
--   Antes la bandeja era LOCAL (AsyncStorage) y solo registraba lo que llegaba
--   con la app en primer plano o lo que el usuario tocaba → las notificaciones
--   entregadas en SEGUNDO PLANO no se contaban en la campana del Home.
--
--   Ahora la rellena la Edge Function `send-push` (service-role, salta RLS) con
--   UNA fila por destinatario, en el idioma de cada uno (ver push_tokens.lang),
--   a la vez que envía el push. La app la lee y la gestiona (marcar leído,
--   borrar una/todas) por RLS. Así el contador cuenta TODAS las notificaciones,
--   independientemente de cómo se entreguen, y es coherente entre dispositivos.
--
-- Aditiva. Ejecutar en: Supabase → SQL Editor.

create table if not exists public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  type       text        not null default 'general',  -- 'cart' | 'friend' | 'group_invite' | 'general'
  title      text        not null,
  body       text,
  data       jsonb       not null default '{}'::jsonb, -- payload de deep-link (type, groupId…)
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;

-- La bandeja se ordena/recorta por usuario y fecha.
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

-- Ver solo las mías.
drop policy if exists "notifications select: mine" on public.notifications;
create policy "notifications select: mine"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

-- Marcar como leídas solo las mías.
drop policy if exists "notifications update: mine" on public.notifications;
create policy "notifications update: mine"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Borrar solo las mías (una o todas).
drop policy if exists "notifications delete: mine" on public.notifications;
create policy "notifications delete: mine"
  on public.notifications for delete to authenticated
  using (auth.uid() = user_id);

-- El INSERT lo hace SOLO `send-push` con la service-role key (salta RLS); el
-- cliente nunca inserta → no hace falta policy de INSERT (RLS la bloquea).
