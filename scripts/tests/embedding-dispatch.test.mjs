import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20260825174505_event_driven_catalog_embedding_dispatch.sql');
const materializer = read('../sync-comparator-embedding-catalog.mjs');
const worker = read('../../supabase/functions/catalog-embed/index.ts');
const cronOps = read('../../supabase/ops/enable-comparator-embedding-cron.sql');

test('el materializador arranca el pipeline solo fuera de DRY_RUN', () => {
  assert.match(materializer, /rpc\/catalog_dispatch_embedding_jobs/);
  assert.match(materializer, /p_max_requests:\s*3/);
  assert.match(materializer, /if \(!DRY_RUN\) await dispatchEmbeddingJobs\(\)/);
});

test('el materializador limita cada upsert a 25 productos', () => {
  assert.match(materializer, /const UPSERT_SIZE = 25/);
  assert.match(materializer, /rows\.slice\(offset, offset \+ UPSERT_SIZE\)/);
});

test('el materializador reconcilia primero y no reescribe todo el catálogo', () => {
  assert.match(materializer, /await fetchExisting\(store\)/);
  assert.match(materializer, /planEmbeddingReconciliation\(rows, existing/);
  assert.match(materializer, /productIdsToUnpublish/);
  assert.doesNotMatch(materializer, /source_seen_at.*lt\./);
});

test('cada worker encadena un único lote y no convierte el fallo del impulso en fallo del lote', () => {
  assert.match(worker, /async function dispatchNextBatch/);
  assert.match(worker, /p_max_requests:\s*1/);
  assert.match(worker, /console\.warn\('embedding_dispatch_failed'/);
  assert.match(worker, /X-Dispatched-Batches/);
});

test('la RPC de arranque usa privilegios del invocador y queda limitada a service_role', () => {
  assert.match(migration, /create or replace function public\.catalog_dispatch_embedding_jobs/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute[\s\S]+to service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test('el cron se conserva solo como respaldo cada 15 minutos', () => {
  for (const sql of [migration, cronOps]) {
    assert.match(sql, /cron\.unschedule/);
    assert.match(sql, /'\*\/15 \* \* \* \*'/);
    assert.doesNotMatch(sql, /'10 seconds'/);
  }
});
