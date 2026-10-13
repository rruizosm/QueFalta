-- Permite acotar las alertas de novedades con las mismas palabras normalizadas
-- que ya usan las alertas de bajadas y ofertas. query sigue siendo opcional
-- para conservar el comportamiento de las reglas de novedades existentes.

set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.price_alert_rules
  drop constraint price_alert_rules_check1,
  add constraint price_alert_rules_check1
    check (
      (kind = 'exact' and exact_store is not null and exact_product_id is not null)
      or
      (kind = 'keyword' and query is not null and char_length(btrim(query)) >= 2
        and cardinality(stores) > 0)
      or
      (kind = 'new_arrival'
        and (query is null or char_length(btrim(query)) >= 2)
        and exact_store is null and exact_product_id is null
        and cardinality(stores) > 0)
    );

create or replace function price_alerts_internal.keyword_tokens_match(
  p_query_norm text,
  p_display_name_norm text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_query_norm is null or not exists (
    select 1
    from unnest(string_to_array(p_query_norm, ' ')) token
    where token <> ''
      and coalesce(p_display_name_norm, '') not like '%' || token || '%'
  )
$$;

revoke all on function price_alerts_internal.keyword_tokens_match(text, text)
  from public, anon, authenticated;

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

  with suppressed_arrival_batches as materialized (
    select e.batch_key
    from price_alerts_internal.catalog_events e
    where e.event_type = 'new_arrival'
      and e.detected_at >= now() - interval '90 days'
    group by e.batch_key
    having count(*) > 400
  )
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
  join public.catalog_sync_status sync
    on sync.store = e.store and sync.synced_at >= e.detected_at
  join public.price_alert_rules r
    on r.active and e.detected_at >= greatest(r.created_at, r.active_since)
   and e.store = any(r.stores)
   and (
     (r.kind = 'new_arrival'
       and e.event_type = 'new_arrival'
       and price_alerts_internal.keyword_tokens_match(r.query_norm, e.display_name_norm))
     or
     (
       ((r.kind = 'exact' and r.exact_store = e.store and r.exact_product_id = e.product_id)
         or (r.kind = 'keyword'
           and price_alerts_internal.keyword_tokens_match(r.query_norm, e.display_name_norm)))
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
  left join suppressed_arrival_batches suppressed
    on suppressed.batch_key = e.batch_key and e.event_type = 'new_arrival'
  where e.detected_at >= now() - interval '90 days'
    and suppressed.batch_key is null
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

comment on function public.claim_price_alert_deliveries(integer) is
  'Materializa y reserva alertas tras cada sync; las novedades admiten palabras y se omiten llenados masivos.';

-- Mantiene coherente la RPC de evaluación acotada, aunque el cron activo usa
-- exclusivamente claim_price_alert_deliveries(integer).
create or replace function public.claim_price_alert_deliveries_for_user(
  p_user_id uuid,
  p_limit integer default 200
)
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
  if p_user_id is null then
    raise exception 'target_user_required';
  end if;

  update public.price_alert_deliveries d
    set status = 'pending', claimed_at = null
    where d.user_id = p_user_id
      and d.status = 'processing'
      and d.claimed_at < now() - interval '15 minutes';

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
    on r.user_id = p_user_id
   and r.active
   and e.detected_at >= greatest(r.created_at, r.active_since)
   and e.store = any(r.stores)
   and (
     (r.kind = 'new_arrival'
       and e.event_type = 'new_arrival'
       and price_alerts_internal.keyword_tokens_match(r.query_norm, e.display_name_norm))
     or
     (
       ((r.kind = 'exact' and r.exact_store = e.store and r.exact_product_id = e.product_id)
         or (r.kind = 'keyword'
           and price_alerts_internal.keyword_tokens_match(r.query_norm, e.display_name_norm)))
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
    where d.user_id = p_user_id
      and (d.status = 'pending'
        or (d.status = 'failed' and coalesce(d.next_retry_at, now()) <= now()))
      and d.attempt_count < 5
    group by d.rule_id, e.batch_key
    order by min(d.created_at), d.rule_id, e.batch_key
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), picked as (
    select d.id
    from public.price_alert_deliveries d
    join price_alerts_internal.catalog_events e on e.id = d.event_id
    join picked_groups g on g.rule_id = d.rule_id and g.batch_key = e.batch_key
    where d.user_id = p_user_id
      and (d.status = 'pending'
        or (d.status = 'failed' and coalesce(d.next_retry_at, now()) <= now()))
      and d.attempt_count < 5
    for update of d skip locked
  ), claimed as (
    update public.price_alert_deliveries d
      set status = 'processing', claimed_at = now(), attempt_count = attempt_count + 1
    from picked
    where d.id = picked.id and d.user_id = p_user_id
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

revoke all on function public.claim_price_alert_deliveries_for_user(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_price_alert_deliveries_for_user(uuid, integer)
  to service_role;

comment on function public.claim_price_alert_deliveries_for_user(uuid, integer) is
  'Reserva entregas de una cuenta para evaluación; las novedades admiten palabras.';
