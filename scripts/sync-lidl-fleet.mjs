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
import { appendFileSync } from 'node:fs';
import { isLidlAccessFailure } from './lib/lidl-http.mjs';

const args = new Set(process.argv.slice(2));
const allowedArgs = new Set(['--schedule-only', '--work-only', '--recover-only', '--report-only', '--retry-dead-only', '--help']);
const unknownArgs = [...args].filter((arg) => !allowedArgs.has(arg));

if (unknownArgs.length) throw new Error(`Argumentos desconocidos: ${unknownArgs.join(', ')}`);
if ([...args].filter((arg) => arg.endsWith('-only')).length > 1) {
  throw new Error('Los modos *-only son excluyentes');
}
if (args.has('--help')) {
  console.log('Uso: node scripts/sync-lidl-fleet.mjs [--schedule-only|--work-only|--recover-only|--report-only|--retry-dead-only]');
  process.exit(0);
}

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');
}

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
const SHOULD_SCHEDULE = args.size === 0 || args.has('--schedule-only');
const SHOULD_WORK = args.size === 0 || args.has('--work-only') || args.has('--recover-only');
const STORE_IDS = process.env.LIDL_FLEET_STORE_IDS?.split(',').map((id) => id.trim()).filter(Boolean) || null;
if (STORE_IDS && (!STORE_IDS.length || STORE_IDS.some((id) => !/^ES\d+$/.test(id)))) throw new Error('LIDL_FLEET_STORE_IDS inválido');
if (SHOULD_SCHEDULE && STORE_IDS) throw new Error('El filtro de tiendas solo se admite en recuperación');
const IDLE_MINUTES = integerEnv('LIDL_FLEET_IDLE_MINUTES', 35, 0, 60);
const WORK_MINUTES = integerEnv('LIDL_FLEET_WORK_MINUTES', 300, 1, 330);
const ACCESS_FAILURE_LIMIT = integerEnv('LIDL_FLEET_ACCESS_FAILURE_LIMIT', 2, 1, 10);
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
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
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

    let detail = '';
    const child = spawn(process.execPath, [STORE_SYNC_PATH], {
      env: childEnv,
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      timeout: STORE_TIMEOUT_MINUTES * 60_000,
      killSignal: 'SIGTERM',
    });
    child.on('message', (message) => {
      if (message?.type === 'lidl-error' && typeof message.message === 'string') detail = message.message.slice(0, 1800);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(detail || `sync-lidl.mjs terminó con ${signal ? `señal ${signal}` : `código ${code}`}`));
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
  let accessFailures = 0;
  let idleSince = Date.now();
  const deadline = Date.now() + WORK_MINUTES * 60_000;

  console.log(`[lidl-fleet] worker=${id} límite=${JOB_LIMIT}`);
  for (let index = 0; index < JOB_LIMIT && Date.now() < deadline;) {
    // Se reclama una sola fila cada vez: ninguna tienda espera con el lease
    // corriendo mientras este worker descarga otro catálogo.
    const jobs = await rpc('claim_lidl_catalog_sync_jobs_filtered', {
      p_worker_id: id,
      p_limit: 1,
      p_lease_minutes: LEASE_MINUTES,
      p_max_attempts: MAX_ATTEMPTS,
      p_store_ids: STORE_IDS,
    });
    const job = Array.isArray(jobs) ? jobs[0] : null;
    if (!job) {
      const rows = await queueReport();
      const waiting = rows.some((row) => ['pending', 'retry', 'running'].includes(row.status));
      if (!waiting || Date.now() - idleSince >= IDLE_MINUTES * 60_000) break;
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      continue;
    }
    index++;
    idleSince = Date.now();

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
      accessFailures = 0;
      console.log(`[lidl-fleet] ${storeId}: completada`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      accessFailures = isLidlAccessFailure(message) ? accessFailures + 1 : 0;
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
        throw reportError;
      }
      if (accessFailures >= ACCESS_FAILURE_LIMIT) {
        console.error('[lidl-fleet] pausa: rechazos HTTP repetidos; se conservan los trabajos pendientes');
        break;
      }
    }
  }

  console.log(`[lidl-fleet] worker=${id} completadas=${completed} fallidas=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

async function queueReport() {
  const rows = await rpc('lidl_catalog_sync_report', { p_store_ids: STORE_IDS });
  if (!Array.isArray(rows)) throw new Error('Informe de cola inválido');
  return rows;
}

async function report() {
  const rows = await queueReport();
  const counts = {};
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  const missing = STORE_IDS?.filter((id) => !rows.some((row) => row.store_id === id)) || [];
  console.log('[lidl-fleet] estado final', JSON.stringify({ counts, missing }));
  const pending = rows.filter((row) => row.status !== 'succeeded');
  for (const row of pending) console.log(JSON.stringify(row));
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `\n### Lidl: estado de la cola\n\n\`\`\`json\n${JSON.stringify({ counts, missing, pending }, null, 2)}\n\`\`\`\n`);
  if (pending.length || missing.length || !rows.length) process.exitCode = 1;
}

if (SHOULD_SCHEDULE) await schedule();
if (SHOULD_WORK) await work();
if (args.has('--report-only')) await report();
if (args.has('--retry-dead-only')) {
  if (!STORE_IDS) throw new Error('Recuperar dead requiere LIDL_FLEET_STORE_IDS explícitos');
  console.log('[lidl-fleet] dead recuperados:', await rpc('retry_dead_lidl_catalog_sync_jobs', { p_store_ids: STORE_IDS }));
}
