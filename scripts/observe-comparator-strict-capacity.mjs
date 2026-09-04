#!/usr/bin/env node
// CE-100: lectura puntual de métricas. No crea jobs, servicios ni objetos SQL.
// La salida solo contiene métricas de infraestructura seleccionadas, nunca claves.
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const projectRef = 'gkffvigcnsesbaihycay';
const args = process.argv.slice(2);
const expected = ['--observe', '--project-ref', projectRef, '--prior-metrics-bytes'];
if (args.length === 0) {
  console.log(JSON.stringify({ mode: 'plan', projectRef, samples: 16, interval_ms: 60000, network_calls: 0 }));
} else {
  if (args.length !== 5 || expected.some((value, i) => args[i] !== value) || !/^\d+$/.test(args[4])) {
    throw new Error('CE100_EXPECT_EXPLICIT_REF_AND_PRIOR_BYTES');
  }
  let transferredBytes = Number(args[4]);
  const maxBytes = 10 * 1024 * 1024;
  if (!Number.isSafeInteger(transferredBytes) || transferredBytes >= maxBytes) throw new Error('CE100_INVALID_BUDGET');
  const env = parseEnv(readFileSync(new URL('../.env.local', import.meta.url), 'utf8'));
  const key = env.SUPABASE_SERVICE_ROLE;
  if (!key) throw new Error('CE100_EXISTING_CREDENTIAL_MISSING');
  if (key.split('.').length !== 3) throw new Error('CE100_EXPECT_EXISTING_SCOPED_LEGACY_KEY');
  const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
  if (claims.ref !== projectRef || claims.role !== 'service_role') throw new Error('CE100_CREDENTIAL_SCOPE_MISMATCH');
  const started = performance.now();
  const acceptedNames = /^(node_cpu_seconds_total|node_cpu_online|node_time_seconds|node_boot_time_seconds|node_load[0-9]+|node_memory_(MemAvailable|MemTotal|MemFree|SwapTotal|SwapFree|Cached|Buffers|Committed_AS|CommitLimit)_bytes|node_vmstat_pswpin|node_vmstat_pswpout|node_pressure_[a-z_]+|node_disk_(read_bytes_total|written_bytes_total|reads_completed_total|writes_completed_total|read_time_seconds_total|write_time_seconds_total|io_time_seconds_total|io_time_weighted_seconds_total|io_now)|node_filesystem_(avail_bytes|size_bytes|device_error|readonly)|connection_stats_connection_count|direct_connection_stats_connection_count|max_connections_connection_count|pg_stat_database_deadlocks_total|pg_stat_database_conflicts_confl_lock_total|pg_up|pg_exporter_last_scrape_error|pgbouncer_pools_client_waiting_connections|pgbouncer_pools_client_maxwait_seconds)$/;
  const acceptedLabels = new Set(['cpu', 'mode', 'device', 'datname', 'database', 'state', 'fstype', 'mountpoint']);
  let lastFetchStarted = null;
  for (let index = 0; index < 16; index++) {
    if (lastFetchStarted !== null) await delay(Math.max(0, 60000 - (performance.now() - lastFetchStarted)));
    if (performance.now() - started > 20 * 60000) throw new Error('CE100_JOB_DEADLINE');
    // Reserve the maximum next response before starting a call; no retry.
    if (transferredBytes + 1048576 > maxBytes) throw new Error('CE100_TRANSFER_BUDGET');
    lastFetchStarted = performance.now();
    const observedAt = new Date().toISOString();
    try {
      const response = await fetch(`https://${projectRef}.supabase.co/customer/v1/privileged/metrics`, {
        headers: { Authorization: `Basic ${Buffer.from(`service_role:${key}`).toString('base64')}` },
        signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!response.ok) throw new Error(`CE100_HTTP_${response.status}`);
      const reader = response.body.getReader();
      const chunks = [];
      let bytes = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        transferredBytes += value.byteLength;
        if (bytes > 1048576 || transferredBytes > maxBytes) {
          await reader.cancel();
          throw new Error('CE100_TRANSFER_BUDGET');
        }
        chunks.push(Buffer.from(value));
      }
      const metrics = [];
      for (const line of Buffer.concat(chunks).toString('utf8').split('\n')) {
        const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*\})?\s+([-+0-9.eE]+)(?:\s+\d+)?$/);
        if (!match || !acceptedNames.test(match[1])) continue;
        const labels = {};
        for (const label of (match[2] ?? '').matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"\\])*)"/g)) {
          if (acceptedLabels.has(label[1])) labels[label[1]] = JSON.parse(`"${label[2]}"`);
        }
        const value = Number(match[3]);
        if (!Number.isFinite(value)) throw new Error('CE100_NONFINITE_METRIC');
        metrics.push({ name: match[1], labels, value });
      }
      if (!metrics.some((m) => m.name === 'node_cpu_seconds_total') || !metrics.some((m) => m.name === 'node_memory_MemTotal_bytes')) {
        throw new Error('CE100_REQUIRED_SERIES_MISSING');
      }
      console.log(JSON.stringify({ type: 'sample', index, projectRef, observed_at: observedAt, elapsed_ms: performance.now() - lastFetchStarted, bytes, transferred_bytes: transferredBytes, metrics }));
    } catch (error) {
      // Never print fetch options, headers, raw response bodies or credentials.
      console.log(JSON.stringify({ type: 'failure', index, observed_at: observedAt, error: error.message.startsWith('CE100_') ? error.message : error.name, transferred_bytes: transferredBytes }));
      process.exitCode = 1;
      break;
    }
  }
}
