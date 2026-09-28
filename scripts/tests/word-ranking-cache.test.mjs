import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/lib/wordRankingCache.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { WordRankingCache } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('precarga y apertura comparten una petición, las lecturas calientes no usan red', async () => {
  const cache = new WordRankingCache(); let calls=0;
  const fetch = async () => { calls++; return { leaders: [1] }; };
  const first = cache.get('ranking:daily:0',fetch);
  assert.equal(cache.get('ranking:daily:0',fetch),first);
  const data = await first;
  assert.equal(cache.peek('ranking:daily:0'),data);
  await cache.get('ranking:daily:0',fetch);
  assert.equal(calls,1);
});
test('caduca a los 60 s y mantiene como máximo 12 respuestas', async () => {
  let now=0; const cache = new WordRankingCache(() => now);
  for(let i=0;i<13;i++) await cache.get(String(i),async()=>i);
  assert.equal(cache.peek('0'),null);
  assert.equal(cache.peek('12'),12);
  now=60000;
  assert.equal(cache.peek('12'),null);
  assert.equal(await cache.get('12',async()=>99),99);
});
test('cuentas y grupos no comparten datos; una respuesta invalidada no resucita', async () => {
  const one = new WordRankingCache(); const two = new WordRankingCache();
  let complete;
  const pending = one.get('group:daily:0',()=>new Promise(resolve=>{complete=resolve;}));
  await flush();
  one.clear();
  const rejected = assert.rejects(pending,/WORD_CACHE_INVALIDATED/);
  complete('old account'); await rejected;
  assert.equal(one.peek('group:daily:0'),null);
  assert.equal(two.peek('group:daily:0'),null);
  assert.equal(await one.get('group:daily:0',async()=>'new'), 'new');
});
test('máximo dos consultas simultáneas y cola limitada', async () => {
  const cache = new WordRankingCache(); let running=0; let peak=0;
  const releases=[];
  const fetch=()=>new Promise(resolve=>{ running++; peak=Math.max(peak,running); releases.push(()=>{running--;resolve('ok');}); });
  const jobs=Array.from({length:12},(_,i)=>cache.get(String(i),fetch));
  await assert.rejects(cache.get('13',fetch),/WORD_CACHE_BUSY/);
  for(let i=0;i<12;i++) { await flush(); releases.shift()(); }
  await Promise.all(jobs); assert.equal(peak,2);
});
test('un error no se cachea y permite reintentar', async () => {
  const cache = new WordRankingCache();
  await assert.rejects(cache.get('ranking',async()=>{throw new Error('offline');}),/offline/);
  assert.equal(await cache.get('ranking',async()=>42),42);
});
test('una instantánea se muestra durante la revalidación pero caduca a los cinco minutos', async () => {
  let now=0; const cache = new WordRankingCache(()=>now);
  await cache.get('ranking',async()=>42);
  now=60000;
  assert.equal(cache.peek('ranking'),null);
  assert.equal(cache.peek('ranking',true),42);
  await cache.get('ranking',async()=>43);
  assert.equal(cache.peek('ranking'),43);
  now=360000;
  assert.equal(cache.peek('ranking',true),null);
});
test('invalidar cancela la señal de red y descarta peticiones en cola', async () => {
  const cache = new WordRankingCache(); let calls=0; const signals=[];
  const fetch=signal=>{ calls++; signals.push(signal); return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))); };
  const jobs = Array.from({length:4},(_,i)=>cache.get(String(i),fetch));
  const checked = jobs.map(job=>assert.rejects(job,/WORD_CACHE_INVALIDATED/));
  await flush(); cache.clear(); await Promise.all(checked);
  assert.equal(calls,2); assert(signals.every(signal=>signal.aborted));
});
