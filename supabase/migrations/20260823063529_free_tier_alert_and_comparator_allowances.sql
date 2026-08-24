-- Cupos gratuitos de QuéFalta Plus:
--   - una alerta personalizada por cuenta
--   - tres ejecuciones del radar de ahorro por cuenta
--
-- Los cupos solo se aplican cuando paywall_enabled() está encendido. Se
-- guardan en servidor para que no se reinicien al reinstalar o cambiar de
-- dispositivo. Plus continúa siendo ilimitado.

set lock_timeout = '5s';
set statement_timeout = '120s';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table if not exists private.free_tier_usage (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  comparator_searches_used smallint not null default 0
    check (comparator_searches_used between 0 and 3),
  updated_at timestamptz not null default now()
);

alter table private.free_tier_usage enable row level security;
revoke all on private.free_tier_usage from public, anon, authenticated;
grant all on private.free_tier_usage to service_role;

comment on table private.free_tier_usage is
  'Server-owned lifetime counters for free-tier Plus allowances.';

create or replace function private.claim_free_comparator_use()
returns table (allowed boolean, remaining smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  used smallint;
begin
  if caller is null and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;

  if caller is null
    or not public.paywall_enabled()
    or public.is_premium(caller) then
    return query select true, null::smallint;
    return;
  end if;

  insert into private.free_tier_usage (
    user_id,
    comparator_searches_used,
    updated_at
  ) values (
    caller,
    1,
    now()
  )
  on conflict (user_id) do update
    set comparator_searches_used = private.free_tier_usage.comparator_searches_used + 1,
        updated_at = now()
    where private.free_tier_usage.comparator_searches_used < 3
  returning comparator_searches_used into used;

  if used is null then
    return query select false, 0::smallint;
  else
    return query select true, (3 - used)::smallint;
  end if;
end
$$;

revoke all on function private.claim_free_comparator_use()
  from public, anon;
grant execute on function private.claim_free_comparator_use()
  to authenticated, service_role;

-- v6 devuelve metadatos del cupo aunque no haya coincidencias. La reserva del
-- uso y la consulta viven en la misma transacción: si la búsqueda falla, el
-- contador también revierte.
create or replace function public.catalog_cheaper_products_v6(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  entitlement record;
  matches jsonb;
begin
  select * into entitlement
  from private.claim_free_comparator_use();

  if not entitlement.allowed then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'results', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(result)), '[]'::jsonb)
    into matches
  from comparator_internal.catalog_cheaper_products_v5(
    p_source_store,
    p_source_product_id,
    p_stores
  ) result;

  return jsonb_build_object(
    'allowed', true,
    'remaining', entitlement.remaining,
    'results', matches
  );
end
$$;

revoke all on function public.catalog_cheaper_products_v6(text, text, text[])
  from public, anon;
grant execute on function public.catalog_cheaper_products_v6(text, text, text[])
  to authenticated, service_role;

-- Mantiene compatibles los clientes que aún usan v5 y evita que esa RPC
-- pública sirva como bypass. Cuando se agota el cupo, un cliente antiguo recibe
-- cero filas; el cliente nuevo usa v6 y abre el paywall explícitamente.
create or replace function public.catalog_cheaper_products_v5(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric,
  is_cheaper boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  entitlement record;
begin
  select * into entitlement
  from private.claim_free_comparator_use();

  if not entitlement.allowed then
    return;
  end if;

  return query
  select *
  from comparator_internal.catalog_cheaper_products_v5(
    p_source_store,
    p_source_product_id,
    p_stores
  );
end
$$;

revoke all on function public.catalog_cheaper_products_v5(text, text, text[])
  from public, anon;
grant execute on function public.catalog_cheaper_products_v5(text, text, text[])
  to authenticated, service_role;

-- En cuentas que tuvieron Plus y conservan varias reglas, la más recientemente
-- actualizada de las activas ocupa el único hueco gratuito. El resto se
-- conserva, pero queda pausado hasta recuperar Plus o eliminar reglas.
create or replace function price_alerts_internal.free_rule_id(p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.id
  from public.price_alert_rules r
  where r.user_id = p_user_id
  order by r.active desc, r.updated_at desc, r.created_at desc, r.id
  limit 1
$$;

revoke all on function price_alerts_internal.free_rule_id(uuid)
  from public, anon, authenticated;
grant execute on function price_alerts_internal.free_rule_id(uuid) to service_role;

create or replace function price_alerts_internal.normalize_rule()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  free_rule uuid;
begin
  if caller is not null then
    new.user_id := caller;
    if new.active
      and public.paywall_enabled()
      and not public.is_premium(caller) then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(caller::text, 0)
      );
      free_rule := price_alerts_internal.free_rule_id(caller);
      if (tg_op = 'INSERT' and free_rule is not null)
        or (tg_op = 'UPDATE' and free_rule is distinct from old.id) then
        raise exception 'free_price_alert_limit_reached';
      end if;
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.active_since := now();
  elsif new.active and not old.active then
    new.active_since := now();
  else
    new.active_since := coalesce(old.active_since, old.created_at);
  end if;

  new.label := btrim(new.label);
  new.query := nullif(regexp_replace(btrim(coalesce(new.query, '')), '\s+', ' ', 'g'), '');
  new.query_norm := case when new.query is null then null
    else lower(public.f_unaccent(new.query)) end;
  new.exact_store := nullif(btrim(coalesce(new.exact_store, '')), '');
  new.exact_product_id := nullif(btrim(coalesce(new.exact_product_id, '')), '');
  new.stores := array(
    select distinct s from unnest(coalesce(new.stores, '{}'::text[])) s
    where s = any(array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc','gadis',
      'froiz','ahorramas'
    ]) order by s
  );
  new.location_ids := coalesce(new.location_ids, '{}'::jsonb);
  if jsonb_typeof(new.location_ids) <> 'object' then
    new.location_ids := '{}'::jsonb;
  end if;

  if new.kind = 'exact' then
    if new.exact_store is null or not (new.exact_store = any(array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc','gadis',
      'froiz','ahorramas'
    ])) then
      raise exception 'invalid_alert_store';
    end if;
    new.stores := array[new.exact_store];
    new.query := null;
    new.query_norm := null;
  elsif new.kind = 'new_arrival' then
    new.query := null;
    new.query_norm := null;
    new.exact_store := null;
    new.exact_product_id := null;
    new.notify_price_drop := false;
    new.notify_new_offer := false;
    new.min_drop_pct := 0;
  else
    new.exact_store := null;
    new.exact_product_id := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;

revoke execute on function price_alerts_internal.normalize_rule()
  from public, anon, authenticated;
grant execute on function price_alerts_internal.normalize_rule() to service_role;

-- La vista previa forma parte de la creación de la alerta gratuita. Conserva
-- autenticación y validaciones, pero deja de exigir Plus.
create or replace function public.preview_price_alert(
  p_kind text,
  p_query text default null,
  p_stores text[] default '{}',
  p_exact_store text default null,
  p_exact_product_id text default null,
  p_region text default null,
  p_location_ids jsonb default '{}'::jsonb,
  p_limit integer default 12
)
returns table (
  store text, product_id text, display_name text, thumbnail text,
  category_name text, unit_price numeric, promo_name text, total_count bigint
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  needle text := lower(public.f_unaccent(regexp_replace(btrim(coalesce(p_query,'')), '\s+', ' ', 'g')));
  community text := price_alerts_internal.region_name(p_region);
begin
  if caller is null then raise exception 'authentication_required'; end if;
  if p_kind not in ('exact','keyword') then raise exception 'invalid_alert_kind'; end if;
  if p_kind = 'keyword' and char_length(needle) < 2 then raise exception 'query_too_short'; end if;

  return query
  select p.store, p.product_id, p.display_name, p.thumbnail, p.category_name,
         p.unit_price, p.promo_name, count(*) over()
  from price_alerts_internal.catalog_products p
  where p.published
    and (
      (p_kind = 'exact' and p.store = p_exact_store and p.product_id = p_exact_product_id)
      or
      (p_kind = 'keyword' and p.store = any(coalesce(p_stores, '{}'::text[]))
        and not exists (
          select 1 from unnest(string_to_array(needle, ' ')) token
          where token <> '' and p.display_name_norm not like '%' || token || '%'
        ))
    )
    and (community is null or p.regions is null or cardinality(p.regions) = 0 or community = any(p.regions))
    and (
      nullif(coalesce(p_location_ids, '{}'::jsonb) ->> p.store, '') is null
      or p.centers is null or cardinality(p.centers) = 0
      or (coalesce(p_location_ids, '{}'::jsonb) ->> p.store) = any(p.centers)
    )
  order by p.store, p.display_name_norm, p.product_id
  limit greatest(1, least(coalesce(p_limit, 12), 24));
end
$$;

revoke all on function public.preview_price_alert(text, text, text[], text, text, text, jsonb, integer)
  from public, anon;
grant execute on function public.preview_price_alert(text, text, text[], text, text, text, jsonb, integer)
  to authenticated, service_role;

create or replace function public.claim_price_alert_deliveries(p_limit integer default 200)
returns table (
  delivery_id uuid, user_id uuid, rule_id uuid, rule_label text,
  event_id uuid, batch_key text, event_type text, store text, product_id text,
  display_name text, thumbnail text, previous_price numeric, current_price numeric,
  price_delta_pct numeric, promo_name text, promo_price numeric
)
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.price_alert_deliveries
    set status = 'pending', claimed_at = null
    where status = 'processing' and claimed_at < now() - interval '15 minutes';

  insert into public.price_alert_deliveries (rule_id, user_id, event_id, status)
  select r.id, r.user_id, e.id,
         case
           when not public.paywall_enabled()
             or p.premium_until > now()
             or r.id = price_alerts_internal.free_rule_id(r.user_id)
           then 'pending'
           else 'paused'
         end
  from price_alerts_internal.catalog_events e
  join public.price_alert_rules r
    on r.active and e.detected_at >= greatest(r.created_at, r.active_since)
   and e.store = any(r.stores)
   and (
     (r.kind = 'new_arrival' and e.event_type = 'new_arrival')
     or
     (
       ((r.kind = 'exact' and r.exact_store = e.store and r.exact_product_id = e.product_id)
         or (r.kind = 'keyword' and not exists (
           select 1 from unnest(string_to_array(r.query_norm, ' ')) token
           where token <> '' and e.display_name_norm not like '%' || token || '%'
         )))
       and ((e.event_type = 'price_drop' and r.notify_price_drop
              and abs(coalesce(e.price_delta_pct, 0)) >= r.min_drop_pct)
         or (e.event_type = 'new_offer' and r.notify_new_offer))
     )
   )
  join public.profiles p on p.id = r.user_id
    and (
      price_alerts_internal.region_name(p.region) is null
      or e.regions is null or cardinality(e.regions) = 0
      or price_alerts_internal.region_name(p.region) = any(e.regions)
    )
  where e.detected_at >= now() - interval '90 days'
    and (
      (e.event_type = 'price_drop' and (
        (e.location_id is null and not (r.location_ids ? e.store))
        or e.location_id = r.location_ids ->> e.store
      ))
      or
      (e.event_type in ('new_offer', 'new_arrival') and (
        e.locations is null or cardinality(e.locations) = 0
        or not (r.location_ids ? e.store)
        or (r.location_ids ->> e.store) = any(e.locations)
      ))
    )
  on conflict on constraint price_alert_deliveries_rule_id_event_id_key do nothing;

  return query
  with picked_groups as (
    select d.rule_id, e.batch_key, min(d.created_at) as first_created
    from public.price_alert_deliveries d
    join price_alerts_internal.catalog_events e on e.id = d.event_id
    where (d.status = 'pending' or (d.status = 'failed' and coalesce(d.next_retry_at, now()) <= now()))
      and d.attempt_count < 5
    group by d.rule_id, e.batch_key
    order by min(d.created_at), d.rule_id, e.batch_key
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), picked as (
    select d.id
    from public.price_alert_deliveries d
    join price_alerts_internal.catalog_events e on e.id = d.event_id
    join picked_groups g on g.rule_id = d.rule_id and g.batch_key = e.batch_key
    where (d.status = 'pending' or (d.status = 'failed' and coalesce(d.next_retry_at, now()) <= now()))
      and d.attempt_count < 5
    for update of d skip locked
  ), claimed as (
    update public.price_alert_deliveries d
      set status = 'processing', claimed_at = now(), attempt_count = attempt_count + 1
    from picked where d.id = picked.id
    returning d.*
  )
  select c.id, c.user_id, c.rule_id, r.label, e.id, e.batch_key, e.event_type,
         e.store, e.product_id, e.display_name, e.thumbnail, e.previous_price,
         e.current_price, e.price_delta_pct, e.promo_name, e.promo_price
  from claimed c
  join public.price_alert_rules r on r.id = c.rule_id
  join price_alerts_internal.catalog_events e on e.id = c.event_id
  order by c.created_at, c.id;
end
$$;

revoke all on function public.claim_price_alert_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_price_alert_deliveries(integer) to service_role;
