import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseAllStores } from '../../src/constants/limits.ts';

test('pre-1.3 accounts retain the combined store selector without Plus', () => {
  assert.equal(canUseAllStores(false, true), true);
});

test('new free accounts still require Plus for the combined selector', () => {
  assert.equal(canUseAllStores(false, false), false);
  assert.equal(canUseAllStores(false, undefined), false);
});

test('Plus always unlocks the combined store selector', () => {
  assert.equal(canUseAllStores(true, false), true);
});
