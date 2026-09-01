import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chunkBatch,
  finalizeBatchMessageIds,
  parseFinalizeBatchResult,
  settleBatchWithIsolation,
  shouldIsolateBatchFinalizeError,
} from '../../supabase/functions/catalog-embed/batch-contract.mjs';

test('divide OpenAI y las escrituras sin perder ni duplicar elementos', () => {
  const values = Array.from({ length: 101 }, (_, index) => index + 1);
  const chunks = chunkBatch(values, 25);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [25, 25, 25, 25, 1]);
  assert.deepEqual(chunks.flat(), values);
});

test('extrae todos los msg_id de writes, stale y failure', () => {
  const batch = {
    writes: [{ msg_ids: [4, 5] }, { msg_ids: [6] }],
    stale_msg_ids: [7],
    failure: { jobs: [{ msg_id: 8 }, { msg_id: 9 }] },
  };
  assert.deepEqual(finalizeBatchMessageIds(batch), [4, 5, 6, 7, 8, 9]);
});

test('acepta una respuesta exhaustiva y deriva resultados autoritativos', () => {
  const parsed = parseFinalizeBatchResult({
    completed_msg_ids: [5, 4],
    stale_msg_ids: [6],
    failed_msg_ids: [8, 7],
    archived_msg_ids: [8],
    deleted_msg_ids: [6, 4, 5],
    updated_products: 2,
    already_ready_products: 1,
  }, [4, 5, 6, 7, 8]);

  assert.deepEqual(parsed.completedMsgIds, [4, 5]);
  assert.deepEqual(parsed.staleMsgIds, [6]);
  assert.deepEqual(parsed.failedMsgIds, [7, 8]);
  assert.deepEqual(parsed.archivedMsgIds, [8]);
  assert.equal(parsed.updatedProducts, 2);
  assert.equal(parsed.alreadyReadyProducts, 1);
});

test('acepta completed y stale intercalados aunque cada grupo venga ordenado', () => {
  const parsed = parseFinalizeBatchResult({
    completed_msg_ids: [1, 3],
    stale_msg_ids: [2],
    failed_msg_ids: [],
    archived_msg_ids: [],
    deleted_msg_ids: [1, 2, 3],
    updated_products: 2,
    already_ready_products: 0,
  }, [3, 2, 1]);

  assert.deepEqual(parsed.completedMsgIds, [1, 3]);
  assert.deepEqual(parsed.staleMsgIds, [2]);
  assert.deepEqual(parsed.deletedMsgIds, [1, 2, 3]);
});

test('rechaza resultados incompletos, solapados o con confirmaciones incorrectas', () => {
  const valid = {
    completed_msg_ids: [1],
    stale_msg_ids: [2],
    failed_msg_ids: [3],
    archived_msg_ids: [],
    deleted_msg_ids: [1, 2],
    updated_products: 1,
    already_ready_products: 0,
  };

  assert.throws(
    () => parseFinalizeBatchResult({ ...valid, failed_msg_ids: [] }, [1, 2, 3]),
    /incomplete_finalize_batch_result/,
  );
  assert.throws(
    () => parseFinalizeBatchResult({ ...valid, stale_msg_ids: [1, 2] }, [1, 2, 3]),
    /incomplete_finalize_batch_result/,
  );
  assert.throws(
    () => parseFinalizeBatchResult({ ...valid, archived_msg_ids: [2] }, [1, 2, 3]),
    /invalid_archived_msg_ids/,
  );
  assert.throws(
    () => parseFinalizeBatchResult({ ...valid, deleted_msg_ids: [1] }, [1, 2, 3]),
    /invalid_deleted_msg_ids/,
  );
});

test('aísla un write venenoso y completa los productos sanos', async () => {
  const executed = [];
  const failed = [];
  const outcomes = await settleBatchWithIsolation([1, 2, 3, 4], {
    execute: async (batch) => {
      executed.push(batch);
      if (batch.includes(3)) {
        const error = new Error('constraint de producto');
        error.code = '23514';
        throw error;
      }
      return { completed: batch };
    },
    onSingletonError: async (value) => {
      failed.push(value);
      return { failed: [value] };
    },
    shouldIsolate: shouldIsolateBatchFinalizeError,
  });

  assert.deepEqual(failed, [3]);
  assert.deepEqual(
    outcomes.flatMap((outcome) => outcome.completed ?? []),
    [1, 2, 4],
  );
  assert.equal(executed.length, 5);
});

test('no divide errores transitorios ni inconsistencias globales de cola', async () => {
  for (const error of [
    Object.assign(new Error('lock timeout'), { code: '55P03' }),
    Object.assign(new Error('Un msg_id no existe'), { code: 'P0001' }),
  ]) {
    let calls = 0;
    await assert.rejects(
      settleBatchWithIsolation([1, 2, 3], {
        execute: async () => {
          calls += 1;
          throw error;
        },
        onSingletonError: async () => ({ failed: true }),
        shouldIsolate: shouldIsolateBatchFinalizeError,
      }),
      error,
    );
    assert.equal(calls, 1);
  }
});

test('conserva outcomes parciales si se agota el límite de aislamiento', async () => {
  const observed = [];
  await assert.rejects(
    settleBatchWithIsolation([1, 2, 3, 4], {
      execute: async () => {
        const error = new Error('constraint sistémica');
        error.code = '23514';
        throw error;
      },
      onSingletonError: async (value) => ({ failed: [value] }),
      shouldIsolate: shouldIsolateBatchFinalizeError,
      onOutcome: (outcome) => observed.push(outcome),
      maxExecuteCalls: 3,
    }),
    /batch_isolation_call_limit/,
  );
  assert.deepEqual(observed, [{ failed: [1] }]);
});
