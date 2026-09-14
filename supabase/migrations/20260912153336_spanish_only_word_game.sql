-- A single Spanish challenge/ranking, regardless of the interface locale.
-- Abort instead of silently deleting or changing any Catalan player results.
lock table private.word_plays in share row exclusive mode;
do $$ begin
  if exists (select 1 from private.word_plays where language <> 'es') then
    raise exception 'Existing non-Spanish plays need an explicit migration decision';
  end if;
end $$;
alter table private.word_plays add constraint word_plays_spanish_only check (language = 'es');
-- Keep dictionary/game history for referential integrity; disable Catalan words.
update private.word_dictionary set enabled = false where language = 'ca';
alter table private.word_dictionary add constraint word_dictionary_enabled_spanish_only check (not enabled or language = 'es');
comment on table private.word_plays is 'One Spanish play per account/day, with one shared ranking regardless of UI language.';

create or replace function private.word_today(p_language text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  game uuid; chosen text;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  -- Keep the RPC argument for older clients, but share the Spanish challenge.
  p_language := 'es';
  select game_id into game from private.word_plays where user_id = uid and day = today;
  if game is not null then return private.word_snapshot(game); end if;
  select id into game from private.word_games where day = today and language = p_language;
  if game is null then
    perform pg_advisory_xact_lock(hashtextextended('word-game:' || today::text || ':' || p_language, 0));
    select id into game from private.word_games where day = today and language = p_language;
    if game is null then
      select d.word into chosen from private.word_dictionary d
      where d.language = p_language and d.enabled
        and not exists (select 1 from private.word_games h where h.language = d.language
          and h.solution = d.word and h.day >= today - 30)
      order by random() limit 1;
      if chosen is null then raise exception 'WORD_UNAVAILABLE'; end if;
      insert into private.word_games(day, language, solution) values (today, p_language, chosen) returning id into game;
    end if;
  end if;
  return private.word_snapshot(game);
end;
$$;

create or replace function private.word_submit(p_game_id uuid, p_word text, p_expected_attempts integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  g private.word_games; p private.word_plays; normalized text; n integer; won boolean;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  if p_expected_attempts is null or p_expected_attempts not between 0 and 5 then raise exception 'WORD_STALE'; end if;
  select * into g from private.word_games where id = p_game_id and day = today and language = 'es';
  if not found then raise exception 'WORD_EXPIRED'; end if;
  if p_word is null or char_length(p_word) > 32 then raise exception 'WORD_INVALID'; end if;
  normalized := private.word_normalize(p_word);
  if char_length(normalized) <> char_length(g.solution) or not exists (
    select 1 from private.word_dictionary where language = g.language and word = normalized and enabled
  ) then raise exception 'WORD_INVALID'; end if;

  -- Serialize this user's submissions (including two devices). No
  -- network calls or global ranking writes while holding the lock.
  perform pg_advisory_xact_lock(hashtextextended('word-play:' || uid::text || ':' || today::text, 0));
  select * into p from private.word_plays where user_id = uid and day = today for update;
  if p.id is not null and p.game_id <> g.id then raise exception 'WORD_STALE'; end if;
  if p.id is null then
    if p_expected_attempts <> 0 then raise exception 'WORD_STALE'; end if;
    insert into private.word_plays(user_id, game_id, day, language)
      values (uid, g.id, today, g.language) returning * into p;
  end if;
  -- Repeated request after an uncertain network outcome: same slot + same
  -- normalized word returns state, including after winning the last attempt.
  if exists (select 1 from private.word_guesses where play_id = p.id
    and attempt = p_expected_attempts + 1 and word = normalized) then
    return private.word_snapshot(g.id);
  end if;
  if p.status <> 'playing' or p.attempts <> p_expected_attempts then raise exception 'WORD_STALE'; end if;
  if exists (select 1 from private.word_guesses where play_id = p.id and word = normalized) then raise exception 'WORD_REPEATED'; end if;
  n := p.attempts + 1; won := normalized = g.solution;
  insert into private.word_guesses(play_id, attempt, word, feedback)
    values (p.id, n, normalized, private.word_feedback(g.solution, normalized));
  update private.word_plays set attempts = n,
    status = case when won then 'won' when n = 6 then 'lost' else 'playing' end,
    score = case when won then 1000 - (n - 1) * 150 else 0 end,
    finished_at = case when won or n = 6 then now() else null end
  where id = p.id;
  return private.word_snapshot(g.id);
end;
$$;

create or replace function private.word_ranking(p_language text, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date; first_day date; result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  -- Keep the RPC argument for older clients, but share the Spanish challenge.
  p_language := 'es';
  if p_period is null or p_period not in ('daily', 'weekly', 'monthly', 'all') then raise exception 'WORD_PERIOD_INVALID'; end if;
  first_day := case p_period when 'daily' then today when 'weekly' then date_trunc('week', today::timestamp)::date
    when 'monthly' then date_trunc('month', today::timestamp)::date else '-infinity'::date end;
  with scores as (
    select user_id, sum(score)::integer as score, count(*) filter (where status = 'won')::integer as wins
    from private.word_plays where language = p_language and day between first_day and today and finished_at is not null
    group by user_id
  ), ranked as (
    select *, rank() over (order by score desc)::integer as position from scores
  ), displayed as (
    select r.user_id, r.position, jsonb_build_object('rank', r.position, 'score', r.score, 'wins', r.wins,
      'username', case when pr.discoverable or r.user_id = uid then pr.username else null end, 'isMe', r.user_id = uid) as entry
    from ranked r left join public.profiles pr on pr.id = r.user_id
  ) select jsonb_build_object(
    'leaders', coalesce((select jsonb_agg(entry order by position, user_id) from (select * from displayed order by position, user_id limit 50) top_rows), '[]'::jsonb),
    'me', (select entry from displayed where user_id = uid)
  ) into result;
  return result;
end;
$$;
