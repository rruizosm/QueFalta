-- Verificación de la Fase 3. Solo lectura.
-- Ejecutar después de aplicar la migración y antes de promover a producción.

-- 1) Debe devolver 0: funciones objetivo sin search_path explícito.
select count(*) as mutable_search_path_functions
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any (array[
    'f_unaccent', 'similar_products', 'catalog_has_all_words',
    'catalog_family_match', 'catalog_clean_name', 'parse_eur',
    'protect_premium_until', 'name_has_all_words', 'spike_similar',
    'paywall_enabled', 'catalog_track_price_change',
    'catalog_track_location_price_change'
  ])
  and not exists (
    select 1
    from unnest(coalesce(p.proconfig, '{}'::text[])) as setting
    where setting like 'search_path=%'
  );

-- 2) Debe devolver 0: helpers SECURITY DEFINER ejecutables por anon.
select p.oid::regprocedure as anonymous_security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.proname = any (array[
    'enforce_group_limit', 'friendships_rate_limit', 'handle_new_user',
    'has_friendship', 'is_discoverable', 'is_group_admin',
    'is_group_member', 'is_premium', 'shares_group_with'
  ])
  and has_function_privilege('anon', p.oid, 'EXECUTE');

-- 3) Debe devolver 0: funciones de trigger invocables directamente por clientes.
select p.oid::regprocedure as client_executable_trigger_function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = any (array[
    'enforce_group_limit', 'friendships_rate_limit', 'handle_new_user'
  ])
  and (
    has_function_privilege('anon', p.oid, 'EXECUTE')
    or has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );

-- 4) Debe devolver 0: auth.uid() sin envolver en SELECT en las policies.
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'activity_log', 'favorites', 'friendships', 'group_members', 'groups',
    'list_items', 'notifications', 'profiles', 'purchases', 'push_tokens',
    'shopping_lists'
  ])
  and regexp_replace(
        coalesce(qual, '') || ' ' || coalesce(with_check, ''),
        '\(\s*select\s+auth\.uid\(\)(\s+as\s+uid)?\s*\)',
        '',
        'gi'
      ) ~ '(^|[^a-z_])auth\.uid\(\)';

-- 5) Debe devolver las seis relaciones esperadas.
select index_name, to_regclass(index_name) is not null as exists
from unnest(array[
  'public.activity_log_user_id_idx',
  'public.friendships_addressee_id_idx',
  'public.groups_created_by_idx',
  'public.list_items_added_by_idx',
  'public.mercadona_categories_parent_id_idx',
  'public.purchases_group_id_idx'
]) as expected(index_name);
