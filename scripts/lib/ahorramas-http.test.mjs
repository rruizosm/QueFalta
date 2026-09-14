import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ahorramasRetryDelay,
  createAhorramasRequester,
  parseRetryAfter,
} from './ahorramas-http.mjs';

function response(status, body = '', headers = {}) {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => normalized.get(name.toLowerCase()) ?? null,
      getSetCookie: () => [],
    },
    text: async () => body,
  };
}

test('Retry-After acepta segundos y fecha HTTP', () => {
  const now = Date.parse('2026-09-14T08:00:00Z');
  assert.equal(parseRetryAfter('120', now), 120_000);
  assert.equal(parseRetryAfter('Mon, 14 Sep 2026 08:03:00 GMT', now), 180_000);
  assert.equal(parseRetryAfter('invalid', now), 0);
});

test('el backoff exponencial añade jitter, respeta Retry-After y aplica el tope', () => {
  assert.equal(ahorramasRetryDelay({
    attempt: 1,
    retryAfter: null,
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    random: () => 0.5,
    jitterRatio: 0.2,
  }), 2_200);

  assert.equal(ahorramasRetryDelay({
    attempt: 0,
    retryAfter: '8',
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    random: () => 0,
  }), 8_000);

  assert.equal(ahorramasRetryDelay({
    attempt: 6,
    retryAfter: '60',
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
    random: () => 1,
  }), 10_000);
});

test('un 429 espera Retry-After y reintenta la misma URL', async () => {
  let calls = 0;
  const sleeps = [];
  const warnings = [];
  const request = createAhorramasRequester({
    baseUrl: 'https://example.test',
    requestDelayMs: 0,
    baseRetryDelayMs: 1_000,
    maxRetryDelayMs: 300_000,
    random: () => 0,
    sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    logger: { warn: (message) => warnings.push(message) },
    fetchImpl: async () => {
      calls++;
      return calls === 1
        ? response(429, 'demasiadas peticiones', { 'Retry-After': '120' })
        : response(200, '<html>ok</html>');
    },
  });

  assert.equal(await request('/categoria/'), '<html>ok</html>');
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [120_000]);
  assert.match(warnings[0], /HTTP 429/);
  assert.match(warnings[0], /reintento 2\/6 en 120 s/);
});

test('los 5xx y errores de red usan backoff; un 404 falla sin insistir', async () => {
  const retrySleeps = [];
  const retryResponses = [
    new TypeError('socket cerrado'),
    response(503, 'mantenimiento'),
    response(200, 'recuperado'),
  ];
  const request = createAhorramasRequester({
    baseUrl: 'https://example.test',
    requestDelayMs: 0,
    baseRetryDelayMs: 1_000,
    maxRetryDelayMs: 10_000,
    random: () => 0,
    sleep: async (milliseconds) => { retrySleeps.push(milliseconds); },
    logger: { warn: () => {} },
    fetchImpl: async () => {
      const next = retryResponses.shift();
      if (next instanceof Error) throw next;
      return next;
    },
  });

  assert.equal(await request('/recuperable/'), 'recuperado');
  assert.deepEqual(retrySleeps, [1_000, 2_000]);

  let notFoundCalls = 0;
  const notFound = createAhorramasRequester({
    baseUrl: 'https://example.test',
    requestDelayMs: 0,
    sleep: async () => { throw new Error('no debe esperar'); },
    logger: { warn: () => {} },
    fetchImpl: async () => {
      notFoundCalls++;
      return response(404, 'no existe');
    },
  });

  await assert.rejects(notFound('/ausente/'), /HTTP 404.*no existe/);
  assert.equal(notFoundCalls, 1);
});

test('separa el inicio de peticiones consecutivas', async () => {
  let now = 10_000;
  const sleeps = [];
  const request = createAhorramasRequester({
    baseUrl: 'https://example.test',
    requestDelayMs: 500,
    now: () => now,
    sleep: async (milliseconds) => {
      sleeps.push(milliseconds);
      now += milliseconds;
    },
    fetchImpl: async () => response(200, 'ok'),
  });

  await request('/una/');
  await request('/dos/');
  assert.deepEqual(sleeps, [500]);
});
