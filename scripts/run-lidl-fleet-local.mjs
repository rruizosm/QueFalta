#!/usr/bin/env node
// Barrido Lidl completo desde un equipo local. La cola de Supabase reparte las
// tiendas entre tres procesos; el informe y el comparador se ejecutan una vez.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length > 1 || (args[0] && args[0] !== '--recover')) {
  throw new Error('Uso: node scripts/run-lidl-fleet-local.mjs [--recover]');
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');
}
if (process.env.DRY_RUN === '1') {
  throw new Error('El runner del fleet es productivo; usa sync-lidl.mjs para DRY_RUN');
}

const recover = args[0] === '--recover';
const fleet = fileURLToPath(new URL('./sync-lidl-fleet.mjs', import.meta.url));
const comparator = fileURLToPath(new URL('./sync-comparator-embedding-catalog.mjs', import.meta.url));
const baseEnv = {
  ...process.env,
  LIDL_FLEET_RUN_ID: randomUUID(),
  LIDL_FLEET_JOB_LIMIT: '300',
  LIDL_FLEET_IDLE_MINUTES: '0',
  LIDL_FLEET_WORK_MINUTES: '300',
  LIDL_FLEET_LEASE_MINUTES: '45',
  LIDL_FLEET_STORE_TIMEOUT_MINUTES: '35',
  LIDL_FLEET_MAX_ATTEMPTS: '1',
  CONCURRENCY: '2',
  REQUEST_DELAY_MS: '250',
  PAGE_SIZE: '100',
  MIN_LEAVES: '35',
  MIN_NONEMPTY_LEAVES: '40',
  EMPTY_LEAF_RETRIES: '3',
  MIN_PRODUCTS: '2200',
  MIN_MATCHED_OFFERS: '1',
  MIN_COVERAGE_RATIO: '0.85',
};
if (!recover) delete baseEnv.LIDL_FLEET_STORE_IDS;

function run(label, script, options = [], extraEnv = {}) {
  console.log(`[lidl-local] ${label}: inicio`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...options], {
      env: { ...baseEnv, ...extraEnv },
      stdio: 'inherit',
    });
    child.once('error', (error) => {
      console.error(`[lidl-local] ${label}: ${error.message}`);
      resolve(false);
    });
    child.once('close', (code, signal) => {
      const ok = code === 0;
      console.log(`[lidl-local] ${label}: ${ok ? 'OK' : `fallo (${signal || code})`}`);
      resolve(ok);
    });
  });
}

if (!recover && !await run('programar censo', fleet, ['--schedule-only'])) {
  process.exitCode = 1;
} else {
  const workers = await Promise.all([1, 2, 3].map((index) =>
    run(`worker ${index}`, fleet, ['--recover-only'], { LIDL_FLEET_WORKER_INDEX: String(index) })));
  const reported = await run('informe final', fleet, ['--report-only']);
  // Cada tienda publica solo tras validar su catálogo; se materializan los
  // éxitos aunque otra tienda haya quedado en dead.
  const compared = await run('comparador', comparator, [], { STORES: 'lidl' });
  if (workers.some((ok) => !ok) || !reported || !compared) process.exitCode = 1;
}
