import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRevealProductDiscovery } from '../../src/lib/productDetailLoading.ts';

test('the comparator waits for an active nutrition lookup to settle', () => {
  assert.equal(shouldRevealProductDiscovery(true, false), false);
  assert.equal(shouldRevealProductDiscovery(true, true), true);
});

test('products without a nutrition source reveal the comparator immediately', () => {
  assert.equal(shouldRevealProductDiscovery(false, false), true);
});
