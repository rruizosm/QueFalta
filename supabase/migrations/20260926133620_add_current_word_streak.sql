-- Expose the streak ending today so the completion banner never has to infer
-- it from the activity calendar's intentionally limited 12-month window.
create or replace function private.word_profile_statistics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  today date := (now() at time zone 'Europe/Madrid')::date;
  cutover date;
  result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then
    raise exception 'WORD_AUTH_REQUIRED';
  end if;
  select start_day into cutover from private.word_scoring_cutover where id = true;
  with completed as materialized (
    select user_id, day, score from private.word_plays
    where language = 'es' and scoring_version = 2 and finished_at is not null
      and day between cutover and today
  ), mine as materialized (
    select day from completed where user_id = uid
  ), islands as (
    select day, day - (row_number() over (order by day))::integer as island from mine
  ), streaks as (
    select max(day) as end_day, count(*)::integer as days from islands group by island
  ), scores as (
    select p.period, date_trunc(p.unit, c.day::timestamp)::date as period_start,
      c.user_id, sum(c.score) as score
    from completed c cross join (values
      ('daily', 'day'), ('weekly', 'week'), ('monthly', 'month'), ('yearly', 'year')
    ) p(period, unit)
    group by p.period, date_trunc(p.unit, c.day::timestamp)::date, c.user_id
  ), ranked as (
    select *, rank() over (partition by period, period_start order by score desc)::integer as position
    from scores
  ), best as (
    select distinct on (period) period, position, period_start,
      period_start = date_trunc(case period when 'daily' then 'day' when 'weekly' then 'week'
        when 'monthly' then 'month' else 'year' end, today::timestamp)::date as provisional
    from ranked where user_id = uid
    order by period, position, period_start
  ) select jsonb_build_object(
    'today', today,
    'currentStreak', coalesce((select max(days) from streaks where end_day = today), 0),
    'bestStreak', coalesce((select max(days) from streaks), 0),
    'completedCount', (select count(*) from mine),
    'activityDays', coalesce((select jsonb_agg(day order by day) from mine
      where day >= (date_trunc('month', today::timestamp) - interval '11 months')::date), '[]'::jsonb),
    'bestPositions', coalesce((select jsonb_object_agg(period, jsonb_build_object(
      'rank', position, 'periodStart', period_start, 'provisional', provisional)) from best), '{}'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function private.word_profile_statistics() from public, anon, authenticated;
grant execute on function private.word_profile_statistics() to authenticated;
