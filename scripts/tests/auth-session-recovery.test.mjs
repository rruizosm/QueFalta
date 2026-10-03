import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

// Run the actual provider's bootstrap effect with React/native boundaries mocked.
const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/context/AuthContext.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
});
const flush = () => new Promise(resolve => setImmediate(resolve));
const session = { user: { id: 'user-one' }, access_token: 'token' };
function fixture(getSession) {
  const effects = []; const state = []; const timers = new Set();
  const f = { signOuts: 0, state, timers, getSession, initialUrl: null, callbackFails: false };
  const react = {
    createContext: () => ({}), useCallback: fn => fn, useRef: value => ({ current: value }),
    useEffect: fn => effects.push(fn),
    useState: value => { const i = state.length; state.push(value); return [value, v => { state[i] = v; }]; },
  };
  const auth = {
    getSession: () => f.getSession(), signOut: async () => { f.signOuts++; },
    onAuthStateChange: fn => { f.event = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    exchangeCodeForSession: async () => { if (f.callbackFails) throw Error('callback failed'); return { error: null }; },
  };
  const modules = {
    react, 'react/jsx-runtime': { jsx: () => null },
    'react-native': { Platform: { OS: 'ios' }, AppState: { addEventListener: (_name, fn) => {
      f.foreground = fn; return { remove() {} };
    } } },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
    'expo-linking': { getInitialURL: async () => f.initialUrl, parse: () => ({ queryParams: { code: 'code' } }) },
    '../lib/supabase': { supabase: { auth } },
    '../lib/catalogRequestCache': { clearCatalogRequests() {} },
    '../lib/catalogSearchScope': { invalidateCatalogSearch() {} },
  };
  const sandbox = { exports: {}, require: name => modules[name] ?? {},
    setTimeout: fn => { timers.add(fn); return fn; }, clearTimeout: fn => timers.delete(fn),
  };
  vm.runInNewContext(outputText, sandbox);
  sandbox.exports.AuthProvider({ children: null });
  f.start = () => { f.dispose = effects[0](); };
  f.retry = () => { const [fn] = timers; timers.delete(fn); fn(); };
  return f;
}

test('retryable Auth errors do not sign out; recovery updates the session', async () => {
  const f = fixture(async () => ({ data: { session: null }, error: { status: 503 } }));
  f.start(); await flush();
  assert.equal(f.signOuts, 0); assert.equal(f.timers.size, 1);
  f.getSession = async () => ({ data: { session }, error: null });
  f.retry(); await flush();
  assert.equal(f.state[0], session); assert.equal(f.signOuts, 0); f.dispose();
});

test('a thrown Keychain error recovers on foreground without revoking credentials', async () => {
  const f = fixture(async () => { throw Error('Keychain locked'); });
  f.start(); await flush();
  assert.equal(f.signOuts, 0);
  f.getSession = async () => ({ data: { session }, error: null });
  f.foreground('active'); await flush();
  assert.equal(f.state[0], session); assert.equal(f.timers.size, 0); f.dispose();
});

test('a stale bootstrap result cannot overwrite a more recent auth event', async () => {
  let resolve;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  f.start(); f.event('SIGNED_IN', session);
  resolve({ data: { session: null }, error: null }); await flush();
  assert.equal(f.state[0], session);
  f.event('SIGNED_OUT', null); assert.equal(f.state[0], null); f.dispose();
});

test('failed cold-start callback preserves an existing session', async () => {
  const f = fixture(async () => ({ data: { session }, error: null }));
  f.initialUrl = 'quefalta://auth/callback?code=code'; f.callbackFails = true;
  f.start(); await flush();
  assert.equal(f.signOuts, 0); assert.equal(f.state[0], session);
  assert.equal(f.state[1], false); assert.equal(f.state[2], true); f.dispose();
});

test('unmount cancels pending recovery', async () => {
  const f = fixture(async () => { throw Error('offline'); });
  f.start(); await flush(); assert.equal(f.timers.size, 1);
  f.dispose(); assert.equal(f.timers.size, 0);
});
