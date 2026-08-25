-- Métricas de producto basadas en aperturas reales de la app.
--
-- Definiciones (zona Europe/Madrid):
--   DAU: usuarios distintos activos hoy.
--   WAU: usuarios distintos activos en los últimos 7 días, incluido hoy.
--   MAU: usuarios distintos activos en los últimos 30 días, incluido hoy.
--
-- La app solo invoca la frontera pública. La tabla, la escritura privilegiada
-- y los agregados globales permanecen en el esquema no expuesto `private`.

set lock_timeout = '5s';
set statement_timeout = '120s';

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table private.app_daily_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  foreground_count integer not null default 1
    check (foreground_count > 0),
  first_platform text not null
    check (first_platform in ('ios', 'android', 'web', 'unknown')),
  last_platform text not null
    check (last_platform in ('ios', 'android', 'web', 'unknown')),
  platforms text[] not null,
  last_app_version text,
  primary key (activity_date, user_id),
  check (first_seen_at <= last_seen_at),
  check (cardinality(platforms) > 0),
  check (last_app_version is null or char_length(last_app_version) <= 32)
);

alter table private.app_daily_activity enable row level security;
revoke all on table private.app_daily_activity from public, anon, authenticated;
grant all on table private.app_daily_activity to service_role;

comment on table private.app_daily_activity is
  'Una fila por usuario y día de Madrid; se registra al arrancar o volver la app al primer plano.';
comment on column private.app_daily_activity.foreground_count is
  'Número de entradas al primer plano observadas para el usuario durante el día.';

create function private.record_app_activity(
  p_platform text,
  p_app_version text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  seen_at timestamptz := statement_timestamp();
  seen_on date := (seen_at at time zone 'Europe/Madrid')::date;
  normalized_platform text := case
    when lower(coalesce(p_platform, '')) in ('ios', 'android', 'web')
      then lower(p_platform)
    else 'unknown'
  end;
  normalized_version text := left(nullif(btrim(p_app_version), ''), 32);
begin
  if caller is null then
    raise exception 'authentication_required';
  end if;

  insert into private.app_daily_activity (
    user_id,
    activity_date,
    first_seen_at,
    last_seen_at,
    foreground_count,
    first_platform,
    last_platform,
    platforms,
    last_app_version
  ) values (
    caller,
    seen_on,
    seen_at,
    seen_at,
    1,
    normalized_platform,
    normalized_platform,
    array[normalized_platform],
    normalized_version
  )
  on conflict (activity_date, user_id) do update
    set last_seen_at = greatest(
          private.app_daily_activity.last_seen_at,
          excluded.last_seen_at
        ),
        foreground_count = least(
          private.app_daily_activity.foreground_count + 1,
          2147483647
        ),
        last_platform = excluded.last_platform,
        platforms = case
          when excluded.last_platform = any(private.app_daily_activity.platforms)
            then private.app_daily_activity.platforms
          else array_append(
            private.app_daily_activity.platforms,
            excluded.last_platform
          )
        end,
        last_app_version = coalesce(
          excluded.last_app_version,
          private.app_daily_activity.last_app_version
        );
end
$$;

revoke all on function private.record_app_activity(text, text)
  from public, anon;
grant execute on function private.record_app_activity(text, text)
  to authenticated, service_role;

create function public.record_app_activity(
  p_platform text,
  p_app_version text
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.record_app_activity(p_platform, p_app_version);
$$;

comment on function public.record_app_activity(text, text) is
  'Registra actividad del usuario autenticado usando exclusivamente la hora del servidor.';

revoke all on function public.record_app_activity(text, text)
  from public, anon;
grant execute on function public.record_app_activity(text, text)
  to authenticated, service_role;

create view private.app_active_user_metrics
with (security_invoker = true)
as
with calendar as (
  select (now() at time zone 'Europe/Madrid')::date as today
)
select
  calendar.today as metric_date,
  'Europe/Madrid'::text as metric_timezone,
  count(*) filter (
    where activity.activity_date = calendar.today
  )::bigint as dau,
  count(distinct activity.user_id) filter (
    where activity.activity_date between calendar.today - 6 and calendar.today
  )::bigint as wau_7d,
  count(distinct activity.user_id) filter (
    where activity.activity_date between calendar.today - 29 and calendar.today
  )::bigint as mau_30d,
  min(activity.activity_date) as tracking_started_on,
  max(activity.last_seen_at) as last_activity_at
from calendar
left join private.app_daily_activity activity
  on activity.activity_date between calendar.today - 29 and calendar.today
group by calendar.today;

comment on view private.app_active_user_metrics is
  'DAU, WAU de 7 días y MAU de 30 días; privado y calculado en Europe/Madrid.';

revoke all on table private.app_active_user_metrics
  from public, anon, authenticated;
grant select on table private.app_active_user_metrics to service_role;
