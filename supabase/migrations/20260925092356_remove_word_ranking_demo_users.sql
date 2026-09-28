-- Remove the temporary synthetic participants from every public ranking.
-- Replace the reader first so the fixture table can then be dropped safely.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function private.word_ranking_window(p_period text, p_offset integer, p_group_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  cutover date; period_start date; period_end date; score_start date; result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  if p_group_id is not null and not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = uid
  ) then raise exception 'WORD_GROUP_FORBIDDEN'; end if;
  if p_period is null or p_period not in ('daily', 'weekly', 'monthly', 'yearly', 'all')
    or p_offset is null or p_offset not between 0 and 1200
    or (p_period = 'all' and p_offset <> 0) then raise exception 'WORD_PERIOD_INVALID'; end if;

  select start_day into cutover from private.word_scoring_cutover where id = true;
  if cutover is null then raise exception 'WORD_PERIOD_UNAVAILABLE'; end if;
  period_start := case p_period
    when 'daily' then today - p_offset
    when 'weekly' then date_trunc('week', today::timestamp)::date - p_offset * 7
    when 'monthly' then (date_trunc('month', today::timestamp) - make_interval(months => p_offset))::date
    when 'yearly' then (date_trunc('year', today::timestamp) - make_interval(years => p_offset))::date
    else cutover end;
  period_end := case p_period
    when 'daily' then period_start
    when 'weekly' then period_start + 6
    when 'monthly' then (period_start + interval '1 month')::date - 1
    when 'yearly' then (period_start + interval '1 year')::date - 1
    else today end;
  if period_end < cutover or period_start > today then raise exception 'WORD_PERIOD_UNAVAILABLE'; end if;
  score_start := greatest(period_start, cutover);

  with scoped_plays as (
    select wp.user_id, wp.score, wp.status
    from private.word_plays wp
    where p_group_id is null and wp.language = 'es'
      and wp.day between score_start and least(period_end, today)
      and wp.finished_at is not null and wp.scoring_version = 2
    union all
    select wp.user_id, wp.score, wp.status
    from public.group_members gm
    join private.word_plays wp on wp.user_id = gm.user_id
      and wp.day between score_start and least(period_end, today)
      and wp.language = 'es' and wp.finished_at is not null and wp.scoring_version = 2
    where p_group_id is not null and gm.group_id = p_group_id
  ), real_scores as (
    select 'user:' || wp.user_id::text as participant_key, wp.user_id,
      sum(wp.score)::integer as score,
      count(*) filter (where wp.status = 'won')::integer as wins
    from scoped_plays wp
    group by wp.user_id
  ), ranked as materialized (
    select *, rank() over (order by score desc)::integer as position from real_scores
  ), top_rows as materialized (
    select * from ranked order by position, participant_key limit 150
  ), selected as (
    select *, true as in_leaders from top_rows
    union all
    select *, false as in_leaders from ranked
    where user_id = uid and not exists (select 1 from top_rows where user_id = uid)
  ), displayed as (
    select r.participant_key, r.user_id, r.position, r.in_leaders,
      jsonb_build_object('rank', r.position, 'score', r.score, 'wins', r.wins,
        'username', case when pr.discoverable or r.user_id = uid then pr.username else null end,
        'avatarUrl', case when pr.discoverable or r.user_id = uid then pr.avatar_url else null end,
        'isPlus', case when (pr.discoverable or r.user_id = uid) and pr.premium_until > now() then true else false end,
        'isMe', r.user_id = uid) as entry
    from selected r left join public.profiles pr on pr.id = r.user_id
  ) select jsonb_build_object(
    'leaders', coalesce((select jsonb_agg(entry order by position, participant_key) from displayed where in_leaders), '[]'::jsonb),
    'me', (select entry from displayed where user_id = uid),
    'periodStart', score_start, 'periodEnd', period_end,
    'offset', p_offset, 'hasPrevious', p_period <> 'all' and period_start - 1 >= cutover
  ) into result;
  return result;
end;
$$;

drop table private.word_ranking_fixtures;

-- CREATE OR REPLACE preserves the existing function ACLs. The public wrappers
-- keep their contracts and now receive rankings built exclusively from real plays.
