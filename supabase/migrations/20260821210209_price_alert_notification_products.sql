-- Productos concretos que originaron una notificación de alerta personalizada.
--
-- La relación duradera ya existe en price_alert_deliveries. Esta RPC expone
-- solo los resultados del propietario de la notificación y mantiene oculto el
-- esquema interno de eventos. Si un mismo producto bajó de precio y además
-- entró en oferta en el mismo lote, se devuelve exclusivamente como oferta.

set lock_timeout = '5s';
set statement_timeout = '30s';

-- Amplía la reserva atómica existente: la fila visible y todas las entregas
-- de su regla+lote quedan enlazadas dentro de la misma transacción. Así nunca
-- existe una notificación confirmada sin resultados por un corte del procesador.
create or replace function public.create_price_alert_notification(
  p_user_id uuid,
  p_rule_id uuid,
  p_batch_key text,
  p_title text,
  p_body text,
  p_data jsonb
)
returns table (notification_id uuid, created boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
  v_created boolean := false;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if not exists (
    select 1 from public.price_alert_rules r
    where r.id = p_rule_id and r.user_id = p_user_id
  ) then
    raise exception 'invalid_price_alert_batch';
  end if;

  insert into price_alerts_internal.notification_batches (rule_id, user_id, batch_key)
  values (p_rule_id, p_user_id, p_batch_key)
  on conflict (rule_id, batch_key) do nothing;

  select b.notification_id into v_notification_id
  from price_alerts_internal.notification_batches b
  where b.rule_id = p_rule_id and b.batch_key = p_batch_key
  for update;

  if v_notification_id is null then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, 'price_alert', p_title, p_body, coalesce(p_data, '{}'::jsonb))
    returning id into v_notification_id;

    update price_alerts_internal.notification_batches
    set notification_id = v_notification_id
    where rule_id = p_rule_id and batch_key = p_batch_key;
    v_created := true;
  end if;

  update public.price_alert_deliveries d
  set notification_id = v_notification_id
  from price_alerts_internal.catalog_events e
  where d.event_id = e.id
    and d.rule_id = p_rule_id
    and d.user_id = p_user_id
    and d.status = 'processing'
    and e.batch_key = p_batch_key
    and d.notification_id is distinct from v_notification_id;

  return query select v_notification_id, v_created;
end
$$;

revoke all on function public.create_price_alert_notification(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_price_alert_notification(uuid,uuid,text,text,text,jsonb)
  to service_role;

create or replace function public.get_price_alert_notification_products(
  p_notification_id uuid
)
returns table (
  store text,
  product_id text,
  display_name text,
  thumbnail text,
  category_name text,
  previous_price numeric,
  current_price numeric,
  price_delta_pct numeric,
  promo_name text,
  promo_price numeric,
  event_type text,
  detected_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception 'authentication_required';
  end if;

  -- Devuelve vacío también para ids ajenos: no revela si la notificación existe.
  if not exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and n.user_id = caller
      and n.type = 'price_alert'
  ) then
    return;
  end if;

  return query
  with ranked as (
    select
      e.store,
      e.product_id,
      e.display_name,
      e.thumbnail,
      e.category_name,
      e.previous_price,
      e.current_price,
      e.price_delta_pct,
      e.promo_name,
      e.promo_price,
      e.event_type,
      e.detected_at,
      row_number() over (
        partition by e.store, e.product_id
        order by
          case e.event_type
            when 'new_arrival' then 3
            when 'new_offer' then 2
            else 1
          end desc,
          e.detected_at desc,
          e.id desc
      ) as event_rank
    from public.price_alert_deliveries d
    join price_alerts_internal.catalog_events e on e.id = d.event_id
    where d.notification_id = p_notification_id
      and d.user_id = caller
  )
  select
    r.store,
    r.product_id,
    r.display_name,
    r.thumbnail,
    r.category_name,
    r.previous_price,
    r.current_price,
    r.price_delta_pct,
    r.promo_name,
    r.promo_price,
    r.event_type,
    r.detected_at
  from ranked r
  where r.event_rank = 1
  order by
    case r.event_type
      when 'new_arrival' then 3
      when 'new_offer' then 2
      else 1
    end desc,
    r.store,
    r.display_name,
    r.product_id;
end
$$;

revoke all on function public.get_price_alert_notification_products(uuid)
  from public, anon;
grant execute on function public.get_price_alert_notification_products(uuid)
  to authenticated, service_role;

comment on function public.get_price_alert_notification_products(uuid) is
  'Resultados deduplicados de una notificación price_alert, visibles solo por su propietario; oferta prevalece sobre bajada.';
