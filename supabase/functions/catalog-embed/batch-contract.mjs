const OUTCOME_KEYS = [
  'completed_msg_ids',
  'stale_msg_ids',
  'failed_msg_ids',
  'archived_msg_ids',
  'deleted_msg_ids',
];

export function chunkBatch(values, size) {
  if (!Array.isArray(values)) throw new Error('batch_values_not_array');
  if (!Number.isInteger(size) || size < 1) throw new Error('invalid_batch_chunk_size');
  const chunks = [];
  for (let offset = 0; offset < values.length; offset += size) {
    chunks.push(values.slice(offset, offset + size));
  }
  return chunks;
}

export function finalizeBatchMessageIds(batch) {
  if (!batch || typeof batch !== 'object') throw new Error('finalize_batch_not_object');
  const writes = Array.isArray(batch.writes) ? batch.writes : [];
  const stale = Array.isArray(batch.stale_msg_ids) ? batch.stale_msg_ids : [];
  const failures = Array.isArray(batch.failure?.jobs) ? batch.failure.jobs : [];
  return [
    ...writes.flatMap((write) => Array.isArray(write?.msg_ids) ? write.msg_ids : []),
    ...stale,
    ...failures.map((failure) => failure?.msg_id),
  ];
}

export function parseFinalizeBatchResult(value, expectedMessageIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('invalid_finalize_batch_result');
  }
  const expected = normalizeIds(expectedMessageIds, 'expected_msg_ids');
  const parsed = {};
  for (const key of OUTCOME_KEYS) parsed[key] = normalizeIds(value[key], key);

  const completed = parsed.completed_msg_ids;
  const stale = parsed.stale_msg_ids;
  const failed = parsed.failed_msg_ids;
  assertSameIds([...completed, ...stale, ...failed], expected, 'incomplete_finalize_batch_result');
  assertSubset(parsed.archived_msg_ids, failed, 'invalid_archived_msg_ids');
  assertSameIds(parsed.deleted_msg_ids, [...completed, ...stale], 'invalid_deleted_msg_ids');

  const updatedProducts = nonNegativeInteger(value.updated_products, 'invalid_updated_products');
  const alreadyReadyProducts = nonNegativeInteger(
    value.already_ready_products,
    'invalid_already_ready_products',
  );

  return {
    completedMsgIds: completed,
    staleMsgIds: stale,
    failedMsgIds: failed,
    archivedMsgIds: parsed.archived_msg_ids,
    deletedMsgIds: parsed.deleted_msg_ids,
    updatedProducts,
    alreadyReadyProducts,
  };
}

export async function settleBatchWithIsolation(
  values,
  { execute, onSingletonError, shouldIsolate, onOutcome, maxExecuteCalls = 16 },
) {
  if (!Array.isArray(values) || values.length < 1) throw new Error('isolation_batch_empty');
  if (typeof execute !== 'function' || typeof onSingletonError !== 'function'
    || typeof shouldIsolate !== 'function') {
    throw new Error('invalid_isolation_handlers');
  }
  if (onOutcome != null && typeof onOutcome !== 'function') {
    throw new Error('invalid_isolation_outcome_handler');
  }
  if (!Number.isInteger(maxExecuteCalls) || maxExecuteCalls < 1) {
    throw new Error('invalid_isolation_call_limit');
  }

  const outcomes = [];
  let executeCalls = 0;
  async function record(outcome) {
    outcomes.push(outcome);
    if (onOutcome) await onOutcome(outcome);
  }
  async function settle(batch) {
    if (executeCalls >= maxExecuteCalls) throw new Error('batch_isolation_call_limit');
    executeCalls += 1;
    try {
      await record(await execute(batch));
      return;
    } catch (error) {
      if (!shouldIsolate(error)) throw error;
      if (batch.length === 1) {
        await record(await onSingletonError(batch[0], error));
        return;
      }
      const middle = Math.ceil(batch.length / 2);
      await settle(batch.slice(0, middle));
      await settle(batch.slice(middle));
    }
  }

  await settle(values);
  return outcomes;
}

export function shouldIsolateBatchFinalizeError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (code.startsWith('23')) return true;
  if (code.startsWith('22')) {
    return /writes contiene un producto invalido|vector|dimension|nan|infinity|infinite/i.test(message);
  }
  if (code === 'P0001') {
    return !/msg_id no existe|confirmar todos los mensajes|archivar todos los mensajes/i.test(message);
  }
  return false;
}

function normalizeIds(value, errorCode) {
  if (!Array.isArray(value)) throw new Error(errorCode);
  const ids = value.map((id) => Number(id));
  if (ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error(errorCode);
  if (new Set(ids).size !== ids.length) throw new Error(errorCode);
  return ids.sort((left, right) => left - right);
}

function assertSubset(values, expected, errorCode) {
  const expectedSet = new Set(expected);
  if (values.some((value) => !expectedSet.has(value))) throw new Error(errorCode);
}

function assertSameIds(values, expected, errorCode) {
  const normalized = normalizeIds(values, errorCode);
  const normalizedExpected = normalizeIds(expected, errorCode);
  if (normalized.length !== normalizedExpected.length) throw new Error(errorCode);
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized[index] !== normalizedExpected[index]) throw new Error(errorCode);
  }
}

function nonNegativeInteger(value, errorCode) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(errorCode);
  return parsed;
}
