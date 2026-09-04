import assert from 'node:assert/strict';
import test from 'node:test';
import { CE1_REF, CE1_LIMITS, createStrictRunner, prepareStrictOperation, strictOperationHash, validateStrictTarget } from './comparator-strict-guard.mjs';

const NOW = Date.parse('2026-09-03T12:00:00Z');
const read = () => ({
  kind: 'diagnostic', sql: 'select 1', objects: ['pg_catalog.pg_class'],
  maxReadRows: 1, maxWriteRows: 0, maxInducedRows: 0, rowKeys: [],
  maxResponseBytes: 1024, maxSqlMs: 5000, externalCalls: 0, queueJobs: 0,
  commercialQuotaUses: 0, globalChanges: false, reviewed: true,
});
const write = () => ({
  ...read(), kind: 'write', sql: 'insert into comparator_strict.execution_control values (1)',
  objects: ['comparator_strict.execution_control'], maxWriteRows: 1, rowKeys: ['1'],
});
const readiness = () => ({
  CE100: 'accepted', scopeReviewed: true, rollbackReviewed: true, canaryAccepted: false,
  baseline: { complete: true, durationMs: 900000, endedAtMs: NOW,
    cpuMaxFiveMinutePercent: 30, connectionsMaxPercent: 45,
    memoryPressure: false, ioPressure: false, clientBlocking: false,
    latencyRegression: false, errorRegression: false },
});
const budget = () => ({
  projectRef: CE1_REF, utcDay: '2026-09-03', jobId: 'ce1-test', activeJobs: 1,
  sqlMsReserved: 0, readRowsReserved: 0, writeRowsReserved: 0, bytesReserved: 0,
  jobWriteRowsReserved: 0, consecutiveTimeouts: 0, halted: false,
});
const context = () => ({
  nowMs: NOW, jobStartedAtMs: NOW - 1000,
  verifiedTarget: { projectRef: CE1_REF, origin: 'https://auth.quefalta.es', status: 'ACTIVE_HEALTHY', verifiedAtMs: NOW },
  budget: budget(), readiness: readiness(),
});
const request = (operation = read(), mode = 'read') => ({
  operation: 'test', projectRef: CE1_REF, supabaseUrl: 'https://auth.quefalta.es',
  jobId: 'ce1-test', mode, operationHash: strictOperationHash(operation),
  ...(mode === 'apply' ? { confirmProduction: CE1_REF } : {}),
});
const check = (op = read(), req = request(op), ctx = context()) => prepareStrictOperation(req, { test: op }, ctx);

test('plan es el modo por defecto; no necesita red ni presupuesto ejecutable', () => {
  const req = request(); delete req.mode; delete req.operationHash;
  const plan = check(read(), req, {});
  assert.equal(plan.mode, 'plan'); assert.equal(plan.transaction.readOnly, true);
  assert.ok(Object.isFrozen(plan.operation.objects));
});
test('admite los dos orígenes exactos del proyecto', () => {
  for (const url of ['https://auth.quefalta.es', `https://${CE1_REF}.supabase.co/`]) assert.ok(validateStrictTarget(CE1_REF, url));
});
for (const url of ['http://auth.quefalta.es', 'https://auth.quefalta.es.evil.test', 'https://evil.test', 'https://u:p@auth.quefalta.es', 'https://auth.quefalta.es/x', 'https://auth.quefalta.es/?x=1', 'https://auth.quefalta.es/#x', 'https://auth.quefalta.es:444']) {
  test(`rechaza endpoint fuera de alcance: ${url}`, () => assert.throws(() => validateStrictTarget(CE1_REF, url), { code: 'ce1_wrong_endpoint' }));
}
test('rechaza otro project ref aunque el dominio sea correcto', () => assert.throws(() => check(read(), { ...request(), projectRef: 'other' }), { code: 'ce1_wrong_project' }));
test('rechaza argumentos desconocidos y SQL aportado por el llamante', () => assert.throws(() => check(read(), { ...request(), sql: 'delete from profiles' }), { code: 'ce1_unknown_argument' }));
test('rechaza operación desconocida o heredada del prototipo', () => {
  for (const name of ['missing', 'toString', '__proto__']) assert.throws(() => check(read(), { ...request(), operation: name }), { code: 'ce1_unknown_operation' });
});
test('un cambio de SQL, presupuesto u objetos rompe la huella revisada', () => {
  for (const delta of [{ sql: 'select 2' }, { maxReadRows: 2 }, { objects: ['pg_catalog.pg_proc'] }]) {
    assert.throws(() => check({ ...read(), ...delta }, request()), { code: 'ce1_operation_changed' });
  }
});
test('no permite cambiar el registro después de crear el runner', async () => {
  const ops = { test: read() }; const runner = createStrictRunner({ operations: ops });
  ops.test.sql = 'select 2';
  const result = await runner({ ...request(), mode: 'plan' }); assert.equal(result.plan.operation.sql, 'select 1');
});
test('producción verificada permite apply explícito, con gates y ámbito válidos', () => {
  const op = write(); const result = check(op, request(op, 'apply'));
  assert.equal(result.mode, 'apply'); assert.equal(result.transaction.readOnly, false);
});
test('producción no se autoriza por un booleano o por cambiar el modo', () => {
  const op = write();
  for (const value of [undefined, true, 'true', 'production', 'other']) assert.throws(() => check(op, { ...request(op, 'apply'), confirmProduction: value }), { code: 'ce1_explicit_confirmation_required' });
  assert.throws(() => check(op, request(op, 'read')), { code: 'ce1_apply_required' });
});
for (const object of ['public.profiles', 'public.catalog_product_embeddings', 'comparator_internal.catalog_embedding_pipeline_control', 'cron.job', 'auth.users', 'storage.objects', 'comparator_strict.unreviewed', 'comparator_strict.execution_control_extra']) {
  test(`no permite escritura en ${object}`, () => assert.throws(() => check({ ...write(), objects: [object] }, request(write(), 'apply')), { code: 'ce1_write_scope' }));
}
test('declara obligatoriamente filas inducidas y prohíbe efectos externos/comerciales', () => {
  const op = write();
  assert.throws(() => check({ ...op, maxInducedRows: undefined }, request(op, 'apply')), { code: 'ce1_induced_rows_unknown' });
  for (const delta of [{ externalCalls: 1 }, { queueJobs: 1 }, { commercialQuotaUses: 1 }, { globalChanges: true }]) {
    assert.throws(() => check({ ...op, ...delta }), { code: 'ce1_side_effects' });
  }
});
test('las escrituras necesitan identificadores exactos sin duplicados', () => {
  assert.throws(() => check({ ...write(), rowKeys: [] }), { code: 'ce1_missing_row_scope' });
  assert.throws(() => check({ ...write(), rowKeys: ['1', '1'] }), { code: 'ce1_invalid_row_scope' });
});
test('rechaza DDL con filas comerciales y operaciones sin revisión', () => {
  assert.throws(() => check({ ...write(), kind: 'ddl', rowKeys: [] }), { code: 'ce1_ddl_contains_data' });
  assert.throws(() => check({ ...write(), reviewed: false }), { code: 'ce1_unreviewed_operation' });
});
test('CE-100 incompleta bloquea escrituras, no el diagnóstico de lectura', () => {
  const ctx = context(); ctx.readiness = { CE100: 'pending' };
  assert.equal(check(read(), request(), ctx).mode, 'read');
  const op = write(); assert.throws(() => check(op, request(op, 'apply'), ctx), { code: 'ce1_capacity_pending' });
});
for (const delta of [{ durationMs: 899999 }, { endedAtMs: NOW + 1 }, { endedAtMs: NOW - 300001 }, { cpuMaxFiveMinutePercent: undefined }, { connectionsMaxPercent: NaN }]) {
  test(`baseline inválido: ${JSON.stringify(delta)}`, () => {
    const ctx = context(); Object.assign(ctx.readiness.baseline, delta);
    assert.throws(() => check(write(), request(write(), 'apply'), ctx), { code: 'ce1_baseline_invalid' });
  });
}
for (const delta of [{ cpuMaxFiveMinutePercent: 70 }, { connectionsMaxPercent: 80 }, { memoryPressure: true }, { ioPressure: undefined }, { clientBlocking: true }, { latencyRegression: true }, { errorRegression: true }]) {
  test(`se detiene por salud no acreditada: ${JSON.stringify(delta)}`, () => {
    const ctx = context(); Object.assign(ctx.readiness.baseline, delta);
    assert.throws(() => check(write(), request(write(), 'apply'), ctx), { code: 'ce1_unhealthy_baseline' });
  });
}
test('el canario cuenta filas directas e inducidas: 5 sí, 6 no', () => {
  const op = { ...write(), maxInducedRows: 4 };
  assert.equal(check(op, request(op, 'apply')).reservation.writeRows, 5);
  const six = { ...op, maxInducedRows: 5 };
  assert.throws(() => check(six, request(six, 'apply')), { code: 'ce1_canary_limit' });
});
for (const delta of [{ maxReadRows: 501 }, { maxWriteRows: 51 }, { maxResponseBytes: 10485761 }, { maxSqlMs: 5001 }, { maxReadRows: NaN }, { maxSqlMs: '5000' }, { maxInducedRows: -1 }]) {
  test(`rechaza límites fuera del presupuesto: ${JSON.stringify(delta)}`, () => assert.throws(() => check({ ...read(), ...delta })));
}
for (const delta of [{ sqlMsReserved: Number.MAX_SAFE_INTEGER }, { readRowsReserved: 5000 }, { bytesReserved: CE1_LIMITS.dayBytes }, { consecutiveTimeouts: 2 }, { halted: true }, { activeJobs: 2 }, { jobId: 'ce1-other' }, { utcDay: '2026-09-02' }, { sqlMsReserved: NaN }]) {
  test(`no despacha con presupuesto inválido/agotado: ${JSON.stringify(delta)}`, () => {
    const ctx = context(); Object.assign(ctx.budget, delta); assert.throws(() => check(read(), request(), ctx));
  });
}
test('respeta presupuestos de escritura por trabajo y por día', () => {
  for (const delta of [{ writeRowsReserved: 2000 }, { jobWriteRowsReserved: 500 }]) {
    const ctx = context(); Object.assign(ctx.budget, delta);
    assert.throws(() => check(write(), request(write(), 'apply'), ctx), { code: 'ce1_budget_exceeded' });
  }
});
test('rechaza ref observada distinta, evidencia antigua y trabajos caducados', () => {
  for (const delta of [{ projectRef: 'other' }, { origin: 'https://evil.test' }, { status: 'INACTIVE' }, { verifiedAtMs: NOW - 300001 }]) {
    const ctx = context(); Object.assign(ctx.verifiedTarget, delta); assert.throws(() => check(read(), request(), ctx));
  }
  const ctx = context(); ctx.jobStartedAtMs = NOW - CE1_LIMITS.jobMs;
  assert.throws(() => check(read(), request(), ctx), { code: 'ce1_job_expired' });
});

// Doble de adaptadores: únicamente memoria, sin SQL real ni red. El coordinador
// conserva reservas y simula exclusión entre DOS runners, no solo uno.
function harness(op = read()) {
  const calls = []; const shared = budget(); let locked = false; let clock = NOW;
  const coordinator = { async withProjectLease(ref, jobId, callback) {
    if (locked) throw Object.assign(new Error('busy'), { code: 'lease_busy' });
    locked = true;
    try {
      return await callback({ budget: shared, jobStartedAtMs: NOW - 1000,
        async reserve(r) {
          calls.push('reserve');
          shared.sqlMsReserved += r.sqlMs; shared.readRowsReserved += r.readRows;
          shared.writeRowsReserved += r.writeRows; shared.jobWriteRowsReserved += r.writeRows;
          shared.bytesReserved += r.responseBytes;
        },
        async recordOutcome(result) {
          calls.push(result.status);
          shared.consecutiveTimeouts = result.sqlTimeout ? shared.consecutiveTimeouts + 1 : 0;
          if (result.halt) shared.halted = true;
        },
      });
    } finally { locked = false; }
  } };
  const transport = {
    async inspectTarget() { calls.push('inspect'); return context().verifiedTarget; },
    async begin(options) { calls.push('begin'); assert.equal(options.statementTimeoutMs, 5000); assert.equal(options.lockTimeoutMs, 500); },
    async execute(plan) { calls.push('execute'); return {
      readRows: 1, writeRows: plan.reservation.writeRows, responseBytes: 10, sqlMs: 1,
      touchedObjects: plan.operation.objects, directWriteRowKeys: plan.operation.rowKeys,
      inducedWriteRows: plan.operation.maxInducedRows,
    }; },
    async commit() { calls.push('commit'); }, async rollback() { calls.push('rollback'); },
  };
  const args = { operations: { test: op }, transport, coordinator, now: () => clock };
  return { calls, shared, transport, args, run: createStrictRunner(args), setClock(value) { clock = value; } };
}
test('el runner planifica sin tocar adaptadores ni claves', async () => {
  const h = harness(); assert.equal((await h.run({ ...request(), mode: 'plan' })).status, 'planned'); assert.deepEqual(h.calls, []);
});
test('sin adaptadores no hay ejecución ni fallback inseguro', async () => {
  await assert.rejects(createStrictRunner({ operations: { test: read() } })(request()), { code: 'ce1_adapter_required' });
});
test('lectura ejecuta BEGIN, validación y ROLLBACK, nunca COMMIT', async () => {
  const h = harness(); await h.run(request());
  assert.deepEqual(h.calls, ['inspect', 'reserve', 'begin', 'execute', 'rollback', 'completed']);
});
test('apply hace COMMIT solo después de validar el resultado', async () => {
  const h = harness(write()); await h.run(request(write(), 'apply'), readiness());
  assert.deepEqual(h.calls, ['inspect', 'reserve', 'begin', 'execute', 'commit', 'completed']);
});
test('CE-BU-002 conserva reservas y permite superar cinco minutos sin duplicarlas al revalidar', async () => {
  const h = harness(); h.shared.sqlMsReserved = 295000; await h.run(request()); assert.equal(h.shared.sqlMsReserved, 300000);
  await h.run(request()); assert.equal(h.shared.sqlMsReserved, 305000);
  assert.equal(CE1_LIMITS.daySqlMs, null);
});
test('si CE-100 falta no se consulta el destino, reserva ni ejecuta', async () => {
  const h = harness(write()); await assert.rejects(h.run(request(write(), 'apply')), { code: 'ce1_capacity_pending' }); assert.deepEqual(h.calls, []);
});
test('si el resultado excede filas se revierte antes del commit y se detiene', async () => {
  const h = harness(write()); h.transport.execute = async () => ({ readRows: 1, writeRows: 2, responseBytes: 10, sqlMs: 1 });
  await assert.rejects(h.run(request(write(), 'apply'), readiness()), { code: 'ce1_result_write_limit' });
  assert.ok(h.calls.includes('rollback')); assert.ok(!h.calls.includes('commit')); assert.equal(h.shared.halted, true);
  assert.equal(h.shared.writeRowsReserved, 1); // No devolver la reserva tras fallo.
});
for (const delta of [{ readRows: 2 }, { responseBytes: 1025 }, { sqlMs: 5001 }, { sqlMs: NaN }]) {
  test(`resultados excedidos o desconocidos no llegan a commit: ${JSON.stringify(delta)}`, async () => {
    const h = harness(write()); h.transport.execute = async () => ({ readRows: 1, writeRows: 1, responseBytes: 10, sqlMs: 1, ...delta });
    await assert.rejects(h.run(request(write(), 'apply'), readiness())); assert.ok(!h.calls.includes('commit'));
  });
}
test('dos cancelaciones SQL consecutivas impiden un tercer intento; sin retries automáticos', async () => {
  const h = harness(); h.transport.execute = async () => { throw Object.assign(new Error('cancelled'), { code: '57014' }); };
  for (let i = 0; i < 2; i++) await assert.rejects(h.run(request()), { code: '57014' });
  assert.equal(h.shared.halted, true);
  await assert.rejects(h.run(request()), { code: 'ce1_execution_halted' }); assert.equal(h.shared.sqlMsReserved, 10000);
});
test('COMMIT con respuesta perdida queda incierto: no reintentar ni devolver presupuesto', async () => {
  const h = harness(write()); h.transport.commit = async () => { h.calls.push('commit'); throw new Error('connection lost'); };
  await assert.rejects(h.run(request(write(), 'apply'), readiness()));
  assert.ok(h.calls.includes('commit_unknown')); assert.equal(h.shared.halted, true); assert.equal(h.shared.writeRowsReserved, 1);
});
test('un segundo runner no puede eludir el lease compartido', async () => {
  const h = harness(); let release; h.transport.execute = () => new Promise((resolve) => { release = () => resolve({ readRows: 1, writeRows: 0, responseBytes: 10, sqlMs: 1 }); });
  const first = h.run(request());
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(h.run(request()), { code: 'ce1_operation_in_flight' });
  await assert.rejects(createStrictRunner(h.args)(request()), { code: 'lease_busy' });
  release(); await first;
});
test('mutar la solicitud durante inspect no cambia SQL, target ni operación', async () => {
  const h = harness(); const req = request(); h.transport.inspectTarget = async () => { req.projectRef = 'other'; req.operation = 'evil'; return context().verifiedTarget; };
  const result = await h.run(req); assert.equal(result.operationId, 'test');
});
test('cruzar medianoche en ejecución revierte y no recicla el presupuesto', async () => {
  const h = harness(write()); h.transport.execute = async () => { h.setClock(Date.parse('2026-09-04T00:00:00Z')); return { readRows: 1, writeRows: 1, responseBytes: 10, sqlMs: 1,
    touchedObjects: write().objects, directWriteRowKeys: ['1'], inducedWriteRows: 0 }; };
  await assert.rejects(h.run(request(write(), 'apply'), readiness()), { code: 'ce1_job_expired' }); assert.ok(!h.calls.includes('commit'));
});
test('el mismo número de filas no permite escribir otro identificador u objeto', async () => {
  for (const delta of [{ directWriteRowKeys: ['other'] }, { touchedObjects: ['public.profiles'] }, { inducedWriteRows: 1 }, { directWriteRowKeys: [] }]) {
    const h = harness(write()); h.transport.execute = async () => ({ readRows: 1, writeRows: 1, responseBytes: 10, sqlMs: 1,
      touchedObjects: write().objects, directWriteRowKeys: ['1'], inducedWriteRows: 0, ...delta });
    await assert.rejects(h.run(request(write(), 'apply'), readiness())); assert.ok(!h.calls.includes('commit'));
  }
});
test('un reloj que retrocede no permite confirmar una escritura', async () => {
  const h = harness(write()); const execute = h.transport.execute;
  h.transport.execute = async (plan) => { const result = await execute(plan); h.setClock(NOW - 1); return result; };
  await assert.rejects(h.run(request(write(), 'apply'), readiness()), { code: 'ce1_job_expired' });
  assert.ok(!h.calls.includes('commit'));
});
