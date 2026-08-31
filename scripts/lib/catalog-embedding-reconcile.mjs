const nullable = (value) => value ?? null;

const sameQuantity = (left, right) => {
  if (left == null || right == null) return left == null && right == null;
  return Number(left) === Number(right);
};

function sameNormalization(current, next) {
  return nullable(current.canonical_unit) === nullable(next.canonical_unit)
    && sameQuantity(current.quantity_base, next.quantity_base);
}

function semanticChanged(current, next) {
  return current.content_hash !== next.content_hash
    || current.content_version !== next.content_version;
}

function comparisonMetadataChanged(current, next) {
  return nullable(current.global_gtin) !== nullable(next.global_gtin)
    || !sameNormalization(current, next);
}

function classifyChange(current, next) {
  if (!current) return 'new';
  if (current.published !== true) return 'republished';
  if (semanticChanged(current, next)) return 'semantic';
  if (comparisonMetadataChanged(current, next)) return 'metadata';
  return 'unchanged';
}

function needsEmbeddingJob(current, next, changeKind) {
  if (changeKind === 'new' || changeKind === 'semantic') return true;
  if (changeKind !== 'republished') return false;
  return semanticChanged(current, next)
    || current.embedded_at == null
    || current.model == null;
}

/**
 * Calcula las escrituras estrictamente necesarias para reconciliar el snapshot.
 * `existingRows` no incluye el vector: la identidad semántica y los metadatos
 * que afectan a matches quedan cubiertos por los campos comparados.
 */
export function planEmbeddingReconciliation(sourceRows, existingRows, {
  normalizationOnly = false,
} = {}) {
  const existingById = new Map(
    existingRows.map((row) => [String(row.product_id), row]),
  );
  const sourceIds = new Set(sourceRows.map((row) => String(row.product_id)));
  const changes = sourceRows.map((row) => {
    const current = existingById.get(String(row.product_id));
    return {
      row,
      current,
      kind: classifyChange(current, row),
    };
  });
  const selectedChanges = changes.filter(({ current, kind, row }) => {
    if (!normalizationOnly) return kind !== 'unchanged';
    return !current || !sameNormalization(current, row);
  });
  const rowsToUpsert = selectedChanges.map(({ row }) => row);
  const productIdsToUnpublish = normalizationOnly
    ? []
    : existingRows
      .filter((row) => row.published === true && !sourceIds.has(String(row.product_id)))
      .map((row) => String(row.product_id));

  const countKind = (kind) => changes.filter((change) => change.kind === kind).length;
  const expectedEmbeddingJobs = selectedChanges.filter(({ current, row, kind }) => (
    needsEmbeddingJob(current, row, kind)
  )).length;

  return {
    rowsToUpsert,
    productIdsToUnpublish,
    unchangedRows: countKind('unchanged'),
    skippedRows: sourceRows.length - rowsToUpsert.length - countKind('unchanged'),
    newRows: countKind('new'),
    semanticChangedRows: countKind('semantic'),
    metadataOnlyRows: countKind('metadata'),
    republishedRows: countKind('republished'),
    expectedEmbeddingJobs,
  };
}

export function postgrestInFilter(values) {
  return `in.(${values.map((value) => {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }).join(',')})`;
}
