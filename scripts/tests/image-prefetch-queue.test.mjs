import assert from 'node:assert/strict';
import test from 'node:test';
import { createImagePrefetchQueue } from '../../src/lib/imagePrefetchQueue.ts';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('screens share a globally bounded and deduplicated prefetch queue', async () => {
  const calls = [];
  const resolve = new Map();
  const enqueue = createImagePrefetchQueue((uri) => { calls.push(uri); return new Promise((done) => resolve.set(uri, done)); });
  enqueue(['a', 'b', 'c']);
  enqueue(['a', 'b', 'd']);
  await tick();
  assert.deepEqual(calls, ['a', 'b']);
  resolve.get('a')(true);
  await tick();
  assert.deepEqual(calls, ['a', 'b', 'c']);
  enqueue(['a']);
  resolve.get('b')(true);
  await tick();
  assert.deepEqual(calls, ['a', 'b', 'c', 'd']);
  resolve.get('c')(true); resolve.get('d')(true);
  await tick();
});

test('leaving a screen releases only its queued images, retaining shared work', async () => {
  const calls = [];
  let finish;
  const enqueue = createImagePrefetchQueue((uri) => { calls.push(uri); return new Promise((done) => { finish = done; }); }, 1);
  const cancel = enqueue(['a', 'b', 'shared']);
  enqueue(['shared']);
  cancel();
  await tick();
  finish(true);
  await tick();
  assert.deepEqual(calls, ['a', 'shared']);
  finish(true);
  await tick();
});

test('failed prefetch can be retried and oversized batches remain bounded', async () => {
  let calls = 0;
  const enqueue = createImagePrefetchQueue(async () => { calls++; return false; }, 1, 3);
  enqueue(['a', 'b', 'c', 'd', 'e']);
  await tick();
  assert.equal(calls, 3);
  enqueue(['a']);
  await tick();
  assert.equal(calls, 4);
});
