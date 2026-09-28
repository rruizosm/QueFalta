-- Drop the retired previous season and expose rankings for current group members.
create or replace function private.word_ranking(p_language text, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  first_day date; cutover date; result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  p_language := 'es';
  if p_period is null or p_period not in ('daily', 'weekly', 'monthly', 'all') then raise exception 'WORD_PERIOD_INVALID'; end if;
  select start_day into cutover from private.word_scoring_cutover where id;
  first_day := case p_period when 'daily' then today when 'weekly' then date_trunc('week', today::timestamp)::date
    when 'monthly' then date_trunc('month', today::timestamp)::date else '-infinity'::date end;
  if today >= cutover then first_day := greatest(first_day, cutover); end if;
  with scores as (
    select user_id, sum(score)::integer as score, count(*) filter (where status = 'won')::integer as wins
    from private.word_plays where language = p_language and day between first_day and today and finished_at is not null
      and scoring_version = case when today >= cutover then 2 else 1 end
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

create function private.word_group_ranking(p_group_id uuid, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  first_day date; cutover date; result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  if p_group_id is null or not exists (
    select 1 from public.group_members where group_id = p_group_id and user_id = uid
  ) then raise exception 'WORD_GROUP_FORBIDDEN'; end if;
  if p_period is null or p_period not in ('daily', 'weekly', 'monthly', 'all') then raise exception 'WORD_PERIOD_INVALID'; end if;
  select start_day into cutover from private.word_scoring_cutover where id;
  first_day := case p_period when 'daily' then today when 'weekly' then date_trunc('week', today::timestamp)::date
    when 'monthly' then date_trunc('month', today::timestamp)::date else '-infinity'::date end;
  if today >= cutover then first_day := greatest(first_day, cutover); end if;
  with members as (
    select distinct user_id from public.group_members where group_id = p_group_id
  ), scores as (
    select wp.user_id, sum(wp.score)::integer as score,
      count(*) filter (where wp.status = 'won')::integer as wins
    from private.word_plays wp join members m on m.user_id = wp.user_id
    where wp.language = 'es' and wp.day between first_day and today and wp.finished_at is not null
      and wp.scoring_version = case when today >= cutover then 2 else 1 end
    group by wp.user_id
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

create function public.word_game_group_ranking(p_group_id uuid, p_period text default 'daily') returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.word_group_ranking(p_group_id, p_period);
$$;
revoke all on function private.word_group_ranking(uuid,text), public.word_game_group_ranking(uuid,text)
  from public, anon, authenticated;
grant execute on function private.word_group_ranking(uuid,text), public.word_game_group_ranking(uuid,text)
  to authenticated;
