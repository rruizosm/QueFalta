import { createHash } from 'node:crypto';

export const CATALOG_PROBE = Object.freeze({
  id: 'CE-100-CATALOG-READ-001',
  projectRef: 'gkffvigcnsesbaihycay',
  origin: 'https://auth.quefalta.es',
  path: '/rest/v1/mercadona_products',
  method: 'GET', role: 'anon', region: 'Catalunya', limit: 50,
  select: 'id,display_name,display_name_ca,slug,packaging,thumbnail,unit_price,price_per_unit,price_per_unit_unit,category_name,category_id,display_name_norm',
  order: 'display_name_norm.asc.nullslast,id.asc',
  attempts: 61, intervalMs: 15000, windowMs: 900000,
  responseLimitBytes: 65536, httpTimeoutMs: 5000, retries: 0,
  requiredStatementTimeoutMs: 5000, requiredLockTimeoutMs: 500,
  writes: 0, comparatorCalls: 0, commercialUses: 0,
});

export const catalogProbeHash = createHash('sha256').update(JSON.stringify(CATALOG_PROBE)).digest('hex');

export function catalogProbeUrl() {
  const url = new URL(CATALOG_PROBE.path, CATALOG_PROBE.origin);
  url.searchParams.set('select', CATALOG_PROBE.select);
  url.searchParams.set('published', 'eq.true');
  url.searchParams.set('order', CATALOG_PROBE.order);
  url.searchParams.set('limit', String(CATALOG_PROBE.limit));
  url.searchParams.set('or', '(regions.is.null,regions.eq.{},regions.cs.{"Catalunya"})');
  return url.href;
}

// This validates one assisted diagnostic request, not a project-wide durable
// budget coordinator. The operator must reserve/count every request separately.
export function catalogProbeBlockers(manifest, nowMs = Date.now()) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Number.isFinite(nowMs)) return ['invalid_manifest_or_clock'];
  const blockers = [];
  const today = new Date(nowMs).toISOString().slice(0, 10);
  if (manifest.project_ref !== CATALOG_PROBE.projectRef || manifest.operation_hash !== catalogProbeHash) blockers.push('target_or_operation_mismatch');
  if (manifest.execution_authorized !== true) blockers.push('execution_not_authorized');
  if (manifest.budget?.date_utc !== today || manifest.budget?.accounting_reviewed !== true) blockers.push('budget_not_current_or_reviewed');
  for (const field of ['remaining_bytes', 'remaining_rows', 'remaining_sql_ms']) {
    if (!Number.isSafeInteger(manifest.budget?.[field]) || manifest.budget[field] < 0) blockers.push(`invalid_${field}`);
  }
  if (manifest.budget?.remaining_bytes < CATALOG_PROBE.responseLimitBytes) blockers.push('insufficient_response_budget');
  if (manifest.budget?.remaining_rows < CATALOG_PROBE.limit) blockers.push('insufficient_row_budget');
  if (manifest.budget?.remaining_sql_ms < CATALOG_PROBE.requiredStatementTimeoutMs) blockers.push('insufficient_sql_budget');
  const capture = Date.parse(manifest.preflight?.captured_at);
  if (!Number.isFinite(capture) || nowMs < capture || nowMs - capture > 300000) blockers.push('stale_preflight');
  if (manifest.preflight?.rls_enabled !== true || manifest.preflight?.anon_select !== true || manifest.preflight?.readonly_reviewed !== true || manifest.preflight?.index_plan_reviewed !== true) blockers.push('read_scope_not_reviewed');
  const statement = manifest.preflight?.configured_statement_timeout_ms;
  if (!Number.isFinite(statement) || statement <= 0 || statement > CATALOG_PROBE.requiredStatementTimeoutMs) blockers.push('statement_timeout_incompatible');
  const lock = manifest.preflight?.configured_lock_timeout_ms;
  if (!Number.isFinite(lock) || lock <= 0 || lock > CATALOG_PROBE.requiredLockTimeoutMs) {
    const exception = manifest.http_lock_exception;
    if (!(lock === 8000 && statement === 3000 && exception?.approved === true &&
      exception.date_utc === today && exception.project_ref === CATALOG_PROBE.projectRef &&
      exception.operation_hash === catalogProbeHash && typeof exception.authority_quote === 'string' && exception.authority_quote.trim().length > 0)) {
      blockers.push('http_lock_timeout_exception_required');
    }
  }
  if (manifest.sole_operator_confirmed !== true || manifest.observation_coordinated !== true) blockers.push('observation_not_coordinated');
  return [...new Set(blockers)];
}

export function validateCatalogProbeRows(rows) {
  if (!Array.isArray(rows) || rows.length !== CATALOG_PROBE.limit) throw new Error('unexpected_page_size');
  const allowed = new Set(CATALOG_PROBE.select.split(','));
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some((key) => !allowed.has(key)) ||
      [...allowed].some((key) => !Object.hasOwn(row, key)) || typeof row.id !== 'string' || !row.id ||
      typeof row.display_name !== 'string' || !row.display_name ||
      !(row.unit_price === null || (typeof row.unit_price === 'number' && Number.isFinite(row.unit_price) && row.unit_price >= 0))) throw new Error('invalid_catalog_payload');
    if (ids.has(row.id)) throw new Error('duplicate_product_id');
    ids.add(row.id);
  }
  return rows.length;
}

export async function readCatalogProbeOnce({ anonKey, manifest, fetchImpl = fetch, now = Date.now, monotonicNow = () => performance.now() }) {
  const blockers = catalogProbeBlockers(manifest, now());
  if (blockers.length) throw new Error(`CE100_PREFLIGHT: ${blockers.join(',')}`);
  if (typeof anonKey !== 'string' || anonKey.split('.').length !== 3) throw new Error('CE100_EXPECT_SCOPED_ANON_KEY');
  const claims = JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString());
  if (claims.ref !== CATALOG_PROBE.projectRef || claims.role !== 'anon') throw new Error('CE100_ANON_SCOPE_MISMATCH');
  const startedAt = new Date(now()).toISOString();
  const started = monotonicNow();
  let bytes = 0;
  let status = null;
  let reader;
  try {
    const response = await fetchImpl(catalogProbeUrl(), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(CATALOG_PROBE.httpTimeoutMs),
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, Accept: 'application/json', 'X-Client-Info': 'ce1-catalog-read-probe' },
    });
    status = response.status;
    reader = response.body?.getReader();
    if (!reader) throw new Error('missing_response_body');
    const chunks = [];
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > CATALOG_PROBE.responseLimitBytes) throw new Error('response_budget_exceeded');
      chunks.push(Buffer.from(value));
    }
    if (status !== 200) throw new Error(`http_${status}`);
    const body = Buffer.concat(chunks);
    let rows;
    try { rows = JSON.parse(body.toString('utf8')); } catch { throw new Error('invalid_json'); }
    const rowCount = validateCatalogProbeRows(rows);
    const duration = monotonicNow() - started;
    if (!Number.isFinite(duration) || duration < 0 || duration > CATALOG_PROBE.httpTimeoutMs) throw new Error('http_duration_exceeded');
    return { started_at: startedAt, duration_ms: duration, status, success: true, failure: null, bytes, rows: rowCount,
      response_sha256: createHash('sha256').update(body).digest('hex'), operation_hash: catalogProbeHash, synthetic: true };
  } catch (error) {
    await reader?.cancel().catch(() => {});
    const recognized = /^(http_\d{3}|http_duration_exceeded|response_budget_exceeded|missing_response_body|invalid_json|unexpected_page_size|invalid_catalog_payload|duplicate_product_id)$/;
    const failure = recognized.test(error.message) ? error.message : ['TimeoutError', 'AbortError'].includes(error.name) ? 'client_timeout_or_abort' : 'transport_error';
    return { started_at: startedAt, duration_ms: monotonicNow() - started, status, success: false, failure, bytes, rows: null,
      response_sha256: null, operation_hash: catalogProbeHash, synthetic: true, stop_required: true, server_cancellation_confirmed: false };
  }
}

export function analyzeCatalogProbe(attempts) {
  if (!Array.isArray(attempts) || attempts.length === 0 || attempts.length > CATALOG_PROBE.attempts) throw new Error('CE100_INVALID_ATTEMPT_COUNT');
  const firstTime = Date.parse(attempts[0].started_at);
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index];
    const time = Date.parse(attempt.started_at);
    if (attempt.operation_hash !== catalogProbeHash || attempt.synthetic !== true || !Number.isFinite(time) || !Number.isFinite(attempt.duration_ms) || attempt.duration_ms < 0 ||
      typeof attempt.success !== 'boolean' || !Number.isSafeInteger(attempt.bytes) || attempt.bytes < 0) throw new Error('CE100_INVALID_ATTEMPT');
    if (attempt.success && (attempt.status !== 200 || attempt.rows !== CATALOG_PROBE.limit || attempt.failure !== null || attempt.duration_ms > CATALOG_PROBE.httpTimeoutMs || !/^[a-f0-9]{64}$/.test(attempt.response_sha256 ?? ''))) throw new Error('CE100_INVALID_SUCCESS');
    if (index > 0 && time - Date.parse(attempts[index - 1].started_at) < CATALOG_PROBE.intervalMs) throw new Error('CE100_CADENCE_VIOLATION');
    if (index > 0 && time < Date.parse(attempts[index - 1].started_at) + attempts[index - 1].duration_ms) throw new Error('CE100_OVERLAPPING_ATTEMPTS');
    if (index > 0 && attempts[index - 1].success === false) throw new Error('CE100_CONTINUED_AFTER_FAILURE');
  }
  const p95 = (values) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] : null;
  const successes = attempts.filter((a) => a.success);
  const failures = attempts.length - successes.length;
  const windows = [0, 1, 2].map((index) => {
    const subset = attempts.filter((a) => { const offset = Date.parse(a.started_at) - firstTime; return offset >= index * 300000 && offset < (index + 1) * 300000; });
    const successful = subset.filter((a) => a.success);
    return { index, attempted: subset.length, successful: successful.length, failures: subset.length - successful.length,
      p95_success_ms: p95(successful.map((a) => a.duration_ms)), adequate_success_sample: successful.length >= 20 };
  });
  const duration = Date.parse(attempts.at(-1).started_at) - firstTime;
  const n = attempts.length; const z2 = 1.96 ** 2; const rate = failures / n;
  const upper = (rate + z2 / (2 * n) + 1.96 * Math.sqrt(rate * (1 - rate) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { attempted: n, successful: successes.length, failed: failures, observed_error_rate: rate, error_rate_wilson_upper_95: upper,
    p95_success_ms: p95(successes.map((a) => a.duration_ms)), acquisition_span_ms: duration, windows,
    read_window_complete: n === 61 && failures === 0 && duration >= 900000 && duration < 1200000 && windows.every((w) => w.adequate_success_sample),
    synthetic_only: true, mobile_rendering_measured: false, real_user_error_rate_measured: false,
    infrastructure_and_lock_correlation_required: true, CE100_closed: false, writes_authorized: false };
}
