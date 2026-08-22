-- Alertas exclusivas para productos recién incorporados al catálogo.

set lock_timeout = '5s';
set statement_timeout = '120s';

alter table public.price_alert_rules
  drop constraint price_alert_rules_kind_check,
  drop constraint price_alert_rules_check,
  drop constraint price_alert_rules_check1;

alter table public.price_alert_rules
  add constraint price_alert_rules_kind_check
    check (kind in ('exact', 'keyword', 'new_arrival')),
  add constraint price_alert_rules_check
    check (
      (kind = 'new_arrival' and not notify_price_drop and not notify_new_offer
        and min_drop_pct = 0)
      or
      (kind in ('exact', 'keyword') and (notify_price_drop or notify_new_offer))
    ),
  add constraint price_alert_rules_check1
    check (
      (kind = 'exact' and exact_store is not null and exact_product_id is not null)
      or
      (kind = 'keyword' and query is not null and char_length(btrim(query)) >= 2
        and cardinality(stores) > 0)
      or
      (kind = 'new_arrival' and query is null and query_norm is null
        and exact_store is null and exact_product_id is null
        and cardinality(stores) > 0)
    );

alter table price_alerts_internal.catalog_events
  drop constraint catalog_events_event_type_check,
  add constraint catalog_events_event_type_check
    check (event_type in ('price_drop', 'new_offer', 'new_arrival'));

create or replace function price_alerts_internal.normalize_rule()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is not null then
    new.user_id := caller;
    if new.active and not public.is_premium(caller) then
      raise exception 'plus_required_for_price_alerts';
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

create or replace function price_alerts_internal.capture_catalog_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  store_key text := price_alerts_internal.store_for_table(tg_table_name);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  new_row jsonb := to_jsonb(new);
  product_name text := coalesce(nullif(new_row ->> 'display_name', ''), new_row ->> 'id');
  product_name_norm text;
  old_price numeric;
  new_price numeric;
  old_offer text;
  new_offer text;
  current_promo_price numeric;
  sync_time timestamptz;
  event_batch text;
  delta numeric;
begin
  if store_key is null or product_name is null then return new; end if;
  product_name_norm := lower(public.f_unaccent(product_name));
  new_price := nullif(new_row ->> 'unit_price', '')::numeric;
  new_offer := price_alerts_internal.offer_name(new_row);
  current_promo_price := price_alerts_internal.offer_price(new_row);
  sync_time := coalesce(nullif(new_row ->> 'synced_at', '')::timestamptz, now());
  event_batch := store_key || ':' || to_char(
    sync_time at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US'
  );

  insert into price_alerts_internal.catalog_products (
    store, product_id, display_name, display_name_norm, thumbnail, category_name,
    unit_price, promo_name, promo_price, published, regions, centers, updated_at
  ) values (
    store_key, new_row ->> 'id', product_name, product_name_norm,
    nullif(new_row ->> 'thumbnail', ''), nullif(new_row ->> 'category_name', ''),
    new_price, new_offer, current_promo_price,
    coalesce(nullif(new_row ->> 'published', '')::boolean, true),
    price_alerts_internal.text_array(new_row, 'regions'),
    price_alerts_internal.text_array(new_row, 'centers'), sync_time
  )
  on conflict (store, product_id) do update set
    display_name = excluded.display_name,
    display_name_norm = excluded.display_name_norm,
    thumbnail = excluded.thumbnail,
    category_name = excluded.category_name,
    unit_price = excluded.unit_price,
    promo_name = excluded.promo_name,
    promo_price = excluded.promo_price,
    published = excluded.published,
    regions = excluded.regions,
    centers = excluded.centers,
    updated_at = excluded.updated_at;

  if tg_op = 'INSERT' then
    if coalesce(nullif(new_row ->> 'published', '')::boolean, true) then
      insert into price_alerts_internal.catalog_events (
        event_fingerprint, batch_key, event_type, store, product_id, display_name,
        display_name_norm, thumbnail, category_name, current_price, promo_name,
        promo_price, locations, regions, detected_at
      ) values (
        md5(concat_ws('|', store_key, new_row ->> 'id', 'new_arrival', event_batch)),
        event_batch, 'new_arrival', store_key, new_row ->> 'id', product_name,
        product_name_norm, nullif(new_row ->> 'thumbnail', ''),
        nullif(new_row ->> 'category_name', ''), new_price, new_offer,
        current_promo_price, price_alerts_internal.text_array(new_row, 'centers'),
        price_alerts_internal.text_array(new_row, 'regions'), sync_time
      ) on conflict (event_fingerprint) do nothing;
    end if;
    return new;
  end if;

  old_price := nullif(old_row ->> 'unit_price', '')::numeric;
  if old_price is not null and old_price > 0 and new_price is not null and new_price < old_price then
    delta := round((new_price - old_price) / old_price * 100, 2);
    insert into price_alerts_internal.catalog_events (
      event_fingerprint, batch_key, event_type, store, product_id, display_name,
      display_name_norm, thumbnail, category_name, previous_price, current_price,
      price_delta_pct, promo_name, promo_price, regions, detected_at
    ) values (
      md5(concat_ws('|', store_key, new_row ->> 'id', 'price_drop', event_batch, old_price, new_price)),
      event_batch, 'price_drop', store_key, new_row ->> 'id', product_name,
      product_name_norm, nullif(new_row ->> 'thumbnail', ''),
      nullif(new_row ->> 'category_name', ''), old_price, new_price, delta,
      new_offer, current_promo_price, price_alerts_internal.text_array(new_row, 'regions'), sync_time
    ) on conflict (event_fingerprint) do nothing;
  end if;

  old_offer := price_alerts_internal.offer_name(old_row);
  if new_offer is not null
     and (old_offer is null or concat_ws('|', old_offer, price_alerts_internal.offer_price(old_row),
          old_row -> 'offer_zones', old_row -> 'offer_centers', old_row -> 'offer_regions')
       is distinct from concat_ws('|', new_offer, current_promo_price,
          new_row -> 'offer_zones', new_row -> 'offer_centers', new_row -> 'offer_regions')) then
    insert into price_alerts_internal.catalog_events (
      event_fingerprint, batch_key, event_type, store, product_id, display_name,
      display_name_norm, thumbnail, category_name, current_price, promo_name,
      promo_price, locations, regions, detected_at
    ) values (
      md5(concat_ws('|', store_key, new_row ->> 'id', 'new_offer', event_batch,
        new_offer, current_promo_price, new_row -> 'offer_zones',
        new_row -> 'offer_centers', new_row -> 'offer_regions')),
      event_batch, 'new_offer', store_key, new_row ->> 'id', product_name,
      product_name_norm, nullif(new_row ->> 'thumbnail', ''),
      nullif(new_row ->> 'category_name', ''), new_price, new_offer,
      current_promo_price,
      coalesce(
        price_alerts_internal.text_array(new_row, 'offer_zones'),
        price_alerts_internal.text_array(new_row, 'offer_centers')
      ),
      coalesce(
        price_alerts_internal.text_array(new_row, 'offer_regions'),
        price_alerts_internal.text_array(new_row, 'regions')
      ), sync_time
    ) on conflict (event_fingerprint) do nothing;
  end if;
  return new;
exception when invalid_text_representation then
  return new;
end
$$;

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
         case when p.premium_until > now() then 'pending' else 'paused' end
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

revoke execute on function price_alerts_internal.normalize_rule()
  from public, anon, authenticated;
revoke execute on function price_alerts_internal.capture_catalog_change()
  from public, anon, authenticated;
grant execute on function price_alerts_internal.normalize_rule(),
  price_alerts_internal.capture_catalog_change() to service_role;

revoke all on function public.claim_price_alert_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_price_alert_deliveries(integer) to service_role;
