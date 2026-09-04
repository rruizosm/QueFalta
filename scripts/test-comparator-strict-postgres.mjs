#!/usr/bin/env node
// Native PG17 integration suite. Creates its own NEW database, never remote.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import {
  atomicRequest, atomicReadiness, atomicContext, buildAtomicPlan, atomicSnapshotSql,
  atomicReserveSql, atomicExecuteSql, atomicRecoverSql, atomicResolveAbortedSql,
  runAtomicPlan, validateAtomicReceipt, ATOMIC_RESERVATION,
} from './lib/comparator-strict-atomic.mjs';
import { CE1_REF } from './lib/comparator-strict-guard.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(arg=>{ const i=arg.indexOf('='); return [arg.slice(0,i),arg.slice(i+1)]; }));
// Future CI runs use the historical approval date, without weakening production
// policy or changing the OS clock. Server cancellation timers remain real.
const realNow=Date.now;
const clockRebased=args['--fixture-clock']==='true';
const wallAnchor=realNow(), fixtureAnchor=Date.parse('2026-09-03T12:00:00Z');
if(clockRebased)Date.now=()=>fixtureAnchor+realNow()-wallAnchor;
const sqlClock=sql=>clockRebased?sql.replaceAll('clock_timestamp()',
  `('2026-09-03T12:00:00Z'::timestamptz+(clock_timestamp()-'${new Date(wallAnchor).toISOString()}'::timestamptz))`):sql;
const host=args['--host'], port=Number(args['--port']??5432), modulePath=args['--pg-module'];
if (!(host==='localhost' || host==='127.0.0.1' || /^\/private\/tmp\/quefalta-ce105\.[a-zA-Z0-9]+$/.test(host??''))
  || !Number.isInteger(port) || port<1024 || port>65535 || !modulePath) throw new Error('Explicit isolated local host/port and PG module are required');
const pgModule=await import(pathToFileURL(resolve(modulePath)).href);
const { Client }=pgModule.default??pgModule;
const config={ host,port,user:'postgres',password:host.startsWith('/')?undefined:'local-ci-only',
  database:'postgres',connectionTimeoutMillis:3000,application_name:'ce1-isolated-integration' };
const fresh=async (db=config.database)=>{const c=new Client({...config,database:db});c.on('error',()=>{});await c.connect();return c;};
const root=new URL('../',import.meta.url);
const dbName='ce1_test_'+randomBytes(6).toString('hex');
const results=[];
const management=await fresh();
let dbCreated=false;
const raw=async sql=>{ const c=await fresh(dbName);try{return await c.query(sqlClock(sql));}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{await c.end().catch(()=>{});} };
const query=async sql=>{const r=await raw(sql);const list=Array.isArray(r)?r:[r];return list.find(x=>x.rows?.[0]?.evidence)?.rows[0].evidence;};
const target=()=>({projectRef:CE1_REF,origin:'https://auth.quefalta.es',status:'ACTIVE_HEALTHY',verifiedAtMs:Date.now(),testEnvironment:'isolated native PG; NOT Supabase evidence'});
const transport={query,inspectTarget:async()=>target()};
const seed=`INSERT INTO comparator_strict.execution_budget(project_ref,budget_date,bytes_limit,approval_reference,bytes_reserved,sql_ms_reserved,read_rows_reserved,write_rows_reserved)
VALUES ('${CE1_REF}','2026-09-03',23068672,'CE-100-22MiB-2026-09-03',22484430,280520,3900,20)`;
const reset=async()=>{await raw('DELETE FROM comparator_strict.execution_control; DELETE FROM comparator_strict.execution_jobs; DELETE FROM comparator_strict.execution_budget;');await raw(seed);};
const makePlan=async(jobKey,operation='f1_stopped_control',parentJobKey=null)=>{
  const snapshot=await query(atomicSnapshotSql()); const request=atomicRequest(operation,jobKey);
  return buildAtomicPlan(request,atomicContext(snapshot,jobKey,target()),{parentJobKey});
};
const state=jobKey=>query(atomicRecoverSql(jobKey));
const runTest=async(name,fn)=>{const start=performance.now();await reset();await fn();results.push({name,status:'PASS',elapsed_ms:Math.round(performance.now()-start)});console.log('PASS '+name);};

try {
  const version=(await management.query('SELECT version(),current_setting(\'server_version_num\') AS v')).rows[0];
  assert.equal(Math.floor(Number(version.v)/10000),17,'Native PostgreSQL 17 is mandatory');
  await management.query(`CREATE DATABASE "${dbName}"`);dbCreated=true;
  await management.query(`DO $$ BEGIN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
  END $$`);
  await raw(await readFile(new URL('supabase/migrations/20260903080621_comparator_strict_private_foundation.sql',root),'utf8'));
  await raw(await readFile(new URL('supabase/tests/comparator-strict-foundation.sql',root),'utf8'));
  results.push({name:'foundation SQL assertions including 28 negative cases, real PG17 roles and RLS',status:'PASS'});
  await raw(seed);
  await raw(`INSERT INTO comparator_strict.execution_jobs(id,project_ref,operation_key,sql_sha256,status,started_at,deadline_at,finished_at)
    VALUES(gen_random_uuid(),'${CE1_REF}','retained-bootstrap-fixture',repeat('a',64),'rolled_back',now(),now()+interval '20 minutes',now())`);
  await raw(await readFile(new URL('supabase/migrations/20260903084621_comparator_strict_atomic_receipts.sql',root),'utf8'));
  assert.equal((await raw('SELECT job_key FROM comparator_strict.execution_jobs')).rows[0].job_key,null);
  assert.equal(Number((await raw('SELECT sql_ms_reserved FROM comparator_strict.execution_budget')).rows[0].sql_ms_reserved),285520);

  await runTest('committed canary + compensating operation + retained cumulative budget',async()=>{
    const p=await makePlan('ce1-positive');const receipt=await runAtomicPlan(p,transport);assert.equal(receipt.payload.enabled,false);
    const reverse=await makePlan('ce1-positive-reverse','f1_revert_control','ce1-positive');
    await runAtomicPlan(reverse,transport);
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_control')).rows[0].n),0);
    const b=(await state('ce1-positive-reverse')).budget;
    assert.equal(Number(b.bytes_reserved),22484430+2*ATOMIC_RESERVATION.responseBytes);
    assert.equal(Number(b.sql_ms_reserved),280520+2*ATOMIC_RESERVATION.sqlMs);
    assert.equal(Number(b.write_rows_reserved),28);
  });

  await runTest('two independent sessions cannot reserve two active jobs',async()=>{
    const a=await makePlan('ce1-race-a'),b=await makePlan('ce1-race-b');
    const outcomes=await Promise.allSettled([query(atomicReserveSql(a)),query(atomicReserveSql(b))]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_jobs')).rows[0].n),1);
    assert.equal(Number((await state(outcomes[0].status==='fulfilled'?'ce1-race-a':'ce1-race-b')).budget.sql_ms_reserved),280520+ATOMIC_RESERVATION.sqlMs);
  });

  await runTest('concurrent replay executes the payload once and preserves original start',async()=>{
    const p=await makePlan('ce1-execute-race'); const reserved=await query(atomicReserveSql(p));
    const outcomes=await Promise.allSettled([query(atomicExecuteSql(p)),query(atomicExecuteSql(p))]);
    assert.ok(outcomes.some(x=>x.status==='fulfilled'));
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_control')).rows[0].n),1);
    const after=await state(p.request.jobId);assert.equal(after.job.started_at,reserved.job.started_at);
    const replay=await runAtomicPlan(p,transport);assert.equal(replay.jobKey,p.request.jobId);
    assert.deepEqual((await state(p.request.jobId)).budget,after.budget);
  });

  await runTest('reservation response lost: no automatic payload; explicit reconciliation only',async()=>{
    const p=await makePlan('ce1-lost-reserve');let calls=0;
    await assert.rejects(runAtomicPlan(p,{...transport,query:async sql=>{calls++;await query(sql);throw new Error('lost-reserve-response');}}),/lost-reserve-response/);
    assert.equal(calls,1);assert.equal((await state(p.request.jobId)).job.status,'planned');
    await assert.rejects(runAtomicPlan(p,transport),/requires_explicit_reconciliation/);
    const before=(await state(p.request.jobId)).budget;
    await query(atomicResolveAbortedSql(p));
    assert.deepEqual((await state(p.request.jobId)).budget,before);
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_control')).rows[0].n),0);
  });

  await runTest('response lost after COMMIT: recover durable receipt, never duplicate effect',async()=>{
    const p=await makePlan('ce1-lost-commit');let calls=0;
    await assert.rejects(runAtomicPlan(p,{...transport,query:async sql=>{const r=await query(sql);if(++calls===2)throw new Error('lost-commit-response');return r;}}),/lost-commit-response/);
    assert.equal(calls,2);const recovered=await state(p.request.jobId);validateAtomicReceipt(p,recovered);
    await assert.rejects(query(atomicResolveAbortedSql(p)),/requires_uncommitted_job/);
    const receipt=await runAtomicPlan(p,transport);assert.equal(receipt.jobKey,p.request.jobId);
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_control')).rows[0].n),1);
    assert.deepEqual((await state(p.request.jobId)).budget,recovered.budget);
  });

  await runTest('real PostgreSQL statement cancellation rolls back effects but keeps reservation',async()=>{
    const p=await makePlan('ce1-timeout');await query(atomicReserveSql(p));
    // Fault injection only in this fresh local DB, after DML and before receipt/COMMIT.
    const sql=atomicExecuteSql(p).replace('GET DIAGNOSTICS affected=ROW_COUNT;','GET DIAGNOSTICS affected=ROW_COUNT; PERFORM pg_sleep(10);');
    const start=performance.now();await assert.rejects(query(sql),{code:'57014'});assert.ok(performance.now()-start<3500);
    const after=await state(p.request.jobId);assert.equal(after.job.status,'planned');assert.equal(after.job.receipt,null);
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_control')).rows[0].n),0);
    await assert.rejects(runAtomicPlan(p,transport),/requires_explicit_reconciliation/);
    await query(atomicResolveAbortedSql(p));assert.deepEqual((await state(p.request.jobId)).budget,after.budget);
  });

  await runTest('whole transaction timeout bounds multiple individually valid statements',async()=>{
    // Native PostgreSQL timer, not a JavaScript cancellation or simulated result.
    const start=performance.now();
    await assert.rejects(raw("BEGIN; SET LOCAL statement_timeout='1000ms'; SET LOCAL transaction_timeout='2000ms'; SELECT pg_sleep(0.8); SELECT pg_sleep(0.8); SELECT pg_sleep(0.8); COMMIT;"),{code:'25P04'});
    assert.ok(performance.now()-start<3500);
  });

  await runTest('pre-COMMIT validation rejects an unexpected row without committing it',async()=>{
    const p=await makePlan('ce1-invalid-row');await query(atomicReserveSql(p));
    const sql=atomicExecuteSql(p).replace('VALUES (\'\'gkffvigcnsesbaihycay\'\',false,true,$1)','VALUES (\'\'gkffvigcnsesbaihycay\'\',true,false,$1)');
    assert.notEqual(sql,atomicExecuteSql(p));await assert.rejects(query(sql),/result_scope_violation/);
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_control')).rows[0].n),0);
    assert.equal((await state(p.request.jobId)).job.status,'planned');
  });

  await runTest('unknown triggers are refused before payload and cannot introduce induced effects',async()=>{
    const p=await makePlan('ce1-trigger');await query(atomicReserveSql(p));
    await raw(`CREATE FUNCTION comparator_strict.local_test_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TRIGGER local_test_trigger BEFORE INSERT ON comparator_strict.execution_control FOR EACH ROW EXECUTE FUNCTION comparator_strict.local_test_trigger()`);
    await assert.rejects(query(atomicExecuteSql(p)),/unreviewed_induced_effects/);
    await raw('DROP TRIGGER local_test_trigger ON comparator_strict.execution_control; DROP FUNCTION comparator_strict.local_test_trigger()');
  });

  await runTest('database budget check survives stale client snapshot and does not create a job',async()=>{
    const p=await makePlan('ce1-budget');await raw('UPDATE comparator_strict.execution_budget SET sql_ms_reserved=299999');
    await assert.rejects(query(atomicReserveSql(p)),/budget_exceeded/);
    assert.equal((await state(p.request.jobId)).job,null);
  });

  await runTest('different day cannot reuse reservation or clear unresolved job',async()=>{
    const p=await makePlan('ce1-midnight');await query(atomicReserveSql(p));
    // Persist a different budget day in isolated fixtures; never alter the machine clock.
    await raw(`INSERT INTO comparator_strict.execution_budget(project_ref,budget_date) VALUES ('${CE1_REF}','2026-09-02');
      UPDATE comparator_strict.execution_jobs SET budget_date='2026-09-02' WHERE job_key='ce1-midnight'`);
    await assert.rejects(query(atomicExecuteSql(p)),/job_expired/);
    assert.equal((await state(p.request.jobId)).job.status,'planned');
    assert.equal(Number((await state(p.request.jobId)).budget.sql_ms_reserved),280520+ATOMIC_RESERVATION.sqlMs);
  });

  await runTest('expired original job cannot get a new 20-minute window',async()=>{
    const p=await makePlan('ce1-expired');await query(atomicReserveSql(p));
    await raw("UPDATE comparator_strict.execution_jobs SET started_at=t.moment-interval '21 minutes',deadline_at=t.moment-interval '1 minute' FROM (SELECT clock_timestamp() AS moment) t");
    const before=await state(p.request.jobId);await assert.rejects(query(atomicExecuteSql(p)),/job_expired/);
    await query(atomicReserveSql(p));assert.equal((await state(p.request.jobId)).job.started_at,before.job.started_at);
  });

  await runTest('process killed during transaction: locks block competitors until real rollback',async()=>{
    const p=await makePlan('ce1-process-death');const competitor=await makePlan('ce1-process-competitor');await query(atomicReserveSql(p));
    const child=fork(new URL('./tests/helpers/comparator-strict-crash-worker.mjs',import.meta.url),[],{stdio:['ignore','ignore','pipe','ipc']});
    child.send({config:{...config,database:dbName},modulePath:resolve(modulePath),sql:sqlClock(atomicExecuteSql(p).replace('GET DIAGNOSTICS affected=ROW_COUNT;','GET DIAGNOSTICS affected=ROW_COUNT; PERFORM pg_sleep(10);'))});
    const [message]=await once(child,'message',{signal:AbortSignal.timeout(5000)});assert.equal(message.state,'query-starting');
    // Read only this isolated database's worker state, bounded polling.
    const deadline=Date.now()+3000;let running=false;
    while(Date.now()<deadline){const rows=(await raw("SELECT 1 FROM pg_stat_activity WHERE application_name='ce1-crash-worker' AND datname=current_database() AND wait_event='PgSleep'")).rows;if(rows.length){running=true;break;}await new Promise(r=>setTimeout(r,20));}
    if(!running){child.kill('SIGKILL');throw new Error('Crash worker did not reach the injected fault');}
    await assert.rejects(query(atomicReserveSql(competitor)),/project_busy|unresolved_work/);
    const exited=once(child,'exit');child.kill('SIGKILL');await exited;
    // The server cancels at its 1-second statement limit, independent of dead JS.
    const cancelDeadline=Date.now()+3500;
    while(Date.now()<cancelDeadline){const n=(await raw("SELECT count(*)::int AS n FROM pg_stat_activity WHERE application_name='ce1-crash-worker' AND datname=current_database()")).rows[0].n;if(n===0)break;await new Promise(r=>setTimeout(r,25));}
    const recovered=await state(p.request.jobId);assert.equal(recovered.job.status,'planned');assert.equal(recovered.job.receipt,null);
    assert.equal(Number((await raw('SELECT count(*) AS n FROM comparator_strict.execution_control')).rows[0].n),0);
    await assert.rejects(query(atomicReserveSql(competitor)),/unresolved_work/);
    await query(atomicResolveAbortedSql(p));
  });

  await runTest('native lock timeout ends a blocked write with no effect',async()=>{
    const p=await makePlan('ce1-lock-timeout');await query(atomicReserveSql(p));
    const blocker=await fresh(dbName);try{
      await blocker.query('BEGIN; LOCK TABLE comparator_strict.execution_control IN ACCESS EXCLUSIVE MODE');
      const start=performance.now();await assert.rejects(query(atomicExecuteSql(p)),{code:'55P03'});assert.ok(performance.now()-start<1500);
    }finally{await blocker.query('ROLLBACK');await blocker.end();}
    assert.equal((await state(p.request.jobId)).job.status,'planned');
  });

  await runTest('real app roles still cannot access or execute the upgraded protocol',async()=>{
    const p=await makePlan('ce1-denied');
    for(const role of ['anon','authenticated','service_role']){
      await assert.rejects(raw(`BEGIN;SET LOCAL ROLE ${role};SELECT job_key,receipt FROM comparator_strict.execution_jobs;ROLLBACK;`),{code:'42501'});
      await assert.rejects(raw(atomicReserveSql(p).replace('BEGIN;',`BEGIN; SET LOCAL ROLE ${role};`)),{code:'42501'});
    }
    assert.equal((await state(p.request.jobId)).job,null);
  });

  console.log(JSON.stringify({status:'PASS',version:version.version,isolatedDatabase:dbName,tests:results,
    testDate:new Date().toISOString(),clockRebased,limitations:['Tests target only the two F1 registered operations','No public comparator activation or production load test','Day transition uses persisted fixtures, not wall-clock manipulation']},null,2));
} finally {
  // Only the fresh database created above; no shared schema or existing database.
  try{if(dbCreated)await management.query(`DROP DATABASE "${dbName}" WITH (FORCE)`);}
  finally{await management.end();Date.now=realNow;}
}
