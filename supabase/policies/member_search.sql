-- Añadir miembros buscando por @usuario.
--
-- 1. Perfiles "visibles" (discoverable = true) se pueden buscar/ver por cualquier
--    usuario autenticado (es justo el sentido del toggle "Visible para otros").
--    Aditiva a las policies existentes (ver tu propio perfil, co-miembros…).
-- 2. El administrador del grupo (owner) puede añadir a otros miembros.
--
-- Ejecutar en: Supabase → SQL Editor.

drop policy if exists "profiles select: discoverable" on public.profiles;
create policy "profiles select: discoverable"
on public.profiles for select to authenticated
using (discoverable = true);

drop policy if exists "group_members insert: admin adds" on public.group_members;
create policy "group_members insert: admin adds"
on public.group_members for insert to authenticated
with check (public.is_group_admin(group_id));
