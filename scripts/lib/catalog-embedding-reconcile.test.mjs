import assert from 'node:assert/strict';
import test from 'node:test';

import {
  embeddingJobIdentityKey,
  planEmbeddingReconciliation,
  postgrestInFilter,
} from './catalog-embedding-reconcile.mjs';

const row = (productId, overrides = {}) => ({
  store: 'test-store',
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

test('republicar con cambio semántico adopta el input nuevo y genera trabajo', () => {
  const source = [{
    identity: { model: 'text-embedding-3-small' },
    record: row('republished-semantic', {
      content: 'contenido nuevo',
      content_hash: 'new-input',
      embedding_input_hash: 'new-input',
      semantic_identity_hash: 'new-semantic',
    }),
  }];
  const existing = [row('republished-semantic', {
    published: false,
    content: 'contenido anterior',
    content_hash: 'old-input',
    embedding_input_hash: 'old-input',
    semantic_identity_hash: 'old-semantic',
  })];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.equal(plan.republishedRows, 1);
  assert.equal(plan.rowsToUpsert[0].content, 'contenido nuevo');
  assert.equal(plan.rowsToUpsert[0].embedding_input_hash, 'new-input');
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

test('normalización preserva el input aunque unidad y nombre cambien a la vez', () => {
  const source = [row('combined', {
    canonical_unit: 'l',
    quantity_base: 2,
    content: 'new content',
    content_hash: 'new-hash',
  })];
  const existing = [row('combined', {
    content: 'legacy content',
    content_hash: 'old-hash',
  })];

  const plan = planEmbeddingReconciliation(source, existing, { normalizationOnly: true });
  assert.equal(plan.rowsToUpsert.length, 1);
  assert.equal(plan.rowsToUpsert[0].content, 'legacy content');
  assert.equal(plan.rowsToUpsert[0].content_hash, 'old-hash');
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('normalización no oculta un cambio semántico al siguiente sync completo', () => {
  const next = {
    identity: { model: 'text-embedding-3-small' },
    record: row('normalization-race', {
      display_name: 'Leche sin lactosa 2 L',
      canonical_unit: 'l',
      quantity_base: 2,
      content: 'input nuevo',
      content_hash: 'new-input',
      embedding_input_hash: 'new-input',
      semantic_identity_hash: 'new-semantic',
      match_metadata_hash: 'new-metadata',
    }),
  };
  const current = row('normalization-race', {
    display_name: 'Leche entera 1 L',
    content: 'input anterior',
    content_hash: 'old-input',
    embedding_input_hash: 'old-input',
    semantic_identity_hash: 'old-semantic',
  });

  const normalization = planEmbeddingReconciliation([next], [current], {
    normalizationOnly: true,
  });
  assert.equal(normalization.rowsToUpsert[0].display_name, 'Leche entera 1 L');
  assert.equal(normalization.rowsToUpsert[0].semantic_identity_hash, 'old-semantic');
  assert.equal(normalization.rowsToUpsert[0].content_hash, 'old-input');

  const full = planEmbeddingReconciliation([next], normalization.rowsToUpsert);
  assert.equal(full.semanticChangedRows, 1);
  assert.equal(full.rowsToUpsert[0].content_hash, 'new-input');
  assert.equal(full.expectedEmbeddingJobs, 1);
});

test('construye un filtro PostgREST seguro para ids de texto', () => {
  assert.equal(
    postgrestInFilter(['plain', 'with"quote', 'with\\slash']),
    'in.("plain","with\\"quote","with\\\\slash")',
  );
});

test('una fila legacy semánticamente equivalente no migra ni reescribe el vector', () => {
  const nextHash = 'b'.repeat(64);
  const source = [{
    identity: { model: 'text-embedding-3-small' },
    record: row('legacy', {
      content: 'nombre: leche; familia: milk',
      content_hash: nextHash,
      embedding_input_hash: nextHash,
      match_metadata_hash: 'c'.repeat(64),
    }),
  }];
  const existing = [row('legacy', {
    content: 'nombre: Leche; categoría: Lácteos; formato: botella',
    content_hash: 'a'.repeat(64),
    embedding_input_hash: null,
    match_metadata_hash: null,
    phase_one_embedding_input_hash: nextHash,
    phase_one_match_metadata_hash: 'c'.repeat(64),
  })];

  const plan = planEmbeddingReconciliation(source, existing);
  assert.deepEqual(plan.rowsToUpsert, []);
  assert.equal(plan.unchangedRows, 1);
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('un cambio solo de metadata preserva content/hash legacy y no genera trabajo', () => {
  const nextHash = 'b'.repeat(64);
  const oldContent = 'nombre: Leche; categoría: Lácteos; formato: botella';
  const source = [{
    identity: { model: 'text-embedding-3-small' },
    record: row('metadata', {
      content: 'nombre: leche; familia: milk',
      content_hash: nextHash,
      embedding_input_hash: nextHash,
      match_metadata_hash: 'd'.repeat(64),
      global_gtin: '8412345678905',
    }),
  }];
  const existing = [row('metadata', {
    content: oldContent,
    content_hash: 'a'.repeat(64),
    embedding_input_hash: null,
    match_metadata_hash: null,
    phase_one_embedding_input_hash: nextHash,
    phase_one_match_metadata_hash: 'c'.repeat(64),
  })];

  const plan = planEmbeddingReconciliation(source, existing);
  assert.equal(plan.metadataOnlyRows, 1);
  assert.equal(plan.expectedEmbeddingJobs, 0);
  assert.equal(plan.rowsToUpsert[0].content, oldContent);
  assert.equal(plan.rowsToUpsert[0].content_hash, 'a'.repeat(64));
  assert.equal(plan.rowsToUpsert[0].embedding_input_hash, null);
});

test('content_version por sí solo no forma parte de la identidad del vector', () => {
  const source = [row('version', { content_version: 'v2' })];
  const existing = [row('version', { content_version: 'v1' })];
  const plan = planEmbeddingReconciliation(source, existing);
  assert.equal(plan.unchangedRows, 1);
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('cambiar solo la huella semántica no regenera un input exacto vigente', () => {
  const source = [row('semantic-algorithm', {
    semantic_identity_hash: 'new-semantic-hash',
  })];
  const existing = [row('semantic-algorithm', {
    semantic_identity_hash: 'old-semantic-hash',
  })];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.equal(plan.semanticChangedRows, 1);
  assert.equal(plan.rowsToUpsert.length, 1);
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('cambiar solo la huella semántica sí repara un vector ausente', () => {
  const source = [row('semantic-repair', {
    semantic_identity_hash: 'new-semantic-hash',
  })];
  const existing = [row('semantic-repair', {
    semantic_identity_hash: 'old-semantic-hash',
    embedded_at: null,
  })];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.equal(plan.semanticChangedRows, 1);
  assert.equal(plan.triggerJobs.length, 1);
  assert.equal(plan.expectedEmbeddingJobs, 1);
});

test('cambiar solo la huella semántica repara también un modelo obsoleto', () => {
  const source = [row('semantic-model-repair', {
    semantic_identity_hash: 'new-semantic-hash',
  })];
  const existing = [row('semantic-model-repair', {
    semantic_identity_hash: 'old-semantic-hash',
    model: 'legacy-model',
  })];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.equal(plan.semanticChangedRows, 1);
  assert.equal(plan.expectedEmbeddingJobs, 1);
});

test('republicar con solo una nueva huella semántica no regenera un vector vigente', () => {
  const source = [row('republished-semantic-algorithm', {
    semantic_identity_hash: 'new-semantic-hash',
  })];
  const existing = [row('republished-semantic-algorithm', {
    semantic_identity_hash: 'old-semantic-hash',
    published: false,
  })];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.equal(plan.republishedRows, 1);
  assert.equal(plan.rowsToUpsert.length, 1);
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('repara una fila idéntica sin vector sin reescribir el snapshot', () => {
  const current = row('missing', {
    embedded_at: null,
    model: null,
  });
  const plan = planEmbeddingReconciliation([row('missing')], [current]);

  assert.deepEqual(plan.rowsToUpsert, []);
  assert.equal(plan.unchangedRows, 1);
  assert.equal(plan.repairProducts, 1);
  assert.equal(plan.expectedEmbeddingJobs, 1);
  assert.deepEqual(plan.repairJobs[0], {
    store: 'test-store',
    productId: 'missing',
    embeddingInputHash: 'hash-missing',
    contentVersion: 'v1',
    model: 'text-embedding-3-small',
  });
});

test('repara un modelo obsoleto y omite el modelo vigente', () => {
  const source = [row('old-model'), row('current-model')];
  const existing = [
    row('old-model', { model: 'legacy-model' }),
    row('current-model'),
  ];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.deepEqual(plan.rowsToUpsert, []);
  assert.deepEqual(plan.repairJobs.map((job) => job.productId), ['old-model']);
  assert.equal(plan.repairProducts, 1);
  assert.equal(plan.expectedEmbeddingJobs, 1);
});

test('un cambio de metadata y una reparación comparten un solo upsert y un solo job', () => {
  const source = [row('metadata-repair', { quantity_base: 2 })];
  const existing = [row('metadata-repair', {
    embedded_at: null,
    model: null,
  })];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.equal(plan.metadataOnlyRows, 1);
  assert.equal(plan.rowsToUpsert.length, 1);
  assert.equal(plan.repairProducts, 1);
  assert.equal(plan.expectedEmbeddingJobs, 1);
  assert.equal(plan.repairJobs[0].embeddingInputHash, 'hash-metadata-repair');
});

test('un trabajo activo suprime la reparación aunque esté invisible o en vuelo', () => {
  const current = row('active', { embedded_at: null, model: null });
  const key = embeddingJobIdentityKey(
    current.store,
    current.product_id,
    current.content_hash,
    'text-embedding-3-small',
  );
  const plan = planEmbeddingReconciliation([row('active')], [current], {
    suppressedEmbeddingJobKeys: new Set([key]),
  });

  assert.deepEqual(plan.rowsToUpsert, []);
  assert.deepEqual(plan.repairJobs, []);
  assert.equal(plan.repairProducts, 0);
  assert.equal(plan.expectedEmbeddingJobs, 0);
});

test('la supresión exacta cubre triggers; otro hash o modelo no suprime el vigente', () => {
  const source = [row('trigger-suppression', {
    content: 'nuevo input',
    content_hash: 'new-input-hash',
    embedding_input_hash: 'new-input-hash',
    semantic_identity_hash: 'new-semantic-hash',
  })];
  const existing = [row('trigger-suppression', {
    content: 'input anterior',
    content_hash: 'old-input-hash',
    embedding_input_hash: 'old-input-hash',
    semantic_identity_hash: 'old-semantic-hash',
  })];
  const exactKey = embeddingJobIdentityKey(
    'test-store',
    'trigger-suppression',
    'new-input-hash',
    'text-embedding-3-small',
  );
  const staleKey = embeddingJobIdentityKey(
    'test-store',
    'trigger-suppression',
    'old-input-hash',
    'legacy-model',
  );

  const suppressed = planEmbeddingReconciliation(source, existing, {
    suppressedEmbeddingJobKeys: new Set([exactKey]),
  });
  const notSuppressed = planEmbeddingReconciliation(source, existing, {
    suppressedEmbeddingJobKeys: new Set([staleKey]),
  });

  assert.equal(suppressed.expectedEmbeddingJobs, 0);
  assert.equal(notSuppressed.expectedEmbeddingJobs, 1);
});

test('la reparación legacy usa el input realmente almacenado', () => {
  const semanticHash = 'b'.repeat(64);
  const legacyHash = 'a'.repeat(64);
  const source = [{
    identity: { model: 'text-embedding-3-small' },
    record: row('legacy-repair', {
      content_hash: 'c'.repeat(64),
      embedding_input_hash: 'c'.repeat(64),
      semantic_identity_hash: semanticHash,
    }),
  }];
  const existing = [row('legacy-repair', {
    content: 'texto v1 realmente almacenado',
    content_hash: legacyHash,
    embedding_input_hash: null,
    phase_one_semantic_identity_hash: semanticHash,
    embedded_at: null,
    model: null,
  })];
  const plan = planEmbeddingReconciliation(source, existing);

  assert.deepEqual(plan.rowsToUpsert, []);
  assert.equal(plan.repairJobs[0].embeddingInputHash, legacyHash);
  assert.equal(plan.expectedEmbeddingJobs, 1);
});
