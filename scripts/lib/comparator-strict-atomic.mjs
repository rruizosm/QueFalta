// CE-105: two-phase durable protocol for the two reviewed F1 canary payloads.
// Each SQL message is a COMPLETE transaction; never split BEGIN/COMMIT over MCP.
// No secrets, credentials, auto-retries, arbitrary SQL, queue or app integration.
import { createHash } from 'node:crypto';
import { CE1_REF, prepareStrictOperation, strictOperationHash } from './comparator-strict-guard.mjs';
import { F1_OPERATIONS } from './comparator-strict-f1-contract.mjs';

export { F1_OPERATIONS };
// Two complete transactions, each HARD limited to 2 seconds by PostgreSQL.
// Historical 6-second reservations remain charged; no refunds or counter reset.
export const ATOMIC_RESERVATION = Object.freeze({ sqlMs: 4000, responseBytes: 32768, readRows: 32, writeRows: 4 });
const DAY = '2026-09-03';
const ORIGIN = 'https://auth.quefalta.es';
const q = value => "'" + String(value).replaceAll("'", "''") + "'";
const literal = value => q(JSON.stringify(value)) + '::jsonb';
const hash = text => createHash('sha256').update(text).digest('hex');
function fail(code) { throw Object.assign(new Error(code), { code }); }
function key(value) { if (typeof value !== 'string' || !/^ce1-[a-z0-9-]{1,72}$/.test(value)) fail('ce1_invalid_job_id'); return value; }

export function atomicRequest(operation, jobId) {
  if (!Object.hasOwn(F1_OPERATIONS, operation)) fail('ce1_unknown_atomic_operation');
  return Object.freeze({ operation, jobId: key(jobId), projectRef: CE1_REF, supabaseUrl: ORIGIN,
    mode: 'apply', confirmProduction: CE1_REF, operationHash: strictOperationHash(F1_OPERATIONS[operation]) });
}

// A reviewed one-time policy, not a claim that CE-100 performance passed.
export function atomicReadiness(snapshot) {
  return { CE100: 'owner_closed_with_limitations', authority: 'CE-SEQ-003', baseline: { complete: false },
    rollbackReviewed: true, scopeReviewed: true, canaryAccepted: false,
    f1Health: { capturedAtMs: Date.parse(snapshot.captured_at), blocked: snapshot.blocked,
      activeOlder30s: snapshot.active_older_30s, connections: snapshot.connections } };
}

export function atomicContext(snapshot, jobId, verifiedTarget) {
  const b = snapshot.budget;
  if (!b || snapshot.unresolved !== 0) fail('ce1_unresolved_work');
  return { nowMs: Date.now(), jobStartedAtMs: Date.parse(snapshot.captured_at), verifiedTarget, leasePhase: 'atomic_proposal',
    readiness: atomicReadiness(snapshot), budget: {
      projectRef: CE1_REF, jobId, utcDay: String(b.budget_date).slice(0,10), activeJobs: 0,
      sqlMsReserved: Number(b.sql_ms_reserved), bytesReserved: Number(b.bytes_reserved),
      readRowsReserved: Number(b.read_rows_reserved), writeRowsReserved: Number(b.write_rows_reserved),
      jobWriteRowsReserved: 0, consecutiveTimeouts: 0, halted: false,
      bytesLimit: Number(b.bytes_limit), approvalReference: b.approval_reference,
    } };
}

export function buildAtomicPlan(request, context, { parentJobKey = null } = {}) {
  const prepared = prepareStrictOperation(request, F1_OPERATIONS, context);
  if (prepared.mode !== 'apply') fail('ce1_atomic_apply_required');
  if (request.operation === 'f1_revert_control') key(parentJobKey);
  else if (parentJobKey !== null) fail('ce1_unexpected_parent');
  const r = ATOMIC_RESERVATION, b = context.budget;
  if (b.sqlMsReserved+r.sqlMs>300000 || b.bytesReserved+r.responseBytes>23068672
      || b.readRowsReserved+r.readRows>5000 || b.writeRowsReserved+r.writeRows>2000) fail('ce1_budget_exceeded');
  const plan = { request: structuredClone(request), prepared, parentJobKey, reservation: r,
    approvedAt: new Date(context.nowMs).toISOString(), expiresAt: new Date(context.nowMs+300000).toISOString(), utcDay: DAY };
  // Bind parent, reviewed descriptor, allowances and authority window together.
  return Object.freeze({ ...plan, protocolHash: strictOperationHash(plan) });
}

function verifyPlan(plan) {
  const { protocolHash, ...body } = plan;
  if (strictOperationHash(body) !== protocolHash) fail('ce1_protocol_changed');
  const req = plan.request;
  const pre = prepareStrictOperation({ ...req, mode: 'plan' }, F1_OPERATIONS);
  if (req.operationHash !== pre.operationHash || req.mode !== 'apply' || req.confirmProduction !== CE1_REF) fail('ce1_operation_changed');
  if (JSON.stringify(plan.reservation) !== JSON.stringify(ATOMIC_RESERVATION) || plan.utcDay !== DAY) fail('ce1_reservation_changed');
  if (!Number.isFinite(Date.parse(plan.approvedAt)) || new Date(plan.approvedAt).toISOString()!==plan.approvedAt
    || !Number.isFinite(Date.parse(plan.expiresAt)) || new Date(plan.expiresAt).toISOString()!==plan.expiresAt
    || Date.parse(plan.expiresAt)-Date.parse(plan.approvedAt)!==300000) fail('ce1_invalid_authority_window');
  if (req.operation==='f1_revert_control') key(plan.parentJobKey);
  else if (plan.parentJobKey!==null) fail('ce1_unexpected_parent');
}

function transaction(body, resultSql, { readOnly = false } = {}) {
  return `BEGIN${readOnly ? ' READ ONLY' : ''};
SET LOCAL statement_timeout='1000ms'; SET LOCAL lock_timeout='250ms';
SET LOCAL idle_in_transaction_session_timeout='1500ms'; SET LOCAL transaction_timeout='2000ms';
${body ? `DO $ce1$\n${body}\n$ce1$;` : ''}
${resultSql};
COMMIT;`;
}

export function atomicSnapshotSql() {
  return transaction('', `SELECT jsonb_build_object('captured_at',clock_timestamp(),
  'version',current_setting('server_version'),
  'budget',(SELECT to_jsonb(b) FROM comparator_strict.execution_budget b WHERE project_ref='${CE1_REF}' AND budget_date=(clock_timestamp() AT TIME ZONE 'UTC')::date),
  'unresolved',(SELECT count(*) FROM comparator_strict.execution_jobs WHERE project_ref='${CE1_REF}' AND status IN ('planned','running','halted','unknown')),
  'blocked',(SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock' AND pid<>pg_backend_pid()),
  'active_older_30s',(SELECT count(*) FROM pg_stat_activity WHERE state='active' AND query_start<clock_timestamp()-interval '30 seconds' AND pid<>pg_backend_pid()),
  'connections',(SELECT count(*) FROM pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid())) AS evidence`, {readOnly:true});
}

function jobResult(jobKey, fresh = false) {
  return `SELECT jsonb_build_object('captured_at',clock_timestamp(),'job',(SELECT to_jsonb(j) FROM comparator_strict.execution_jobs j WHERE job_key=${q(jobKey)}),
  ${fresh ? "'freshReservation',current_setting('ce1.fresh_reservation',true)::boolean," : ''}
  'budget',(SELECT to_jsonb(b) FROM comparator_strict.execution_budget b WHERE project_ref='${CE1_REF}' AND budget_date=DATE '${DAY}')) AS evidence`;
}

export function atomicReserveSql(plan) {
  verifyPlan(plan);
  const req=plan.request, r=plan.reservation;
  const stored = { ...r, protocolHash: plan.protocolHash, parentJobKey: plan.parentJobKey,
    expiresAt: plan.expiresAt, payloadHash: hash(F1_OPERATIONS[req.operation].sql) };
  return transaction(`DECLARE existing comparator_strict.execution_jobs; b comparator_strict.execution_budget; job_started timestamptz;
BEGIN
  PERFORM set_config('ce1.fresh_reservation','false',true);
  IF (clock_timestamp() AT TIME ZONE 'UTC')::date<>DATE '${DAY}' OR clock_timestamp()>${q(plan.expiresAt)}::timestamptz
    OR clock_timestamp()<${q(plan.approvedAt)}::timestamptz THEN RAISE EXCEPTION 'ce1_authority_expired'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:atomic-v1',0)) THEN RAISE EXCEPTION 'ce1_project_busy'; END IF;
  SELECT * INTO existing FROM comparator_strict.execution_jobs WHERE job_key=${q(req.jobId)} FOR UPDATE;
  IF FOUND THEN
    IF existing.operation_hash<>${q(req.operationHash)} OR existing.reservation IS DISTINCT FROM ${literal(stored)} THEN
      RAISE EXCEPTION 'ce1_job_identity_conflict'; END IF;
    RETURN; -- Same identity: report durable state, never reset start or reserve twice.
  END IF;
  IF EXISTS (SELECT 1 FROM comparator_strict.execution_jobs WHERE project_ref='${CE1_REF}' AND status IN ('planned','running','halted','unknown'))
    THEN RAISE EXCEPTION 'ce1_unresolved_work'; END IF;
  IF EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND (wait_event_type='Lock'
    OR (state='active' AND query_start<clock_timestamp()-interval '30 seconds'))) THEN RAISE EXCEPTION 'ce1_unhealthy_now'; END IF;
  SELECT * INTO STRICT b FROM comparator_strict.execution_budget WHERE project_ref='${CE1_REF}' AND budget_date=DATE '${DAY}' FOR UPDATE;
  IF b.bytes_limit<>23068672 OR b.approval_reference IS DISTINCT FROM 'CE-100-22MiB-2026-09-03'
    OR b.bytes_reserved+${r.responseBytes}>b.bytes_limit OR b.sql_ms_reserved+${r.sqlMs}>300000
    OR b.read_rows_reserved+${r.readRows}>5000 OR b.write_rows_reserved+${r.writeRows}>2000 THEN RAISE EXCEPTION 'ce1_budget_exceeded'; END IF;
  UPDATE comparator_strict.execution_budget SET bytes_reserved=bytes_reserved+${r.responseBytes}, sql_ms_reserved=sql_ms_reserved+${r.sqlMs},
    read_rows_reserved=read_rows_reserved+${r.readRows}, write_rows_reserved=write_rows_reserved+${r.writeRows},updated_at=clock_timestamp()
    WHERE project_ref='${CE1_REF}' AND budget_date=DATE '${DAY}';
  job_started:=clock_timestamp();
  INSERT INTO comparator_strict.execution_jobs(id,project_ref,operation_key,sql_sha256,status,started_at,deadline_at,job_key,operation_hash,budget_date,reservation)
  VALUES(gen_random_uuid(),'${CE1_REF}',${q(req.operation)},${q(hash(F1_OPERATIONS[req.operation].sql))},'planned',job_started,job_started+interval '20 minutes',
    ${q(req.jobId)},${q(req.operationHash)},DATE '${DAY}',${literal(stored)});
  PERFORM set_config('ce1.fresh_reservation','true',true);
END`, jobResult(req.jobId, true));
}

export function atomicExecuteSql(plan) {
  verifyPlan(plan);
  const req=plan.request, payload=F1_OPERATIONS[req.operation];
  return transaction(`DECLARE j comparator_strict.execution_jobs; parent comparator_strict.execution_jobs;
  affected integer; item record; argument uuid; outcome jsonb; started timestamptz:=clock_timestamp();
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:atomic-v1',0)) THEN RAISE EXCEPTION 'ce1_project_busy'; END IF;
  LOCK TABLE comparator_strict.execution_control, comparator_strict.execution_jobs IN ROW EXCLUSIVE MODE;
  SELECT * INTO STRICT j FROM comparator_strict.execution_jobs WHERE job_key=${q(req.jobId)} FOR UPDATE;
  IF j.project_ref<>'${CE1_REF}' OR j.operation_key<>${q(req.operation)} OR j.operation_hash<>${q(req.operationHash)}
    OR j.sql_sha256<>${q(hash(payload.sql))} OR j.reservation->>'protocolHash' IS DISTINCT FROM ${q(plan.protocolHash)}
    THEN RAISE EXCEPTION 'ce1_job_identity_conflict'; END IF;
  IF j.status='succeeded' THEN RETURN; END IF; -- Receipt, not another side effect.
  IF j.status<>'planned' THEN RAISE EXCEPTION 'ce1_job_not_executable'; END IF;
  IF j.budget_date<>(clock_timestamp() AT TIME ZONE 'UTC')::date OR clock_timestamp()>j.deadline_at
    OR clock_timestamp()>${q(plan.expiresAt)}::timestamptz THEN RAISE EXCEPTION 'ce1_job_expired'; END IF;
  IF EXISTS(SELECT 1 FROM comparator_strict.test_principals) THEN RAISE EXCEPTION 'ce1_unexpected_principals'; END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid IN ('comparator_strict.execution_control'::regclass,'comparator_strict.execution_jobs'::regclass) AND NOT tgisinternal)
    THEN RAISE EXCEPTION 'ce1_unreviewed_induced_effects'; END IF;
  IF EXISTS (SELECT 1 FROM pg_rewrite WHERE ev_class IN ('comparator_strict.execution_control'::regclass,'comparator_strict.execution_jobs'::regclass))
    THEN RAISE EXCEPTION 'ce1_unreviewed_rule'; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid IN
    ('comparator_strict.execution_control'::regclass,'comparator_strict.execution_jobs'::regclass) AND (confdeltype<>'r' AND confdeltype<>'a' OR confupdtype<>'a'))
    THEN RAISE EXCEPTION 'ce1_unreviewed_cascade'; END IF;
  argument:=j.id;
  ${req.operation === 'f1_revert_control' ? `SELECT * INTO STRICT parent FROM comparator_strict.execution_jobs WHERE job_key=${q(plan.parentJobKey)} FOR SHARE;
  IF parent.status<>'succeeded' OR parent.operation_hash<>${q(strictOperationHash(F1_OPERATIONS.f1_stopped_control))}
    OR parent.receipt->>'operationId'<>'f1_stopped_control' THEN RAISE EXCEPTION 'ce1_invalid_reversal_parent'; END IF;
  argument:=parent.id;` : ''}
  EXECUTE ${q(payload.sql)} INTO STRICT item USING argument;
  GET DIAGNOSTICS affected=ROW_COUNT;
  IF affected<>1 OR item.project_ref<>'${CE1_REF}' OR item.enabled OR NOT item.halted OR item.active_job_id<>argument
    THEN RAISE EXCEPTION 'ce1_result_scope_violation'; END IF;
  outcome:=jsonb_build_object('operationId',${q(req.operation)},'operationHash',${q(req.operationHash)},'jobKey',${q(req.jobId)},
    'protocolHash',${q(plan.protocolHash)},'readRows',1,'writeRows',2,'inducedWriteRows',1,
    'touchedObjects',jsonb_build_array('comparator_strict.execution_control','comparator_strict.execution_jobs'),
    'directWriteRowKeys',jsonb_build_array(item.project_ref),'payload',to_jsonb(item),'sqlMs',extract(epoch FROM clock_timestamp()-started)*1000);
  IF octet_length(outcome::text)>${payload.maxResponseBytes} OR (outcome->>'sqlMs')::numeric>${payload.maxSqlMs}
    OR (clock_timestamp() AT TIME ZONE 'UTC')::date<>j.budget_date OR clock_timestamp()>j.deadline_at THEN RAISE EXCEPTION 'ce1_result_budget_exceeded'; END IF;
  UPDATE comparator_strict.execution_jobs SET status='succeeded',finished_at=clock_timestamp(),receipt=outcome WHERE id=j.id;
  -- Operation and durable receipt commit TOGETHER; failure rolls both back.
END`, jobResult(req.jobId));
}

export function atomicRecoverSql(jobKey) {
  return transaction('', jobResult(key(jobKey)), {readOnly:true});
}

// Explicit reconciliation only, not an automatic retry after a broken response.
// The same project lock and FOR UPDATE wait for any in-flight execution to end.
export function atomicResolveAbortedSql(plan) {
  verifyPlan(plan);
  return transaction(`DECLARE j comparator_strict.execution_jobs;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:atomic-v1',0)) THEN RAISE EXCEPTION 'ce1_project_busy'; END IF;
  SELECT * INTO STRICT j FROM comparator_strict.execution_jobs WHERE job_key=${q(plan.request.jobId)} FOR UPDATE;
  IF j.operation_hash<>${q(plan.request.operationHash)} OR j.reservation->>'protocolHash' IS DISTINCT FROM ${q(plan.protocolHash)}
    THEN RAISE EXCEPTION 'ce1_job_identity_conflict'; END IF;
  IF j.status<>'planned' OR j.receipt IS NOT NULL THEN RAISE EXCEPTION 'ce1_reconciliation_requires_uncommitted_job'; END IF;
  IF EXISTS (SELECT 1 FROM comparator_strict.execution_control WHERE active_job_id=j.id) THEN RAISE EXCEPTION 'ce1_unexpected_effect'; END IF;
  UPDATE comparator_strict.execution_jobs SET status='rolled_back',finished_at=clock_timestamp(),stop_reason='Explicit reconciliation: no atomic effect committed; reservation retained' WHERE id=j.id;
END`, jobResult(plan.request.jobId));
}

export function validateAtomicReceipt(plan, evidence) {
  verifyPlan(plan);
  const j=evidence?.job, r=j?.receipt;
  if (j?.job_key!==plan.request.jobId || j?.operation_hash!==plan.request.operationHash
    || j?.status!=='succeeded' || r?.protocolHash!==plan.protocolHash || r?.operationHash!==plan.request.operationHash
    || r?.jobKey!==plan.request.jobId || r?.operationId!==plan.request.operation
    || r?.writeRows!==2 || r?.readRows!==1 || r?.inducedWriteRows!==1
    || JSON.stringify(r.directWriteRowKeys)!==JSON.stringify([CE1_REF])
    || JSON.stringify(r.touchedObjects)!==JSON.stringify(F1_OPERATIONS[plan.request.operation].objects)
    || r.payload?.project_ref!==CE1_REF || r.payload?.enabled!==false || r.payload?.halted!==true
    || !Number.isFinite(r.sqlMs) || r.sqlMs<0 || r.sqlMs>1000
    || Buffer.byteLength(JSON.stringify(r))>4096) fail('ce1_invalid_atomic_receipt');
  if (plan.request.operation==='f1_stopped_control' && r.payload.active_job_id!==j.id) fail('ce1_invalid_atomic_receipt');
  return r;
}

/** Transport is trusted/bound to a verified target and submits COMPLETE SQL messages.
 * A thrown execute/response-validation error NEVER retries, releases or refunds.
 * Recovery is a separate explicit read; planned work remains globally blocking.
 */
export async function runAtomicPlan(plan, transport) {
  verifyPlan(plan);
  if (typeof transport?.query!=='function' || typeof transport?.inspectTarget!=='function') fail('ce1_adapter_required');
  const target=await transport.inspectTarget();
  if (target?.projectRef!==CE1_REF || target?.origin!==ORIGIN || target?.status!=='ACTIVE_HEALTHY'
    || !Number.isFinite(target.verifiedAtMs) || target.verifiedAtMs>Date.now()
    || Date.now()-target.verifiedAtMs>300000) fail('ce1_target_unverified');
  const reserved=await transport.query(atomicReserveSql(plan));
  if (reserved?.job?.reservation?.protocolHash!==plan.protocolHash) fail('ce1_invalid_reservation_receipt');
  if (reserved.job.status==='succeeded') return validateAtomicReceipt(plan,reserved);
  if (reserved.job.status!=='planned') fail('ce1_job_not_executable');
  if (reserved.freshReservation!==true) fail('ce1_requires_explicit_reconciliation');
  const committed=await transport.query(atomicExecuteSql(plan));
  return validateAtomicReceipt(plan,committed);
}
