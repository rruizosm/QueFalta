-- Fase 3: endurecimiento de funciones y optimización conservadora de RLS.
--
-- Esta migración preserva la semántica de acceso existente. Consolida policies
-- permisivas equivalentes, evita reevaluar auth.uid() por cada fila y restringe
-- a usuarios autenticados las tablas colaborativas de la aplicación.

-- Evita esperas prolongadas en producción. La conexión de migración restaura
-- sus valores al terminar correctamente.
set lock_timeout = '5s';
set statement_timeout = '120s';

-- Preflight de deriva: aborta antes del primer DDL si el esquema ya no coincide
-- con el que se auditó el 2026-08-14. Así un cambio posterior no puede dejar una
-- consolidación de policies incompleta o con una semántica distinta.
do $preflight$
declare
  missing_functions text[];
  missing_policies text[];
begin
  select array_agg(signature order by signature)
  into missing_functions
  from unnest(array[
    'public.f_unaccent(text)',
    'public.similar_products(text,text[])',
    'public.catalog_has_all_words(text,text)',
    'public.catalog_family_match(text,text)',
    'public.catalog_clean_name(text)',
    'public.parse_eur(text)',
    'public.protect_premium_until()',
    'public.name_has_all_words(text,text)',
    'public.spike_similar(text,text[],real,integer)',
    'public.paywall_enabled()',
    'public.catalog_track_price_change()',
    'public.catalog_track_location_price_change()',
    'public.enforce_group_limit()',
    'public.friendships_rate_limit()',
    'public.handle_new_user()',
    'public.has_friendship(uuid)',
    'public.is_discoverable(uuid)',
    'public.is_group_admin(uuid)',
    'public.is_group_member(uuid)',
    'public.is_premium(uuid)',
    'public.shares_group_with(uuid)',
    'public.username_available(text)'
  ]) as expected(signature)
  where to_regprocedure(signature) is null;

  select array_agg(format('%I.%I', expected.table_name, expected.policy_name)
                   order by expected.table_name, expected.policy_name)
  into missing_policies
  from (values
    ('activity_log', 'activity_log: insertar si eres miembro del grupo'),
    ('activity_log', 'activity_log: ver si eres miembro del grupo'),
    ('favorites', 'favorites select: mine'),
    ('favorites', 'favorites insert: mine'),
    ('favorites', 'favorites delete: mine'),
    ('friendships', 'friendships select: mine'),
    ('friendships', 'friendships insert: requester'),
    ('friendships', 'friendships update: addressee'),
    ('friendships', 'friendships delete: either'),
    ('group_members', 'Users can join groups via invite'),
    ('group_members', 'group_members insert: admin adds'),
    ('group_members', 'group_members: el creador del grupo puede añadir miembros'),
    ('group_members', 'group_members delete: leave or admin removes'),
    ('group_members', 'group_members: el creador puede eliminar miembros'),
    ('group_members', 'group_members: ver si eres miembro'),
    ('groups', 'groups: crear'),
    ('groups', 'groups: eliminar si eres creador'),
    ('groups', 'groups: ver si eres miembro'),
    ('groups', 'groups update: admin'),
    ('list_items', 'list_items delete: group members'),
    ('list_items', 'list_items: eliminar si tienes acceso a la lista'),
    ('list_items', 'list_items: añadir si tienes acceso a la lista'),
    ('list_items', 'list_items: editar si tienes acceso a la lista'),
    ('list_items', 'list_items: ver si tienes acceso a la lista'),
    ('notifications', 'notifications select: mine'),
    ('notifications', 'notifications update: mine'),
    ('notifications', 'notifications delete: mine'),
    ('profiles', 'profiles select: co-member'),
    ('profiles', 'profiles select: discoverable'),
    ('profiles', 'profiles select: friendship'),
    ('profiles', 'profiles select: own'),
    ('profiles', 'profiles: edición propia'),
    ('profiles', 'profiles: actualizar propio'),
    ('purchases', 'purchases insert: group members'),
    ('purchases', 'purchases select: group members'),
    ('push_tokens', 'push_tokens select: mine'),
    ('push_tokens', 'push_tokens insert: mine'),
    ('push_tokens', 'push_tokens update: claim'),
    ('push_tokens', 'push_tokens delete: mine'),
    ('shopping_lists', 'shopping_lists: editar si eres creador'),
    ('shopping_lists', 'shopping_lists: crear'),
    ('shopping_lists', 'shopping_lists: ver propias o del grupo'),
    ('shopping_lists', 'shopping_lists: editar si tienes acceso'),
    ('shopping_lists', 'shopping_lists: eliminar si eres creador')
  ) as expected(table_name, policy_name)
  left join pg_policies p
    on p.schemaname = 'public'
   and p.tablename = expected.table_name
   and p.policyname = expected.policy_name
  where p.policyname is null;

  if missing_functions is not null or missing_policies is not null then
    raise exception 'phase_3_preflight_failed: missing functions=%, missing policies=%',
      coalesce(missing_functions, '{}'::text[]),
      coalesce(missing_policies, '{}'::text[]);
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Funciones: search_path explícito y mínimo privilegio de ejecución
-- ---------------------------------------------------------------------------

alter function public.f_unaccent(text)
  set search_path = pg_catalog, public, extensions;
alter function public.similar_products(text, text[])
  set search_path = pg_catalog, public, extensions;
alter function public.catalog_has_all_words(text, text)
  set search_path = pg_catalog, public, extensions;
alter function public.catalog_family_match(text, text)
  set search_path = pg_catalog, public, extensions;
alter function public.catalog_clean_name(text)
  set search_path = pg_catalog, public, extensions;
alter function public.parse_eur(text)
  set search_path = pg_catalog, public, extensions;
alter function public.protect_premium_until()
  set search_path = pg_catalog, public;
alter function public.name_has_all_words(text, text)
  set search_path = pg_catalog, public, extensions;
alter function public.spike_similar(text, text[], real, integer)
  set search_path = pg_catalog, public, extensions;
alter function public.paywall_enabled()
  set search_path = pg_catalog, public;
alter function public.catalog_track_price_change()
  set search_path = pg_catalog, public;
alter function public.catalog_track_location_price_change()
  set search_path = pg_catalog, public;

-- Los helpers SECURITY DEFINER resuelven primero funciones del sistema y luego
-- objetos de la aplicación. Todos usan nombres de tabla cualificados o viven en
-- policies controladas por este mismo proyecto.
alter function public.enforce_group_limit()
  set search_path = pg_catalog, public;
alter function public.friendships_rate_limit()
  set search_path = pg_catalog, public;
alter function public.handle_new_user()
  set search_path = pg_catalog, public;
alter function public.has_friendship(uuid)
  set search_path = pg_catalog, public;
alter function public.is_discoverable(uuid)
  set search_path = pg_catalog, public;
alter function public.is_group_admin(uuid)
  set search_path = pg_catalog, public;
alter function public.is_group_member(uuid)
  set search_path = pg_catalog, public;
alter function public.is_premium(uuid)
  set search_path = pg_catalog, public;
alter function public.shares_group_with(uuid)
  set search_path = pg_catalog, public;
alter function public.username_available(text)
  set search_path = pg_catalog, public;

-- Las funciones de trigger nunca deben ser RPC públicas. Los triggers pueden
-- seguir ejecutándolas aunque los roles cliente no tengan EXECUTE directo.
revoke execute on function public.enforce_group_limit() from public, anon, authenticated;
revoke execute on function public.friendships_rate_limit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.enforce_group_limit() to service_role;
grant execute on function public.friendships_rate_limit() to service_role;
grant execute on function public.handle_new_user() to service_role;

-- Estos helpers sí son necesarios para RLS de usuarios autenticados, pero no
-- deben quedar expuestos a llamadas anónimas por PostgREST.
revoke execute on function public.has_friendship(uuid) from public, anon;
revoke execute on function public.is_discoverable(uuid) from public, anon;
revoke execute on function public.is_group_admin(uuid) from public, anon;
revoke execute on function public.is_group_member(uuid) from public, anon;
revoke execute on function public.is_premium(uuid) from public, anon;
revoke execute on function public.shares_group_with(uuid) from public, anon;
grant execute on function public.has_friendship(uuid) to authenticated, service_role;
grant execute on function public.is_discoverable(uuid) to authenticated, service_role;
grant execute on function public.is_group_admin(uuid) to authenticated, service_role;
grant execute on function public.is_group_member(uuid) to authenticated, service_role;
grant execute on function public.is_premium(uuid) to authenticated, service_role;
grant execute on function public.shares_group_with(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. RLS: una policy por rol/operación y auth.uid() como initPlan
-- ---------------------------------------------------------------------------

alter policy "activity_log: insertar si eres miembro del grupo"
  on public.activity_log to authenticated
  with check (((select auth.uid()) = user_id) and public.is_group_member(group_id));
alter policy "activity_log: ver si eres miembro del grupo"
  on public.activity_log to authenticated
  using (public.is_group_member(group_id));

alter policy "favorites select: mine"
  on public.favorites
  using (user_id = (select auth.uid()));
alter policy "favorites insert: mine"
  on public.favorites
  with check (user_id = (select auth.uid()));
alter policy "favorites delete: mine"
  on public.favorites
  using (user_id = (select auth.uid()));

alter policy "friendships select: mine"
  on public.friendships
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));
alter policy "friendships insert: requester"
  on public.friendships
  with check (requester_id = (select auth.uid()));
alter policy "friendships update: addressee"
  on public.friendships
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()));
alter policy "friendships delete: either"
  on public.friendships
  using (requester_id = (select auth.uid()) or addressee_id = (select auth.uid()));

drop policy if exists "Users can join groups via invite" on public.group_members;
drop policy if exists "group_members insert: admin adds" on public.group_members;
drop policy if exists "group_members: el creador del grupo puede añadir miembros" on public.group_members;
create policy "group_members insert: allowed membership"
  on public.group_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or (public.is_group_admin(group_id) and public.is_discoverable(user_id))
    or exists (
      select 1 from public.groups
      where groups.id = group_members.group_id
        and groups.created_by = (select auth.uid())
    )
  );

drop policy if exists "group_members delete: leave or admin removes" on public.group_members;
drop policy if exists "group_members: el creador puede eliminar miembros" on public.group_members;
create policy "group_members delete: allowed removal"
  on public.group_members for delete to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_group_admin(group_id)
    or exists (
      select 1 from public.groups
      where groups.id = group_members.group_id
        and groups.created_by = (select auth.uid())
    )
  );

alter policy "group_members: ver si eres miembro"
  on public.group_members to authenticated
  using (public.is_group_member(group_id));

alter policy "groups: crear"
  on public.groups to authenticated
  with check ((select auth.uid()) = created_by);
alter policy "groups: eliminar si eres creador"
  on public.groups to authenticated
  using (owner_id = (select auth.uid()));
alter policy "groups: ver si eres miembro"
  on public.groups to authenticated
  using (owner_id = (select auth.uid()) or public.is_group_member(id));
alter policy "groups update: admin"
  on public.groups
  using (owner_id = (select auth.uid()))
  with check (true);

drop policy if exists "list_items delete: group members" on public.list_items;
alter policy "list_items: eliminar si tienes acceso a la lista"
  on public.list_items to authenticated
  using (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = list_items.list_id
        and (sl.created_by = (select auth.uid()) or public.is_group_member(sl.group_id))
    )
  );
alter policy "list_items: añadir si tienes acceso a la lista"
  on public.list_items to authenticated
  with check (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = list_items.list_id
        and (sl.created_by = (select auth.uid()) or public.is_group_member(sl.group_id))
    )
  );
alter policy "list_items: editar si tienes acceso a la lista"
  on public.list_items to authenticated
  using (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = list_items.list_id
        and (sl.created_by = (select auth.uid()) or public.is_group_member(sl.group_id))
    )
  );
alter policy "list_items: ver si tienes acceso a la lista"
  on public.list_items to authenticated
  using (
    exists (
      select 1 from public.shopping_lists sl
      where sl.id = list_items.list_id
        and (
          sl.created_by = (select auth.uid())
          or exists (
            select 1 from public.group_members gm
            where gm.group_id = sl.group_id
              and gm.user_id = (select auth.uid())
          )
        )
    )
  );

alter policy "notifications select: mine"
  on public.notifications
  using ((select auth.uid()) = user_id);
alter policy "notifications update: mine"
  on public.notifications
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "notifications delete: mine"
  on public.notifications
  using ((select auth.uid()) = user_id);

drop policy if exists "profiles select: co-member" on public.profiles;
drop policy if exists "profiles select: discoverable" on public.profiles;
drop policy if exists "profiles select: friendship" on public.profiles;
drop policy if exists "profiles select: own" on public.profiles;
create policy "profiles select: visible"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or discoverable = true
    or public.shares_group_with(id)
    or public.has_friendship(id)
  );

drop policy if exists "profiles: edición propia" on public.profiles;
alter policy "profiles: actualizar propio"
  on public.profiles to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "purchases insert: group members"
  on public.purchases
  with check (public.is_group_member(group_id) and completed_by = (select auth.uid()));
alter policy "purchases select: group members"
  on public.purchases
  using (public.is_group_member(group_id));

alter policy "push_tokens select: mine"
  on public.push_tokens
  using ((select auth.uid()) = user_id);
alter policy "push_tokens insert: mine"
  on public.push_tokens
  with check ((select auth.uid()) = user_id);
alter policy "push_tokens update: claim"
  on public.push_tokens
  using (true)
  with check ((select auth.uid()) = user_id);
alter policy "push_tokens delete: mine"
  on public.push_tokens
  using ((select auth.uid()) = user_id);

drop policy if exists "shopping_lists: editar si eres creador" on public.shopping_lists;
alter policy "shopping_lists: crear"
  on public.shopping_lists to authenticated
  with check (
    (select auth.uid()) = created_by
    and (group_id is null or public.is_group_member(group_id))
  );
alter policy "shopping_lists: ver propias o del grupo"
  on public.shopping_lists to authenticated
  using ((select auth.uid()) = created_by or public.is_group_member(group_id));
alter policy "shopping_lists: editar si tienes acceso"
  on public.shopping_lists to authenticated
  using ((select auth.uid()) = created_by or public.is_group_member(group_id));
alter policy "shopping_lists: eliminar si eres creador"
  on public.shopping_lists to authenticated
  using ((select auth.uid()) = created_by);

-- ---------------------------------------------------------------------------
-- 3. Índices que cubren claves foráneas detectadas por el advisor
-- ---------------------------------------------------------------------------

create index if not exists activity_log_user_id_idx
  on public.activity_log (user_id);
create index if not exists friendships_addressee_id_idx
  on public.friendships (addressee_id);
create index if not exists groups_created_by_idx
  on public.groups (created_by);
create index if not exists list_items_added_by_idx
  on public.list_items (added_by);
create index if not exists mercadona_categories_parent_id_idx
  on public.mercadona_categories (parent_id);
create index if not exists purchases_group_id_idx
  on public.purchases (group_id);

reset statement_timeout;
reset lock_timeout;
