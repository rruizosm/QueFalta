-- Reversión funcional de emergencia de la Fase 3.
--
-- Restaura la topología anterior de permisos y policies si el QA autenticado
-- detecta una regresión. Conserva los índices, search_path explícitos y la
-- optimización (select auth.uid()), que no cambian la semántica de acceso.
-- NO ejecutar salvo incidencia confirmada.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- Permisos directos anteriores de las funciones de trigger.
grant execute on function public.enforce_group_limit() to public, anon, authenticated;
grant execute on function public.friendships_rate_limit() to public, anon, authenticated;
grant execute on function public.handle_new_user() to public, anon, authenticated;

-- Policies colaborativas que antes estaban asignadas a PUBLIC.
alter policy "activity_log: insertar si eres miembro del grupo"
  on public.activity_log to public;
alter policy "activity_log: ver si eres miembro del grupo"
  on public.activity_log to public;
alter policy "group_members: ver si eres miembro"
  on public.group_members to public;
alter policy "groups: crear" on public.groups to public;
alter policy "groups: eliminar si eres creador" on public.groups to public;
alter policy "groups: ver si eres miembro" on public.groups to public;
alter policy "list_items: eliminar si tienes acceso a la lista"
  on public.list_items to public;
alter policy "list_items: añadir si tienes acceso a la lista"
  on public.list_items to public;
alter policy "list_items: editar si tienes acceso a la lista"
  on public.list_items to public;
alter policy "list_items: ver si tienes acceso a la lista"
  on public.list_items to public;
alter policy "profiles: actualizar propio" on public.profiles to public;
alter policy "shopping_lists: crear" on public.shopping_lists to public;
alter policy "shopping_lists: ver propias o del grupo"
  on public.shopping_lists to public;
alter policy "shopping_lists: editar si tienes acceso"
  on public.shopping_lists to public;
alter policy "shopping_lists: eliminar si eres creador"
  on public.shopping_lists to public;

-- Restaurar policies de miembros de grupo previas a la consolidación.
drop policy if exists "group_members insert: allowed membership" on public.group_members;
create policy "Users can join groups via invite"
  on public.group_members for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "group_members insert: admin adds"
  on public.group_members for insert to authenticated
  with check (
    public.is_group_admin(group_id)
    and public.is_discoverable(user_id)
  );
create policy "group_members: el creador del grupo puede añadir miembros"
  on public.group_members for insert to public
  with check (
    exists (
      select 1 from public.groups
      where groups.id = group_members.group_id
        and groups.created_by = (select auth.uid())
    )
  );

drop policy if exists "group_members delete: allowed removal" on public.group_members;
create policy "group_members delete: leave or admin removes"
  on public.group_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id)
  );
create policy "group_members: el creador puede eliminar miembros"
  on public.group_members for delete to public
  using (
    exists (
      select 1 from public.groups
      where groups.id = group_members.group_id
        and groups.created_by = (select auth.uid())
    )
  );

-- Restaurar policies de perfiles previas a la consolidación.
drop policy if exists "profiles select: visible" on public.profiles;
create policy "profiles select: own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles select: co-member"
  on public.profiles for select to authenticated
  using (public.shares_group_with(id));
create policy "profiles select: friendship"
  on public.profiles for select to authenticated
  using (public.has_friendship(id));
create policy "profiles select: discoverable"
  on public.profiles for select to authenticated
  using (discoverable = true);

-- Restaurar policies redundantes que existían antes de la Fase 3.
create policy "list_items delete: group members"
  on public.list_items for delete to authenticated
  using (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = list_items.list_id
        and public.is_group_member(sl.group_id)
    )
  );
create policy "profiles: edición propia"
  on public.profiles for update to public
  using ((select auth.uid()) = id);
create policy "shopping_lists: editar si eres creador"
  on public.shopping_lists for update to public
  using ((select auth.uid()) = created_by);

reset statement_timeout;
reset lock_timeout;
