import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acquisitionPlan } from './comparator-strict-acquisition.mjs';
test('CE200 reader refuses arbitrary store, kind, page size and delimiter', () => {
  for (const x of [{kind:'sql'}, {kind:'products',store:'profiles'}, {kind:'products',store:'consum',limit:501}, {kind:'products',store:'consum',cursor:'$payload$'}]) assert.throws(()=>acquisitionPlan(x));
});
test('CE200 stable bounded plans and durable reservation precede payload', () => {
  const p=acquisitionPlan({kind:'products',store:'consum',cursor:'001',limit:100});
  assert.deepEqual(p,acquisitionPlan({kind:'products',store:'consum',cursor:'001',limit:100}));
  assert.match(p.select,/id COLLATE "C" > '001'/);
  assert.match(p.select,/LIMIT 100/);
  assert.ok(p.sql.indexOf('COMMIT;')<p.sql.indexOf('DO $payload$'));
  assert.doesNotMatch(p.sql,/300000|UPDATE public\.|DELETE|TRUNCATE|OFFSET|random\(\)/);
  assert.match(p.sql,/ce200_exclusive_or_replay/);
  assert.match(p.sql,/statement_timeout='5s'/);
  assert.match(p.sql,/job_started,job_started\+interval '20 minutes'/);
});
test('CE200 cursors are quoted; observations are not inferred', () => {
  const p=acquisitionPlan({kind:'products',store:'carrefour',cursor:"a' OR true --"});
  assert.ok(p.select.includes("'a'' OR true --'"));
  assert.match(p.select,/ingredients/);assert.match(p.select,/source_row_md5/);
  assert.doesNotMatch(p.select,/coalesce\(available|embedding|profiles/);
});
