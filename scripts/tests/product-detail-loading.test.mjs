import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldRevealProductDiscovery, peekLidlDetail } from '../../src/lib/productDetailLoading.ts';

test('the comparator waits for an active nutrition lookup to settle', () => {
  assert.equal(shouldRevealProductDiscovery(true, false), false);
  assert.equal(shouldRevealProductDiscovery(true, true), true);
});

test('products without a nutrition source reveal the comparator immediately', () => {
  assert.equal(shouldRevealProductDiscovery(false, false), true);
});

test('Lidl detail snapshots expire and never cross products or stores', () => {
  const product = { id: 'p1', storeId: 'ES001' };
  const snapshot = { product, fetchedAt: 1000 };
  assert.equal(peekLidlDetail(snapshot, 'p1', 'ES001', 1001), product);
  assert.equal(peekLidlDetail(snapshot, 'p2', 'ES001', 1001), null);
  assert.equal(peekLidlDetail(snapshot, 'p1', 'ES002', 1001), null);
  assert.equal(peekLidlDetail(snapshot, 'p1', null, 1001), null);
  assert.equal(peekLidlDetail(snapshot, 'p1', 'ES001', 301000), null);
  assert.equal(peekLidlDetail(undefined, 'p1', 'ES001', 1001), null);
});
