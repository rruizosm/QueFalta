#!/usr/bin/env node
// Orquesta el catalogo Lidl multitienda mediante la cola privada de Supabase.
//
// Por defecto programa el censo completo y lo procesa. El workflow separa
// ambas fases para repartir todas las tiendas abiertas entre varios workers.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      LIDL_FLEET_JOB_LIMIT=10
//      LIDL_FLEET_LEASE_MINUTES=45, LIDL_FLEET_STORE_TIMEOUT_MINUTES=35
//      LIDL_FLEET_MAX_ATTEMPTS=3
// Uso: node scripts/sync-lidl-fleet.mjs [--schedule-only|--work-only]
import { spawn } from 'node:child_process';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(['--schedule-only', '--work-only', '--help']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

if (unknownArgs.length) throw new Error(`Argumentos desconocidos: ${unknownArgs.join(', ')}`);
if (args.has('--schedule-only') && args.has('--work-only')) {
  throw new Error('--schedule-only y --work-only son excluyentes');
}
if (args.has('--help')) {
  console.log('Uso: node scripts/sync-lidl-fleet.mjs [--schedule-only|--work-only]');
  process.exit(0);
}

const URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!URL || !KEY) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');

function integerEnv(name, fallback, min, max) {
  const raw = process.env[name];
  const parsed = raw == null || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}`);
  }
  return parsed;
}

const JOB_LIMIT = integerEnv('LIDL_FLEET_JOB_LIMIT', 10, 1, 100);
const LEASE_MINUTES = integerEnv('LIDL_FLEET_LEASE_MINUTES', 45, 5, 120);
const STORE_TIMEOUT_MINUTES = integerEnv('LIDL_FLEET_STORE_TIMEOUT_MINUTES', 35, 1, 115);
const MAX_ATTEMPTS = integerEnv('LIDL_FLEET_MAX_ATTEMPTS', 3, 1, 10);
const SHOULD_SCHEDULE = !args.has('--work-only');
const SHOULD_WORK = !args.has('--schedule-only');
const STORE_SYNC_PATH = fileURLToPath(new URL('./sync-lidl.mjs', import.meta.url));

if (STORE_TIMEOUT_MINUTES >= LEASE_MINUTES) {
  throw new Error('LIDL_FLEET_STORE_TIMEOUT_MINUTES debe ser menor que LIDL_FLEET_LEASE_MINUTES');
}

function workerId() {
  const parts = [
    'lidl',
    process.env.GITHUB_RUN_ID || hostname(),
    process.env.GITHUB_RUN_ATTEMPT || 'local',
    process.env.LIDL_FLEET_WORKER_INDEX || process.pid,
  ];
  return parts.join('-').replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120);
}

async function rpc(name, body) {
  const response = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) {
    throw new Error(`${name}: HTTP ${response.status} ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function runStoreSync(storeId) {
  return new Promise((resolve, reject) => {
    const childEnv = {
      ...process.env,
      LIDL_STORE_ID: storeId,
      DRY_RUN: '0',
    };
    delete childEnv.MAX_LEAVES;

    const child = spawn(process.execPath, [STORE_SYNC_PATH], {
      env: childEnv,
      stdio: 'inherit',
      timeout: STORE_TIMEOUT_MINUTES * 60_000,
      killSignal: 'SIGTERM',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`sync-lidl.mjs terminó con ${signal ? `señal ${signal}` : `código ${code}`}`));
    });
  });
}

async function schedule() {
  const count = await rpc('schedule_all_lidl_catalog_sync_jobs', {});
  console.log(`[lidl-fleet] ${count ?? 0} tiendas incluidas en el barrido semanal`);
}

async function work() {
  const id = workerId();
  let completed = 0;
  let failed = 0;

  console.log(`[lidl-fleet] worker=${id} límite=${JOB_LIMIT}`);
  for (let index = 0; index < JOB_LIMIT; index++) {
    // Se reclama una sola fila cada vez: ninguna tienda espera con el lease
    // corriendo mientras este worker descarga otro catálogo.
    const jobs = await rpc('claim_lidl_catalog_sync_jobs', {
      p_worker_id: id,
      p_limit: 1,
      p_lease_minutes: LEASE_MINUTES,
      p_max_attempts: MAX_ATTEMPTS,
    });
    const job = Array.isArray(jobs) ? jobs[0] : null;
    if (!job) break;

    const storeId = job.job_store_id;
    console.log(
      `[lidl-fleet] ${storeId}: inicio intento=${job.job_attempts}`,
    );

    try {
      await runStoreSync(storeId);
      const acknowledged = await rpc('complete_lidl_catalog_sync_job', {
        p_store_id: storeId,
        p_worker_id: id,
      });
      if (acknowledged !== true) {
        throw new Error('Supabase rechazó el cierre: el worker ya no posee el lease');
      }
      completed++;
      console.log(`[lidl-fleet] ${storeId}: completada`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[lidl-fleet] ${storeId}: ${message}`);
      try {
        const nextStatus = await rpc('fail_lidl_catalog_sync_job', {
          p_store_id: storeId,
          p_worker_id: id,
          p_error: message,
          p_max_attempts: MAX_ATTEMPTS,
        });
        console.error(`[lidl-fleet] ${storeId}: estado=${nextStatus ?? 'lease perdido'}`);
      } catch (reportError) {
        console.error(`[lidl-fleet] ${storeId}: no se pudo registrar el fallo`, reportError);
      }
    }
  }

  console.log(`[lidl-fleet] worker=${id} completadas=${completed} fallidas=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

if (SHOULD_SCHEDULE) await schedule();
if (SHOULD_WORK) await work();
