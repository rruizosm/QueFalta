import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20260825174505_event_driven_catalog_embedding_dispatch.sql');
const controlMigration = read('../../supabase/migrations/20260831203004_embedding_pipeline_phase_zero_control.sql');
const controlFixMigration = read('../../supabase/migrations/20260831204445_fix_embedding_phase_zero_special_expressions.sql');
const canaryBudgetMigration = read('../../supabase/migrations/20260831205518_enforce_single_canary_dispatch_budget.sql');
const phaseOneMigration = read('../../supabase/migrations/20260831214031_embedding_materializer_phase_one_idempotency.sql');
const materializer = read('../sync-comparator-embedding-catalog.mjs');
const worker = read('../../supabase/functions/catalog-embed/index.ts');
const cronOps = read('../../supabase/ops/enable-comparator-embedding-cron.sql');

test('el materializador arranca el pipeline solo fuera de DRY_RUN', () => {
  assert.match(materializer, /rpc\/catalog_dispatch_embedding_jobs/);
  assert.match(materializer, /p_max_requests:\s*3/);
  assert.match(materializer, /if \(!DRY_RUN\)/);
  assert.match(materializer, /dispatchableRuns\.length/);
});

test('el materializador audita el desglose y permite que la base bloquee anomalías', () => {
  assert.match(materializer, /rpc\/catalog_begin_embedding_run/);
  assert.match(materializer, /rpc\/catalog_complete_embedding_run/);
  assert.match(materializer, /p_expected_embedding_jobs/);
  assert.match(materializer, /EMBEDDING_ANOMALY_OVERRIDE/);
  assert.match(controlMigration, /max_auto_jobs[^\n]+default 1000/i);
  assert.match(controlMigration, /max_auto_ratio[^\n]+default 0\.10/i);
  assert.match(controlMigration, /set mode = 'paused'/i);
  const anomalyGuard = materializer.indexOf('if (run.anomalyBlocked)');
  const firstUpsert = materializer.indexOf('await upsertRows(rowsToUpsert)');
  assert.ok(anomalyGuard >= 0 && anomalyGuard < firstUpsert);
  assert.match(materializer, /embedding_materialization_blocked/);
  assert.match(materializer, /if \(materializationBlocked\) break/);
});

test('el materializador limita cada upsert a 25 productos', () => {
  assert.match(materializer, /const UPSERT_SIZE = 25/);
  assert.match(materializer, /rows\.slice\(offset, offset \+ UPSERT_SIZE\)/);
});

test('el materializador reconcilia primero y no reescribe todo el catálogo', () => {
  assert.match(materializer, /await fetchExisting\(store\)/);
  assert.match(materializer, /planEmbeddingReconciliation\(candidates, existing/);
  assert.match(materializer, /productIdsToUnpublish/);
  assert.match(materializer, /match_metadata_hash:\s*null/);
  assert.doesNotMatch(materializer, /source_seen_at.*lt\./);
});

test('fase 1 separa input y metadata sin backfill masivo', () => {
  assert.match(materializer, /embedding_input_hash:\s*embeddingInput\.embeddingInputHash/);
  assert.match(materializer, /semantic_identity_hash:\s*identity\.semanticIdentityHash/);
  assert.match(materializer, /match_metadata_hash:\s*identity\.matchMetadataHash/);
  assert.match(materializer, /phase_one_semantic_identity_hash/);
  assert.match(materializer, /buildCatalogEmbeddingProjectionV1/);
  assert.match(phaseOneMigration, /add column if not exists embedding_input_hash text/i);
  assert.match(phaseOneMigration, /add column if not exists semantic_identity_hash text/i);
  assert.match(phaseOneMigration, /add column if not exists match_metadata_hash text/i);
  assert.doesNotMatch(phaseOneMigration, /update\s+public\.catalog_product_embeddings/i);
});

test('fase 1 hace única la identidad activa de la cola y mantiene payload legacy', () => {
  assert.match(phaseOneMigration, /identidades activas duplicadas/i);
  assert.match(phaseOneMigration, /create unique index if not exists catalog_embedding_jobs_identity_uidx/i);
  assert.match(phaseOneMigration, /embeddingInputHash[\s\S]+contentHash[\s\S]+model/);
  assert.match(phaseOneMigration, /when unique_violation[\s\S]+catalog_embedding_jobs_identity_uidx/i);
  assert.match(worker, /effectiveEmbeddingInputHash\(row\) !== job\.embeddingInputHash/);
  assert.match(worker, /job\.embeddingInputHash}:\$\{job\.model/);
});

test('fase 1 repara sin upsert y cierra la carrera A-B-A al borrar', () => {
  assert.match(materializer, /rpc\/catalog_ensure_embedding_jobs/);
  assert.match(materializer, /p_repair_products:\s*plan\.repairProducts/);
  assert.match(phaseOneMigration, /add column if not exists repair_products integer/i);
  assert.match(phaseOneMigration, /create or replace function comparator_internal\.ensure_catalog_embedding_job/i);
  assert.match(phaseOneMigration, /create or replace function public\.catalog_delete_embedding_jobs[\s\S]+ensure_catalog_embedding_job/i);
  assert.match(phaseOneMigration, /failure\.archived_at is not null/i);
  assert.match(phaseOneMigration, /returns jsonb[\s\S]+jsonb_agg[\s\S]+'activeJobs'[\s\S]+'terminalFailures'/i);
  assert.match(materializer, /const \{ jobs \} = result/);
});

test('fase 1 atribuye un despacho global una sola vez', () => {
  assert.match(materializer, /recordEmbeddingDispatch\(dispatchableRuns\.at\(-1\)\.runId, requestIds\.length\)/);
  assert.doesNotMatch(materializer, /dispatchableRuns\.map\(\(run\).*recordEmbeddingDispatch/s);
});

test('un cambio de huella semántica revalida el vector sin invalidarlo', () => {
  assert.match(phaseOneMigration, /v_semantic_identity_changed[\s\S]+ensure_catalog_embedding_job/i);
  assert.match(phaseOneMigration, /after update of content_hash, embedding_input_hash, semantic_identity_hash, published/i);
  assert.doesNotMatch(phaseOneMigration, /before update of[^\n]*semantic_identity_hash/i);
});

test('cada worker encadena un único lote y no convierte el fallo del impulso en fallo del lote', () => {
  assert.match(worker, /async function dispatchNextBatch/);
  assert.match(worker, /p_max_requests:\s*1/);
  assert.match(worker, /console\.warn\('embedding_dispatch_failed'/);
  assert.match(worker, /X-Dispatched-Batches/);
});

test('la RPC de arranque usa privilegios del invocador y queda limitada a service_role', () => {
  for (const sql of [migration, controlMigration]) {
    assert.match(sql, /create or replace function public\.catalog_dispatch_embedding_jobs/);
    assert.match(sql, /security invoker/i);
    assert.match(sql, /revoke all[\s\S]+from public, anon, authenticated/i);
    assert.match(sql, /grant execute[\s\S]+to service_role/i);
    assert.doesNotMatch(sql, /security definer/i);
  }
});

test('el kill switch protege materializador, cron y encadenamiento del worker', () => {
  assert.match(controlFixMigration, /mode = 'paused'[\s\S]+return array\[\]::bigint\[\]/i);
  assert.match(controlFixMigration, /mode = 'canary'[\s\S]+least\(p_max_requests/i);
  assert.match(controlMigration, /command => 'select public\.catalog_dispatch_embedding_jobs\(3\);'/);
  assert.match(worker, /rpc\('catalog_dispatch_embedding_jobs'/);
});

test('el canario consume un presupuesto global y no se encadena indefinidamente', () => {
  assert.match(canaryBudgetMigration, /canary_remaining_requests integer not null default 0/i);
  assert.match(canaryBudgetMigration, /where control\.singleton\s+for update/i);
  assert.match(canaryBudgetMigration, /canary_remaining_requests = 0[\s\S]+return array\[\]::bigint\[\]/i);
  assert.match(canaryBudgetMigration, /canary_remaining_requests - v_effective_requests/i);
  assert.match(canaryBudgetMigration, /when p_mode = 'canary' then control\.canary_max_requests/i);
});

test('las expresiones especiales de PostgreSQL no se prefijan con pg_catalog', () => {
  assert.match(controlFixMigration, /reason = nullif\(/i);
  assert.match(controlFixMigration, /left\(coalesce\(/i);
  assert.match(controlFixMigration, /if least\(/i);
  assert.match(controlFixMigration, /set dispatch_request_count = greatest\(/i);
  assert.match(controlFixMigration, /then least\(p_max_requests/i);
  assert.doesNotMatch(controlFixMigration, /pg_catalog\.(?:coalesce|nullif|least|greatest)/i);
  assert.doesNotMatch(phaseOneMigration, /pg_catalog\.(?:coalesce|nullif|least|greatest)\s*\(/i);
});

test('el cron se conserva solo como respaldo cada 15 minutos', () => {
  for (const sql of [migration, cronOps]) {
    assert.match(sql, /'\*\/15 \* \* \* \*'/);
    assert.doesNotMatch(sql, /'10 seconds'/);
  }
  assert.match(cronOps, /catalog_set_embedding_pipeline_mode[\s\S]+'canary'/);
  assert.match(cronOps, /cron\.alter_job/);
  assert.match(cronOps, /select public\.catalog_dispatch_embedding_jobs\(3\)/);
});
