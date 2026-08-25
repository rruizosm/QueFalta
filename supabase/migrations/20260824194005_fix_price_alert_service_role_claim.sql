-- PostgREST expone actualmente el JWT completo en `request.jwt.claims`.
-- La comprobación anterior usaba la GUC singular heredada
-- `request.jwt.claim.role`, que queda vacía y rechazaba incluso las llamadas
-- hechas con la service-role key desde process-price-alerts.

set lock_timeout = '5s';
set statement_timeout = '30s';

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
  if coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role' then
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

comment on function public.create_price_alert_notification(uuid,uuid,text,text,text,jsonb) is
  'Crea una sola notificación por regla+lote; solo admite llamadas service_role verificadas desde request.jwt.claims.';
