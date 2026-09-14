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
    const es = parseDailyWord(await today(uid));
    const requestedCa = parseDailyWord(await today(uid, 'ca'));
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
      submit: async (id, word, attempts) => {
        const result = parseDailyWord(await guess(uid, id, word, attempts));
        if (result.status === 'won') throw Error('Simulated lost HTTP response after commit');
        return result;
      },
    });
    await client.refresh();
    for (const word of words) { for (const letter of word) client.key(letter); await client.send(); }
    assert.equal(client.state.game.status, status);
    assert.equal(client.state.game.score, score);
    assert.equal(client.state.error, '');
    for (const period of ['daily', 'weekly', 'monthly', 'all']) {
      const ranks = parseWordRanking(await asUser(uid, 'select public.word_game_ranking($1,$2) data', ['es', period]));
      assert.equal(ranks.me.score, score);
    }
  }
  await query("update private.word_games set day=day-1 where id=$1", [game.id]);
  await assert.rejects(guess(A, game.id, 'ARROZ', 1), /WORD_EXPIRED/);
  const cPlay = (await query('select id from private.word_plays where user_id=$1', [C]))[0].id;
  await query('delete from auth.users where id=$1', [C]);
  assert.equal((await query('select count(*)::int n from private.word_guesses where play_id=$1', [cPlay]))[0].n,0);
  console.log('PASS: vocabulary', vocabulary, '· repeated letters · resume · retry · one daily play · language lock · scores · four rankings · privacy · permissions · expiry · full client/RPC win+loss+lost-response integration');
} finally { await db.close(); }
