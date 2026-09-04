// Ephemeral embedded PostgreSQL only; no remote fallback.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import {acquisitionPlan} from './lib/comparator-strict-acquisition.mjs';
const modulePath=process.argv[2];
if(!modulePath || !isAbsolute(modulePath)) throw Error('Explicit local PGlite module required');
const {PGlite}=await import(pathToFileURL(modulePath).href);
const db=new PGlite();
try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  await db.exec(await readFile('supabase/migrations/20260903080621_comparator_strict_private_foundation.sql','utf8'));
  await db.exec(`INSERT INTO comparator_strict.execution_budget(project_ref,budget_date,bytes_limit,approval_reference,bytes_reserved,sql_ms_reserved,read_rows_reserved,write_rows_reserved) VALUES('gkffvigcnsesbaihycay','2026-09-03',23068672,'CE-100-22MiB-2026-09-03',22000000,200000,1000,10)`);
  // Structural replay of the historical dated migration in a fresh local DB.
  const atomic=await readFile('supabase/migrations/20260903084621_comparator_strict_atomic_receipts.sql','utf8');
  await db.exec(atomic.replace("(clock_timestamp() AT TIME ZONE 'UTC')::date", "DATE '2026-09-03'"));
  await db.exec('UPDATE comparator_strict.execution_budget SET bytes_reserved=22623694,sql_ms_reserved=299920,read_rows_reserved=4128,write_rows_reserved=35');
  await db.exec(await readFile('supabase/migrations/20260903101356_comparator_strict_ce200_corpus_authority.sql','utf8'));
  const b=(await db.query('SELECT * FROM comparator_strict.execution_budget')).rows[0];
  assert.equal(b.sql_ms_reserved,314920);assert.equal(b.bytes_reserved,22754766);assert.equal(b.read_rows_reserved,4628);
  const p=acquisitionPlan({kind:'health'});
  const r=await db.exec(p.sql);
  const evidence=r.flatMap(x=>x.rows).find(x=>x?.evidence)?.evidence;
  assert.equal(evidence.rows[0].private_rls,true);assert.equal(evidence.rows[0].anon_usage,false);
  assert.equal((await db.query('SELECT status FROM comparator_strict.execution_jobs')).rows[0].status,'succeeded');
  await assert.rejects(db.exec(p.sql),/ce200_exclusive_or_replay/);await db.exec('ROLLBACK');
  const before=(await db.query('SELECT sql_ms_reserved FROM comparator_strict.execution_budget')).rows[0].sql_ms_reserved;
  await assert.rejects(db.exec(acquisitionPlan({kind:'products',store:'consum'}).sql),/does not exist/);await db.exec('ROLLBACK');
  assert.equal((await db.query('SELECT sql_ms_reserved FROM comparator_strict.execution_budget')).rows[0].sql_ms_reserved,before+10000);
  await assert.rejects(db.exec(acquisitionPlan({kind:'health',round:'after-failure'}).sql),/ce200_exclusive_or_replay/);await db.exec('ROLLBACK');
  for(const sql of ['UPDATE comparator_strict.execution_budget SET sql_ms_reserved=-1','UPDATE comparator_strict.execution_budget SET read_rows_reserved=50001','UPDATE comparator_strict.execution_budget SET approval_reference=NULL','UPDATE comparator_strict.execution_budget SET bytes_reserved=134217729']) await assert.rejects(db.exec(sql),/constraint/);
  console.log(JSON.stringify({status:'PASS',scope:'CE-BU-002 migration + CE200 reader',checks:14,limitations:'embedded single-process; not a remote concurrency benchmark'}));
} finally {await db.close();}
