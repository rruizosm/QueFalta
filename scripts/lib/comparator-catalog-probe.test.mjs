import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { CATALOG_PROBE, catalogProbeHash, catalogProbeUrl, catalogProbeBlockers, validateCatalogProbeRows, readCatalogProbeOnce, analyzeCatalogProbe } from './comparator-catalog-probe.mjs';

const now = Date.parse('2026-09-03T12:00:00Z');
const key = (role = 'anon') => `test.${Buffer.from(JSON.stringify({ ref: CATALOG_PROBE.projectRef, role })).toString('base64url')}.test`;
const manifest = () => ({ project_ref: CATALOG_PROBE.projectRef, operation_hash: catalogProbeHash, execution_authorized: true,
  sole_operator_confirmed: true, observation_coordinated: true,
  budget: { date_utc: '2026-09-03', accounting_reviewed: true, remaining_bytes: 100000, remaining_rows: 500, remaining_sql_ms: 5000 },
  preflight: { captured_at: new Date(now).toISOString(), rls_enabled: true, anon_select: true, readonly_reviewed: true,
    index_plan_reviewed: true, configured_statement_timeout_ms: 3000, configured_lock_timeout_ms: 500 } });
const page = () => Array.from({ length: 50 }, (_, i) => ({ ...Object.fromEntries(CATALOG_PROBE.select.split(',').map((column) => [column, null])), id: String(i + 1), display_name: `Producto ${i + 1}`, unit_price: 1 }));
const observations = (n = 61) => Array.from({ length: n }, (_, i) => ({ started_at: new Date(now + i * 15000).toISOString(), duration_ms: i + 10,
  status: 200, success: true, failure: null, bytes: 1000, rows: 50, response_sha256: 'a'.repeat(64), operation_hash: catalogProbeHash, synthetic: true }));

test('CE-100 catálogo: URL exacta de primera página sin RPC ni escritura', () => {
  const url = new URL(catalogProbeUrl());
  assert.equal(url.origin, 'https://auth.quefalta.es');
  assert.equal(url.pathname, '/rest/v1/mercadona_products');
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('published'), 'eq.true');
  assert.equal(url.searchParams.get('order'), 'display_name_norm.asc.nullslast,id.asc');
  assert.equal(CATALOG_PROBE.method, 'GET');
  assert.equal(CATALOG_PROBE.commercialUses, 0);
});

test('CE-100 catálogo: manifiesto compatible no tiene bloqueos', () => {
  assert.deepEqual(catalogProbeBlockers(manifest(), now), []);
});

test('CE-100 catálogo: otro destino/hash, autorización ausente y observación incompleta se rechazan', () => {
  const m = manifest(); m.project_ref = 'other'; m.execution_authorized = false; m.observation_coordinated = false;
  assert.deepEqual(catalogProbeBlockers(m, now), ['target_or_operation_mismatch', 'execution_not_authorized', 'observation_not_coordinated']);
});

test('CE-100 catálogo: se rechazan métricas caducadas/futuras y presupuesto de otro día', () => {
  const m = manifest(); m.preflight.captured_at = new Date(now - 300001).toISOString();
  assert.ok(catalogProbeBlockers(m, now).includes('stale_preflight'));
  m.preflight.captured_at = new Date(now + 1).toISOString();
  assert.ok(catalogProbeBlockers(m, now).includes('stale_preflight'));
  m.budget.date_utc = '2026-09-02';
  assert.ok(catalogProbeBlockers(m, now).includes('budget_not_current_or_reviewed'));
});

test('CE-100 catálogo: se rechazan presupuestos insuficientes y valores no finitos', () => {
  const m = manifest(); m.budget.remaining_bytes = 0; m.budget.remaining_rows = 49; m.budget.remaining_sql_ms = Number.NaN;
  const blockers = catalogProbeBlockers(m, now);
  assert.ok(blockers.includes('insufficient_response_budget'));
  assert.ok(blockers.includes('insufficient_row_budget'));
  assert.ok(blockers.includes('invalid_remaining_sql_ms'));
});

test('CE-100 catálogo: lock 8s no se hace pasar por 500ms; excepción debe tener alcance y día', () => {
  const m = manifest(); m.preflight.configured_lock_timeout_ms = 8000;
  assert.ok(catalogProbeBlockers(m, now).includes('http_lock_timeout_exception_required'));
  m.http_lock_exception = { approved: true, date_utc: '2026-09-03', project_ref: CATALOG_PROBE.projectRef, operation_hash: catalogProbeHash, authority_quote: 'TEST ONLY' };
  assert.deepEqual(catalogProbeBlockers(m, now), []);
  m.http_lock_exception.date_utc = '2026-09-02';
  assert.ok(catalogProbeBlockers(m, now).includes('http_lock_timeout_exception_required'));
});

test('CE-100 catálogo: se rechazan permisos no revisados y statement timeout demasiado largo', () => {
  const m = manifest(); m.preflight.rls_enabled = false; m.preflight.configured_statement_timeout_ms = 8000;
  assert.ok(catalogProbeBlockers(m, now).includes('read_scope_not_reviewed'));
  assert.ok(catalogProbeBlockers(m, now).includes('statement_timeout_incompatible'));
});

test('CE-100 catálogo: valida campos, tamaño de página y duplicados', () => {
  assert.equal(validateCatalogProbeRows(page()), 50);
  assert.throws(() => validateCatalogProbeRows([]), /page_size/);
  const duplicate = page(); duplicate[1].id = duplicate[0].id;
  assert.throws(() => validateCatalogProbeRows(duplicate), /duplicate/);
  const unexpected = page(); unexpected[0].secret = 'not allowed';
  assert.throws(() => validateCatalogProbeRows(unexpected), /payload/);
});

test('CE-100 catálogo: GET exitoso simulado no exporta productos ni credenciales', async () => {
  let calls = 0;
  const result = await readCatalogProbeOnce({ anonKey: key(), manifest: manifest(), now: () => now, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, catalogProbeUrl()); assert.equal(options.method, 'GET'); assert.equal(options.redirect, 'error');
    assert.equal(options.body, undefined); assert.ok(options.signal);
    return new Response(JSON.stringify(page()), { status: 200 });
  } });
  assert.equal(calls, 1); assert.equal(result.success, true); assert.equal(result.rows, 50);
  assert.match(result.response_sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes('Producto'), false);
  assert.equal(JSON.stringify(result).includes(key()), false);
});

test('CE-100 catálogo: preflight inválido y service_role nunca llegan a fetch', async () => {
  const options = { now: () => now, fetchImpl: async () => { throw new Error('must not run'); } };
  const m = manifest(); m.execution_authorized = false;
  await assert.rejects(readCatalogProbeOnce({ ...options, anonKey: key(), manifest: m }), /PREFLIGHT/);
  await assert.rejects(readCatalogProbeOnce({ ...options, anonKey: key('service_role'), manifest: manifest() }), /ANON_SCOPE/);
});

test('CE-100 catálogo: HTTP 403/429/500 y timeout se registran, sin reintentar', async () => {
  for (const status of [403, 429, 500]) {
    let calls = 0;
    const result = await readCatalogProbeOnce({ anonKey: key(), manifest: manifest(), now: () => now, fetchImpl: async () => {
      calls++; return new Response('private error text', { status });
    } });
    assert.equal(calls, 1); assert.equal(result.success, false); assert.equal(result.failure, `http_${status}`);
    assert.equal(result.stop_required, true); assert.equal(result.server_cancellation_confirmed, false);
    assert.equal(JSON.stringify(result).includes('private error text'), false);
  }
  const timeout = await readCatalogProbeOnce({ anonKey: key(), manifest: manifest(), now: () => now, fetchImpl: async () => { throw new DOMException('private', 'TimeoutError'); } });
  assert.equal(timeout.failure, 'client_timeout_or_abort');
});

test('CE-100 catálogo: respuesta excesiva/inválida no se cuenta como éxito', async () => {
  for (const [body, failure] of [['x'.repeat(65537), 'response_budget_exceeded'], ['[]', 'unexpected_page_size'], ['not json', 'invalid_json']]) {
    const result = await readCatalogProbeOnce({ anonKey: key(), manifest: manifest(), now: () => now, fetchImpl: async () => new Response(body) });
    assert.equal(result.success, false); assert.equal(result.failure, failure); assert.equal(result.stop_required, true);
  }
});

test('CE-100 catálogo: 61 observaciones dan 3 ventanas de 20, p95 por nearest rank, sin aprobar CE-100', () => {
  const result = analyzeCatalogProbe(observations());
  assert.equal(result.read_window_complete, true);
  assert.deepEqual(result.windows.map((w) => w.attempted), [20, 20, 20]);
  assert.deepEqual(result.windows.map((w) => w.p95_success_ms), [28, 48, 68]);
  assert.equal(result.p95_success_ms, 67);
  assert.equal(result.CE100_closed, false); assert.equal(result.writes_authorized, false);
  assert.equal(result.real_user_error_rate_measured, false);
  assert.ok(result.error_rate_wilson_upper_95 > 0.01);
});

test('CE-100 catálogo: muestra corta, errores y cancelaciones conservan denominador', () => {
  const short = observations(20); assert.equal(analyzeCatalogProbe(short).read_window_complete, false);
  const failed = observations(2); Object.assign(failed[1], { status: null, success: false, failure: 'client_timeout_or_abort', rows: null, response_sha256: null });
  const result = analyzeCatalogProbe(failed);
  assert.equal(result.attempted, 2); assert.equal(result.failed, 1); assert.equal(result.observed_error_rate, 0.5);
  assert.equal(result.p95_success_ms, 10);
});

test('CE-100 catálogo: rechaza simultaneidad/cadencia, NaN, otro hash y continuar tras fallo', () => {
  const rapid = observations(2); rapid[1].started_at = rapid[0].started_at;
  assert.throws(() => analyzeCatalogProbe(rapid), /CADENCE/);
  const bad = observations(2); bad[0].duration_ms = NaN;
  assert.throws(() => analyzeCatalogProbe(bad), /INVALID_ATTEMPT/);
  const hash = observations(2); hash[0].operation_hash = 'other';
  assert.throws(() => analyzeCatalogProbe(hash), /INVALID_ATTEMPT/);
  const continued = observations(2); Object.assign(continued[0], { success: false, status: 500, failure: 'http_500', rows: null });
  assert.throws(() => analyzeCatalogProbe(continued), /CONTINUED/);
});

test('CE-100 catálogo: CLI por defecto offline y modo remoto bloqueado por manifiesto', () => {
  const script = new URL('../probe-comparator-strict-catalog.mjs', import.meta.url).pathname;
  const plan = JSON.parse(execFileSync(process.execPath, [script], { encoding: 'utf8' }));
  assert.equal(plan.mode, 'plan'); assert.equal(plan.network_calls, 0);
  assert.ok(plan.blockers.includes('execution_not_authorized'));
  const denied = spawnSync(process.execPath, [script, '--read-once', '--project-ref', CATALOG_PROBE.projectRef, '--confirm', catalogProbeHash], { encoding: 'utf8' });
  assert.notEqual(denied.status, 0); assert.match(denied.stderr, /CE100_PREFLIGHT/);
});

test('CE-100 catálogo: rechaza manifiestos inválidos y un éxito fuera del límite temporal', async () => {
  assert.deepEqual(catalogProbeBlockers(null, now), ['invalid_manifest_or_clock']);
  const m = manifest(); m.budget.remaining_bytes = 65536.5;
  assert.ok(catalogProbeBlockers(m, now).includes('invalid_remaining_bytes'));
  let clock = 0;
  const result = await readCatalogProbeOnce({ anonKey: key(), manifest: manifest(), now: () => now,
    monotonicNow: () => { clock += 6000; return clock; }, fetchImpl: async () => new Response(JSON.stringify(page())) });
  assert.equal(result.success, false); assert.equal(result.failure, 'http_duration_exceeded');
});

test('CE-100 catálogo: un éxito debe incluir hash de respuesta y no durar más de 5s', () => {
  const noHash = observations(1); delete noHash[0].response_sha256;
  assert.throws(() => analyzeCatalogProbe(noHash), /INVALID_SUCCESS/);
  const slow = observations(1); slow[0].duration_ms = 5001;
  assert.throws(() => analyzeCatalogProbe(slow), /INVALID_SUCCESS/);
});
