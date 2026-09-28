-- Return the persisted completion duration in the existing game payload. This
-- keeps result screens stable after a refresh or when opened on another device.
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
    'durationSeconds', case when p.started_at is not null and p.finished_at is not null
      then floor(greatest(0, extract(epoch from p.finished_at - p.started_at)))::integer else null end,
    'solution', case when p.status in ('won', 'lost') then g.solution else null end,
    'endsAt', (g.day + 1)::timestamp at time zone 'Europe/Madrid', 'serverNow', clock_timestamp(),
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'feedback', feedback) order by attempt)
      from private.word_guesses where play_id = p.id), '[]'::jsonb));
end;
$$;
