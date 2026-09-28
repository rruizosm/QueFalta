-- New scoring starts at the next Madrid midnight after this migration is applied.
-- Existing plays and their scores remain untouched. Deploy the client that calls
-- word_game_start before the cutover; v2 guesses require an explicit start.
create table private.word_scoring_cutover (
  id boolean primary key default true check (id),
  start_day date not null
);
insert into private.word_scoring_cutover(id, start_day)
values (true, (now() at time zone 'Europe/Madrid')::date + 1);
alter table private.word_scoring_cutover enable row level security;
revoke all on private.word_scoring_cutover from public, anon, authenticated;

alter table private.word_plays add column scoring_version smallint not null default 1
  check (scoring_version in (1, 2));

-- The original unnamed status/score constraint encoded the v1 formula.
do $$ declare constraint_name name;
begin
  select c.conname into constraint_name from pg_constraint c
  where c.conrelid = 'private.word_plays'::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%status%'
    and pg_get_constraintdef(c.oid) like '%1000%';
  if constraint_name is null then raise exception 'Old word score constraint not found'; end if;
  execute format('alter table private.word_plays drop constraint %I', constraint_name);
end $$;
alter table private.word_plays add constraint word_plays_score_rules check (
  (status = 'playing' and attempts < 6 and score = 0 and finished_at is null)
  or (status = 'lost' and attempts = 6 and score = 0 and finished_at is not null)
  or (status = 'won' and attempts between 1 and 6 and finished_at is not null and
    ((scoring_version = 1 and score = 1000 - (attempts - 1) * 150)
      or (scoring_version = 2 and score between 1 and 280)))
);

create function private.word_score_v2(p_attempt integer, p_length integer,
  p_started_at timestamptz, p_finished_at timestamptz, p_day date) returns integer
language sql immutable strict set search_path = '' as $$
  select greatest(1, round(
    (115 - p_attempt * 15)::numeric
    * case p_length when 4 then 1.0 when 5 then 1.2 else 1.4 end
    * power(0.95::numeric, floor(greatest(0, extract(epoch from p_finished_at - p_started_at)) / 20))
  )::integer) * case when extract(isodow from p_day) = 7 then 2 else 1 end;
$$;

create or replace function private.word_snapshot(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g private.word_games; p private.word_plays; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'WORD_AUTH_REQUIRED'; end if;
  select * into strict g from private.word_games where id = p_game_id;
  select * into p from private.word_plays where user_id = uid and game_id = g.id;
  return jsonb_build_object('id', g.id, 'day', g.day, 'language', g.language,
    'length', char_length(g.solution), 'status', coalesce(p.status, 'playing'),
    'score', coalesce(p.score, 0), 'scoringVersion', coalesce(p.scoring_version,
      case when g.day >= (select start_day from private.word_scoring_cutover where id) then 2 else 1 end),
    'startedAt', p.started_at,
    'solution', case when p.status in ('won', 'lost') then g.solution else null end,
    'endsAt', (g.day + 1)::timestamp at time zone 'Europe/Madrid', 'serverNow', clock_timestamp(),
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'feedback', feedback) order by attempt)
      from private.word_guesses where play_id = p.id), '[]'::jsonb));
end;
$$;

create function private.word_start(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  g private.word_games; p private.word_plays; cutover date;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  select * into g from private.word_games where id = p_game_id and day = today and language = 'es';
  if not found then raise exception 'WORD_EXPIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('word-play:' || uid::text || ':' || today::text, 0));
  if (clock_timestamp() at time zone 'Europe/Madrid')::date <> today then raise exception 'WORD_EXPIRED'; end if;
  select * into p from private.word_plays where user_id = uid and day = today for update;
  if p.id is not null and p.game_id <> g.id then raise exception 'WORD_STALE'; end if;
  if p.id is null then
    select start_day into cutover from private.word_scoring_cutover where id;
    insert into private.word_plays(user_id, game_id, day, language, scoring_version)
      values (uid, g.id, today, 'es', case when today >= cutover then 2 else 1 end);
  end if;
  return private.word_snapshot(g.id);
end;
$$;

create or replace function private.word_submit(p_game_id uuid, p_word text, p_expected_attempts integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  g private.word_games; p private.word_plays; normalized text; n integer; won boolean;
  cutover date; completed_at timestamptz;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  if p_expected_attempts is null or p_expected_attempts not between 0 and 5 then raise exception 'WORD_STALE'; end if;
  select * into g from private.word_games where id = p_game_id and day = today and language = 'es';
  if not found then raise exception 'WORD_EXPIRED'; end if;
  if p_word is null or char_length(p_word) > 32 then raise exception 'WORD_INVALID'; end if;
  normalized := private.word_normalize(p_word);
  if char_length(normalized) <> char_length(g.solution) or not exists (
    select 1 from private.word_dictionary where language = 'es' and word = normalized and enabled
  ) then raise exception 'WORD_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended('word-play:' || uid::text || ':' || today::text, 0));
  if (clock_timestamp() at time zone 'Europe/Madrid')::date <> today then raise exception 'WORD_EXPIRED'; end if;
  select * into p from private.word_plays where user_id = uid and day = today for update;
  if p.id is not null and p.game_id <> g.id then raise exception 'WORD_STALE'; end if;
  if p.id is null then
    select start_day into cutover from private.word_scoring_cutover where id;
    if today >= cutover then raise exception 'WORD_START_REQUIRED'; end if;
    if p_expected_attempts <> 0 then raise exception 'WORD_STALE'; end if;
    insert into private.word_plays(user_id, game_id, day, language, scoring_version)
      values (uid, g.id, today, 'es', 1) returning * into p;
  end if;
  -- An uncertain retry returns the original saved score and completion time.
  if exists (select 1 from private.word_guesses where play_id = p.id
    and attempt = p_expected_attempts + 1 and word = normalized) then
    return private.word_snapshot(g.id);
  end if;
  if p.status <> 'playing' or p.attempts <> p_expected_attempts then raise exception 'WORD_STALE'; end if;
  if exists (select 1 from private.word_guesses where play_id = p.id and word = normalized) then raise exception 'WORD_REPEATED'; end if;
  n := p.attempts + 1; won := normalized = g.solution;
  completed_at := clock_timestamp();
  insert into private.word_guesses(play_id, attempt, word, feedback, submitted_at)
    values (p.id, n, normalized, private.word_feedback(g.solution, normalized), completed_at);
  update private.word_plays set attempts = n,
    status = case when won then 'won' when n = 6 then 'lost' else 'playing' end,
    score = case when not won then 0 when p.scoring_version = 1 then 1000 - (n - 1) * 150
      else private.word_score_v2(n, char_length(g.solution), p.started_at, completed_at, today) end,
    finished_at = case when won or n = 6 then completed_at else null end
  where id = p.id;
  return private.word_snapshot(g.id);
end;
$$;

create or replace function private.word_ranking(p_language text, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  first_day date; cutover date; result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  p_language := 'es';
  if p_period is null or p_period not in ('daily', 'weekly', 'monthly', 'all', 'previous') then raise exception 'WORD_PERIOD_INVALID'; end if;
  select start_day into cutover from private.word_scoring_cutover where id;
  first_day := case p_period when 'daily' then today when 'weekly' then date_trunc('week', today::timestamp)::date
    when 'monthly' then date_trunc('month', today::timestamp)::date else '-infinity'::date end;
  if p_period <> 'previous' and today >= cutover then first_day := greatest(first_day, cutover); end if;
  with scores as (
    select user_id, sum(score)::integer as score, count(*) filter (where status = 'won')::integer as wins
    from private.word_plays where language = p_language and day between first_day and today and finished_at is not null
      and (case when p_period = 'previous' then scoring_version = 1
        when today >= cutover then scoring_version = 2 else scoring_version = 1 end)
    group by user_id
  ), ranked as (
    select *, rank() over (order by score desc)::integer as position from scores
  ), displayed as (
    select r.user_id, r.position, jsonb_build_object('rank', r.position, 'score', r.score, 'wins', r.wins,
      'username', case when pr.discoverable or r.user_id = uid then pr.username else null end,
      'avatarUrl', case when pr.discoverable or r.user_id = uid then pr.avatar_url else null end,
      'isPlus', case when (pr.discoverable or r.user_id = uid) and pr.premium_until > now() then true else false end,
      'isMe', r.user_id = uid) as entry
    from ranked r left join public.profiles pr on pr.id = r.user_id
  ) select jsonb_build_object(
    'leaders', coalesce((select jsonb_agg(entry order by position, user_id) from (select * from displayed order by position, user_id limit 50) top_rows), '[]'::jsonb),
    'me', (select entry from displayed where user_id = uid)
  ) into result;
  return result;
end;
$$;

create function public.word_game_start(p_game_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.word_start(p_game_id); $$;
revoke all on function private.word_score_v2(integer,integer,timestamptz,timestamptz,date),
  private.word_start(uuid), public.word_game_start(uuid) from public, anon, authenticated;
grant execute on function private.word_start(uuid), public.word_game_start(uuid) to authenticated;
-- word_score_v2 is called only by the privileged internal submit function.
