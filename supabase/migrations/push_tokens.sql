-- Push tokens (Fase 2 de NOTIFICACIONES.md).
--   Un dispositivo = un Expo push token. Un usuario puede tener varios
--   dispositivos → varias filas. El token es ÚNICO globalmente: si el mismo
--   dispositivo cambia de cuenta, la fila se reasigna al nuevo user_id (la app
--   hace upsert on conflict(token)).
--
-- La tabla la LEE la Edge Function `send-push` con la service-role key (salta
-- RLS) para resolver a quién enviar; el cliente solo gestiona sus propias filas.
--
-- Ejecutar en: Supabase → SQL Editor.

create table if not exists public.push_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles(id) on delete cascade,
  token      text        not null unique,
  platform   text,                                    -- 'ios' | 'android'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_tokens enable row level security;

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

-- Ver solo los míos.
drop policy if exists "push_tokens select: mine" on public.push_tokens;
create policy "push_tokens select: mine"
  on public.push_tokens for select to authenticated
  using (auth.uid() = user_id);

-- Registrar un token mío.
drop policy if exists "push_tokens insert: mine" on public.push_tokens;
create policy "push_tokens insert: mine"
  on public.push_tokens for insert to authenticated
  with check (auth.uid() = user_id);

-- Reclamar un token (p. ej. el mismo dispositivo cambia de cuenta): cualquier
-- usuario puede actualizar la fila de un token SIEMPRE que lo deje a su nombre.
drop policy if exists "push_tokens update: claim" on public.push_tokens;
create policy "push_tokens update: claim"
  on public.push_tokens for update to authenticated
  using (true) with check (auth.uid() = user_id);

-- Borrar solo los míos (logout).
drop policy if exists "push_tokens delete: mine" on public.push_tokens;
create policy "push_tokens delete: mine"
  on public.push_tokens for delete to authenticated
  using (auth.uid() = user_id);


-- ── Anti-saturación: límite de frecuencia por clave ───────────────────────────
-- Para no bombardear: tras enviar una notificación de carrito, ese carrito entra
-- en cooldown (5 min). La clave del carrito es `cart:<group_id>`. La tabla la
-- gestiona SOLO la Edge Function `send-push` (service-role, salta RLS); RLS
-- activada SIN policies → el cliente no puede tocarla.

create table if not exists public.push_throttle (
  key          text        primary key,
  last_sent_at timestamptz not null default now()
);

alter table public.push_throttle enable row level security;
