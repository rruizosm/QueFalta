import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20260901103216_embedding_runs_durable_settlement_and_set_based_invalidation.sql');
const compatibilityMigration = read('../../supabase/migrations/20260901104518_phase4_legacy_materializer_compatibility.sql');
const manifestOptimizationMigration = read('../../supabase/migrations/20260901104730_phase4_manifest_revalidate_on_close.sql');
const materializer = read('../sync-comparator-embedding-catalog.mjs');
const reconciler = read('../lib/catalog-embedding-reconcile.mjs');
const smoke = read('../../supabase/ops/verify-embedding-run-durable-settlement.sql');

test('fase 4 añade estados draining/settled sin romper estados históricos', () => {
  assert.match(migration, /'running', 'blocked', 'materialized', 'draining', 'settled', 'failed'/i);
  assert.match(migration, /dependencies_registered_at timestamptz/i);
  assert.match(migration, /draining_at timestamptz/i);
  assert.match(migration, /settled_at timestamptz/i);
  assert.match(migration, /cache_bumped_at timestamptz/i);
});

test('una identidad durable puede satisfacer varios runs con resultado propio', () => {
  assert.match(migration, /create table comparator_internal\.catalog_embedding_job_identities/i);
  assert.match(migration, /unique \(\s*store, product_id, embedding_input_hash, model\s*\)/i);
  assert.match(migration, /create table comparator_internal\.catalog_embedding_run_jobs/i);
  assert.match(migration, /primary key \(run_id, job_identity_id\)/i);
  assert.match(migration, /'pending', 'completed', 'already_ready', 'superseded', 'terminal_failed'/i);
  assert.match(migration, /foreign key \(run_id\)[\s\S]+on delete cascade/i);
  assert.match(migration, /catalog_embedding_run_jobs_identity_idx[\s\S]+\(job_identity_id\)/i);
});

test('el materializador cierra el manifiesto durable antes de completar el run', () => {
  assert.match(materializer, /rpc\/catalog_register_embedding_run_jobs/);
  assert.match(materializer, /p_manifest_complete:\s*index === chunks\.length - 1/);
  const register = materializer.indexOf('await registerEmbeddingRunJobs(run.runId, runJobs)');
  const complete = materializer.indexOf('await completeEmbeddingRun(run.runId, true)', register);
  assert.ok(register >= 0 && complete > register);
  assert.match(reconciler, /const runJobs = \[\.\.\.runJobsByIdentity\.values\(\)\]/);
  assert.match(reconciler, /El manifiesto del run incluye también una identidad ya activa/);
  assert.match(migration, /p_manifest_complete and v_linked <> p_expected_dependency_count/i);
  assert.match(migration, /p_expected_dependency_count < v_run\.expected_embedding_jobs/i);
  assert.match(migration, /expected_dependency_count is null or expected_dependency_count >= expected_embedding_jobs/i);
  assert.match(materializer, /p_expected_dependency_count:\s*jobs\.length/);
  assert.match(reconciler, /const expectedEmbeddingJobs = triggerJobs\.length \+ repairJobs\.length/);
  assert.match(reconciler, /repairProducts:\s*repairJobs\.length/);
});

test('retryable permanece pending y solo los outcomes terminales cierran dependencias', () => {
  assert.match(migration, /failure_state\.has_terminal_failure then 'terminal_failed'/i);
  assert.match(migration, /failure_state\.has_retryable_failure then 'retryable_failed'/i);
  assert.match(migration, /when failure_state\.has_retryable_failure then 'retryable_failed'[\s\S]+when queued\.msg_id is not null then 'queued'/i);
  assert.match(migration, /classified\.next_status <> 'pending'/i);
  assert.match(migration, /where link\.status = 'pending'/i);
  assert.match(migration, /product\.embedded_at <= link\.linked_at[\s\S]+then 'already_ready'/i);
});

test('la revalidación contrasta producto, cola PGMQ y fallos terminales', () => {
  assert.match(migration, /left join public\.catalog_product_embeddings as product/i);
  assert.match(migration, /from pgmq\.q_catalog_embedding_jobs as job/i);
  assert.match(migration, /from public\.catalog_embedding_failures as failure/i);
  assert.match(migration, /product\.embedded_content_hash/i);
  assert.match(migration, /failure\.archived_at is not null/i);
  assert.match(migration, /last_queue_msg_id bigint/i);
});

test('el cierre serializa por run y hace como máximo un bump cuando hay impacto', () => {
  assert.match(migration, /try_settle_catalog_embedding_run[\s\S]+where run\.id = p_run_id\s+for update/i);
  assert.match(migration, /Orden global run -> links[\s\S]+order by link\.run_id[\s\S]+for update/i);
  assert.match(migration, /bump_catalog_match_store_version_for_run[\s\S]+where run\.id = p_run_id\s+for update/i);
  assert.match(migration, /if v_run\.cache_bumped_at is not null then[\s\S]+return v_run\.settled_generation/i);
  assert.doesNotMatch(migration, /for update skip locked/i);
  assert.match(migration, /set generation = version\.generation \+ 1/i);
  assert.match(migration, /set cache_bumped_at = pg_catalog\.now\(\),[\s\S]+settled_generation = v_generation/i);
  assert.match(migration, /v_run\.status = 'running' and v_run\.comparator_impact[\s\S]+bump_catalog_match_store_version_for_run/i);
  assert.match(migration, /new_products > 0[\s\S]+unpublished_products > 0/i);
  assert.match(migration, /or not comparator_impact[\s\S]+cache_bumped_at is null/i);
  const impactStart = migration.indexOf('add column if not exists comparator_impact');
  const impactEnd = migration.indexOf('add column if not exists dependency_count', impactStart);
  assert.doesNotMatch(migration.slice(impactStart, impactEnd), /expected_dependency_count/i);
  assert.match(smoke, /v_generation_after <> v_generation_before \+ 1/i);
  assert.match(smoke, /run\.expected_embedding_jobs = 0[\s\S]+run\.expected_dependency_count = 1/i);
  assert.match(migration, /if v_run\.status = 'draining' then[\s\S]+revalidate_catalog_embedding_run_jobs[\s\S]+v_settled := comparator_internal\.try_settle_catalog_embedding_run/i);
  assert.match(migration, /if v_settled then[\s\S]+return true[\s\S]+return exists \([\s\S]+link\.status = 'pending'/i);
  assert.match(migration, /if p_success is null then[\s\S]+errcode = '22023'/i);
  assert.match(materializer, /SETTLEMENT_RETRY_DELAYS_MS = \[50, 150, 300\]/);
  assert.doesNotMatch(materializer, /registration\.pendingJobs === 0/);
  assert.match(materializer, /return \{ linkedJobs, pendingJobs \}/);
  assert.match(materializer, /typeof settled !== 'boolean'/);
  assert.match(materializer, /if \(!success \|\| settled\) return settled/);
  assert.match(materializer, /event: 'embedding_run_draining'/);
  assert.match(smoke, /dependencia pendiente no quedó atendido/);
  assert.match(smoke, /cierre terminal\/idempotente devolvió settled=false/);
});

test('las revalidaciones de producto y fallo son set-based por sentencia', () => {
  assert.match(migration, /referencing new table as phase4_changed_products\s+for each statement/i);
  assert.match(migration, /referencing old table as phase4_deleted_products\s+for each statement/i);
  assert.match(migration, /referencing new table as phase4_changed_failures\s+for each statement/i);
  assert.match(migration, /array_agg\(distinct changed\.product_id/i);
  assert.match(migration, /link\.status = 'pending'/i);
  assert.doesNotMatch(
    migration.slice(
      migration.indexOf('revalidate_embedding_runs_after_failure_change'),
      migration.indexOf('revoke all on function comparator_internal.revalidate_embedding_runs_after_product_update'),
    ),
    /changed\.archived_at is not null/i,
  );
});

test('la invalidación del comparador elimina fuentes en bloque y evita bumps por fila', () => {
  assert.match(migration, /drop trigger if exists catalog_product_embeddings_match_cache_insert_delete/i);
  assert.match(migration, /drop trigger if exists catalog_product_embeddings_match_cache_update/i);
  assert.match(migration, /create trigger catalog_a_match_cache_insert[\s\S]+for each statement/i);
  assert.match(migration, /create trigger catalog_a_match_cache_update[\s\S]+for each statement/i);
  assert.match(migration, /create trigger catalog_a_match_cache_delete[\s\S]+for each statement/i);
  assert.match(migration, /delete from public\.catalog_product_match_cache_status as status[\s\S]+using changed/i);
  assert.match(migration, /array_agg\(distinct changed\.store order by changed\.store\)/i);
  assert.match(migration, /run\.status in \('running', 'draining'\)/i);
  assert.match(migration, /insert into comparator_internal\.catalog_match_store_versions as version[\s\S]+select eligible\.store, 1/i);
  assert.match(migration, /El prefijo catalog_a_[\s\S]+run todavía running\/draining/i);
  assert.doesNotMatch(migration, /for each row\s+execute function comparator_internal\.bump_catalog_match_store_version/i);
  assert.match(smoke, /Dos inserts de una sentencia no hicieron un único fallback/i);
  assert.match(smoke, /El UPDATE del run hizo bump prematuro o no invalidó la fuente/i);
  assert.match(smoke, /El run metadata no cerró con exactamente un bump/i);
  assert.match(smoke, /El run fallido no invalidó exactamente una vez/i);
});

test('el preflight exige cron inactivo y cero mensajes en vuelo', () => {
  assert.match(migration, /job\.jobid = 17[\s\S]+job\.jobname = 'catalog-embedding-dispatch'[\s\S]+not job\.active/i);
  assert.match(migration, /from pgmq\.q_catalog_embedding_jobs as job[\s\S]+job\.vt > pg_catalog\.now\(\)/i);
});

test('tablas internas y RPC públicas conservan permisos mínimos', () => {
  assert.match(migration, /alter table comparator_internal\.catalog_embedding_job_identities enable row level security/i);
  assert.match(migration, /alter table comparator_internal\.catalog_embedding_run_jobs enable row level security/i);
  assert.match(migration, /grant select, insert, update\s+on table comparator_internal\.catalog_embedding_job_identities\s+to service_role/i);
  assert.doesNotMatch(migration, /grant select, insert, update, delete/i);
  for (const signature of [
    'catalog_register_embedding_run_jobs',
    'catalog_revalidate_embedding_runs',
    'catalog_complete_embedding_run',
  ]) {
    const start = migration.indexOf(`create or replace function public.${signature}`);
    assert.ok(start >= 0);
    const body = migration.slice(start, migration.indexOf('$function$;', start) + 11);
    assert.match(body, /security invoker/i);
    assert.match(body, /set search_path = ''/i);
  }
});

test('la fase 4 deja SWR para el siguiente bloque pero retira el trigger legacy', () => {
  assert.doesNotMatch(migration, /refresh_catalog_match_cache_pair_v3/i);
  assert.match(migration, /drop trigger if exists catalog_product_embeddings_match_cache_update/i);
});

test('la compatibilidad legacy adopta solo un conjunto exacto y acotado al run', () => {
  assert.match(compatibilityMigration, /queued\.enqueued_at >= v_run\.started_at/i);
  assert.match(compatibilityMigration, /v_legacy_job_count <> v_run\.expected_embedding_jobs/i);
  assert.match(compatibilityMigration, /catalog_register_embedding_run_jobs\([\s\S]+v_legacy_jobs[\s\S]+v_legacy_job_count/i);
  assert.match(compatibilityMigration, /v_run\.expected_dependency_count is null/i);
  assert.match(compatibilityMigration, /security invoker/i);
  assert.match(compatibilityMigration, /grant execute on function public\.catalog_complete_embedding_run[\s\S]+to service_role/i);
});

test('los chunks intermedios no revalidan el manifiesto completo', () => {
  assert.match(
    manifestOptimizationMigration,
    /if p_manifest_complete then[\s\S]+revalidate_catalog_embedding_run_jobs/i,
  );
  assert.match(manifestOptimizationMigration, /p_jobs admite como máximo 500 identidades/i);
  assert.match(manifestOptimizationMigration, /v_linked > p_expected_dependency_count/i);
  assert.match(manifestOptimizationMigration, /p_manifest_complete and v_linked <> p_expected_dependency_count/i);
  assert.match(manifestOptimizationMigration, /security invoker/i);
});
