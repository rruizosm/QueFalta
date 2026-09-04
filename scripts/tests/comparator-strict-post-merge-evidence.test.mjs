import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { CATALOG_PROBE, catalogProbeHash } from '../lib/comparator-catalog-probe.mjs';
import { assertEvidenceReferences } from './helpers/comparator-strict-evidence.mjs';

const json = path => JSON.parse(readFileSync(path, 'utf8'));

const receipts = [
  'docs/comparator-strict/CE-201-202-corpus-evidence.json',
  'docs/comparator-strict/CE-201-202-potatoes-evidence.json',
  'docs/comparator-strict/CE-201-202-yogurt-evidence.json',
  'docs/comparator-strict/CE-201-202-yogurt-plusfresc-evidence.json',
  'docs/comparator-strict/CE-201-202-yogurt-carrefour-evidence.json',
  'docs/comparator-strict/CE-201-202-water-evidence.json',
  'docs/comparator-strict/CE-203-selection-evidence.json',
];

test('historical comparator receipts survive explicitly recorded post-merge product changes', () => {
  for (const path of receipts) assertEvidenceReferences(json(path));
});

test('the obsolete CE-100 probe stays fail-closed after the catalog client evolves', () => {
  const script = 'scripts/probe-comparator-strict-catalog.mjs';
  for (const args of [[], ['--read-once', '--project-ref', CATALOG_PROBE.projectRef, '--confirm', catalogProbeHash]]) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /CE100_CLIENT_SOURCE_CHANGED/);
  }
});

test('the frozen water closure still closes only CE-201/202', () => {
  const receipt = json('docs/comparator-strict/CE-201-202-water-evidence.json');
  assert.deepEqual(receipt.tasks, ['CE-201', 'CE-202']);
  assert.equal(receipt.status, 'complete');
  assert.equal(receipt.report.union_first_annotated_corpus_pairs, 6000);
  assert.equal(receipt.report.corpus_pairs_pending_first_annotation, 0);
  assert.equal(receipt.report.supported_full_positive_equivalences, 1);
  assert.equal(receipt.report.eligible_savings, 0);
  assert.equal(receipt.report.CE203_complete, false);
  assert.equal(receipt.report.G2_pass, false);
  assert.equal(receipt.safety.supabase_calls, 0);
  assert.equal(receipt.safety.retailer_calls, 0);
});

test('the frozen owner packet keeps CE-203, gold and G2 open', () => {
  const receipt = json('docs/comparator-strict/CE-203-selection-evidence.json');
  assert.deepEqual(receipt.tasks, ['CE-203']);
  assert.equal(receipt.status, 'in_progress_selection_ready_owner_review_pending');
  assert.equal(receipt.report.total_blind_review_cases, 1336);
  assert.equal(receipt.report.owner_reviews_completed, 0);
  assert.equal(receipt.report.CE203_complete, false);
  assert.equal(receipt.report.G2_pass, false);
  assert.equal(receipt.safety.supabase_calls, 0);
});
