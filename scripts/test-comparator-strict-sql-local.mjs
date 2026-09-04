#!/usr/bin/env node
// Explicit temporary PGlite module path only. No remote URL or credentials.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath || !isAbsolute(modulePath)) throw new Error('Pass the absolute path to a temporary @electric-sql/pglite module');
const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const root = new URL('../', import.meta.url);
const migration = await readFile(new URL('supabase/migrations/20260903080621_comparator_strict_private_foundation.sql', root), 'utf8');
const tests = await readFile(new URL('supabase/tests/comparator-strict-foundation.sql', root), 'utf8');
const rollback = await readFile(new URL('supabase/ops/rollback-comparator-strict-foundation.sql', root), 'utf8');
try {
  await db.exec('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;');
  const version = await db.query('select version()');
  await db.exec(migration);
  const result = await db.exec(tests);
  assert.match(result.at(-1).rows[0].result, /PASS/);
  await db.exec(rollback);
  assert.equal((await db.query("select to_regnamespace('comparator_strict') as n")).rows[0].n, null);
  await db.exec(migration);
  await db.exec("INSERT INTO comparator_strict.execution_control(project_ref) VALUES ('gkffvigcnsesbaihycay')");
  await assert.rejects(db.exec(rollback), /tables are not empty/);
  await db.exec('ROLLBACK;');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM comparator_strict.execution_control')).rows[0].n, 1);
  let canaryResult = 'not requested (dated one-time operation)';
  if (process.argv.includes('--one-time-canary')) {
    // This is an ephemeral local database, never production cleanup.
    await db.exec('DELETE FROM comparator_strict.execution_control;');
    const canary = await readFile(new URL('supabase/ops/canary-comparator-strict-foundation.sql', root), 'utf8');
    const revert = await readFile(new URL('supabase/ops/revert-comparator-strict-canary.sql', root), 'utf8');
    await db.exec(canary);
    assert.equal((await db.query('SELECT enabled FROM comparator_strict.execution_control')).rows[0].enabled, false);
    await assert.rejects(db.exec(canary), /verified empty foundation/);
    await db.exec('ROLLBACK;');
    await db.exec(revert);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM comparator_strict.execution_control')).rows[0].n, 0);
    assert.equal((await db.query('SELECT status FROM comparator_strict.execution_jobs')).rows[0].status, 'rolled_back');
    assert.equal((await db.query('SELECT bytes_reserved::int AS n FROM comparator_strict.execution_budget')).rows[0].n, 22484430);
    await assert.rejects(db.exec(revert), /no rows/);
    await db.exec('ROLLBACK;');
    canaryResult = 'PASS: committed local inactive canary, refused replay, compensating reversal, retained accounting, refused second reversal';
  }
  console.log(JSON.stringify({ status: 'PASS', version: version.rows[0].version,
    module: resolve(modulePath), sqlAssertions: '28 negative cases + structure, defaults, budget and RLS',
    rollback: 'empty foundation removed/recreated; nonempty rollback refused without loss',
    canary: canaryResult,
    limitations: 'Embedded single-process PostgreSQL; not a production concurrency, cancellation or crash-recovery test' }, null, 2));
} finally {
  await db.close();
}
