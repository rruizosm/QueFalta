-- Palabra de hoy: server-owned games, answers and scores. The private schema
-- is intentionally not exposed to PostgREST; only three invoker RPCs are public.
create schema if not exists private;

create table private.word_dictionary (
  language text not null check (language in ('es', 'ca')),
  word text not null check (word ~ '^[A-ZÑÇ]{4,6}$'),
  enabled boolean not null default true,
  primary key (language, word)
);
create table private.word_games (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  language text not null,
  solution text not null,
  created_at timestamptz not null default now(),
  unique (day, language),
  foreign key (language, solution) references private.word_dictionary(language, word)
);
create index word_games_dictionary_idx on private.word_games(language, solution);
create table private.word_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_id uuid not null references private.word_games(id),
  day date not null,
  language text not null check (language in ('es', 'ca')),
  status text not null default 'playing' check (status in ('playing', 'won', 'lost')),
  attempts integer not null default 0 check (attempts between 0 and 6),
  score integer not null default 0 check (score between 0 and 1000),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, day),
  check ((status = 'playing' and attempts < 6 and score = 0 and finished_at is null)
    or (status = 'lost' and attempts = 6 and score = 0 and finished_at is not null)
    or (status = 'won' and attempts >= 1 and score = 1000 - (attempts - 1) * 150 and finished_at is not null))
);
create index word_plays_game_idx on private.word_plays(game_id);
create index word_plays_ranking_idx on private.word_plays(language, day, user_id)
  include (score, status) where finished_at is not null;
create table private.word_guesses (
  play_id uuid not null references private.word_plays(id) on delete cascade,
  attempt integer not null check (attempt between 1 and 6),
  word text not null check (word ~ '^[A-ZÑÇ]{4,6}$'),
  feedback text[] not null check (cardinality(feedback) = char_length(word)
    and feedback <@ array['correct', 'present', 'absent']::text[]),
  submitted_at timestamptz not null default now(),
  primary key (play_id, attempt)
);

alter table private.word_dictionary enable row level security;
alter table private.word_games enable row level security;
alter table private.word_plays enable row level security;
alter table private.word_guesses enable row level security;
revoke all on private.word_dictionary, private.word_games, private.word_plays, private.word_guesses from public, anon, authenticated;
comment on table private.word_games is 'Daily secret solution; never return to clients before their game is complete.';
comment on table private.word_plays is 'One play per account/day across all languages. Scores written only by the server.';

create function private.word_normalize(p_word text) returns text
language sql immutable strict set search_path = '' as $$
  select translate(upper(trim(p_word)), 'ÁÉÍÓÚÜÀÈÏÒ', 'AEIOUUAEIO');
$$;

-- Curated launch vocabulary. Can be extended without changing the app.
insert into private.word_dictionary(language, word)
select 'es', private.word_normalize(w) from unnest(string_to_array(
  'AGUA ARROZ AVENA ACEITE ACEITE ACEITUNA ACELGA AZUCAR ATUN ANCHOA APIO AJO AJOS ALUBIA ALMENDRA BACON BATATA BATIDO BOLLO BONITO BOTE BOLSA BRIE BROCOLI CACAO CAFE CALDO CANELA CARNE CEBADA CEBOLLA CEREAL CEREZA CESTA CESTO CHICLE CHOCO CHORIZO CIRUELA CLAVO COBRO COLA COLIFLOR COMINO COMPRA CONGELADO COPOS CREMA CURRY DATIL DULCE ENVASE ESPINACA FIDEO FIDEOS FILETE FLAN FRUTA FRESA FRESON FRITO GALLETA GAMBAS GARBANZO GOMAS GOFRE GOFIO GRANO HABAS HARINA HELADO HIELO HIGOS HORNO HUEVO HUEVOS JAMON JABON JARRA JUDIA JUDIAS JUGO KAKI KILO KIWI LATA LATAS LECHE LENTEJA LEVADURA LIMON LIMA LOMO LONCHA LUBINA MAIZ MALTA MANGA MANGO MANTA MARCA MELON MERLUZA MERO MIEL MIGA MIGAS MOLDE MORAS MOSTAZA MUSLO NABO NATA NATAS NECTAR NUECES NUEZ OBLEA OLIVA OREJON OSTRA PAELLA PALITO PALOMITAS PANES PAPAYA PAPEL PASTA PASTEL PATATA PATO PAVO PEPINO PERA PERAS PEREJIL PESA PESO PESTO PICADA PIMENTON PIMIENTA PIMIENTOS PIZZA PLATO POLLO POMELO PRECIO PUERRO PULPO PURE QUESO RABANO RACION RAMEN RAPE ROLLO ROMERO RUCULA SACO SALSA SALMON SANDIA SEPIA SETAS SIROPE SOBRE SOJA SOPA SORBETE SURIMI TACOS TALLARIN TARRO TARTA TAZA TERNERA TIENDA TOMATE TOMILLO TORTA TRIGO TRUCHA TRUFA TURRON UBRE UVAS VAINA VASO VENTA VERDURA VINAGRE VINO YOGUR YUCA ZUMO', ' ')) w
where char_length(private.word_normalize(w)) between 4 and 6
on conflict do nothing;
insert into private.word_dictionary(language, word)
select 'ca', private.word_normalize(w) from unnest(string_to_array(
  'AIGUA ARROS AVENA CIVADA OLI OLIVA BLEDES SUCRE TONYINA ANXOVA API ALLS MONGETA AMETLLA BACO BATUT BRIOIX BONIT POT POTS BOSSA BRIE BROCOLI CACAU CAFE BROU CANYELLA CARN CEBA ORDI CEREAL CIRERA CISTELL CISTELLA XICLET XORIÇO PRUNA CLAU COLA COLS COMI COMPRA FLOCS CREMA CURRI DATIL DOLÇ DOLÇA ENVAS FIDEU FIDEUS FILET FLAM FRUITA MADUIXA FREGIT GALETA GAMBA GAMBES CIGRO CIGRONS GOFRE GRA GRANS FAVA FAVES FARINA GELAT GLAÇ FIGA FIGUES FORN FORNS OU OUS PERNIL SABO GERRA MONGETES SUC SUCS CAQUI QUILO KIWI LLAUNA LLET LLENTIA LLEVAT LLIMONA LLIMA LLOM LLOBARRO BLAT MALTA MANGO MANTA MARCA MELO LLUÇ MERO MEL MICA MOTLLE MORA MORES MOSTASSA CUIXA NAP NAPS NATA NECTAR NOUS NOU NEULA OSTRA OSTRES PAELLA PANETS PAPER PASTA PASTIS PATATA ANEC GALL DINDI COGOMBRE PERA PERES PES PESOS PESTO PICADA PEBRE PEBROT PIZZA PLAT POLLASTRE POMELO PREU PORRO POP PURE FORMATGE RAVE RACIO RAMEN RAP ROTLLE ROMANI RUCULA SAC SACS SALSA SALMO SINDRIA SEPIA BOLET BOLETS SIROP SOBRE SOIA SOPA SURIMI TACOS TALL TALLS POTET TARTA TASSA VEDELLA BOTIGA TOMAQUET FARIGOLA COCA TRUITA TOFONA TORRO RAIM BEINA GOT GOTS VENDA VERDURA VINAGRE VINS IOGURT IUCA SUCS REBOST CARRO CAIXA CANVI CUPÓ CUPONS TIQUET CEREALS MATÓ BROSSAT LLENTIES PEIX PEIXOS BISTEC BACALLA MUSCLO', ' ')) w
where char_length(private.word_normalize(w)) between 4 and 6
on conflict do nothing;

create function private.word_feedback(p_solution text, p_guess text) returns text[]
language plpgsql immutable strict set search_path = '' as $$
declare
  result text[] := array_fill('absent'::text, array[char_length(p_solution)]);
  remaining text[] := string_to_array(p_solution, null);
  i integer; position integer;
begin
  for i in 1..char_length(p_solution) loop
    if substr(p_guess, i, 1) = remaining[i] then
      result[i] := 'correct'; remaining[i] := null;
    end if;
  end loop;
  for i in 1..char_length(p_solution) loop
    if result[i] <> 'correct' then
      position := array_position(remaining, substr(p_guess, i, 1));
      if position is not null then result[i] := 'present'; remaining[position] := null; end if;
    end if;
  end loop;
  return result;
end;
$$;

create function private.word_snapshot(p_game_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare g private.word_games; p private.word_plays; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'WORD_AUTH_REQUIRED'; end if;
  select * into strict g from private.word_games where id = p_game_id;
  select * into p from private.word_plays where user_id = uid and game_id = g.id;
  return jsonb_build_object('id', g.id, 'day', g.day, 'language', g.language,
    'length', char_length(g.solution), 'status', coalesce(p.status, 'playing'),
    'score', coalesce(p.score, 0),
    'solution', case when p.status in ('won', 'lost') then g.solution else null end,
    'endsAt', (g.day + 1)::timestamp at time zone 'Europe/Madrid', 'serverNow', clock_timestamp(),
    'guesses', coalesce((select jsonb_agg(jsonb_build_object('word', word, 'feedback', feedback) order by attempt)
      from private.word_guesses where play_id = p.id), '[]'::jsonb));
end;
$$;

create function private.word_today(p_language text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  game uuid; chosen text;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  if p_language is null or p_language not in ('es', 'ca') then raise exception 'WORD_LANGUAGE_INVALID'; end if;
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

create function private.word_submit(p_game_id uuid, p_word text, p_expected_attempts integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date;
  g private.word_games; p private.word_plays; normalized text; n integer; won boolean;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  if p_expected_attempts is null or p_expected_attempts not between 0 and 5 then raise exception 'WORD_STALE'; end if;
  select * into g from private.word_games where id = p_game_id and day = today;
  if not found then raise exception 'WORD_EXPIRED'; end if;
  if p_word is null or char_length(p_word) > 32 then raise exception 'WORD_INVALID'; end if;
  normalized := private.word_normalize(p_word);
  if char_length(normalized) <> char_length(g.solution) or not exists (
    select 1 from private.word_dictionary where language = g.language and word = normalized and enabled
  ) then raise exception 'WORD_INVALID'; end if;

  -- Serialize this user's submissions (including two devices/languages). No
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

create function private.word_ranking(p_language text, p_period text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid(); today date := (now() at time zone 'Europe/Madrid')::date; first_day date; result jsonb;
begin
  if uid is null or not exists (select 1 from auth.users where id = uid) then raise exception 'WORD_AUTH_REQUIRED'; end if;
  if p_language is null or p_language not in ('es', 'ca') then raise exception 'WORD_LANGUAGE_INVALID'; end if;
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

create function public.word_game_today(p_language text default 'es') returns jsonb
language sql security invoker set search_path = '' as $$ select private.word_today(p_language); $$;
create function public.word_game_guess(p_game_id uuid, p_word text, p_expected_attempts integer) returns jsonb
language sql security invoker set search_path = '' as $$ select private.word_submit(p_game_id, p_word, p_expected_attempts); $$;
create function public.word_game_ranking(p_language text default 'es', p_period text default 'daily') returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.word_ranking(p_language, p_period); $$;

revoke all on function private.word_normalize(text), private.word_feedback(text,text), private.word_snapshot(uuid),
  private.word_today(text), private.word_submit(uuid,text,integer), private.word_ranking(text,text),
  public.word_game_today(text), public.word_game_guess(uuid,text,integer), public.word_game_ranking(text,text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.word_today(text), private.word_submit(uuid,text,integer), private.word_ranking(text,text),
  public.word_game_today(text), public.word_game_guess(uuid,text,integer), public.word_game_ranking(text,text) to authenticated;
