const asNonNegativeInteger = (value, label) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} inválido: ${value}`);
  }
  return number;
};

const splitIntoBatches = (rows, size) => Array.from(
  { length: Math.ceil(rows.length / size) },
  (_, index) => rows.slice(index * size, index * size + size),
);

/**
 * Valida el checkpoint persistido y devuelve la ventana que puede publicar
 * esta ejecución. El cursor es inclusivo respecto al progreso confirmado: la
 * nueva ventana empieza justo después de él.
 */
export function planPublication(rows, {
  cursor = null,
  published = 0,
  total = rows.length,
  limit,
}) {
  if (!Array.isArray(rows)) throw new TypeError('rows debe ser un array');
  const safeLimit = asNonNegativeInteger(limit, 'limit');
  if (safeLimit === 0) throw new Error('limit debe ser mayor que 0');
  const safePublished = asNonNegativeInteger(published, 'publication_published');
  const safeTotal = asNonNegativeInteger(total, 'publication_total');

  const ids = rows.map((row) => {
    if (row?.id == null || String(row.id) === '') throw new Error('producto sin id en el plan');
    return String(row.id);
  });
  if (new Set(ids).size !== ids.length) throw new Error('IDs duplicados en el plan de publicación');
  if (safeTotal !== rows.length) {
    throw new Error(`el total del ciclo cambió: checkpoint=${safeTotal}, plan=${rows.length}`);
  }
  if (safePublished > safeTotal) {
    throw new Error(`progreso fuera de rango: ${safePublished}/${safeTotal}`);
  }

  let start = 0;
  if (cursor == null) {
    if (safePublished !== 0) {
      throw new Error(`checkpoint sin cursor para ${safePublished} productos`);
    }
  } else {
    const cursorIndex = ids.indexOf(String(cursor));
    if (cursorIndex < 0) throw new Error(`cursor ${cursor} ausente del plan`);
    start = cursorIndex + 1;
    if (start !== safePublished) {
      throw new Error(`cursor y contador no coinciden: cursor=${start}, contador=${safePublished}`);
    }
  }

  const selected = rows.slice(start, Math.min(start + safeLimit, safeTotal));
  return {
    start,
    end: start + selected.length,
    total: safeTotal,
    rows: selected,
    complete: start >= safeTotal,
  };
}

/**
 * Publica únicamente la ventana permitida y confirma el checkpoint DESPUÉS de
 * cada upsert. Las dependencias se inyectan para poder probar respuestas
 * ambiguas sin tocar Supabase.
 */
export async function publishWindow(rows, state, {
  limit,
  batchSize,
  upsertBatch,
  checkpointBatch,
  afterBatch,
}) {
  if (typeof upsertBatch !== 'function') throw new TypeError('falta upsertBatch');
  if (typeof checkpointBatch !== 'function') throw new TypeError('falta checkpointBatch');
  const safeBatchSize = asNonNegativeInteger(batchSize, 'batchSize');
  if (safeBatchSize === 0) throw new Error('batchSize debe ser mayor que 0');

  const plan = planPublication(rows, { ...state, limit });
  let cursor = state.cursor ?? null;
  let published = plan.start;
  const batches = splitIntoBatches(plan.rows, safeBatchSize);

  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    await upsertBatch(batch);
    const nextCursor = String(batch.at(-1).id);
    const nextPublished = published + batch.length;
    await checkpointBatch({
      previousCursor: cursor,
      previousPublished: published,
      cursor: nextCursor,
      published: nextPublished,
      total: plan.total,
    });
    cursor = nextCursor;
    published = nextPublished;
    if (afterBatch && index + 1 < batches.length) {
      await afterBatch({ cursor, published, total: plan.total });
    }
  }

  return {
    cursor,
    published,
    total: plan.total,
    written: plan.rows.length,
    complete: published >= plan.total,
  };
}
