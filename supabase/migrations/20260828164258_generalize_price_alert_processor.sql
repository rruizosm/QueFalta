-- Activa el procesador de alertas personalizadas para todas las cuentas.
--
-- Dos guardas evitan avisos falsos o incompletos:
--   1. solo se materializan eventos cuando catalog_sync_status confirma que el
--      sync de la tienda terminó;
--   2. un lote con más de 400 altas se considera llenado/importación masiva y
--      no origina alertas de novedades. Coincide con el cortafuegos del cliente.

set lock_timeout = '5s';
set statement_timeout = '120s';

create index if not exists price_alert_events_type_batch_idx
  on price_alerts_internal.catalog_events (event_type, batch_key);

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
  'Materializa y reserva alertas de todas las cuentas tras finalizar cada sync; omite lotes masivos de novedades.';

do $checks$
begin
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'catalog_embed_project_url' and decrypted_secret <> ''
  ) then
    raise exception 'missing_catalog_embed_project_url';
  end if;
  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'catalog_embed_worker_token' and decrypted_secret <> ''
  ) then
    raise exception 'missing_catalog_embed_worker_token';
  end if;
end
$checks$;

select cron.schedule(
  'process-price-alerts-every-15-minutes',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'catalog_embed_project_url'
    ) || '/functions/v1/process-price-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-alert-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'catalog_embed_worker_token'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $cron$
);
