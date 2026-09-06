import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const orchestratorPath = fileURLToPath(new URL('../sync-lidl-fleet.mjs', import.meta.url));
const orchestratorModule = pathToFileURL(orchestratorPath).href;

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
const deleteGrantSql = await readFile(
  new URL(
    '../../supabase/migrations/20260904185536_lidl_catalog_sync_queue_delete_grant.sql',
    import.meta.url,
  ),
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

test('service_role dispone de todas las operaciones usadas por las RPC SECURITY INVOKER', () => {
  assert.match(
    migration,
    /grant select, insert, update on table private\.lidl_catalog_sync_queue\s+to service_role/i,
  );
  assert.match(
    deleteGrantSql,
    /grant delete on table private\.lidl_catalog_sync_queue\s+to service_role/i,
  );
  assert.match(
    deleteGrantSql,
    /revoke delete on table private\.lidl_catalog_sync_queue\s+from public, anon, authenticated/i,
  );
  assert.match(
    weeklySql,
    /create or replace function public\.schedule_all_lidl_catalog_sync_jobs\(\)[\s\S]*security invoker/i,
  );
  assert.doesNotMatch(deleteGrantSql, /security definer/i);
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

test('cada worker comparte una sola caché privada de campañas con sus tiendas', () => {
  assert.match(orchestrator, /fetchLidlCampaignCatalog/);
  assert.match(orchestrator, /mkdtemp\(join\(tmpdir\(\), 'quefalta-lidl-campaigns-'\)\)/);
  assert.match(orchestrator, /LIDL_CAMPAIGNS_FILE: campaignFile/);
  assert.match(orchestrator, /LIDL_CAMPAIGNS_DISABLED: '1'/);
  assert.match(orchestrator, /cleanupCampaignCache/);
});

test('el orquestador arranca y programa el barrido con la RPC esperada', async () => {
  const bootstrap = `
    globalThis.fetch = async (input, init) => {
      const expected = 'https://supabase.invalid/rest/v1/rpc/schedule_all_lidl_catalog_sync_jobs';
      if (String(input) !== expected) throw new Error('URL RPC inesperada: ' + input);
      if (init?.method !== 'POST') throw new Error('Método RPC inesperado: ' + init?.method);
      if (init?.headers?.Authorization !== 'Bearer test-service-role') {
        throw new Error('Autorización RPC inesperada');
      }
      return new Response('0', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    process.argv = [process.execPath, ${JSON.stringify(orchestratorPath)}, '--schedule-only'];
    await import(${JSON.stringify(orchestratorModule)});
  `;
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ['--input-type=module', '--eval', bootstrap],
    {
      env: {
        ...process.env,
        SUPABASE_URL: 'https://supabase.invalid',
        SUPABASE_SERVICE_ROLE: 'test-service-role',
      },
      timeout: 5_000,
    },
  );

  assert.equal(stderr, '');
  assert.match(stdout, /0 tiendas incluidas en el barrido semanal/);
});

test('el único workflow ejecuta capacidad para todo el censo cada lunes', () => {
  assert.match(fleetWorkflow, /cron: '20 11 \* \* 1'/);
  assert.match(fleetWorkflow, /workers=\[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24\]/);
  assert.match(fleetWorkflow, /LIDL_FLEET_JOB_LIMIT:.*'100'/);
  assert.match(fleetWorkflow, /--report-only/);
  assert.match(fleetWorkflow, /default: recover/);
  assert.match(fleetWorkflow, /schedule_all_lidl_catalog_sync_jobs|--schedule-only/);
  assert.match(fleetWorkflow, /vars\.LIDL_SYNC_ENABLED == 'true'/);
  assert.doesNotMatch(fleetWorkflow, /MIN_PRIORITY|SCHEDULE_LIMIT|MAX_AGE_DAYS/);
});

async function runFleetScenario(mode, setup, extraEnv = {}) {
  return execFileAsync(process.execPath, ['--input-type=module', '--eval', `
    ${setup}
    process.argv = [process.execPath, ${JSON.stringify(orchestratorPath)}, ${JSON.stringify(mode)}];
    await import(${JSON.stringify(orchestratorModule)});
  `], {
    env: { ...process.env, SUPABASE_URL: 'https://supabase.invalid', SUPABASE_SERVICE_ROLE: 'test',
      LIDL_FLEET_IDLE_MINUTES: '0', ...extraEnv }, timeout: 5000,
  });
}

test('recovery forwards the filter, never schedules and preserves successful jobs', async () => {
  const { stdout } = await runFleetScenario('--recover-only', `
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      if (JSON.stringify(body.p_store_ids) !== '["ES0367"]') throw new Error('missing filter');
      if (url.endsWith('claim_lidl_catalog_sync_jobs_filtered')) return Response.json([]);
      if (url.endsWith('lidl_catalog_sync_report')) return Response.json([{ store_id:'ES0367',status:'succeeded' }]);
      throw new Error('unexpected mutation ' + url);
    };
  `, { LIDL_FLEET_STORE_IDS: 'ES0367' });
  assert.match(stdout, /completadas=0 fallidas=0/);
});

test('final report fails for unfinished or missing stores and passes only complete scopes', async () => {
  for (const rows of [[], [{store_id:'ES0367',status:'retry'}], [{store_id:'ES0367',status:'dead'}]]) {
    await assert.rejects(runFleetScenario('--report-only',
      `globalThis.fetch = async () => Response.json(${JSON.stringify(rows)});`, { LIDL_FLEET_STORE_IDS:'ES0367' }),
    (error) => error.code === 1 && error.stdout.includes('estado final'));
  }
  await runFleetScenario('--report-only', `globalThis.fetch = async () => Response.json([{store_id:'ES0367',status:'succeeded'}]);`,
    { LIDL_FLEET_STORE_IDS:'ES0367' });
});

test('child error is persisted and repeated 403 stops claims after two stores', async () => {
  await assert.rejects(runFleetScenario('--recover-only', `
    import childProcess from 'node:child_process';
    import { EventEmitter } from 'node:events';
    import { syncBuiltinESMExports } from 'node:module';
    childProcess.spawn = () => {
      const child = new EventEmitter();
      queueMicrotask(() => {
        child.emit('message', { type:'lidl-error', message:'/categories: HTTP 403 denied' });
        child.emit('close', 1, null);
      });
      return child;
    };
    syncBuiltinESMExports();
    let claimed = 0, failed = 0;
    globalThis.fetch = async (url, init) => {
      if (url.endsWith('claim_lidl_catalog_sync_jobs_filtered')) {
        if (++claimed > 2) throw new Error('circuit did not stop');
        return Response.json([{job_store_id:'ES0'+claimed,job_attempts:1}]);
      }
      if (url.endsWith('fail_lidl_catalog_sync_job')) {
        if (JSON.parse(init.body).p_error !== '/categories: HTTP 403 denied') throw new Error('lost error detail');
        failed++;
        return Response.json('retry');
      }
      throw new Error('unexpected RPC ' + url);
    };
    process.on('exit', () => { if (claimed !== 2 || failed !== 2) process.exitCode = 99; });
  `), (error) => error.code === 1 && error.stderr.includes('pausa: rechazos HTTP repetidos'));
});
