#!/usr/bin/env node
// Real PostgreSQL semantics with PGlite; isolated users and zero production writes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const loadClient = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const { WordGameSession } = await loadClient('../src/lib/wordGameSession.ts');
const { parseDailyWord, parseWordRanking } = await loadClient('../src/lib/wordGamePayload.ts');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const migration = await readFile(new URL('../supabase/migrations/20260911184021_daily_word_game.sql', import.meta.url), 'utf8');
const dictionaryExpansion = await readFile(new URL('../supabase/migrations/20260912120048_expand_word_game_dictionary.sql', import.meta.url), 'utf8');
const spanishOnly = await readFile(new URL('../supabase/migrations/20260912153336_spanish_only_word_game.sql', import.meta.url), 'utf8');
const podium = await readFile(new URL('../supabase/migrations/20260912154950_word_ranking_podium.sql', import.meta.url), 'utf8');
const scoringV2 = await readFile(new URL('../supabase/migrations/20260916192534_word_game_scoring_v2.sql', import.meta.url), 'utf8');
const resultDuration = await readFile(new URL('../supabase/migrations/20260920165521_word_game_result_duration.sql', import.meta.url), 'utf8');
const resetHistory = await readFile(new URL('../supabase/migrations/20260916202042_word_game_start_now_reset_history.sql', import.meta.url), 'utf8');
const spanishDictionary = await readFile(new URL('../supabase/migrations/20260916201158_replace_word_game_dictionary_es_es.sql', import.meta.url), 'utf8');
const bonsaiDictionary = await readFile(new URL('../supabase/migrations/20260920163807_add_bonsai_to_word_game_dictionary.sql', import.meta.url), 'utf8');
const groupRanking = await readFile(new URL('../supabase/migrations/20260916210720_word_group_ranking.sql', import.meta.url), 'utf8');
const rankingHistory = await readFile(new URL('../supabase/migrations/20260916211402_word_ranking_period_history.sql', import.meta.url), 'utf8');
const rankingDemoUsers = await readFile(new URL('../supabase/migrations/20260919102242_seed_word_ranking_demo_users.sql', import.meta.url), 'utf8');
const removeRankingDemoUsers = await readFile(new URL('../supabase/migrations/20260925092356_remove_word_ranking_demo_users.sql', import.meta.url), 'utf8');
const addFourRankingDemoUsers = await readFile(new URL('../supabase/migrations/20260926195641_add_four_word_ranking_demo_users.sql', import.meta.url), 'utf8');
const removeFourRankingDemoUsers = await readFile(new URL('../supabase/migrations/20260927090604_remove_four_word_ranking_demo_users.sql', import.meta.url), 'utf8');
const expectedRejections = await readFile(new URL('../supabase/migrations/20260929131848_word_game_expected_rejections.sql', import.meta.url), 'utf8');
const A = '00000000-0000-0000-0000-000000000001';
const B = '00000000-0000-0000-0000-000000000002';
const C = '00000000-0000-0000-0000-000000000003';
const query = async (sql, params = []) => (await db.query(sql, params)).rows;
const asUser = async (uid, sql, params = []) => {
  await db.exec(`set role authenticated; set test.uid = '${uid}'`);
  try { return (await query(sql, params))[0]?.data; }
  finally { await db.exec('reset role; reset test.uid'); }
};
const today = (uid, lang = 'es') => asUser(uid, 'select public.word_game_today($1) data', [lang]);
const guess = (uid, game, word, attempts) => asUser(uid, 'select public.word_game_guess($1,$2,$3) data', [game, word, attempts]);
const guessV2 = (uid, game, word, attempts) => asUser(uid, 'select public.word_game_guess_v2($1,$2,$3) data', [game, word, attempts]);
const start = (uid, game) => asUser(uid, 'select public.word_game_start($1) data', [game]);
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;
    create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, username text, discoverable boolean);
    insert into auth.users values ('${A}'),('${B}'),('${C}');
    insert into public.profiles values ('${A}','ana',true),('${B}','private_name',false),('${C}','carla',true);
  `);
  await db.exec(migration);
  const vocabulary = await query('select language, count(*)::integer total from private.word_dictionary group by language');
  assert(vocabulary.every((row) => row.total >= 75));
  const feedback = async (solution, word) => (await query('select private.word_feedback($1,$2) data', [solution, word]))[0].data;
  assert.deepEqual(await feedback('ARROZ', 'RAZAS'), ['present', 'present', 'present', 'absent', 'absent']);
  assert.deepEqual(await feedback('PASTA', 'PATAS'), ['correct', 'correct', 'present', 'present', 'present']);
  assert.deepEqual(await feedback('LECHE', 'ELEEE'), ['present', 'present', 'absent', 'absent', 'correct']);
  assert.deepEqual(await feedback('ARROZ', 'RRRRR'), ['absent', 'correct', 'correct', 'absent', 'absent']);

  let game = await today(A);
  assert.equal(game.solution, null);
  assert.equal(game.guesses.length, 0);
  assert.equal((await query('select count(*)::integer n from private.word_plays'))[0].n, 0);
  // Pin only the isolated fixture; production picks an unpredictable word.
  await query("update private.word_games set solution='ARROZ' where id=$1", [game.id]);
  game = await today(A);
  assert.equal(game.length, 5);
  assert.equal((await today(B)).id, game.id);
  await assert.rejects(guess(A, game.id, 'AAAAA', 0), /WORD_INVALID/);
  await assert.rejects(guess(A, game.id, 'QUESO', 2), /WORD_STALE/);
  assert.equal((await query('select count(*)::integer n from private.word_plays'))[0].n, 0);
  let progress = await guess(A, game.id, 'QUESO', 0);
  assert.equal(progress.guesses.length, 1);
  assert.equal(progress.solution, null);
  assert.equal((await guess(A, game.id, 'QUESO', 0)).guesses.length, 1);
  assert.equal((await today(A)).guesses.length, 1);
  assert.equal((await today(A, 'ca')).language, 'es');
  const ca = await today(B, 'ca');
  await assert.rejects(guess(A, ca.id, (await query('select solution from private.word_games where id=$1', [ca.id]))[0].solution, 0), /WORD_STALE/);
  await assert.rejects(guess(A, game.id, 'LECHE', 0), /WORD_STALE/);
  await assert.rejects(guess(A, game.id, 'QUESO', 1), /WORD_REPEATED/);
  progress = await guess(A, game.id, 'arroz', 1);
  assert.equal(progress.status, 'won'); assert.equal(progress.score, 850); assert.equal(progress.solution, 'ARROZ');
  assert.equal((await guess(A, game.id, 'arroz', 1)).score, 850);
  await assert.rejects(guess(A, game.id, 'LECHE', 2), /WORD_STALE/);
  assert.equal((await today(B)).solution, null);
  assert.equal((await guess(B, game.id, 'ARROZ', 0)).score, 1000);
  for (const period of ['daily', 'weekly', 'monthly', 'all']) {
    const ranks = await asUser(A, 'select public.word_game_ranking($1,$2) data', ['es', period]);
    assert.equal(ranks.leaders.length, 2);
    assert.equal(ranks.leaders[0].username, null);
    assert.equal(ranks.me.rank, 2); assert.equal(ranks.me.score, 850);
    assert(!JSON.stringify(ranks).includes(B));
  }
  const lossWords = ['QUESO', 'LECHE', 'PAPEL', 'PASTA', 'FRUTA', 'HUEVO'];
  for (let i = 0; i < lossWords.length; i++) progress = await guess(C, game.id, lossWords[i], i);
  assert.equal(progress.status, 'lost'); assert.equal(progress.score, 0); assert.equal(progress.solution, 'ARROZ');
  assert.equal((await guess(C, game.id, 'HUEVO', 5)).guesses.length, 6);

  // Calendar periods exclude future rows and retain legitimate older scores.
  const past = (await query("select (date_trunc('month', now() at time zone 'Europe/Madrid')::date - 40)::text as day"))[0].day;
  const pastGame = (await query("insert into private.word_games(day,language,solution) values($1,'es','LECHE') returning id", [past]))[0].id;
  await query("insert into private.word_plays(user_id,game_id,day,language,status,attempts,score,finished_at) values($1,$2,$3,'es','won',1,1000,now())", [A,pastGame,past]);
  const allRanks = await asUser(A, "select public.word_game_ranking('es','all') data");
  assert.equal(allRanks.me.score,1850);
  for (const period of ['daily','weekly','monthly']) {
    const ranks = await asUser(A, 'select public.word_game_ranking($1,$2) data',['es',period]);
    assert.equal(ranks.me.score,850);
  }
  await query("update private.word_plays set attempts=2,score=850 where user_id=$1 and day=$2", [B,game.day]);
  const tied = await asUser(A, "select public.word_game_ranking('es','daily') data");
  assert.deepEqual(tied.leaders.slice(0,2).map((row)=>row.rank),[1,1]);
  // Restore the ranking-only fixture to match its actual single saved guess.
  await query("update private.word_plays set attempts=1,score=1000 where user_id=$1 and day=$2", [B,game.day]);
  const dst = await query(`select
    extract(epoch from ('2026-03-30'::timestamp at time zone 'Europe/Madrid' - '2026-03-29'::timestamp at time zone 'Europe/Madrid'))/3600 spring,
    extract(epoch from ('2026-10-26'::timestamp at time zone 'Europe/Madrid' - '2026-10-25'::timestamp at time zone 'Europe/Madrid'))/3600 autumn`);
  assert.equal(Number(dst[0].spring),23); assert.equal(Number(dst[0].autumn),25);

  // Every private table and internal answer helper must be inaccessible.
  for (const table of ['word_dictionary', 'word_games', 'word_plays', 'word_guesses']) {
    await assert.rejects(asUser(A, `select * from private.${table}`), /permission denied/);
  }
  await assert.rejects(asUser(A, 'select private.word_snapshot($1) data', [game.id]), /permission denied/);
  await assert.rejects(asUser(A, "update private.word_plays set score=1000"), /permission denied/);
  await assert.rejects(asUser('', "select public.word_game_today('es') data"), /WORD_AUTH_REQUIRED/);
  await assert.rejects(today('00000000-0000-0000-0000-000000000099'), /WORD_AUTH_REQUIRED/);
  await db.exec('set role anon');
  await assert.rejects(query("select public.word_game_today('es')"), /permission denied/);
  await db.exec('reset role');
  // Applying the vocabulary update to existing games must only add words.
  const snapshotTables = async () => Promise.all(['word_games', 'word_plays', 'word_guesses'].map(async (table) =>
    (await query(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb) data from private.${table} t`))[0].data));
  const beforeExpansion = await snapshotTables();
  const originalWords = await query('select * from private.word_dictionary order by language, word');
  await db.exec(dictionaryExpansion);
  const expandedWords = await query('select * from private.word_dictionary order by language, word');
  for (const original of originalWords) assert.deepEqual(expandedWords.find((row) => row.language === original.language && row.word === original.word), original);
  await db.exec(dictionaryExpansion);
  assert.deepEqual(await query('select * from private.word_dictionary order by language, word'), expandedWords);
  assert.deepEqual(await snapshotTables(), beforeExpansion);
  assert(expandedWords.every((row) => /^[A-ZÑÇ]{4,6}$/.test(row.word)));
  for (const word of ['LAVAR', 'COCER', 'PELAR', 'PLATOS', 'NEVERA', 'BUFFET', 'OFERTA', 'SUPER', 'REBAJA', 'ALIÑAR']) {
    assert(expandedWords.some((row) => row.language === 'es' && row.word === word && row.enabled));
  }
  for (const word of ['RENTAR', 'COURE', 'PELAR', 'PLATS', 'NEVERA', 'BUFET', 'OFERTA', 'SUPER']) {
    assert(expandedWords.some((row) => row.language === 'ca' && row.word === word && row.enabled));
  }
  // Preserve manual disabled flags on conflict; don't resurrect curated removals.
  await query("update private.word_dictionary set enabled=false where language='es' and word='LAVAR'");
  await db.exec(dictionaryExpansion);
  assert.equal((await query("select enabled from private.word_dictionary where language='es' and word='LAVAR'"))[0].enabled, false);
  await query("update private.word_dictionary set enabled=true where language='es' and word='LAVAR'");
  // Play every requested example against the real RPC, in disposable transactions.
  for (const [language, words] of [
    ['es', ['LAVAR', 'COCER', 'PELAR', 'PLATOS', 'NEVERA', 'BUFFET', 'OFERTA', 'SUPER', 'REBAJA', 'ALIÑAR']],
    ['ca', ['RENTAR', 'COURE', 'PELAR', 'PLATS', 'NEVERA', 'BUFET', 'OFERTA', 'SUPER']],
  ]) {
    for (const word of words) {
      await db.exec('begin');
      try {
        const uid = (await query('insert into auth.users values(gen_random_uuid()) returning id'))[0].id;
        const daily = await today(uid, language);
        await query('update private.word_games set solution=$1 where id=$2', [word, daily.id]);
        // Verify historical migrations before upgrading to the Spanish-only API.
        const won = await guess(uid, daily.id, word.toLowerCase(), 0);
        assert.equal(won.status, 'won'); assert.equal(won.score, 1000);
      } finally { await db.exec('rollback'); }
    }
  }
  console.log('PASS: expanded vocabulary', await query('select language, count(*)::integer total from private.word_dictionary group by language'), '· additive · idempotent · existing games unchanged · requested words playable');
  const beforeSpanishOnly = await snapshotTables();
  await db.exec(spanishOnly);
  assert.deepEqual(await snapshotTables(), beforeSpanishOnly);
  assert.equal((await query("select count(*)::int n from private.word_dictionary where language='ca' and enabled"))[0].n, 0);
  assert.equal((await query("select count(*)::int n from private.word_dictionary where language='es' and enabled"))[0].n, 439);
  await assert.rejects(guess(A, ca.id, 'ARROS', 0), /WORD_EXPIRED/);
  await assert.rejects(query("update private.word_dictionary set enabled=true where language='ca'"), /word_dictionary_enabled_spanish_only/);
  await assert.rejects(query("update private.word_plays set language='ca' where user_id=$1", [A]), /word_plays_spanish_only/);
  for (const uid of [A, B, C]) {
    const es = await today(uid);
    const requestedCa = await today(uid, 'ca');
    assert.equal(requestedCa.id, es.id);
    assert.equal(requestedCa.language, 'es');
    assert.deepEqual(requestedCa.guesses, es.guesses);
    assert.equal((await asUser(uid, "select private.word_today('ca') data")).id, es.id);
    for (const period of ['daily', 'weekly', 'monthly', 'all']) {
      const esRank = await asUser(uid, 'select public.word_game_ranking($1,$2) data', ['es', period]);
      assert.deepEqual(await asUser(uid, 'select public.word_game_ranking($1,$2) data', ['ca', period]), esRank);
      assert.deepEqual(await asUser(uid, 'select private.word_ranking($1,$2) data', ['ca', period]), esRank);
    }
  }
  console.log('PASS: Spanish-only upgrade preserves games/guesses/scores · Catalan requests share all four rankings · legacy Catalan game blocked');
  await db.exec(`alter table public.profiles add column avatar_url text, add column premium_until timestamptz;
    update public.profiles set avatar_url='https://example.com/avatar.png', premium_until=now()+interval '1 day';`);
  const beforePodium = await snapshotTables();
  await db.exec(podium);
  assert.deepEqual(await snapshotTables(), beforePodium);
  const podiumRanks = parseWordRanking(await asUser(A, "select public.word_game_ranking('es','daily') data"));
  assert.equal(podiumRanks.me.avatarUrl, 'https://example.com/avatar.png');
  assert.equal(podiumRanks.me.isPlus, true);
  assert.equal(podiumRanks.leaders[0].username, null);
  assert.equal(podiumRanks.leaders[0].avatarUrl, null);
  assert.equal(podiumRanks.leaders[0].isPlus, false);
  const privateSelf = parseWordRanking(await asUser(B, "select public.word_game_ranking('es','daily') data"));
  assert.equal(privateSelf.me.isPlus, true);
  assert.equal(privateSelf.me.avatarUrl, 'https://example.com/avatar.png');
  await query("update public.profiles set premium_until=now()-interval '1 second' where id=$1", [A]);
  assert.equal((await asUser(A, "select public.word_game_ranking('es','daily') data")).me.isPlus, false);
  for (const period of ['daily', 'weekly', 'monthly', 'all']) {
    assert.deepEqual(await asUser(A, 'select public.word_game_ranking($1,$2) data', ['ca', period]),
      await asUser(A, 'select public.word_game_ranking($1,$2) data', ['es', period]));
  }
  console.log('PASS: podium photos/Plus · hidden profile privacy · expired Plus · all periods · scores unchanged');
  const beforeScoring = await snapshotTables();
  await db.exec(scoringV2);
  await db.exec(resultDuration);
  assert.deepEqual(await snapshotTables(), beforeScoring.map((rows, index) => index === 1
    ? rows.map((row) => ({ ...row, scoring_version: 1 })) : rows));
  assert.equal((await query("select start_day = (now() at time zone 'Europe/Madrid')::date + 1 as tomorrow from private.word_scoring_cutover"))[0].tomorrow, true);
  assert.equal((await query("select private.word_score_v2(2,6,'2026-09-21 12:00+00','2026-09-21 12:02+00','2026-09-21') score"))[0].score, 87);
  assert.equal((await query("select private.word_score_v2(2,6,'2026-09-20 12:00+00','2026-09-20 12:02+00','2026-09-20') score"))[0].score, 174);
  assert.equal((await query("select private.word_score_v2(1,4,'2026-09-21 12:00+00','2026-09-21 12:00:19+00','2026-09-21') score"))[0].score, 100);
  assert.equal((await query("select private.word_score_v2(1,4,'2026-09-21 12:00+00','2026-09-21 12:00:20+00','2026-09-21') score"))[0].score, 95);
  assert.equal((await query("select private.word_score_v2(1,5,'2026-09-21 12:00+00','2026-09-21 12:00+00','2026-09-21') score"))[0].score, 120);
  assert.equal((await query("select private.word_score_v2(1,6,'2026-09-20 12:00+00','2026-09-20 12:00+00','2026-09-20') score"))[0].score, 280);
  assert.equal((await query("select private.word_score_v2(6,4,'2026-09-21 00:00+00','2026-09-21 23:00+00','2026-09-21') score"))[0].score, 1);
  await assert.rejects(asUser(A, 'select * from private.word_scoring_cutover'), /permission denied/);
  await assert.rejects(asUser(A, "select private.word_score_v2(1,4,now(),now(),current_date)"), /permission denied/);
  // Full production client controller → real RPC functions → PostgreSQL.
  // No reimplementation of scoring/evaluation in this integration test.
  for (const [uid, words, status, score] of [
    ['00000000-0000-0000-0000-000000000004', ['QUESO', 'ARROZ'], 'won', 850],
    ['00000000-0000-0000-0000-000000000005', lossWords, 'lost', 0],
  ]) {
    await query('insert into auth.users values($1)', [uid]);
    let saved = null;
    const client = new WordGameSession({
      storageKey: uid,
      readDraft: async () => saved, writeDraft: async (value) => { saved = value; },
      today: async () => parseDailyWord(await today(uid, 'ca')),
      start: async (id) => parseDailyWord(await start(uid, id)),
      submit: async (id, word, attempts) => {
        const result = parseDailyWord(await guess(uid, id, word, attempts));
        if (result.status === 'won') throw Error('Simulated lost HTTP response after commit');
        return result;
      },
    });
    await client.refresh();
    await client.start();
    for (const word of words) { for (const letter of word) client.key(letter); await client.send(); }
    assert.equal(client.state.game.status, status);
    assert.equal(client.state.game.score, score);
    assert.equal(client.state.error, '');
    for (const period of ['daily', 'weekly', 'monthly', 'all']) {
      const ranks = parseWordRanking(await asUser(uid, 'select public.word_game_ranking($1,$2) data', ['es', period]));
      assert.equal(ranks.me.score, score);
    }
  }
  // Simulate the cutover at Madrid midnight: move old fixture plays to the
  // previous day, then make the current day the first v2 season day.
  await query('update private.word_plays set day=day-1 where game_id=$1', [game.id]);
  await query('update private.word_games set day=day-1 where id=$1', [game.id]);
  await query("update private.word_scoring_cutover set start_day=(now() at time zone 'Europe/Madrid')::date where id");
  const V2 = '00000000-0000-0000-0000-000000000006';
  await query('insert into auth.users values($1)', [V2]);
  const newGame = await today(V2);
  await query("update private.word_games set solution='ARROZ' where id=$1", [newGame.id]);
  await assert.rejects(guess(V2, newGame.id, 'ARROZ', 0), /WORD_START_REQUIRED/);
  const began = parseDailyWord(await start(V2, newGame.id));
  assert.equal(began.scoringVersion, 2);
  assert.equal((await start(V2, newGame.id)).startedAt, began.startedAt);
  await query("update private.word_plays set started_at=clock_timestamp()-interval '120 seconds' where user_id=$1", [V2]);
  const victory = parseDailyWord(await guess(V2, newGame.id, 'ARROZ', 0));
  const expectedVictory = new Date(`${newGame.day}T12:00:00Z`).getUTCDay() === 0 ? 176 : 88;
  assert.equal(victory.score, expectedVictory);
  assert(victory.durationSeconds >= 120 && victory.durationSeconds <= 121);
  assert.equal((await guess(V2, newGame.id, 'ARROZ', 0)).score, expectedVictory);
  await assert.rejects(query('update private.word_plays set score=281 where user_id=$1', [V2]), /word_plays_score_rules/);
  assert.equal((await asUser(V2, "select public.word_game_ranking('es','all') data")).me.score, expectedVictory);
  assert.equal((await asUser(A, "select public.word_game_ranking('es','all') data")).me, null);
  assert.equal((await asUser(A, "select public.word_game_ranking('es','previous') data")).me.score, 1850);
  console.log('PASS: v2 cutover · 20-second brackets · word length · Sunday double · explicit idempotent start · saved retry score · season ranking');
  const beforeDictionary = await snapshotTables();
  await db.exec(spanishDictionary);
  assert.deepEqual(await snapshotTables(), beforeDictionary);
  assert.equal((await query("select count(*)::int n from private.word_dictionary where language='es' and enabled"))[0].n, 31889);
  for (const word of ['UVAS', 'PANES', 'PECES', 'HUEVOS', 'TAZAS', 'LIBRO', 'CASAS']) {
    assert.equal((await query("select enabled from private.word_dictionary where language='es' and word=$1", [word]))[0]?.enabled, true);
  }
  const oldOnly = (await query("select word from private.word_dictionary where language='es' and not enabled limit 1"))[0]?.word;
  assert(oldOnly, 'Old local-only words remain only as disabled FK references');
  await query('update private.word_games set solution=$1 where id=$2', [oldOnly, newGame.id]);
  const legacyPlayer = '00000000-0000-0000-0000-000000000007';
  await query('insert into auth.users values($1)', [legacyPlayer]);
  await start(legacyPlayer, newGame.id);
  assert.equal((await guess(legacyPlayer, newGame.id, oldOnly, 0)).status, 'won');
  await db.exec(spanishDictionary);
  assert.equal((await query("select count(*)::int n from private.word_dictionary where language='es' and enabled"))[0].n, 31889);
  await db.exec(bonsaiDictionary);
  assert.equal((await query("select count(*)::int n from private.word_dictionary where language='es' and enabled"))[0].n, 31890);
  assert.equal((await query("select enabled from private.word_dictionary where language='es' and word='BONSAI'"))[0]?.enabled, true);
  const bonsaiPlayer = '00000000-0000-0000-0000-000000000008';
  await query('insert into auth.users values($1)', [bonsaiPlayer]);
  await query("update private.word_games set solution='BONSAI' where id=$1", [newGame.id]);
  await start(bonsaiPlayer, newGame.id);
  assert.equal((await guess(bonsaiPlayer, newGame.id, 'bonsai', 0)).status, 'won');
  await db.exec(bonsaiDictionary);
  assert.equal((await query("select count(*)::int n from private.word_dictionary where language='es' and enabled"))[0].n, 31890);
  console.log('PASS: es_ES dictionary · plurals · general vocabulary · curated BONSAI · old-only entries disabled · idempotent imports');
  await assert.rejects(guess(A, game.id, 'ARROZ', 1), /WORD_EXPIRED/);
  const cPlay = (await query('select id from private.word_plays where user_id=$1', [C]))[0].id;
  await query('delete from auth.users where id=$1', [C]);
  assert.equal((await query('select count(*)::int n from private.word_guesses where play_id=$1', [cPlay]))[0].n,0);
  console.log('PASS: vocabulary', vocabulary, '· repeated letters · resume · retry · one daily play · language lock · scores · four rankings · privacy · permissions · expiry · full client/RPC win+loss+lost-response integration');

  assert((await query('select count(*)::int n from private.word_plays'))[0].n > 0);
  const dictionaryCount = (await query("select count(*)::int n from private.word_dictionary where language='es' and enabled"))[0].n;
  const challengeCount = (await query('select count(*)::int n from private.word_games'))[0].n;
  await db.exec(resetHistory);
  for (const table of ['word_guesses', 'word_plays']) {
    assert.equal((await query(`select count(*)::int n from private.${table}`))[0].n, 0);
  }
  assert.equal((await query("select start_day=(now() at time zone 'Europe/Madrid')::date as active from private.word_scoring_cutover where id"))[0].active, true);
  assert.equal((await query("select count(*)::int n from private.word_dictionary where language='es' and enabled"))[0].n, dictionaryCount);
  assert.equal((await query('select count(*)::int n from private.word_games'))[0].n, challengeCount);
  const fresh = await today(V2);
  assert.equal(fresh.id, newGame.id);
  assert.equal(fresh.scoringVersion, 2);
  await query("update private.word_games set solution='ARROZ' where id=$1", [fresh.id]);
  await start(V2, fresh.id);
  const freshScore = expectedVictory === 176 ? 240 : 120;
  assert.equal((await guess(V2, fresh.id, 'ARROZ', 0)).score, freshScore);
  assert.equal((await asUser(V2, "select public.word_game_ranking('es','all') data")).me.score, freshScore);
  assert.equal((await asUser(A, "select public.word_game_ranking('es','previous') data")).me, null);
  console.log('PASS: immediate v2 cutover · all guesses and plays removed · challenges and dictionary intact · reset challenge scores correctly');

  await db.exec(`create table public.group_members(group_id uuid not null, user_id uuid not null references auth.users(id), primary key(group_id,user_id));`);
  const groupId = '10000000-0000-0000-0000-000000000001';
  const otherGroup = '10000000-0000-0000-0000-000000000002';
  await query('insert into public.group_members(group_id,user_id) values ($1,$2),($1,$3),($1,$4),($5,$6)',
    [groupId, A, B, V2, otherGroup, V2]);
  await db.exec(groupRanking);
  await start(B, fresh.id);
  assert.equal((await guess(B, fresh.id, 'ARROZ', 0)).status, 'won');
  await assert.rejects(asUser(A, "select public.word_game_ranking('es','previous') data"), /WORD_PERIOD_INVALID/);
  await assert.rejects(asUser(A, 'select public.word_game_group_ranking($1,$2) data', [otherGroup, 'daily']), /WORD_GROUP_FORBIDDEN/);
  await assert.rejects(asUser(A, 'select public.word_game_group_ranking($1,$2) data', [null, 'daily']), /WORD_GROUP_FORBIDDEN/);
  await assert.rejects(asUser(A, 'select public.word_game_group_ranking($1,$2) data', [groupId, 'previous']), /WORD_PERIOD_INVALID/);
  await assert.rejects(asUser('', 'select public.word_game_group_ranking($1,$2) data', [groupId, 'daily']), /WORD_AUTH_REQUIRED/);
  await db.exec('set role anon');
  await assert.rejects(query('select public.word_game_group_ranking($1,$2)', [groupId, 'daily']), /permission denied/);
  await db.exec('reset role');
  const groupRanks = parseWordRanking(await asUser(A, 'select public.word_game_group_ranking($1,$2) data', [groupId, 'daily']));
  assert.equal(groupRanks.leaders.length, 2);
  assert(groupRanks.leaders.every((row) => row.score === freshScore && !row.isMe));
  assert.equal(groupRanks.leaders.find((row) => row.username === null)?.avatarUrl, null);
  assert(!JSON.stringify(groupRanks).includes('private_name'));
  assert.equal(groupRanks.me, null);
  for (const period of ['daily', 'weekly', 'monthly', 'all']) {
    const result = parseWordRanking(await asUser(V2, 'select public.word_game_group_ranking($1,$2) data', [groupId, period]));
    assert.equal(result.me.score, freshScore);
    assert.equal(result.leaders.length, 2);
  }
  await query('delete from public.group_members where group_id=$1 and user_id=$2', [groupId, V2]);
  assert.equal((await asUser(A, 'select public.word_game_group_ranking($1,$2) data', [groupId, 'all'])).leaders.length, 1);
  await assert.rejects(asUser(V2, 'select public.word_game_group_ranking($1,$2) data', [groupId, 'daily']), /WORD_GROUP_FORBIDDEN/);
  console.log('PASS: retired previous ranking · group ranking filters current members · access checks · four periods');

  await db.exec(rankingHistory);
  const window = (uid, period, offset, group = null) =>
    asUser(uid, 'select public.word_game_ranking_window($1,$2,$3) data', [period, offset, group]);
  for (const period of ['daily', 'weekly', 'monthly', 'yearly']) {
    assert.equal((await window(A, period, 0)).hasPrevious, false);
    await assert.rejects(window(A, period, 1), /WORD_PERIOD_UNAVAILABLE/);
  }
  await query("update private.word_scoring_cutover set start_day=date_trunc('year', now() at time zone 'Europe/Madrid')::date - 1 where id");
  const yesterday = (await query("select ((now() at time zone 'Europe/Madrid')::date - 1)::text as value"))[0].value;
  const lastYear = (await query("select (date_trunc('year', now() at time zone 'Europe/Madrid')::date - 1)::text as value"))[0].value;
  for (const [day, score] of [[yesterday, 85], [lastYear, 100]]) {
    const id = (await query("insert into private.word_games(day,language,solution) values($1,'es','ARROZ') on conflict(day,language) do update set solution='ARROZ' returning id", [day]))[0].id;
    await query("insert into private.word_plays(user_id,game_id,day,language,status,attempts,score,finished_at,scoring_version) values($1,$2,$3,'es','won',1,$4,now(),2)", [A,id,day,score]);
  }
  const currentDay = await window(A, 'daily', 0);
  assert.equal(currentDay.hasPrevious, true);
  assert.equal(currentDay.periodStart, currentDay.periodEnd);
  assert.equal(currentDay.leaders.length, 2);
  const closedDay = await window(A, 'daily', 1);
  assert.equal(closedDay.periodStart, yesterday);
  assert.equal(closedDay.periodEnd, yesterday);
  assert.equal(closedDay.me.score, 85);
  assert.equal(closedDay.leaders.length, 1);
  assert.equal((await window(A, 'weekly', 0)).me.score, 85);
  assert.equal((await window(A, 'monthly', 0)).me.score, 85);
  assert.equal((await window(A, 'yearly', 0)).me.score, 85);
  const closedYear = await window(A, 'yearly', 1);
  assert.equal(closedYear.me.score, 100);
  assert.equal(closedYear.periodStart.slice(0,4), String(Number(currentDay.periodStart.slice(0,4))-1));
  assert.equal((await window(A, 'all', 0)).me.score, 185);
  assert.equal((await window(A, 'daily', 1, groupId)).me.score, 85);
  assert.equal((await window(A, 'daily', 0, groupId)).leaders.length, 1);
  await assert.rejects(window(V2, 'daily', 0, groupId), /WORD_GROUP_FORBIDDEN/);
  await assert.rejects(window(A, 'daily', -1), /WORD_PERIOD_INVALID/);
  await assert.rejects(window(A, 'all', 1), /WORD_PERIOD_INVALID/);
  await assert.rejects(window(A, 'yearly', 2), /WORD_PERIOD_UNAVAILABLE/);
  await db.exec('set role anon');
  await assert.rejects(query("select public.word_game_ranking_window('daily',0,null)"), /permission denied/);
  await db.exec('reset role');
  console.log('PASS: annual and archived period rankings · Madrid calendar boundaries · group scope · unavailable/future periods · permissions');

  await db.exec(rankingDemoUsers);
  assert.equal((await query('select count(distinct bot_id)::int n from private.word_ranking_fixtures'))[0].n, 100);
  assert.equal((await query("select count(*)::int n from private.word_ranking_fixtures where day=(now() at time zone 'Europe/Madrid')::date"))[0].n, 100);
  for (const period of ['daily', 'weekly', 'monthly', 'yearly']) {
    const result = parseWordRanking(await window(A, period, 0));
    assert.equal(result.leaders.filter((row) => row.username?.startsWith('demo_')).length, 100);
  }
  assert.equal((await window(A, 'all', 0)).leaders.some((row) => row.username?.startsWith('demo_')), false);
  assert.equal((await window(A, 'daily', 0, groupId)).leaders.some((row) => row.username?.startsWith('demo_')), false);
  for (const period of ['daily', 'weekly', 'monthly']) {
    const result = parseWordRanking(await asUser(A, 'select public.word_game_ranking($1,$2) data', ['es', period]));
    assert.equal(result.leaders.filter((row) => row.username?.startsWith('demo_')).length, 100);
  }
  assert.equal((await asUser(A, "select public.word_game_ranking('es','all') data")).leaders.some((row) => row.username?.startsWith('demo_')), false);
  await assert.rejects(asUser(A, 'select * from private.word_ranking_fixtures'), /permission denied/);
  console.log('PASS: 100 non-login demo participants · daily/weekly/monthly/yearly · no group/all-time leakage · legacy client');
  const optimizedRanking = await readFile(new URL('../supabase/migrations/20260920155016_word_ranking_read_optimization.sql', import.meta.url), 'utf8');
  const cases = [];
  for (const uid of [A, B, V2]) for (const period of ['daily', 'weekly', 'monthly', 'yearly', 'all']) {
    cases.push({ uid, period, offset: 0, group: null, before: await window(uid, period, 0) });
  }
  cases.push({ uid: A, period: 'daily', offset: 1, group: null, before: await window(A, 'daily', 1) });
  cases.push({ uid: A, period: 'weekly', offset: 0, group: groupId, before: await window(A, 'weekly', 0, groupId) });

  // Synthetic scale stays in this disposable in-memory database.
  await db.exec(`
    insert into auth.users select md5('word-perf-' || n)::uuid from generate_series(1,10000) n;
    insert into public.profiles(id,username,discoverable)
      select md5('word-perf-' || n)::uuid, 'perf_' || n, n % 2 = 0 from generate_series(1,10000) n;
    insert into private.word_plays(user_id,game_id,day,language,status,attempts,score,finished_at,scoring_version)
      select md5('word-perf-' || n)::uuid, g.id, g.day, 'es','won',1,1 + n % 200,now(),2
      from generate_series(1,10000) n cross join private.word_games g
      where g.day = (now() at time zone 'Europe/Madrid')::date and g.language='es';
    analyze private.word_plays; analyze public.profiles;
  `);
  const perfUser = (await query("select md5('word-perf-1')::uuid as id"))[0].id;
  const benchmark = async () => {
    const samples = [];
    let result;
    for (let i=0; i<6; i++) {
      const started = performance.now(); result = await window(perfUser,'daily',0);
      if (i) samples.push(performance.now()-started);
    }
    samples.sort((a,b)=>a-b);
    return { ms: samples[2], result };
  };
  const baseline = await benchmark();
  await db.exec(optimizedRanking);
  const optimized = await benchmark();
  assert.deepEqual(optimized.result, baseline.result);
  assert.equal(optimized.result.leaders.length, 150);
  assert(optimized.result.me.rank > 150, 'own position outside the first 150 survives');
  await db.exec("delete from auth.users where id in (select md5('word-perf-' || n)::uuid from generate_series(1,10000) n)");
  for (const c of cases) assert.deepEqual(await window(c.uid,c.period,c.offset,c.group),c.before);
  await assert.rejects(window(A,'daily',0,otherGroup), /WORD_GROUP_FORBIDDEN/);
  await assert.rejects(asUser('', "select public.word_game_ranking_window('daily',0,null) data"), /WORD_AUTH_REQUIRED/);
  await db.exec('set role anon');
  await assert.rejects(query("select public.word_game_ranking_window('daily',0,null)"), /permission denied/);
  await db.exec('reset role');
  console.log(`PASS: optimized SQL parity, ties, privacy, permissions, own rank >150; 10,000 synthetic players median ${baseline.ms.toFixed(1)} → ${optimized.ms.toFixed(1)} ms`);

  await db.exec(removeRankingDemoUsers);
  assert.equal((await query("select to_regclass('private.word_ranking_fixtures') is null as removed"))[0].removed, true);
  for (const period of ['daily', 'weekly', 'monthly', 'yearly', 'all']) {
    const result = parseWordRanking(await window(A, period, 0));
    assert.equal(result.leaders.some((row) => row.username?.startsWith('demo_')), false);
  }
  for (const period of ['daily', 'weekly', 'monthly', 'all']) {
    const result = parseWordRanking(await asUser(A, 'select public.word_game_ranking($1,$2) data', ['es', period]));
    assert.equal(result.leaders.some((row) => row.username?.startsWith('demo_')), false);
  }
  assert.equal((await window(A, 'daily', 0, groupId)).leaders.some((row) => row.username?.startsWith('demo_')), false);
  console.log('PASS: demo ranking table removed · only real players remain in current, archived, group and legacy rankings');

  await db.exec(await readFile(new URL('../supabase/migrations/20260926113035_word_profile_statistics.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260926133620_add_current_word_streak.sql', import.meta.url), 'utf8'));
  await db.exec(addFourRankingDemoUsers);
  const demoNames = ['demo_001', 'demo_002', 'demo_003', 'demo_004'];
  for (const offset of [0, 1]) {
    const result = parseWordRanking(await window(A, 'daily', offset));
    const demos = result.leaders.filter((row) => row.username?.startsWith('demo_'));
    assert.deepEqual(demos.map((row) => row.username).sort(), demoNames);
    assert(demos.some((row) => row.rank >= 4));
    assert(demos.every((row) => !row.isMe && !row.isPlus && !row.avatarUrl));
    if (result.me) assert(result.me.isMe);
  }
  for (const period of ['weekly', 'monthly', 'yearly']) {
    const result = parseWordRanking(await window(A, period, 0));
    assert.deepEqual(result.leaders.filter((row) => row.username?.startsWith('demo_'))
      .map((row) => row.username).sort(), demoNames);
  }
  for (const [period, offset, group] of [['daily', 2, null], ['all', 0, null], ['daily', 0, groupId]]) {
    assert.equal((await window(A, period, offset, group)).leaders.some((row) => row.username?.startsWith('demo_')), false);
  }
  assert.deepEqual((await asUser(A, "select public.word_game_ranking('es','daily') data"))
    .leaders.filter((row) => row.username?.startsWith('demo_')).map((row) => row.username).sort(), demoNames);
  assert.equal((await query("select to_regclass('private.word_ranking_fixtures') is null as removed"))[0].removed, true);
  console.log('PASS: four virtual demo users · today and yesterday · current periods · no group/all-time or old archive leakage');

  await db.exec(removeFourRankingDemoUsers);
  for (const [period, offset] of [['daily', 0], ['daily', 1], ['daily', 2], ['weekly', 0], ['monthly', 0], ['yearly', 0], ['all', 0]]) {
    assert.equal((await window(A, period, offset)).leaders.some((row) => row.username?.startsWith('demo_')), false);
  }
  assert.equal((await window(A, 'daily', 0, groupId)).leaders.some((row) => row.username?.startsWith('demo_')), false);
  assert.equal((await asUser(A, "select public.word_game_ranking('es','daily') data"))
    .leaders.some((row) => row.username?.startsWith('demo_')), false);
  console.log('PASS: four virtual demo users removed · current, archived, group and legacy rankings contain only real players');

  await db.exec(expectedRejections);
  const rejectionPlayer = '00000000-0000-0000-0000-000000000009';
  await query('insert into auth.users values($1)', [rejectionPlayer]);
  const rejectionGame = await today(rejectionPlayer);
  await query("update private.word_games set solution='ARROZ' where id=$1", [rejectionGame.id]);
  await start(rejectionPlayer, rejectionGame.id);
  assert.deepEqual(await guessV2(rejectionPlayer, rejectionGame.id, 'AAAAA', 0),
    { accepted: false, reason: 'WORD_INVALID' });
  assert.equal((await query('select attempts from private.word_plays where user_id=$1', [rejectionPlayer]))[0].attempts, 0);
  const acceptedGuess = await guessV2(rejectionPlayer, rejectionGame.id, 'QUESO', 0);
  assert.equal(acceptedGuess.accepted, true);
  assert.equal(acceptedGuess.game.guesses.length, 1);
  assert.deepEqual(await guessV2(rejectionPlayer, rejectionGame.id, 'QUESO', 1),
    { accepted: false, reason: 'WORD_REPEATED' });
  assert.equal((await query('select attempts from private.word_plays where user_id=$1', [rejectionPlayer]))[0].attempts, 1);
  await assert.rejects(guess(rejectionPlayer, rejectionGame.id, 'AAAAA', 1), /WORD_INVALID/);
  await assert.rejects(guessV2(rejectionPlayer, rejectionGame.id, 'LECHE', 0), /WORD_STALE/);
  await assert.rejects(guessV2('', rejectionGame.id, 'LECHE', 1), /WORD_AUTH_REQUIRED/);
  await db.exec('set role anon');
  await assert.rejects(query("select public.word_game_guess_v2(null,'AAAAA',0)"), /permission denied/);
  await db.exec('reset role');
  console.log('PASS: expected invalid/repeated guesses return data · attempts intact · legacy RPC and real errors unchanged · ACL');

  await query('insert into auth.users values($1)', [C]); // Fresh account, no completed plays.
  const stats = (uid) => asUser(uid, 'select public.word_game_profile_statistics() data');
  for (const uid of [A, B, C]) {
    const result = await stats(uid);
    const own = await query(`select day::text, status from private.word_plays where user_id=$1
      and finished_at is not null and language='es' and scoring_version=2
      and day between (select start_day from private.word_scoring_cutover where id=true)
        and (now() at time zone 'Europe/Madrid')::date order by day`, [uid]);
    let best = 0, streak = 0, last = 0;
    for (const row of own) {
      const stamp = Date.parse(row.day);
      streak = stamp - last === 86400000 ? streak + 1 : 1;
      best = Math.max(best, streak); last = stamp;
    }
    assert.equal(result.currentStreak, last === Date.parse(result.today) ? streak : 0);
    assert.equal(result.bestStreak, best);
    assert.equal(result.completedCount, own.length);
    const from = new Date(result.today + 'T12:00:00Z');
    from.setUTCDate(1); from.setUTCMonth(from.getUTCMonth()-11);
    assert.deepEqual(result.activityDays, own.map(r=>r.day).filter(day=>day>=from.toISOString().slice(0,10)));
    for (const period of ['daily','weekly','monthly','yearly']) {
      const positions = [];
      for (let offset=0; offset<1200; offset++) {
        let ranking;
        try { ranking = await window(uid,period,offset); }
        catch (error) { if (/WORD_PERIOD_UNAVAILABLE/.test(error.message)) break; throw error; }
        if (ranking.me) positions.push(ranking.me.rank);
        if (!ranking.hasPrevious) break;
      }
      assert.equal(result.bestPositions[period]?.rank ?? null, positions.length ? Math.min(...positions) : null);
    }
  }
  await assert.rejects(stats(''), /WORD_AUTH_REQUIRED/);
  await db.exec('set role anon');
  await assert.rejects(query('select public.word_game_profile_statistics()'), /permission denied/);
  await db.exec('reset role');
  console.log('PASS: own profile statistics, completed wins/losses, streak gaps, all four ranking records, auth and anonymous denial');
} finally { await db.close(); }
