// Pure analysis of CE-100 infrastructure samples; never authorizes a write.
const sum = (sample, name, predicate = () => true) => {
  const values = sample.metrics.filter((m) => m.name === name && predicate(m));
  if (!values.length || values.some((m) => !Number.isFinite(m.value))) throw new Error(`CE100_MISSING_OR_INVALID_${name}`);
  return values.reduce((total, m) => total + m.value, 0);
};

export function analyzeCapacitySamples(samples) {
  if (!Array.isArray(samples) || samples.length < 2) throw new Error('CE100_NEED_MULTIPLE_SAMPLES');
  const series = samples.map((sample, index) => {
    if (sample.type !== 'sample' || sample.projectRef !== 'gkffvigcnsesbaihycay') throw new Error('CE100_INVALID_SAMPLE_SCOPE');
    const time = Date.parse(sample.observed_at);
    if (!Number.isFinite(time) || (index > 0 && time <= Date.parse(samples[index - 1].observed_at))) throw new Error('CE100_INVALID_SAMPLE_ORDER');
    const memTotal = sum(sample, 'node_memory_MemTotal_bytes');
    const memAvailable = sum(sample, 'node_memory_MemAvailable_bytes');
    const swapTotal = sum(sample, 'node_memory_SwapTotal_bytes');
    const swapFree = sum(sample, 'node_memory_SwapFree_bytes');
    const connections = sum(sample, 'connection_stats_connection_count');
    const maxConnections = sum(sample, 'max_connections_connection_count');
    if (memTotal <= 0 || memAvailable < 0 || memAvailable > memTotal || swapFree < 0 || swapFree > swapTotal || maxConnections <= 0) throw new Error('CE100_INVALID_GAUGE');
    const devices = {};
    for (const metric of sample.metrics.filter((m) => m.name === 'node_disk_io_time_seconds_total')) {
      const device = metric.labels.device;
      const onDevice = (m) => m.labels.device === device;
      devices[device] = {
        ioSeconds: metric.value,
        operations: sum(sample, 'node_disk_reads_completed_total', onDevice) + sum(sample, 'node_disk_writes_completed_total', onDevice),
        bytes: sum(sample, 'node_disk_read_bytes_total', onDevice) + sum(sample, 'node_disk_written_bytes_total', onDevice),
      };
    }
    if (!Object.keys(devices).length) throw new Error('CE100_DISK_SERIES_MISSING');
    return {
      time, observed_at: sample.observed_at,
      cpuTotal: sum(sample, 'node_cpu_seconds_total'),
      cpuIdle: sum(sample, 'node_cpu_seconds_total', (m) => m.labels.mode === 'idle'),
      cpuIowait: sum(sample, 'node_cpu_seconds_total', (m) => m.labels.mode === 'iowait'),
      available_memory_percent: 100 * memAvailable / memTotal,
      swap_used_bytes: swapTotal - swapFree,
      swapIn: sum(sample, 'node_vmstat_pswpin'), swapOut: sum(sample, 'node_vmstat_pswpout'),
      connection_count: connections, connection_limit: maxConnections,
      connection_percent: 100 * connections / maxConnections,
      pg_up: sum(sample, 'pg_up'), scrape_error: sum(sample, 'pg_exporter_last_scrape_error'),
      deadlocks: sum(sample, 'pg_stat_database_deadlocks_total'), devices,
    };
  });
  const intervals = [];
  let previous = series[0];
  let unchangedCounterSamples = 0;
  for (const current of series.slice(1)) {
    const cpuDelta = current.cpuTotal - previous.cpuTotal;
    if (cpuDelta < 0 || current.cpuIdle < previous.cpuIdle || current.cpuIowait < previous.cpuIowait || current.swapIn < previous.swapIn || current.swapOut < previous.swapOut || current.deadlocks < previous.deadlocks) throw new Error('CE100_COUNTER_RESET');
    // Repeated exporter snapshots are not a new minute of zero CPU or zero IO.
    if (cpuDelta === 0) { unchangedCounterSamples++; continue; }
    const seconds = (current.time - previous.time) / 1000;
    const idleDelta = current.cpuIdle - previous.cpuIdle;
    const iowaitDelta = current.cpuIowait - previous.cpuIowait;
    if (idleDelta > cpuDelta || iowaitDelta > cpuDelta) throw new Error('CE100_INCONSISTENT_CPU_COUNTERS');
    const disks = {};
    if (JSON.stringify(Object.keys(current.devices).sort()) !== JSON.stringify(Object.keys(previous.devices).sort())) throw new Error('CE100_DEVICE_SET_CHANGED');
    for (const [device, now] of Object.entries(current.devices)) {
      const before = previous.devices[device];
      if (Object.keys(now).some((key) => now[key] < before[key])) throw new Error('CE100_COUNTER_RESET');
      disks[device] = { iops: (now.operations - before.operations) / seconds, bytes_per_second: (now.bytes - before.bytes) / seconds, busy_percent: 100 * (now.ioSeconds - before.ioSeconds) / seconds };
    }
    intervals.push({ from: previous.observed_at, to: current.observed_at, seconds, cpu_counter_seconds: cpuDelta,
      cpu_busy_percent: 100 * (1 - idleDelta / cpuDelta), cpu_iowait_percent: 100 * iowaitDelta / cpuDelta,
      swap_in_pages: current.swapIn - previous.swapIn, swap_out_pages: current.swapOut - previous.swapOut, disks });
    previous = current;
  }
  const durationSeconds = (series.at(-1).time - series[0].time) / 1000;
  return {
    sample_count: samples.length, from: series[0].observed_at, to: series.at(-1).observed_at, acquisition_duration_seconds: durationSeconds,
    observation_window_at_least_15_minutes: durationSeconds >= 900,
    unchanged_cpu_counter_samples: unchangedCounterSamples,
    acquisition_time_is_not_exporter_generation_time: true,
    cpu_busy_weighted_percent: intervals.length ? intervals.reduce((t, i) => t + i.cpu_busy_percent * i.cpu_counter_seconds, 0) / intervals.reduce((t, i) => t + i.cpu_counter_seconds, 0) : null,
    max_cpu_interval_percent: intervals.length ? Math.max(...intervals.map((i) => i.cpu_busy_percent)) : null,
    min_available_memory_percent: Math.min(...series.map((i) => i.available_memory_percent)),
    max_connections: Math.max(...series.map((i) => i.connection_count)),
    max_connection_percent: Math.max(...series.map((i) => i.connection_percent)),
    swap_in_pages_delta: series.at(-1).swapIn - series[0].swapIn,
    swap_out_pages_delta: series.at(-1).swapOut - series[0].swapOut,
    postgres_all_samples_up: series.every((i) => i.pg_up === 1 && i.scrape_error === 0),
    deadlocks_delta: series.at(-1).deadlocks - series[0].deadlocks,
    gauges: series.map(({ observed_at, available_memory_percent, swap_used_bytes, connection_count, connection_limit, connection_percent, pg_up, scrape_error, deadlocks }) => ({ observed_at, available_memory_percent, swap_used_bytes, connection_count, connection_limit, connection_percent, pg_up, scrape_error, deadlocks })),
    intervals,
    commercial_latency_measured: false, commercial_error_rate_measured: false,
    complete_BU01_baseline: false, CE100_closed: false, writes_authorized: false,
  };
}
