// Regression checks on CAPTURED evidence, not a new production smoke test.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {atomicReserveSql,atomicExecuteSql,validateAtomicReceipt} from '../lib/comparator-strict-atomic.mjs';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const evidence=JSON.parse(read('docs/comparator-strict/CE-105-106-closure-evidence.json'));
const supersession=JSON.parse(read('docs/comparator-strict/CE-BU-002-runtime-supersession.json'));
const sha=s=>createHash('sha256').update(s).digest('hex');

test('CE-105 receipt migration and audited runtime match captured hashes',()=>{
  assert.equal(sha(read(evidence.migration.file)),evidence.migration.sha256);
  assert.equal(sha(evidence.migration.sql),evidence.migration.sha256);
  for(const [file,hash] of Object.entries(evidence.runtime_hashes)){
    if(file===supersession.runtime_file){
      // An authorized policy change must not rewrite closed F1 evidence. Verify
      // its exact archived predecessor AND the separately audited successor.
      assert.equal(supersession.authority,'CE-BU-002');
      assert.equal(supersession.historical_F1_receipts_modified,false);
      assert.equal(hash,supersession.historical_sha256);
      assert.equal(sha(read(supersession.historical_archive)),hash);
      assert.equal(sha(read(file)),supersession.current_sha256);
    }else assert.equal(sha(read(file)),hash,file);
  }
  assert.ok(evidence.after.evidence.migrations.some(m=>m.version===evidence.migration.remote_version));
});

test('CE-106 recorded bridge transactions match generated plans and committed receipts',()=>{
  for(const item of [evidence.completed_control,evidence.completed_reversal]){
    assert.equal(atomicReserveSql(item.plan),item.reserve_message.sql);
    assert.equal(atomicExecuteSql(item.plan),item.execute_message.sql);
    assert.equal(sha(item.reserve_message.sql),item.reserve_message.sha256);
    assert.equal(sha(item.execute_message.sql),item.execute_message.sha256);
    validateAtomicReceipt(item.plan,item.committed);
    assert.equal(item.bridge_exit_code,0);
    assert.equal(item.reserved.job.started_at,item.committed.job.started_at);
  }
  assert.equal(evidence.completed_reversal.committed.job.receipt.payload.active_job_id,evidence.completed_control.committed.job.id);
});

test('CE-106 cancellation, diagnostics and successful jobs retain every reservation',()=>{
  const a=evidence.aborted_attempt;
  assert.equal(a.payload_dispatched,false);assert.equal(a.reconciled.job.status,'rolled_back');
  assert.equal(a.reconciled.job.receipt,null);assert.deepEqual(a.reservation.budget,a.reconciled.budget);
  assert.equal(a.reservation.job.started_at,a.reconciled.job.started_at);
  const before=evidence.before.budget,after=evidence.after.evidence.budget;
  assert.equal(after.sql_ms_reserved,before.sql_ms_reserved+5000+6000+400+4000+4000);
  assert.equal(after.bytes_reserved,before.bytes_reserved+32768+32768+8192+32768+32768);
  assert.equal(after.read_rows_reserved,before.read_rows_reserved+100+32+32+32+32);
  assert.equal(after.write_rows_reserved,before.write_rows_reserved+2+4+1+4+4);
  assert.ok(after.sql_ms_reserved<=evidence.limits.day_sql_ms);
  assert.ok(after.bytes_reserved<=evidence.limits.day_bytes);
});

test('CE-105/106 captured closure proves only a private inactive foundation',()=>{
  const after=evidence.after.evidence;
  assert.equal(after.control_rows,0);assert.equal(after.principals,0);assert.equal(after.unresolved,0);
  assert.equal(after.jobs.length,4);assert.equal(after.verified_role_denials,12);
  assert.ok(after.rls_tables.every(t=>t.rls));assert.equal(after.policy_count,0);
  assert.equal(after.public_table_grants,0);assert.equal(after.public_schema_grants,0);
  assert.deepEqual(after.legacy,evidence.before.legacy);
  assert.equal(evidence.status.baseline_complete,false);assert.equal(evidence.status.public_comparator_activated,false);
  assert.equal(evidence.native_postgres.tests.length,16);
  assert.ok(evidence.native_postgres.tests.every(t=>t.status==='PASS'));
  assert.equal(evidence.native_postgres.process_exit_code,0);
  assert.equal(evidence.local_quality.github_workflow_executed,false);
  assert.ok(evidence.public_api.after.some(p=>p.status===406&&p.code==='PGRST106'));
  assert.ok(evidence.public_api.after.some(p=>p.status===200&&p.rows===1));
});
