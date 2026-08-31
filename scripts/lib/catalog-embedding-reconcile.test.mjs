import assert from 'node:assert/strict';
import test from 'node:test';

import {
  planEmbeddingReconciliation,
  postgrestInFilter,
} from './catalog-embedding-reconcile.mjs';

const row = (productId, overrides = {}) => ({
  product_id: productId,
  content_hash: `hash-${productId}`,
  content_version: 'v1',
  global_gtin: null,
  canonical_unit: 'kg',
  quantity_base: 1,
  published: true,
  embedded_at: '2026-08-01T00:00:00.000Z',
  model: 'text-embedding-3-small',
  ...overrides,
});

test('omite filas sin cambios y conserva solo altas o cambios materiales', () => {
  const source = [
    row('same'),
    row('changed', { content_hash: 'new-hash' }),
    row('new'),
  ];
  const existing = [
    row('same'),
    row('changed', { content_hash: 'old-hash' }),
  ];

  const plan = planEmbeddingReconciliation(source, existing);

  assert.deepEqual(plan.rowsToUpsert.map((item) => item.product_id), ['changed', 'new']);
  assert.equal(plan.unchangedRows, 1);
  assert.equal(plan.newRows, 1);
  assert.equal(plan.semanticChangedRows, 1);
  assert.equal(plan.metadataOnlyRows, 0);
  assert.equal(plan.republishedRows, 0);
  assert.equal(plan.expectedEmbeddingJobs, 2);
  assert.deepEqual(plan.productIdsToUnpublish, []);
});

test('republica y actualiza metadatos que afectan a la comparación', () => {
  const source = [
    row('republished'),
    row('gtin', { global_gtin: '8412345678905' }),
    row('quantity', { quantity_base: 2 }),
  ];
  const existing = [
    row('republished', { published: false }),
    row('gtin'),
    row('quantity'),
  ];

  const plan = planEmbeddingReconciliation(source, existing);

  assert.deepEqual(
    plan.rowsToUpsert.map((item) => item.product_id),
    ['republished', 'gtin', 'quantity'],
  );
  assert.equal(plan.republishedRows, 1);
  assert.equal(plan.metadataOnlyRows, 2);
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('republicar sin vector genera trabajo y republicar con vector lo reutiliza', () => {
  const source = [row('embedded'), row('missing-vector')];
  const existing = [
    row('embedded', { published: false }),
    row('missing-vector', {
      published: false,
      embedded_at: null,
      model: null,
    }),
  ];

  const plan = planEmbeddingReconciliation(source, existing);

  assert.equal(plan.republishedRows, 2);
  assert.equal(plan.expectedEmbeddingJobs, 1);
});

test('despublica solo ausencias que seguían publicadas', () => {
  const source = [row('present')];
  const existing = [
    row('present'),
    row('missing'),
    row('already-unpublished', { published: false }),
  ];

  const plan = planEmbeddingReconciliation(source, existing);

  assert.deepEqual(plan.rowsToUpsert, []);
  assert.deepEqual(plan.productIdsToUnpublish, ['missing']);
});

test('el modo de normalización ignora ausencias y cambios semánticos', () => {
  const source = [
    row('semantic', { content_hash: 'new-hash' }),
    row('unit', { canonical_unit: 'l', quantity_base: 2 }),
  ];
  const existing = [
    row('semantic', { content_hash: 'old-hash' }),
    row('unit'),
    row('missing'),
  ];

  const plan = planEmbeddingReconciliation(source, existing, { normalizationOnly: true });

  assert.deepEqual(plan.rowsToUpsert.map((item) => item.product_id), ['unit']);
  assert.deepEqual(plan.productIdsToUnpublish, []);
  assert.equal(plan.semanticChangedRows, 1);
  assert.equal(plan.metadataOnlyRows, 1);
  assert.equal(plan.skippedRows, 1);
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('construye un filtro PostgREST seguro para ids de texto', () => {
  assert.equal(
    postgrestInFilter(['plain', 'with"quote', 'with\\slash']),
    'in.("plain","with\\"quote","with\\\\slash")',
  );
});
