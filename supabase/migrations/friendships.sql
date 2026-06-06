-- Sistema de amigos (solicitud + aceptación).
--   requester_id → quien envía la solicitud
--   addressee_id → quien la recibe
--   status       → 'pending' | 'accepted'
--
-- Ejecutar en: Supabase → SQL Editor.

create table if not exists public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       text not null default 'pending',
  created_at   timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;

-- Helper SECURITY DEFINER: ¿tengo alguna relación (pendiente o aceptada) con `other`?
create or replace function public.has_friendship(other uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists (
    select 1 from friendships f
    where (f.requester_id = auth.uid() and f.addressee_id = other)
       or (f.addressee_id = auth.uid() and f.requester_id = other)
  );
$$;

-- Ver mis relaciones (como emisor o receptor).
drop policy if exists "friendships select: mine" on public.friendships;
create policy "friendships select: mine"
on public.friendships for select to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Enviar solicitud (yo soy el emisor).
drop policy if exists "friendships insert: requester" on public.friendships;
create policy "friendships insert: requester"
on public.friendships for insert to authenticated
with check (requester_id = auth.uid());

-- Aceptar: el receptor actualiza su solicitud.
drop policy if exists "friendships update: addressee" on public.friendships;
create policy "friendships update: addressee"
on public.friendships for update to authenticated
using (addressee_id = auth.uid()) with check (addressee_id = auth.uid());

-- Rechazar / cancelar / eliminar amistad: cualquiera de los dos.
drop policy if exists "friendships delete: either" on public.friendships;
create policy "friendships delete: either"
on public.friendships for delete to authenticated
using (requester_id = auth.uid() or addressee_id = auth.uid());

-- Ver el perfil de personas con las que tengo relación (aunque no sean visibles),
-- para poder mostrar nombre/avatar en amigos y solicitudes.
drop policy if exists "profiles select: friendship" on public.profiles;
create policy "profiles select: friendship"
on public.profiles for select to authenticated
using (public.has_friendship(id));
