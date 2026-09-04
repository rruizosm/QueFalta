// The only reviewed atomic write payloads for F1. No caller-supplied SQL.
export const F1_OPERATIONS = Object.freeze(Object.fromEntries([
  ['f1_stopped_control', `INSERT INTO comparator_strict.execution_control(project_ref,enabled,halted,active_job_id)
VALUES ('gkffvigcnsesbaihycay',false,true,$1) RETURNING project_ref,enabled,halted,active_job_id`],
  ['f1_revert_control', `DELETE FROM comparator_strict.execution_control
WHERE project_ref='gkffvigcnsesbaihycay' AND active_job_id=$1 AND NOT enabled AND halted
RETURNING project_ref,enabled,halted,active_job_id`],
].map(([id, sql]) => [id, Object.freeze({
  kind: 'write', sql,
  objects: Object.freeze(['comparator_strict.execution_control','comparator_strict.execution_jobs']),
  rowKeys: Object.freeze(['gkffvigcnsesbaihycay']), maxReadRows: 1, maxWriteRows: 1,
  maxInducedRows: 1, maxResponseBytes: 4096, maxSqlMs: 1000,
  externalCalls: 0, queueJobs: 0, commercialQuotaUses: 0, globalChanges: false, reviewed: true,
})])));

// Administrative closure is deliberately NOT baseline.complete=true.
export function f1CapacityException(readiness, now, operationId, operationHash, hash) {
  const operation = F1_OPERATIONS[operationId];
  if (!operation || hash(operation) !== operationHash) return false;
  const health = readiness?.f1Health;
  return readiness?.CE100 === 'owner_closed_with_limitations'
    && readiness?.baseline?.complete === false && readiness?.authority === 'CE-SEQ-003'
    && readiness?.scopeReviewed === true && readiness?.rollbackReviewed === true
    && new Date(now).toISOString().slice(0,10) === '2026-09-03'
    && Number.isFinite(health?.capturedAtMs) && health.capturedAtMs <= now && now-health.capturedAtMs <= 300000
    && health.blocked === 0 && health.activeOlder30s === 0
    && Number.isInteger(health.connections) && health.connections >= 0 && health.connections < 48;
}
