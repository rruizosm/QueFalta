import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/lib/secureAuthStorage.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { createSecureAuthStorage } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const flush = () => new Promise(r => setImmediate(r));
function fixture() {
  const encrypted = new Map();
  const plaintext = new Map();
  const f = { encrypted, plaintext, before: async () => {} };
  f.secure = {
    async getItemAsync(k) { await f.before('get', k); return encrypted.get(k) ?? null; },
    async setItemAsync(k, v) { await f.before('set', k, v); encrypted.set(k, v); },
    async deleteItemAsync(k) { await f.before('delete', k); encrypted.delete(k); },
  };
  f.legacy = {
    async getItem(k) { return plaintext.get(k) ?? null; },
    async setItem(k, v) { plaintext.set(k, v); },
    async removeItem(k) { plaintext.delete(k); },
  };
  f.restart = () => createSecureAuthStorage(f.secure, f.legacy);
  f.storage = f.restart();
  return f;
}

test('a concurrent read waits for the complete replacement session', async () => {
  const f = fixture(); await f.storage.setItem('session', 'old');
  const entered = deferred(); const resume = deferred();
  f.before = async (op, key) => {
    if (op === 'set' && key === 'session.v2.1.0') { entered.resolve(); await resume.promise; }
  };
  const write = f.storage.setItem('session', 'new'.repeat(2000));
  await entered.promise;
  let settled = false;
  const read = f.storage.getItem('session').then(v => { settled = true; return v; });
  await flush(); assert.equal(settled, false);
  resume.resolve(); await write;
  assert.equal(await read, 'new'.repeat(2000));
});

for (const failKey of ['session.v2.1.cnt', 'session.v2.1.0', 'session.v2.1.1', 'session.v2.head']) {
  test(`failed write at ${failKey} preserves the previous session after restart`, async () => {
    const f = fixture(); await f.storage.setItem('session', 'old');
    f.before = async (op, key) => { if (op === 'set' && key === failKey) throw Error('Keychain unavailable'); };
    await assert.rejects(f.storage.setItem('session', 'new'.repeat(2000)));
    f.before = async () => {};
    assert.equal(await f.restart().getItem('session'), 'old');
    await f.storage.setItem('session', 'recovered');
    assert.equal(await f.storage.getItem('session'), 'recovered');
  });
}

test('Keychain read errors preserve data, reject instead of returning anonymous, and recover', async () => {
  const f = fixture(); await f.storage.setItem('session', 'token');
  const saved = new Map(f.encrypted);
  f.before = async (op) => { if (op === 'get') throw Error('locked'); };
  await assert.rejects(f.storage.getItem('session'), /locked/);
  assert.deepEqual(f.encrypted, saved);
  f.before = async () => {};
  assert.equal(await f.storage.getItem('session'), 'token');
});

test('legacy chunked and plaintext sessions migrate without re-login', async () => {
  for (const chunked of [false, true]) {
    const f = fixture();
    if (chunked) { f.encrypted.set('session.cnt', '2'); f.encrypted.set('session.0', 'abc'); f.encrypted.set('session.1', 'def'); }
    else f.plaintext.set('session', 'abcdef');
    assert.equal(await f.storage.getItem('session'), 'abcdef');
    assert.equal(await f.restart().getItem('session'), 'abcdef');
    assert.equal(f.plaintext.size, 0); assert.equal(f.encrypted.has('session.cnt'), false);
  }
});

test('failed migration retains the original session', async () => {
  const f = fixture(); f.plaintext.set('session', 'legacy');
  f.before = async (op, key) => { if (op === 'set' && key.endsWith('.head')) throw Error('write failed'); };
  await assert.rejects(f.storage.getItem('session'));
  assert.equal(f.plaintext.get('session'), 'legacy');
  f.before = async () => {};
  assert.equal(await f.restart().getItem('session'), 'legacy');
});

test('logout queued behind a refresh wins and never falls back to legacy after cleanup failure', async () => {
  const f = fixture(); await f.storage.setItem('session', 'old');
  await Promise.all([f.storage.setItem('session', 'new'), f.storage.removeItem('session')]);
  assert.equal(await f.restart().getItem('session'), null);
  await f.storage.setItem('session', 'login');
  f.plaintext.set('session', 'stale');
  f.before = async (op) => { if (op === 'delete') throw Error('cleanup failed'); };
  await f.storage.removeItem('session');
  f.before = async () => {};
  assert.equal(await f.restart().getItem('session'), null);
});

test('missing chunks do not delete remaining data or revive stale plaintext', async () => {
  const f = fixture(); await f.storage.setItem('session', 'token');
  f.encrypted.delete('session.v2.0.0'); f.plaintext.set('session', 'stale');
  const saved = new Map(f.encrypted);
  await assert.rejects(f.storage.getItem('session'), /Incomplete/);
  assert.deepEqual(f.encrypted, saved);
});

test('Unicode values fit the native byte limit and round trip without split surrogates', async () => {
  const f = fixture(); const value = 'á😀漢'.repeat(1600);
  await f.storage.setItem('session', value);
  for (const part of f.encrypted.values()) assert.ok(Buffer.byteLength(part, 'utf8') <= 2000);
  assert.equal(await f.restart().getItem('session'), value);
});

test('Supabase RPC reads the complete new token during concurrent session persistence', async () => {
  const f = fixture();
  const session = token => ({ access_token: token, refresh_token: 'refresh', expires_at: Math.floor(Date.now()/1000)+3600,
    token_type: 'bearer', user: { id: 'test-user' } });
  await f.storage.setItem('session', JSON.stringify(session('old-token')));
  const sent = [];
  const client = createClient('https://example.supabase.co', 'anon-key', {
    auth: { storage: f.storage, storageKey: 'session', autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (_url, init) => {
      sent.push(new Headers(init.headers).get('Authorization'));
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  await client.auth.getSession();
  const entered = deferred(); const resume = deferred();
  f.before = async (op, key) => {
    if (op === 'set' && key === 'session.v2.1.0') { entered.resolve(); await resume.promise; }
  };
  const saving = f.storage.setItem('session', JSON.stringify(session('new-token')));
  await entered.promise;
  const request = Promise.resolve(client.rpc('word_game_today'));
  await flush(); assert.equal(sent.length, 0);
  resume.resolve(); await saving; assert.equal((await request).error, null);
  assert.deepEqual(sent, ['Bearer new-token']);
  // A transient Keychain error must stop before transport, never use anon-key.
  f.before = async (op) => { if (op === 'get') throw Error('locked'); };
  const failed = await client.rpc('word_game_today');
  assert.ok(failed.error); assert.equal(sent.length, 1);
  await client.auth.stopAutoRefresh();
});
