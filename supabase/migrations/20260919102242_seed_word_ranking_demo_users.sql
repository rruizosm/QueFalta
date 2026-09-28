-- Demo participants for the public current-period rankings. They are not Auth
-- users, cannot sign in, and never appear in group or all-time rankings.
create table private.word_ranking_fixtures (
  bot_id uuid not null,
  username text not null check (username ~ '^demo_[0-9]{3}$'),
  day date not null,
  score integer not null check (score between 1 and 280),
  wins integer not null default 1 check (wins between 0 and 1),
  primary key (bot_id, day)
);
create index word_ranking_fixtures_day_idx on private.word_ranking_fixtures(day, bot_id)
  include (score, wins, username);
alter table private.word_ranking_fixtures enable row level security;
revoke all on private.word_ranking_fixtures from public, anon, authenticated;

with settings as (
  select (now() at time zone 'Europe/Madrid')::date as today,
    start_day as cutover from private.word_scoring_cutover where id = true
), bots as (
  select n, md5('quefalta-word-ranking-demo-' || n::text)::uuid as bot_id,
    'demo_' || lpad(n::text, 3, '0') as username
  from generate_series(1, 100) n
), days as (
  select s.today, d::date as day
  from settings s cross join lateral generate_series(
    greatest(s.cutover, s.today - 3), s.today, interval '1 day'
  ) d
)
insert into private.word_ranking_fixtures(bot_id, username, day, score, wins)
select b.bot_id, b.username, d.day,
  greatest(1, 280 - (b.n - 1) * 2 - (d.today - d.day) * 5), 1
from bots b cross join days d
on conflict (bot_id, day) do update set
  username = excluded.username, score = excluded.score, wins = excluded.wins;

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

  with real_scores as (
    select 'user:' || wp.user_id::text as participant_key, wp.user_id,
      null::text as fixture_username, sum(wp.score)::integer as score,
      count(*) filter (where wp.status = 'won')::integer as wins
    from private.word_plays wp
    where wp.language = 'es' and wp.day between score_start and least(period_end, today)
      and wp.finished_at is not null and wp.scoring_version = 2
      and (p_group_id is null or exists (
        select 1 from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = wp.user_id
      ))
    group by wp.user_id
  ), fixture_scores as (
    select 'demo:' || f.bot_id::text as participant_key, null::uuid as user_id,
      min(f.username) as fixture_username, sum(f.score)::integer as score,
      sum(f.wins)::integer as wins
    from private.word_ranking_fixtures f
    where p_group_id is null and p_period <> 'all'
      and f.day between score_start and least(period_end, today)
    group by f.bot_id
  ), scores as (
    select * from real_scores union all select * from fixture_scores
  ), ranked as (
    select *, rank() over (order by score desc)::integer as position from scores
  ), displayed as (
    select r.participant_key, r.user_id, r.position,
      jsonb_build_object('rank', r.position, 'score', r.score, 'wins', r.wins,
        'username', case when r.user_id is null then r.fixture_username
          when pr.discoverable or r.user_id = uid then pr.username else null end,
        'avatarUrl', case when r.user_id is null then null
          when pr.discoverable or r.user_id = uid then pr.avatar_url else null end,
        'isPlus', case when r.user_id is null then false
          when (pr.discoverable or r.user_id = uid) and pr.premium_until > now() then true else false end,
        'isMe', coalesce(r.user_id = uid, false)) as entry
    from ranked r left join public.profiles pr on pr.id = r.user_id
  ) select jsonb_build_object(
    'leaders', coalesce((select jsonb_agg(entry order by position, participant_key) from (
      select * from displayed order by position, participant_key limit 150
    ) top_rows), '[]'::jsonb),
    'me', (select entry from displayed where user_id = uid),
    'periodStart', score_start, 'periodEnd', period_end,
    'offset', p_offset, 'hasPrevious', p_period <> 'all' and period_start - 1 >= cutover
  ) into result;
  return result;
end;
$$;

-- Keep the legacy ranking used by already published clients populated too.
create or replace function private.word_ranking(p_language text, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  first_day date; cutover date; result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  p_language := 'es';
  if p_period is null or p_period not in ('daily', 'weekly', 'monthly', 'all') then raise exception 'WORD_PERIOD_INVALID'; end if;
  select start_day into cutover from private.word_scoring_cutover where id = true;
  first_day := case p_period when 'daily' then today when 'weekly' then date_trunc('week', today::timestamp)::date
    when 'monthly' then date_trunc('month', today::timestamp)::date else cutover end;
  first_day := greatest(first_day, cutover);
  with real_scores as (
    select 'user:' || user_id::text as participant_key, user_id, null::text as fixture_username,
      sum(score)::integer as score, count(*) filter (where status = 'won')::integer as wins
    from private.word_plays where language = p_language and day between first_day and today
      and finished_at is not null and scoring_version = 2 group by user_id
  ), fixture_scores as (
    select 'demo:' || bot_id::text as participant_key, null::uuid as user_id,
      min(username) as fixture_username, sum(score)::integer as score, sum(wins)::integer as wins
    from private.word_ranking_fixtures
    where p_period <> 'all' and day between first_day and today group by bot_id
  ), scores as (
    select * from real_scores union all select * from fixture_scores
  ), ranked as (
    select *, rank() over (order by score desc)::integer as position from scores
  ), displayed as (
    select r.participant_key, r.user_id, r.position,
      jsonb_build_object('rank', r.position, 'score', r.score, 'wins', r.wins,
        'username', case when r.user_id is null then r.fixture_username
          when pr.discoverable or r.user_id = uid then pr.username else null end,
        'avatarUrl', case when r.user_id is null then null
          when pr.discoverable or r.user_id = uid then pr.avatar_url else null end,
        'isPlus', case when r.user_id is null then false
          when (pr.discoverable or r.user_id = uid) and pr.premium_until > now() then true else false end,
        'isMe', coalesce(r.user_id = uid, false)) as entry
    from ranked r left join public.profiles pr on pr.id = r.user_id
  ) select jsonb_build_object(
    'leaders', coalesce((select jsonb_agg(entry order by position, participant_key) from (
      select * from displayed order by position, participant_key limit 150
    ) top_rows), '[]'::jsonb),
    'me', (select entry from displayed where user_id = uid)
  ) into result;
  return result;
end;
$$;
