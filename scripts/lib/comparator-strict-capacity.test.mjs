import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { analyzeCapacitySamples } from './comparator-strict-capacity.mjs';

function sample(seconds, tick = seconds) {
  const metrics = [];
  const add = (name, value, labels = {}) => metrics.push({ name, value, labels });
  add('node_cpu_seconds_total', 10000 + tick * 1.9, { cpu: '0', mode: 'idle' });
  add('node_cpu_seconds_total', 1000 + tick * 0.08, { cpu: '0', mode: 'user' });
  add('node_cpu_seconds_total', 100 + tick * 0.02, { cpu: '0', mode: 'iowait' });
  add('node_memory_MemTotal_bytes', 1000);
  add('node_memory_MemAvailable_bytes', 400);
  add('node_memory_SwapTotal_bytes', 1000);
  add('node_memory_SwapFree_bytes', 600);
  add('node_vmstat_pswpin', 200 + tick);
  add('node_vmstat_pswpout', 100 + tick / 2);
  add('connection_stats_connection_count', 10);
  add('connection_stats_connection_count', 2);
  add('max_connections_connection_count', 60);
  add('pg_up', 1);
  add('pg_exporter_last_scrape_error', 0);
  add('pg_stat_database_deadlocks_total', 0);
  for (const [name, value] of Object.entries({
    node_disk_io_time_seconds_total: 10 + tick * 0.01,
    node_disk_reads_completed_total: 1000 + tick * 10,
    node_disk_writes_completed_total: 500 + tick * 2,
    node_disk_read_bytes_total: 10000 + tick * 4096,
    node_disk_written_bytes_total: 10000 + tick * 4096,
  })) add(name, value, { device: 'nvme1n1' });
  return { type: 'sample', projectRef: 'gkffvigcnsesbaihycay', observed_at: new Date(Date.UTC(2026, 8, 3) + seconds * 1000).toISOString(), metrics };
}

test('CE-100 calcula ratios con denominadores y no autoriza escrituras', () => {
  const result = analyzeCapacitySamples([sample(0), sample(900)]);
  assert.equal(result.observation_window_at_least_15_minutes, true);
  assert.ok(Math.abs(result.cpu_busy_weighted_percent - 5) < 0.0001);
  assert.equal(result.max_connection_percent, 20);
  assert.equal(result.intervals[0].disks.nvme1n1.iops, 12);
  assert.equal(result.min_available_memory_percent, 40);
  assert.equal(result.swap_out_pages_delta, 450);
  assert.equal(result.complete_BU01_baseline, false);
  assert.equal(result.CE100_closed, false);
  assert.equal(result.writes_authorized, false);
});

test('CE-100 no trata un snapshot repetido como CPU cero ni duplica IOPS', () => {
  const result = analyzeCapacitySamples([sample(0), sample(60, 0), sample(120)]);
  assert.equal(result.unchanged_cpu_counter_samples, 1);
  assert.equal(result.intervals.length, 1);
  assert.equal(result.intervals[0].seconds, 120);
  assert.equal(result.intervals[0].disks.nvme1n1.iops, 12);
});

test('CE-100 no fabrica CPU cero cuando nunca avanzan los contadores', () => {
  const result = analyzeCapacitySamples([sample(0), sample(900, 0)]);
  assert.equal(result.cpu_busy_weighted_percent, null);
  assert.equal(result.max_cpu_interval_percent, null);
  assert.equal(result.writes_authorized, false);
});

test('CE-100 distingue una ventana corta y rechaza fechas no ordenadas', () => {
  assert.equal(analyzeCapacitySamples([sample(0), sample(899)]).observation_window_at_least_15_minutes, false);
  assert.throws(() => analyzeCapacitySamples([sample(1), sample(0)]), /ORDER/);
  assert.throws(() => analyzeCapacitySamples([sample(0), sample(0)]), /ORDER/);
});

test('CE-100 rechaza otro proyecto y métricas ausentes o inválidas', () => {
  const wrong = sample(900); wrong.projectRef = 'other';
  assert.throws(() => analyzeCapacitySamples([sample(0), wrong]), /SCOPE/);
  const missing = sample(900); missing.metrics = missing.metrics.filter((m) => m.name !== 'node_memory_MemAvailable_bytes');
  assert.throws(() => analyzeCapacitySamples([sample(0), missing]), /MISSING/);
  const invalid = sample(900); invalid.metrics.find((m) => m.name === 'max_connections_connection_count').value = 0;
  assert.throws(() => analyzeCapacitySamples([sample(0), invalid]), /GAUGE/);
});

test('CE-100 rechaza reinicios de contadores y cambios de discos', () => {
  assert.throws(() => analyzeCapacitySamples([sample(0, 100), sample(60, 0)]), /COUNTER_RESET/);
  const changed = sample(900); changed.metrics.filter((m) => m.name.startsWith('node_disk')).forEach((m) => { m.labels.device = 'other'; });
  assert.throws(() => analyzeCapacitySamples([sample(0), changed]), /DEVICE_SET/);
});

test('CE-100 observador por defecto es offline y rechaza un destino distinto', () => {
  const script = new URL('../observe-comparator-strict-capacity.mjs', import.meta.url);
  const plan = JSON.parse(execFileSync(process.execPath, [script.pathname], { encoding: 'utf8' }));
  assert.equal(plan.mode, 'plan');
  assert.equal(plan.network_calls, 0);
  const result = spawnSync(process.execPath, [script.pathname, '--observe', '--project-ref', 'other', '--prior-metrics-bytes', '0'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CE100_EXPECT_EXPLICIT_REF/);
});
