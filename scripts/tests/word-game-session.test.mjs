import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Execute production TypeScript, with only the transport, storage and clock replaced.
async function source(path) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { WordGameSession, wordDraftKey } = await source('src/lib/wordGameSession.ts');
const { parseDailyWord, parseWordRanking } = await source('src/lib/wordGamePayload.ts');
const emptyGame = (patch = {}) => ({
  id: 'day-one', day: '2026-09-11', language: 'es', length: 5, status: 'playing',
  guesses: [], score: 0, solution: null, serverNow: '2026-09-11T12:00:00Z', endsAt: '2026-09-11T22:00:00Z', ...patch,
});
const turn = (word, correct = false) => ({ word, feedback: Array(word.length).fill(correct ? 'correct' : 'absent') });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; let reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let fixtureId = 0;
function fixture() {
  const storageKey = `test-user-${++fixtureId}`;
  const f = { game: emptyGame(), saved: null, now: 0, calls: [], reads: 0, offline: false };
  f.today = async () => { f.reads++; if (f.offline) throw Error('offline'); return structuredClone(f.game); };
  f.submit = async (id, word, attempts) => {
    f.calls.push({ id, word, attempts });
    if (f.offline) throw Error('offline');
    if (f.game.guesses[attempts]?.word === word) return structuredClone(f.game);
    if (attempts !== f.game.guesses.length || f.game.status !== 'playing') throw Error('WORD_STALE');
    if (word === 'ZZZZZ') throw Error('WORD_INVALID');
    if (f.game.guesses.some((guess) => guess.word === word)) throw Error('WORD_REPEATED');
    const won = word === 'ARROZ';
    f.game.guesses.push(turn(word, won));
    f.game.status = won ? 'won' : f.game.guesses.length === 6 ? 'lost' : 'playing';
    f.game.score = won ? 1000 - 150 * attempts : 0;
    f.game.solution = f.game.status === 'playing' ? null : 'ARROZ';
    return structuredClone(f.game);
  };
  f.create = () => new WordGameSession({ storageKey, today: () => f.today(), submit: (...args) => f.submit(...args),
    now: () => f.now, readDraft: async () => f.saved, writeDraft: async (value) => { f.saved = value; } });
  f.session = f.create();
  f.type = (word, session = f.session) => { for (const letter of word) session.key(letter); };
  return f;
}

test('4–6 letras: entrada limitada, borrado y longitud requerida', async () => {
  for (const length of [4, 5, 6]) {
    const f = fixture(); f.game.length = length; await f.session.refresh();
    f.type('AB!CDÉEFG'); assert.equal(f.session.state.draft, 'ABCDEFG'.slice(0, length));
    f.session.key('⌫'); await f.session.send();
    assert.equal(f.session.state.error, 'length'); assert.equal(f.calls.length, 0);
  }
});
test('borrador persiste al refrescar y al recrear la sesión', async () => {
  const f = fixture(); await f.session.refresh(); f.type('QUE');
  await f.session.refresh(); assert.equal(f.session.state.draft, 'QUE');
  const next = f.create(); await next.refresh(); assert.equal(next.state.draft, 'QUE');
});
test('borrador antiguo se descarta si avanzó en otro dispositivo', async () => {
  const f = fixture(); await f.session.refresh(); f.type('QUE');
  f.game.guesses.push(turn('LECHE')); await f.session.refresh();
  assert.equal(f.session.state.draft, ''); assert.equal(f.session.state.game.guesses.length, 1);
});
test('refresco tardío de una pantalla cerrada no pisa el nuevo borrador', async () => {
  const f = fixture(); await f.session.refresh(); f.type('Q');
  const wait = deferred(); const today = f.today;
  f.today = () => wait.promise; const oldRefresh = f.session.refresh();
  f.today = today; const next = f.create(); await next.refresh(); f.type('UE', next);
  wait.resolve(structuredClone(f.game)); await oldRefresh;
  const third = f.create(); await third.refresh(); assert.equal(third.state.draft, 'QUE');
});
test('almacenamiento separado por cuenta conserva la clave española independientemente del idioma de interfaz', () => {
  assert.notEqual(wordDraftKey('ana'), wordDraftKey('bea'));
  assert.equal(wordDraftKey('ana'), '@quefalta/word-draft:v1:ana:es');
});
test('solo admite el alfabeto castellano y rechaza partidas catalanas', async () => {
  const f = fixture(); await f.session.refresh();
  f.type('ÑÇ'); assert.equal(f.session.state.draft, 'Ñ');
  assert.throws(() => parseDailyWord({ ...structuredClone(f.game), language: 'ca' }));
});
test('datos locales corruptos o de otra partida nunca restauran intentos', async () => {
  for (const saved of ['{bad', 'null', JSON.stringify({ gameId: 'other', word: 'ARROZ', attempts: 0, pending: false }),
    JSON.stringify({ gameId: 'day-one', word: 'TOOLONG', attempts: 0, pending: false }),
    JSON.stringify({ gameId: 'day-one', word: 'ABC', attempts: 0, pending: true })]) {
    const f = fixture(); f.saved = saved; await f.session.refresh(); assert.equal(f.session.state.draft, '');
  }
});
test('inválida y repetida no consumen intentos; permiten corregir', async () => {
  const f = fixture(); await f.session.refresh(); f.type('ZZZZZ'); await f.session.send();
  assert.equal(f.session.state.error, 'invalid'); assert.equal(f.game.guesses.length, 0);
  for (let i = 0; i < 5; i++) f.session.key('⌫');
  f.type('QUESO'); await f.session.send(); f.type('QUESO'); await f.session.send();
  assert.equal(f.session.state.error, 'repeated'); assert.equal(f.game.guesses.length, 1);
  assert.equal(f.session.state.uncertain, false);
});
test('victoria y puntuación del servidor; no deja jugar tras terminar', async () => {
  const f = fixture(); await f.session.refresh(); f.type('QUESO'); await f.session.send();
  f.type('ARROZ'); assert.equal(await f.session.send(), 'won');
  assert.equal(f.session.state.game.score, 850); assert.equal(f.session.state.game.solution, 'ARROZ');
  f.type('LECHE'); await f.session.send(); assert.equal(f.calls.length, 2); assert.equal(f.session.state.draft, '');
});
test('seis fallos cierran la partida sin puntos', async () => {
  const f = fixture(); await f.session.refresh();
  for (const word of ['QUESO', 'LECHE', 'PASTA', 'PAPEL', 'HUEVO', 'FRUTA']) { f.type(word); await f.session.send(); }
  assert.equal(f.session.state.game.status, 'lost'); assert.equal(f.session.state.game.score, 0);
  assert.equal(f.session.state.game.guesses.length, 6); assert.equal(f.session.state.game.solution, 'ARROZ');
});
test('doble toque y refresco durante un envío no envían dos intentos', async () => {
  const f = fixture(); const wait = deferred(); const submit = f.submit;
  f.submit = async (...args) => { await wait.promise; return submit(...args); };
  await f.session.refresh(); f.type('QUESO'); const pending = f.session.send();
  await f.session.send(); await f.session.refresh(); f.session.key('⌫');
  assert.equal(f.session.state.draft, 'QUESO'); wait.resolve(); await pending;
  assert.equal(f.calls.length, 1); assert.equal(f.game.guesses.length, 1);
});
test('respuesta perdida tras guardarse recupera el acierto sin falso error', async () => {
  const f = fixture(); const submit = f.submit;
  f.submit = async (...args) => { await submit(...args); throw Error('network'); };
  await f.session.refresh(); f.type('ARROZ'); assert.equal(await f.session.send(), 'won');
  assert.equal(f.session.state.error, ''); assert.equal(f.session.state.uncertain, false);
});
test('sin conexión bloquea editar y conserva el reenvío al reiniciar', async () => {
  const f = fixture(); await f.session.refresh(); f.type('QUESO'); f.offline = true;
  await f.session.send(); assert.equal(f.session.state.error, 'sendError');
  f.session.key('⌫'); assert.equal(f.session.state.draft, 'QUESO');
  f.offline = false; const next = f.create(); await next.refresh();
  assert.equal(next.state.uncertain, true); assert.equal(next.state.draft, 'QUESO');
  await next.send(); assert.equal(f.game.guesses.length, 1); assert.equal(next.state.uncertain, false);
});
test('lectura tras timeout no desbloquea una escritura todavía en vuelo', async () => {
  const f = fixture(); const submit = f.submit; f.submit = async () => { throw Error('WORD_TIMEOUT'); };
  await f.session.refresh(); f.type('QUESO'); await f.session.send();
  assert.equal(f.session.state.error, 'notSent'); assert.equal(f.session.state.uncertain, true);
  f.session.key('⌫'); assert.equal(f.session.state.draft, 'QUESO');
  await submit('day-one', 'QUESO', 0); f.submit = submit;
  await f.session.send(); assert.equal(f.game.guesses.length, 1); assert.equal(f.session.state.draft, '');
});
test('conflicto entre dispositivos recupera el tablero actualizado', async () => {
  const f = fixture(); await f.session.refresh(); f.type('QUESO');
  f.game.guesses.push(turn('LECHE')); await f.session.send();
  assert.equal(f.session.state.error, 'stale'); assert.equal(f.session.state.draft, '');
  assert.equal(f.session.state.game.guesses[0].word, 'LECHE');
});
test('medianoche cambia el reto aunque hubiese una palabra inválida', async () => {
  const f = fixture(); f.session.setActive(true); await flush(); f.type('ZZZZZ'); await f.session.send();
  f.game = emptyGame({ id: 'day-two', day: '2026-09-12' }); f.now = 36_000_001;
  f.session.tick(); await flush(); assert.equal(f.session.state.game.id, 'day-two'); assert.equal(f.session.state.draft, '');
});
test('medianoche offline bloquea intentos caducados y reintenta con pausa', async () => {
  const f = fixture(); f.session.setActive(true); await flush(); f.type('QUESO');
  f.offline = true; f.now = 36_000_001; f.session.tick(); await flush();
  const reads = f.reads; f.session.tick(); await flush(); assert.equal(f.reads, reads);
  f.session.key('⌫'); assert.equal(f.session.state.draft, 'QUESO');
  await f.session.send(); assert.equal(f.calls.length, 0);
  f.offline = false; f.game = emptyGame({ id: 'day-two' }); f.now += 30_001;
  f.session.tick(); await flush(); assert.equal(f.session.state.game.id, 'day-two');
});
test('no consulta periódicamente estando en segundo plano; reanuda al volver', async () => {
  const f = fixture(); await f.session.refresh(); f.now = 36_000_001;
  f.session.tick(); assert.equal(f.reads, 1); f.session.setActive(true); await flush(); assert.equal(f.reads, 2);
});
test('acepta payloads reales y rechaza respuestas que romperían el tablero', () => {
  assert.equal(parseDailyWord(emptyGame()).length, 5);
  for (const patch of [{ length: 9 }, { endsAt: null }, { serverNow: 'bad' }, { guesses: null },
    { guesses: [{ word: 'QUESO', feedback: ['correct'] }] }, { solution: 'ARROZ' },
    { status: 'lost' }, { status: 'won', guesses: [turn('ARROZ', true)], solution: 'ARROZ', score: 42 }]) {
    assert.throws(() => parseDailyWord(emptyGame(patch)), /WORD_BAD_RESPONSE/);
  }
});
test('ranking valida filas y posición propia antes de renderizar', () => {
  assert.deepEqual(parseWordRanking({ leaders: [], me: null }), { leaders: [], me: null });
  const row = { rank: 1, score: 1000, wins: 1, username: null, isMe: true };
  assert.equal(parseWordRanking({ leaders: [row], me: row }).me.rank, 1);
  const podium = { ...row, avatarUrl: 'https://example.com/photo.png', isPlus: true };
  assert.deepEqual(parseWordRanking({ leaders: [podium], me: podium }).me, podium);
  for (const data of [null, {}, { leaders: [{ ...row, score: '1000' }], me: null },
    { leaders: [{ ...row, avatarUrl: 123 }], me: null }, { leaders: [{ ...row, isPlus: 'yes' }], me: null },
    { leaders: [], me: { ...row, isMe: false } }, { leaders: Array(51).fill(row), me: null }]) {
    assert.throws(() => parseWordRanking(data), /WORD_BAD_RESPONSE/);
  }
});
