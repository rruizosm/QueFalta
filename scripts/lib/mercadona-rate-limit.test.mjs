import assert from 'node:assert/strict';
import test from 'node:test';

import { createSharedCooldown, parseRetryAfter } from './mercadona-rate-limit.mjs';

test('Retry-After acepta segundos y fecha HTTP', () => {
  const now = Date.parse('2026-08-28T10:00:00Z');
  assert.equal(parseRetryAfter('45', now), 45_000);
  assert.equal(parseRetryAfter('Fri, 28 Aug 2026 10:01:30 GMT', now), 90_000);
  assert.equal(parseRetryAfter('invalid', now), 0);
});

test('el cooldown compartido pausa todos los workers sin multiplicar la misma rafaga', async () => {
  let now = 1_000;
  const sleeps = [];
  const cooldown = createSharedCooldown({
    baseCooldownMs: 30_000,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });

  assert.deepEqual(cooldown.block(null), {
    blockedUntil: 31_000,
    cooldownMs: 30_000,
    retryAfterMs: 0,
    started: true,
  });

  now += 100;
  assert.equal(cooldown.block(null).started, false);
  assert.equal(cooldown.remainingMs(), 29_900);

  await cooldown.wait();
  assert.deepEqual(sleeps, [29_900]);
  assert.equal(cooldown.remainingMs(), 0);
});

test('Retry-After puede ampliar una ventana compartida ya activa', async () => {
  let now = 10_000;
  const cooldown = createSharedCooldown({
    baseCooldownMs: 30_000,
    now: () => now,
    sleep: async (ms) => { now += ms; },
  });

  cooldown.block(null);
  now += 1_000;
  const extended = cooldown.block('60');

  assert.equal(extended.started, false);
  assert.equal(extended.blockedUntil, 71_000);
  await cooldown.wait();
  assert.equal(now, 71_000);
});
