create schema sponsor_metrics_private;
revoke all on schema sponsor_metrics_private from public, anon, authenticated;
grant usage on schema sponsor_metrics_private to authenticated, service_role;

create table sponsor_metrics_private.events (
  event_id uuid primary key,
  campaign_id uuid not null references public.sponsor_campaigns(id) on delete restrict,
  visit_id uuid not null,
  event_type text not null check (event_type in ('impression','click')),
  platform text not null check (platform in ('ios','android','web')),
  app_version text not null check (length(app_version) between 1 and 32),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp()
);
alter table sponsor_metrics_private.events enable row level security;
revoke all on sponsor_metrics_private.events from public, anon, authenticated;
grant select, delete on sponsor_metrics_private.events to service_role;
create unique index sponsor_impression_per_visit on sponsor_metrics_private.events(campaign_id,visit_id)
  where event_type = 'impression';
create index sponsor_events_user_time on sponsor_metrics_private.events(user_id,created_at desc);
create index sponsor_events_campaign_time on sponsor_metrics_private.events(campaign_id,created_at desc);

-- Privileged writer is kept OUTSIDE the exposed schema. No direct client writes.
create function sponsor_metrics_private.record_event(
  p_event_id uuid, p_campaign_id uuid, p_visit_id uuid, p_event_type text,
  p_platform text, p_app_version text
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
begin
  if v_user is null or not exists (select 1 from auth.users where id=v_user) then
    return false;
  end if;
  if p_event_id is null or p_campaign_id is null or p_visit_id is null
    or p_event_type is null or p_event_type not in ('impression','click')
    or p_platform is null or p_platform not in ('ios','android','web')
    or p_app_version is null or p_app_version !~ '^[0-9A-Za-z.+_-]{1,32}$' then
    return false;
  end if;
  if not exists (select 1 from public.sponsor_campaigns c
    where c.id=p_campaign_id and c.enabled and c.starts_at <= now()
      and (c.ends_at is null or c.ends_at > now())
      and case p_platform when 'ios' then c.destination_ios
        when 'android' then c.destination_android else c.destination_web end is not null) then
    return false;
  end if;
  -- Serialize the rate check per account (including concurrent requests).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 912831));
  if exists (select 1 from sponsor_metrics_private.events where event_id=p_event_id) then
    return true;
  end if;
  if p_event_type='impression' and exists (select 1 from sponsor_metrics_private.events
    where campaign_id=p_campaign_id and visit_id=p_visit_id and event_type='impression') then
    return true;
  end if;
  select count(*) into v_count from (select 1 from sponsor_metrics_private.events
    where user_id=v_user and created_at > clock_timestamp()-interval '1 minute' limit 60) recent;
  if v_count >= 60 then return false; end if;
  insert into sponsor_metrics_private.events(event_id,campaign_id,visit_id,event_type,platform,app_version,user_id)
    values(p_event_id,p_campaign_id,p_visit_id,p_event_type,p_platform,p_app_version,v_user)
    on conflict do nothing;
  return true;
end;
$$;
revoke all on function sponsor_metrics_private.record_event(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function sponsor_metrics_private.record_event(uuid,uuid,uuid,text,text,text) to authenticated;

create function public.record_sponsor_banner_event(
  p_event_id uuid, p_campaign_id uuid, p_visit_id uuid, p_event_type text,
  p_platform text, p_app_version text
) returns boolean language sql security invoker set search_path = '' as $$
  select sponsor_metrics_private.record_event(p_event_id,p_campaign_id,p_visit_id,p_event_type,p_platform,p_app_version);
$$;
revoke all on function public.record_sponsor_banner_event(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_sponsor_banner_event(uuid,uuid,uuid,text,text,text) to authenticated;

create view public.sponsor_banner_daily_stats with (security_invoker=true) as
select e.campaign_id, c.slug, (e.created_at at time zone 'Europe/Madrid')::date as day,
  e.platform, e.app_version,
  count(*) filter (where e.event_type='impression') as impressions,
  count(*) filter (where e.event_type='click') as clicks,
  round(100.0 * count(*) filter (where e.event_type='click') /
    nullif(count(*) filter (where e.event_type='impression'),0),2) as ctr_percent
from sponsor_metrics_private.events e join public.sponsor_campaigns c on c.id=e.campaign_id
group by e.campaign_id,c.slug,(e.created_at at time zone 'Europe/Madrid')::date,e.platform,e.app_version;
revoke all on public.sponsor_banner_daily_stats from public,anon,authenticated;
grant select on public.sponsor_banner_daily_stats to service_role;
comment on view public.sponsor_banner_daily_stats is 'Private sponsor statistics; day in Europe/Madrid. CTR is NULL without impressions. Multiple clicks per visit are allowed.';
