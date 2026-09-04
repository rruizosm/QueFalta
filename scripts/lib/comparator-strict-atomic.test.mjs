import test from 'node:test';
import assert from 'node:assert/strict';
import {atomicRequest,buildAtomicPlan,atomicReserveSql,atomicExecuteSql,atomicReadiness,runAtomicPlan,F1_OPERATIONS} from './comparator-strict-atomic.mjs';
import {prepareStrictOperation,strictOperationHash,CE1_REF} from './comparator-strict-guard.mjs';
const NOW=Date.parse('2026-09-03T12:00:00Z');
const ready=()=>atomicReadiness({captured_at:new Date(NOW).toISOString(),blocked:0,active_older_30s:0,connections:8});
const context=()=>({nowMs:NOW,jobStartedAtMs:NOW,leasePhase:'atomic_proposal',verifiedTarget:{projectRef:CE1_REF,origin:'https://auth.quefalta.es',status:'ACTIVE_HEALTHY',verifiedAtMs:NOW},
  readiness:ready(),budget:{projectRef:CE1_REF,utcDay:'2026-09-03',jobId:'ce1-unit',activeJobs:0,sqlMsReserved:280520,bytesReserved:22484430,
    writeRowsReserved:20,readRowsReserved:3900,jobWriteRowsReserved:0,consecutiveTimeouts:0,halted:false,bytesLimit:23068672,approvalReference:'CE-100-22MiB-2026-09-03'}});
const plan=()=>buildAtomicPlan(atomicRequest('f1_stopped_control','ce1-unit'),context());
test('F1 exception admits only the exact reviewed canary without faking baseline',()=>{
  const p=plan();assert.equal(context().readiness.baseline.complete,false);assert.equal(p.prepared.reservation.writeRows,2);
  assert.equal(p.reservation.writeRows,4);assert.equal(p.reservation.sqlMs,4000);
});
test('same operation id with altered SQL is not covered by owner closure',()=>{
  const op={...F1_OPERATIONS.f1_stopped_control,sql:'DELETE FROM comparator_strict.execution_control'};
  const request={...atomicRequest('f1_stopped_control','ce1-unit'),operationHash:strictOperationHash(op)};
  const c=context();c.budget.bytesReserved=0;c.budget.activeJobs=1;delete c.leasePhase;
  assert.throws(()=>prepareStrictOperation(request,{f1_stopped_control:op},c),/capacity_pending/);
});
for(const mutation of [r=>r.authority='other',r=>r.f1Health.blocked=1,r=>r.f1Health.connections=48,r=>r.f1Health.activeOlder30s=1,
  r=>r.f1Health.capturedAtMs=NOW-300001,r=>r.scopeReviewed=false,r=>r.baseline.complete=true]){
  test('F1 incomplete, stale or unhealthy authority is denied: '+String(mutation),()=>{
    const c=context();mutation(c.readiness);assert.throws(()=>buildAtomicPlan(atomicRequest('f1_stopped_control','ce1-unit'),c));
  });
}
test('F1 exception and 22 MiB approval expire after their precise UTC date',()=>{
  const c=context();c.nowMs+=86400000;c.jobStartedAtMs=c.nowMs;c.verifiedTarget.verifiedAtMs=c.nowMs;c.readiness.f1Health.capturedAtMs=c.nowMs;c.budget.utcDay='2026-09-04';
  assert.throws(()=>buildAtomicPlan(atomicRequest('f1_stopped_control','ce1-unit'),c));
});
test('unknown operation and arbitrary identifiers cannot reach SQL',()=>{
  assert.throws(()=>atomicRequest('toString','ce1-unit'));assert.throws(()=>atomicRequest('f1_stopped_control',"ce1-x'; DROP TABLE x"));
  assert.throws(()=>buildAtomicPlan(atomicRequest('f1_revert_control','ce1-unit'),context(),{parentJobKey:"'; select 1"}));
});
test('changed durable protocol fails before producing SQL',()=>{
  const p=structuredClone(plan());p.reservation.sqlMs=1;assert.throws(()=>atomicReserveSql(p),/protocol_changed/);
});
test('complete SQL messages contain bounded timers and validate before COMMIT',()=>{
  const reserve=atomicReserveSql(plan()),execute=atomicExecuteSql(plan());
  for(const sql of [reserve,execute]){assert.match(sql,/^BEGIN;/);assert.match(sql,/transaction_timeout='2000ms'/);assert.match(sql,/statement_timeout='1000ms'/);assert.match(sql,/COMMIT;$/);}
  assert.ok(reserve.indexOf('UPDATE comparator_strict.execution_budget')<reserve.indexOf('INSERT INTO comparator_strict.execution_jobs'));
  assert.ok(execute.indexOf('ce1_result_scope_violation')<execute.indexOf("SET status='succeeded'"));
  assert.ok(execute.indexOf("SET status='succeeded'")<execute.indexOf('COMMIT'));
  assert.match(execute,/LOCK TABLE comparator_strict.execution_control/);
});
test('unverified transport cannot run even a reviewed plan',async()=>{
  let calls=0;await assert.rejects(runAtomicPlan(plan(),{inspectTarget:async()=>({}),query:async()=>{calls++;}}),/target_unverified/);assert.equal(calls,0);
});
test('accounting overhead is reserved, not just the payload row',()=>{
  const c=context();c.budget.sqlMsReserved=299000;
  assert.throws(()=>buildAtomicPlan(atomicRequest('f1_stopped_control','ce1-unit'),c),/budget_exceeded/);
});
