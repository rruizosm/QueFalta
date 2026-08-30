const nullable = (value) => value ?? null;

const sameQuantity = (left, right) => {
  if (left == null || right == null) return left == null && right == null;
  return Number(left) === Number(right);
};

function sameMaterializedState(current, next) {
  return current.published === true
    && current.content_hash === next.content_hash
    && current.content_version === next.content_version
    && nullable(current.global_gtin) === nullable(next.global_gtin)
    && nullable(current.canonical_unit) === nullable(next.canonical_unit)
    && sameQuantity(current.quantity_base, next.quantity_base);
}

function sameNormalization(current, next) {
  return nullable(current.canonical_unit) === nullable(next.canonical_unit)
    && sameQuantity(current.quantity_base, next.quantity_base);
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
  const rowsToUpsert = sourceRows.filter((row) => {
    const current = existingById.get(String(row.product_id));
    if (!current) return true;
    return normalizationOnly
      ? !sameNormalization(current, row)
      : !sameMaterializedState(current, row);
  });
  const productIdsToUnpublish = normalizationOnly
    ? []
    : existingRows
      .filter((row) => row.published === true && !sourceIds.has(String(row.product_id)))
      .map((row) => String(row.product_id));

  return {
    rowsToUpsert,
    productIdsToUnpublish,
    unchangedRows: sourceRows.length - rowsToUpsert.length,
  };
}

export function postgrestInFilter(values) {
  return `in.(${values.map((value) => {
    const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  }).join(',')})`;
}
