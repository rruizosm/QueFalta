import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const json = path => JSON.parse(read(path));
const sha = text => createHash('sha256').update(text).digest('hex');
const base = 'docs/comparator-strict/';
const bootstrap = json(base + 'CE-103-bootstrap-manifest.json');
const canary = json(base + 'CE-106-canary-manifest.json');
const evidence = json(base + 'CE-103-106-execution-evidence.json');

test('CE-103 deployed foundation matches reviewed local SQL hash/version', () => {
  assert.equal(sha(read('supabase/migrations/' + bootstrap.migration)), bootstrap.sha256);
  assert.equal(bootstrap.sha256, evidence.migration.sha256);
  assert.ok(bootstrap.migration.startsWith(evidence.migration.remote_version + '_'));
  assert.equal(bootstrap.baseline_complete, false);
  assert.equal(bootstrap.G1_accepted, false);
});

test('CE-103 SQL is a bounded private foundation, not a comparator deployment', () => {
  const sql = read('supabase/migrations/' + bootstrap.migration);
  assert.equal((sql.match(/CREATE TABLE comparator_strict\./g) ?? []).length, 4);
  assert.equal((sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length, 4);
  assert.match(sql, /DO \$foundation\$/);
  assert.match(sql, /statement_timeout = '5s'/);
  assert.match(sql, /lock_timeout = '500ms'/);
  assert.doesNotMatch(sql, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\./i);
  assert.doesNotMatch(sql, /CREATE (?:OR REPLACE )?(?:FUNCTION|POLICY|TRIGGER|EXTENSION)/i);
  assert.doesNotMatch(sql, /GRANT .+ TO (?:anon|authenticated|service_role)/i);
});

test('CE-106 reviewed one-time SQL and reversal match their hashes', () => {
  assert.equal(sha(read(canary.sql_file)), canary.sql_sha256);
  assert.equal(sha(read(canary.reversal_file)), canary.reversal_sha256);
  assert.ok(canary.insert_rows <= 5);
  assert.ok(canary.reversal_rows <= 5);
  assert.equal(canary.reservation_reset_on_reversal, false);
  assert.equal(canary.generic_CE102_remote_adapter_tested, false);
  const rollback = read('supabase/ops/rollback-comparator-strict-foundation.sql');
  assert.match(rollback, /tables are not empty/);
  assert.doesNotMatch(rollback, /DROP\s+(?:TABLE|SCHEMA)[^;]*CASCADE/i);
});

test('CE-106 captured proof has a committed stopped row followed by compensation', () => {
  const snapshot = key => evidence.records.find(r => r.key === key).rows[0].evidence;
  const committed = snapshot('ce106_committed');
  const final = snapshot('ce106_final');
  assert.equal(committed.control.enabled, false);
  assert.equal(committed.control.halted, true);
  assert.equal(committed.job.status, 'running');
  assert.equal(final.canary_job.id, committed.job.id);
  assert.equal(final.canary_job.status, 'rolled_back');
  assert.deepEqual(final.rows, { jobs: 1, budget: 1, control: 0, principals: 0 });
  assert.deepEqual(final.budget, committed.budget);
  assert.deepEqual(final.legacy, snapshot('ce103_preapply').legacy);
  assert.ok(final.roles.every(r => !r.schema_usage && !r.schema_create && !r.any_table_grant));
  assert.equal(final.health.blocked, 0);
});

test('CE-1 reservation retains prior spend and fits the approved daily limits', () => {
  for (const [key, value] of Object.entries(bootstrap.reserved_day_totals)) {
    assert.ok(value <= bootstrap.daily_limits[key], key);
  }
  assert.equal(bootstrap.reserved_day_totals.bytes, bootstrap.prior_day_accounting.bytes
    + bootstrap.F1_continuation_reservation_including_preflight_migration_sample_tests_canary_and_reversal.bytes);
  assert.ok(evidence.accounting.captured_tool_response_bytes_plus_HTTP_bodies < evidence.accounting.continuation_reserved_bytes);
  assert.equal(evidence.accounting.day_reserved_bytes, bootstrap.reserved_day_totals.bytes);
});

test('CE-104 real sample remains bounded, active, unlabelled and non-synthetic', () => {
  const data = json(base + 'fixtures/catalog-sample-2026-09-03.json');
  assert.equal(data.synthetic, false);
  assert.equal(data.products.length, 72);
  assert.match(data.label_status, /unreviewed/);
  const counts = new Map();
  for (const row of data.products) {
    assert.equal(row.product.published, true);
    assert.ok(row.product.id && row.product.display_name);
    assert.equal(row.expected, undefined);
    const key = row.store + ':' + row.hint;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    assert.deepEqual(Object.keys(row.product).sort(),
      ['id','ean','packaging','published','synced_at','unit_price','display_name','price_per_unit'].sort());
  }
  assert.equal(counts.size, 12);
  assert.ok([...counts.values()].every(n => n === 6));
});

test('CE-104 synthetic contract preserves quantity, variants, order and quarantine cases', () => {
  const data = json(base + 'fixtures/contract-cases-v1.json');
  assert.equal(data.synthetic, true);
  assert.equal(data.not_a_holdout, true);
  assert.equal(data.cases.length, 24);
  assert.equal(new Set(data.cases.map(c => c.id)).size, 24);
  const expected = id => data.cases.find(c => c.id === id).expected.equivalence;
  assert.equal(expected('yogurt-word-order'), 'equivalent');
  assert.equal(expected('yogurt-natural-sweetened'), 'not_equivalent');
  assert.equal(expected('yogurt-equal-total-different-pack'), 'not_equivalent');
  assert.equal(expected('yogurt-missing-pack-details'), 'unknown');
  assert.equal(expected('potatoes-1kg-mismatch'), 'not_equivalent');
  assert.equal(expected('variable-meat-quarantine'), 'quarantined');
  assert.equal(expected('same-ean-conflicting-format'), 'not_equivalent');
  const scenarios = data.price_and_freshness_scenarios;
  assert.equal(scenarios.length, 8);
  assert.equal(scenarios.find(s => s.id === 'same-price-no-use').expected.consume_use, false);
  assert.equal(scenarios.find(s => s.id === 'active-older-than-24h').expected.show_saving, true);
  assert.equal(scenarios.find(s => s.id === 'price-only-revision').expected.rebuild_embedding, false);
});

test('CE-105 CI is explicit manual-only with isolated PostgreSQL and no Supabase secrets', () => {
  const workflow = read('.github/workflows/comparator-strict-sql.yml');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /image: postgres:17/);
  assert.match(workflow, /PGHOST: localhost/);
  assert.doesNotMatch(workflow, /secrets\.|db push|migration repair|pull_request:|push:/);
  assert.match(workflow, /supabase\/tests\/comparator-strict-foundation.sql/);
});
