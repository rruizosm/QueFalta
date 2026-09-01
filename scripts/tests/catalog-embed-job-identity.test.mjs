import assert from 'node:assert/strict';
import test from 'node:test';

import {
  effectiveEmbeddingInputHash,
  parseEmbeddingJob,
} from '../../supabase/functions/catalog-embed/job-identity.mjs';

const MODEL = 'text-embedding-3-small';
const HASH = 'a'.repeat(64);
const STORES = new Set(['hiperdino']);

const parse = (overrides = {}) => parseEmbeddingJob({
  msgId: 1,
  readCount: 1,
  store: 'hiperdino',
  productId: 'sku-1',
  contentVersion: 'catalog_embedding_content_v1',
  ...overrides,
}, { stores: STORES, defaultModel: MODEL });

test('el worker acepta payload legacy y deriva hash/model efectivos', () => {
  const job = parse({ contentHash: HASH });
  assert.equal(job.embeddingInputHash, HASH);
  assert.equal(job.model, MODEL);
});

test('el worker prioriza la identidad nueva y rechaza otro modelo', () => {
  const job = parse({ embeddingInputHash: HASH, contentHash: 'b'.repeat(64), model: MODEL });
  assert.equal(job.embeddingInputHash, HASH);
  assert.throws(() => parse({ embeddingInputHash: HASH, model: 'other-model' }), /unsupported_model/);
});

test('el hash efectivo de la fila mantiene compatibilidad gradual', () => {
  assert.equal(effectiveEmbeddingInputHash({ content_hash: HASH }), HASH);
  assert.equal(
    effectiveEmbeddingInputHash({ embedding_input_hash: 'b'.repeat(64), content_hash: HASH }),
    'b'.repeat(64),
  );
});
