-- Los cupos gratuitos son una decisión de producto independiente del encendido
-- comercial de Plus. El kill-switch remoto continúa apagando los demás gates,
-- pero una cuenta sin premium dispone desde ahora de 1 alerta y 3 búsquedas.

set lock_timeout = '5s';
set statement_timeout = '120s';

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

  if caller is null or public.is_premium(caller) then
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

create or replace function price_alerts_internal.enforce_free_rule_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  free_rule uuid;
begin
  if caller is null or public.is_premium(caller) or not new.active then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(caller::text, 0)
  );
  free_rule := price_alerts_internal.free_rule_id(caller);

  if (tg_op = 'INSERT' and free_rule is not null)
    or (tg_op = 'UPDATE' and free_rule is distinct from old.id) then
    raise exception 'free_price_alert_limit_reached';
  end if;

  return new;
end
$$;

drop trigger if exists enforce_free_price_alert_allowance
  on public.price_alert_rules;
create trigger enforce_free_price_alert_allowance
  before insert or update on public.price_alert_rules
  for each row execute function price_alerts_internal.enforce_free_rule_limit();

revoke all on function price_alerts_internal.enforce_free_rule_limit()
  from public, anon, authenticated;
grant execute on function price_alerts_internal.enforce_free_rule_limit()
  to service_role;

create or replace function price_alerts_internal.enforce_free_delivery_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending'
    and not public.is_premium(new.user_id)
    and new.rule_id is distinct from price_alerts_internal.free_rule_id(new.user_id) then
    new.status := 'paused';
  end if;
  return new;
end
$$;

drop trigger if exists enforce_free_price_alert_delivery
  on public.price_alert_deliveries;
create trigger enforce_free_price_alert_delivery
  before insert on public.price_alert_deliveries
  for each row execute function price_alerts_internal.enforce_free_delivery_limit();

revoke all on function price_alerts_internal.enforce_free_delivery_limit()
  from public, anon, authenticated;
grant execute on function price_alerts_internal.enforce_free_delivery_limit()
  to service_role;
