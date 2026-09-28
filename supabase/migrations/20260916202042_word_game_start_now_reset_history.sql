-- Activate scoring v2 immediately in Madrid. Clear all player guesses and
-- scores, while preserving the common daily challenges and dictionary.
do $$
declare madrid_today date := (clock_timestamp() at time zone 'Europe/Madrid')::date;
begin
  update private.word_scoring_cutover set start_day = madrid_today where id = true;
  if not found then raise exception 'Word scoring cutover configuration is missing'; end if;

  delete from private.word_guesses;
  delete from private.word_plays;

  if exists (select 1 from private.word_guesses)
    or exists (select 1 from private.word_plays) then
    raise exception 'Word game history reset was incomplete';
  end if;
end;
$$;
