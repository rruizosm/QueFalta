import { buildCatalogMatchMetadataHash } from './catalog-embedding-identity.mjs';

const nullable = (value) => value ?? null;
const DEFAULT_TARGET_MODEL = 'text-embedding-3-small';
const compareText = (left, right) => {
  const a = String(left ?? '');
  const b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
};

const sameQuantity = (left, right) => {
  if (left == null || right == null) return left == null && right == null;
  return Number(left) === Number(right);
};

function sameNormalization(current, next) {
  return nullable(current.canonical_unit) === nullable(next.canonical_unit)
    && sameQuantity(current.quantity_base, next.quantity_base);
}

const recordOf = (entry) => entry?.record ?? entry?.row ?? entry;

function effectiveSemanticIdentityHash(row) {
  return row.semantic_identity_hash
    ?? row.phase_one_semantic_identity_hash
    ?? row.phase_one_embedding_input_hash
    ?? row.embedding_input_hash
    ?? row.content_hash;
}

function storedEmbeddingInputHash(row) {
  return row.embedding_input_hash ?? row.content_hash;
}

// Las filas anteriores a la Fase 3 no tienen embedded_content_hash. En ellas,
// un NULL significa "el vector corresponde al input que tenía la fila al
// migrar". En cuanto cambia el input, el trigger materializa el hash anterior.
function effectiveEmbeddedContentHash(row) {
  return row.embedded_content_hash ?? storedEmbeddingInputHash(row);
}

function hasCurrentEmbedding(row, targetModel) {
  return row.embedded_at != null
    && row.model === targetModel
    && effectiveEmbeddedContentHash(row) === storedEmbeddingInputHash(row);
}

function effectiveMatchMetadataHash(row) {
  return row.match_metadata_hash
    ?? row.phase_one_match_metadata_hash
    ?? null;
}

function semanticChanged(current, entry) {
  const next = recordOf(entry);
  return effectiveSemanticIdentityHash(current) !== effectiveSemanticIdentityHash(next);
}

function comparisonMetadataChanged(current, entry) {
  const next = recordOf(entry);
  const currentHash = effectiveMatchMetadataHash(current);
  const nextHash = effectiveMatchMetadataHash(next);
  if (currentHash && nextHash) return currentHash !== nextHash;
  return nullable(current.global_gtin) !== nullable(next.global_gtin)
    || !sameNormalization(current, next);
}

function classifyChange(current, entry) {
  if (!current) return 'new';
  if (current.published !== true) return 'republished';
  if (semanticChanged(current, entry)) return 'semantic';
  if (comparisonMetadataChanged(current, entry)) return 'metadata';
  return 'unchanged';
}

function needsEmbeddingJob(current, entry, changeKind, fallbackModel) {
  const targetModel = targetModelOf(entry, fallbackModel);
  if (changeKind === 'new') return true;
  if (changeKind !== 'semantic' && changeKind !== 'republished') return false;
  const materialized = rowForChange(entry, current, changeKind);
  return storedEmbeddingInputHash(current) !== storedEmbeddingInputHash(materialized)
    || (targetModel != null && !hasCurrentEmbedding(current, targetModel));
}

export function embeddingJobIdentityKey(store, productId, embeddingInputHash, model) {
  return JSON.stringify([
    String(store ?? ''),
    String(productId ?? ''),
    String(embeddingInputHash ?? ''),
    String(model ?? ''),
  ]);
}

function targetModelOf(entry, fallback) {
  const next = recordOf(entry);
  return entry?.identity?.model ?? next.embedding_target_model ?? fallback ?? null;
}

function embeddingJobForChange(entry, current, changeKind, fallbackModel) {
  const next = rowForChange(entry, current, changeKind);
  const model = targetModelOf(entry, fallbackModel);
  if (!model) return null;
  return {
    store: next.store ?? current?.store ?? null,
    productId: String(next.product_id),
    embeddingInputHash: storedEmbeddingInputHash(next),
    contentVersion: next.content_version,
    model,
  };
}

function needsRepair(current, entry, changeKind, fallbackModel) {
  if (!current || current.published !== true) return false;
  if (changeKind === 'new' || changeKind === 'semantic' || changeKind === 'republished') return false;
  const targetModel = targetModelOf(entry, fallbackModel);
  if (!targetModel) return false;
  return !hasCurrentEmbedding(current, targetModel);
}

function rowForChange(entry, current, changeKind) {
  const next = recordOf(entry);
  if (!current
    || changeKind === 'new'
    || changeKind === 'semantic'
    || (changeKind === 'republished' && semanticChanged(current, entry))) {
    return next;
  }

  // Las filas legacy conservan exactamente el texto/hash con el que se generó
  // su vector. Solo las altas o un cambio semántico real adoptan el input nuevo.
  return {
    ...next,
    content: current.content ?? next.content,
    content_hash: current.content_hash ?? next.content_hash,
    content_version: current.content_version ?? next.content_version,
    embedding_input_hash: current.embedding_input_hash ?? null,
  };
}

function rowForNormalization(entry, current) {
  const next = recordOf(entry);
  const categoryFamily = current.category_family
    ?? current.phase_one_category_family
    ?? null;
  return {
    ...next,
    display_name: current.display_name ?? next.display_name,
    brand: current.brand ?? null,
    category: current.category ?? null,
    category_family: current.category_family ?? null,
    global_gtin: current.global_gtin ?? null,
    attributes: current.attributes ?? {},
    content: current.content ?? next.content,
    content_hash: current.content_hash ?? next.content_hash,
    content_version: current.content_version ?? next.content_version,
    embedding_input_hash: current.embedding_input_hash ?? null,
    semantic_identity_hash: current.semantic_identity_hash ?? null,
    match_metadata_hash: buildCatalogMatchMetadataHash({
      attributes: current.attributes,
      canonicalUnit: next.canonical_unit,
      categoryFamily,
      globalGtin: current.global_gtin,
      published: current.published,
      quantityBase: next.quantity_base,
    }),
    published: current.published,
  };
}

/**
 * Calcula las escrituras estrictamente necesarias para reconciliar el snapshot.
 * `existingRows` no incluye el vector: la identidad semántica y los metadatos
 * que afectan a matches quedan cubiertos por los campos comparados.
 */
export function planEmbeddingReconciliation(sourceRows, existingRows, {
  normalizationOnly = false,
  suppressedEmbeddingJobKeys = new Set(),
  targetModel = DEFAULT_TARGET_MODEL,
} = {}) {
  const existingById = new Map(
    existingRows.map((row) => [String(row.product_id), row]),
  );
  const sourceIds = new Set(sourceRows.map((entry) => String(recordOf(entry).product_id)));
  const changes = sourceRows.map((entry) => {
    const row = recordOf(entry);
    const current = existingById.get(String(row.product_id));
    return {
      entry,
      row,
      current,
      kind: classifyChange(current, entry),
    };
  });
  const selectedChanges = changes.filter(({ current, kind, row }) => {
    if (!normalizationOnly) return kind !== 'unchanged';
    return Boolean(current) && !sameNormalization(current, row);
  });
  const rowsToUpsert = selectedChanges.map(({ entry, current, kind }) => (
    normalizationOnly
      ? rowForNormalization(entry, current)
      : rowForChange(entry, current, kind)
  ));
  const productIdsToUnpublish = normalizationOnly
    ? []
    : existingRows
      .filter((row) => row.published === true && !sourceIds.has(String(row.product_id)))
      .map((row) => String(row.product_id));

  const countKind = (kind) => changes.filter((change) => change.kind === kind).length;
  const suppressedJobs = suppressedEmbeddingJobKeys instanceof Set
    ? suppressedEmbeddingJobKeys
    : new Set(suppressedEmbeddingJobKeys);
  const isSuppressed = (job) => job && suppressedJobs.has(embeddingJobIdentityKey(
    job.store,
    job.productId,
    job.embeddingInputHash,
    job.model,
  ));
  const triggerJobs = normalizationOnly
    ? []
    : selectedChanges
      .filter(({ current, entry, kind }) => (
        needsEmbeddingJob(current, entry, kind, targetModel)
      ))
      .map(({ current, entry, kind }) => embeddingJobForChange(entry, current, kind, targetModel))
      .filter((job) => job && !isSuppressed(job));
  const repairJobs = normalizationOnly
    ? []
    : changes
      .filter(({ current, entry, kind }) => needsRepair(current, entry, kind, targetModel))
      .map(({ current, entry }) => ({
        store: current.store ?? recordOf(entry).store ?? null,
        productId: String(current.product_id),
        embeddingInputHash: storedEmbeddingInputHash(current),
        contentVersion: current.content_version,
        model: targetModelOf(entry, targetModel),
      }))
      .filter((job) => !isSuppressed(job))
      .sort((left, right) => (
        compareText(left.store, right.store)
        || compareText(left.productId, right.productId)
        || compareText(left.embeddingInputHash, right.embeddingInputHash)
        || compareText(left.model, right.model)
      ));
  const expectedEmbeddingJobs = triggerJobs.length + repairJobs.length;

  return {
    rowsToUpsert,
    productIdsToUnpublish,
    unchangedRows: countKind('unchanged'),
    skippedRows: sourceRows.length - rowsToUpsert.length - countKind('unchanged'),
    newRows: countKind('new'),
    semanticChangedRows: countKind('semantic'),
    metadataOnlyRows: countKind('metadata'),
    republishedRows: countKind('republished'),
    repairProducts: repairJobs.length,
    repairJobs,
    triggerJobs,
    expectedEmbeddingJobs,
  };
}

export function postgrestInFilter(values) {
  return `in.(${values.map((value) => {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }).join(',')})`;
}
