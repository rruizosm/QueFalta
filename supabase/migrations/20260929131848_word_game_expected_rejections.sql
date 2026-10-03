-- A word absent from the dictionary, or one already tried, is normal gameplay.
-- Keep the legacy RPC unchanged for older clients and expose a versioned result
-- contract that catches only those two expected rejections. Integrity, auth and
-- concurrency failures still propagate as PostgreSQL errors.
create function public.word_game_guess_v2(
  p_game_id uuid,
  p_word text,
  p_expected_attempts integer
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  game jsonb;
begin
  game := private.word_submit(p_game_id, p_word, p_expected_attempts);
  return jsonb_build_object('accepted', true, 'game', game);
exception
  when raise_exception then
    if sqlerrm in ('WORD_INVALID', 'WORD_REPEATED') then
      return jsonb_build_object('accepted', false, 'reason', sqlerrm);
    end if;
    raise;
end;
$$;

comment on function public.word_game_guess_v2(uuid,text,integer) is
  'Submits a guess and returns expected invalid/repeated outcomes as data, not PostgreSQL errors.';

revoke all on function public.word_game_guess_v2(uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.word_game_guess_v2(uuid,text,integer)
  to authenticated;
