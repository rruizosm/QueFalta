import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20260904141250_lidl_catalog_sync_queue.sql', import.meta.url),
  'utf8',
);
const policySql = await readFile(
  new URL('../../supabase/migrations/20260904141502_lidl_catalog_sync_queue_policy.sql', import.meta.url),
  'utf8',
);
const weeklySql = await readFile(
  new URL('../../supabase/migrations/20260904175757_lidl_weekly_full_fleet.sql', import.meta.url),
  'utf8',
);
const orchestrator = await readFile(new URL('../sync-lidl-fleet.mjs', import.meta.url), 'utf8');
const fleetWorkflow = await readFile(
  new URL('../../.github/workflows/sync-lidl.yml', import.meta.url),
  'utf8',
);

test('la cola Lidl vive en private, tiene estados acotados y no se expone al cliente', () => {
  assert.match(migration, /create table private\.lidl_catalog_sync_queue\s*\(/i);
  assert.match(migration, /status in \('pending', 'running', 'retry', 'succeeded', 'dead'\)/i);
  assert.match(migration, /alter table private\.lidl_catalog_sync_queue enable row level security/i);
  assert.match(
    migration,
    /revoke all on table private\.lidl_catalog_sync_queue\s+from public, anon, authenticated/i,
  );
  assert.doesNotMatch(migration, /grant .*lidl_catalog_sync_queue[\s\S]*to anon, authenticated/i);
  assert.match(policySql, /for all\s+to service_role\s+using \(true\)\s+with check \(true\)/i);
});

test('la migración semanal desacopla por completo la selección del usuario', () => {
  assert.match(weeklySql, /drop trigger if exists enqueue_lidl_catalog_sync on public\.profiles/i);
  assert.match(weeklySql, /drop function if exists private\.enqueue_lidl_catalog_sync_from_profile\(\)/i);
  assert.match(weeklySql, /drop column priority,\s*drop column source/i);
  assert.doesNotMatch(weeklySql, /create trigger/i);
});

test('cada ejecución semanal vuelve a programar todas las tiendas abiertas', () => {
  assert.match(weeklySql, /schedule_all_lidl_catalog_sync_jobs\(\)/i);
  assert.match(weeklySql, /from public\.lidl_stores as s[\s\S]*s\.published[\s\S]*s\.selectable/i);
  assert.doesNotMatch(weeklySql, /latest\.synced_at|p_max_age|p_limit integer default 103/i);
  assert.match(weeklySql, /on conflict \(store_id\) do update/i);
});

test('varios workers reclaman atomically sin esperar y con lease recuperable', () => {
  assert.match(weeklySql, /for update skip locked/i);
  assert.match(weeklySql, /q\.status = 'running' and q\.lease_until <= now\(\)/i);
  assert.match(weeklySql, /q\.attempts \+ 1/i);
  assert.match(migration, /q\.worker_id = p_worker_id/i);
  assert.match(migration, /then 'dead'\s+else 'retry'/i);
});

test('las RPC de escritura de cola son exclusivas de service_role', () => {
  for (const fn of [
    'complete_lidl_catalog_sync_job',
    'fail_lidl_catalog_sync_job',
  ]) {
    assert.match(migration, new RegExp(`revoke all on function public\\.${fn}\\(`, 'i'));
    assert.match(
      migration,
      new RegExp(`grant execute on function public\\.${fn}\\([\\s\\S]*?to service_role`, 'i'),
    );
  }
  assert.match(weeklySql, /revoke all on function public\.schedule_all_lidl_catalog_sync_jobs\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(weeklySql, /grant execute on function public\.schedule_all_lidl_catalog_sync_jobs\(\)[\s\S]*to service_role/i);
  assert.match(weeklySql, /grant execute on function public\.claim_lidl_catalog_sync_jobs\(text,integer,integer,integer\)[\s\S]*to service_role/i);
});

test('el orquestador reclama una tienda cada vez y delega en el sync aislado por store_id', () => {
  assert.match(orchestrator, /claim_lidl_catalog_sync_jobs/);
  assert.match(orchestrator, /p_limit: 1/);
  assert.match(orchestrator, /schedule_all_lidl_catalog_sync_jobs/);
  assert.match(orchestrator, /LIDL_STORE_ID: storeId/);
  assert.match(orchestrator, /complete_lidl_catalog_sync_job/);
  assert.match(orchestrator, /fail_lidl_catalog_sync_job/);
  assert.doesNotMatch(orchestrator, /MIN_PRIORITY|job_priority|job_source/);
  assert.match(orchestrator, /STORE_TIMEOUT_MINUTES >= LEASE_MINUTES/);
  assert.match(orchestrator, /timeout: STORE_TIMEOUT_MINUTES \* 60_000/);
});

test('el único workflow ejecuta capacidad para todo el censo cada lunes', () => {
  assert.match(fleetWorkflow, /cron: '20 11 \* \* 1'/);
  assert.match(fleetWorkflow, /worker: \[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24\]/);
  assert.match(fleetWorkflow, /LIDL_FLEET_JOB_LIMIT: '32'/);
  assert.match(fleetWorkflow, /schedule_all_lidl_catalog_sync_jobs|--schedule-only/);
  assert.match(fleetWorkflow, /vars\.LIDL_SYNC_ENABLED == 'true'/);
  assert.doesNotMatch(fleetWorkflow, /MIN_PRIORITY|SCHEDULE_LIMIT|MAX_AGE_DAYS/);
});
