#!/usr/bin/env node
// Planificador OFFLINE. No carga .env, no abre conexiones, no despliega SQL.
import { CE1_REF, createStrictRunner } from './lib/comparator-strict-guard.mjs';

const operations = {
  metadata_probe: {
    kind: 'diagnostic',
    sql: "select current_database() as database_name, current_setting('transaction_read_only') as read_only",
    objects: ['pg_catalog.pg_database'], maxReadRows: 1, maxWriteRows: 0,
    maxInducedRows: 0, rowKeys: [], maxResponseBytes: 4096, maxSqlMs: 5000,
    externalCalls: 0, queueJobs: 0, commercialQuotaUses: 0, globalChanges: false,
    reviewed: true,
  },
};
const flags = new Map([
  ['--operation', 'operation'], ['--project-ref', 'projectRef'], ['--supabase-url', 'supabaseUrl'],
  ['--mode', 'mode'], ['--job-id', 'jobId'], ['--operation-hash', 'operationHash'],
  ['--confirm-production', 'confirmProduction'],
]);
const request = { operation: 'metadata_probe', projectRef: CE1_REF,
  supabaseUrl: 'https://auth.quefalta.es', jobId: 'ce1-preflight' };
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    console.log('CE-102 offline preflight: --operation metadata_probe --project-ref REF --supabase-url URL --job-id ce1-ID --mode plan');
    console.log('Default: plan. No remote adapters are configured: read/apply cannot execute.');
  } else {
    const seen = new Set();
    for (let i = 0; i < args.length; i += 2) {
      const key = flags.get(args[i]);
      if (!key || seen.has(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('ce1_invalid_cli_arguments');
      seen.add(key); request[key] = args[i + 1];
    }
    const result = await createStrictRunner({ operations })(request);
    console.log(JSON.stringify({ ...result, networkCalls: 0, remoteAdapterConfigured: false }, null, 2));
  }
} catch (error) {
  console.error(error.code ?? error.message); process.exitCode = 1;
}
