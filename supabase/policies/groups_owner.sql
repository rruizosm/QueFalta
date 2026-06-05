-- Modelo de administración de grupos basado en owner_id.
--   created_by = quién creó el grupo (histórico, inmutable).
--   owner_id   = administrador actual (cambia al transferir la administración).
--
-- Idempotente: se puede re-ejecutar. Reemplaza versiones previas basadas en
-- created_by (group_members_delete.sql / group_admin_transfer.sql).
--
-- Ejecutar en: Supabase → SQL Editor.

-- 1. Columna owner_id (backfill desde created_by para grupos existentes).
alter table public.groups add column if not exists owner_id uuid;
update public.groups set owner_id = created_by where owner_id is null;

-- 2. is_group_admin: comprueba el admin actual SIN disparar la RLS de
--    group_members (SECURITY DEFINER evita recursión).
create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from groups where id = gid and owner_id = auth.uid()
  );
$$;

-- 3. El admin actual puede actualizar el grupo (incluido transferir owner_id).
drop policy if exists "groups update: admin" on public.groups;
create policy "groups update: admin"
on public.groups
for update
to authenticated
using (owner_id = auth.uid())
with check (true);

-- 4. Borrar miembros: abandonar (uno mismo) o el admin elimina a otros.
drop policy if exists "group_members delete: leave or admin removes" on public.group_members;
create policy "group_members delete: leave or admin removes"
on public.group_members
for delete
to authenticated
using (
  user_id = auth.uid()
  or public.is_group_admin(group_id)
);
