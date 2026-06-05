-- Permitir borrar miembros de un grupo en dos casos:
--   1. Un usuario se borra a sí mismo  →  "Abandonar grupo".
--   2. El administrador del grupo (groups.created_by) borra a otros  →  "Eliminar miembro".
--
-- Se usa una función SECURITY DEFINER (is_group_admin) para comprobar quién es
-- el admin SIN disparar la RLS de group_members (evita recursión).
--
-- Ejecutar en: Supabase → SQL Editor.

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from groups
    where id = gid and created_by = auth.uid()
  );
$$;

drop policy if exists "group_members delete: leave or admin removes" on public.group_members;

create policy "group_members delete: leave or admin removes"
on public.group_members
for delete
to authenticated
using (
  user_id = auth.uid()                 -- abandonar (borrarte a ti mismo)
  or public.is_group_admin(group_id)   -- el admin elimina a otros
);
