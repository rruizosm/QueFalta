-- Add public podium identity only; keep scores, ties, privacy and RPC grants unchanged.
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
      'username', case when pr.discoverable or r.user_id = uid then pr.username else null end,
      'avatarUrl', case when pr.discoverable or r.user_id = uid then pr.avatar_url else null end,
      'isPlus', case when pr.discoverable or r.user_id = uid then coalesce(pr.premium_until > now(), false) else false end,
      'isMe', r.user_id = uid) as entry
    from ranked r left join public.profiles pr on pr.id = r.user_id
  ) select jsonb_build_object(
    'leaders', coalesce((select jsonb_agg(entry order by position, user_id) from (select * from displayed order by position, user_id limit 50) top_rows), '[]'::jsonb),
    'me', (select entry from displayed where user_id = uid)
  ) into result;
  return result;
end;
$$;
