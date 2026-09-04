import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {datasetHash as hash} from '../lib/comparator-strict-dataset.mjs';
import {buildOwnerReview} from '../lib/comparator-strict-owner-review.mjs';

const dir = 'docs/comparator-strict/dataset/owner-review-v1';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const fileHash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const packet = buildOwnerReview();
const report = json(`${dir}/report.json`);
const manifest = json(`${dir}/manifest.json`);

test('stored CE-203 report and manifest reproduce from frozen inputs', () => {
  assert.deepEqual(report, packet.report);
  const cliManifest = JSON.parse(execFileSync(process.execPath,
    ['scripts/prepare-comparator-strict-owner-review.mjs', '--artifact=manifest'], {encoding: 'utf8'}));
  assert.deepEqual(manifest, cliManifest);
  assert.equal(hash(packet.index), report.hashes.index);
  assert.equal(hash(packet.cases), report.hashes.cases);
  assert.equal(hash(packet.responses), report.hashes.response_template);
});

test('manifest pins code, policy, corpus and completed first-annotation receipt', () => {
  for (const file of manifest.code_and_policy) assert.equal(hash(readFileSync(file.path, 'utf8')), file.sha256, file.path);
  assert.equal(hash(readFileSync(manifest.corpus_manifest.path, 'utf8')), manifest.corpus_manifest.sha256);
  assert.equal(hash(readFileSync(manifest.first_annotation_closure.path, 'utf8')), manifest.first_annotation_closure.sha256);
});

test('CLI exposes source-only review batches and rejects hidden or mutation-like artifacts', () => {
  const run = args => execFileSync(process.execPath,
    ['scripts/prepare-comparator-strict-owner-review.mjs', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  const review = run(['--artifact=review', '--batch=1', '--batch-size=1']);
  assert.match(review, /CE203-79260E7AD071/);
  assert.doesNotMatch(review, /source_dispute|selection_reason|challenge_reason|annotation_id|review_id/);
  assert.throws(() => run(['--artifact=audit']));
  assert.throws(() => run(['--artifact=deploy']));
  assert.throws(() => run(['--artifact=review', '--batch=0']));
  assert.throws(() => run(['--artifact=cases', '--limit=1337']));
});

test('workbook is the sole final spreadsheet and remains pinned', () => {
  const path = 'outputs/ce203-owner-review-v1/CE-203-revision-ciega.xlsx';
  assert.deepEqual(readdirSync('outputs/ce203-owner-review-v1'), ['CE-203-revision-ciega.xlsx']);
  assert.equal(statSync(path).size, 4799661);
  assert.equal(fileHash(path), 'f6d009ec1b0f1861477ffb08039d6fe251d1bb6f1b822d82000580b991519342');
  assert.equal(readFileSync(path).subarray(0, 2).toString(), 'PK');
});

test('previous closure and protected production-facing files remain byte-identical', () => {
  const previousPath = 'docs/comparator-strict/CE-201-202-water-evidence.json';
  assert.equal(hash(readFileSync(previousPath, 'utf8')), '4a287019b78979867940c77212e58b811d85544d6212538fe593a7b5fc7eacc6');
  const previous = json(previousPath);
  for (const file of [...previous.files, ...previous.protected_files, ...previous.previous_evidence_preserved]) {
    assert.equal(hash(readFileSync(file.path, 'utf8')), file.sha256, file.path);
  }
});

test('preparation receipt keeps CE-203, gold and G2 open', () => {
  const receipt = json('docs/comparator-strict/CE-203-selection-evidence.json');
  assert.deepEqual(receipt.tasks, ['CE-203']);
  assert.equal(receipt.status, 'in_progress_selection_ready_owner_review_pending');
  assert.equal(receipt.report.total_blind_review_cases, 1336);
  assert.equal(receipt.report.owner_reviews_completed, 0);
  assert.equal(receipt.report.CE203_complete, false);
  assert.equal(receipt.report.G2_pass, false);
  assert.equal(receipt.quality.tests.pass, 592);
  assert.equal(receipt.safety.supabase_calls, 0);
  for (const file of [...receipt.files, ...receipt.protected_files, ...receipt.previous_evidence_preserved]) {
    assert.equal(fileHash(file.path), file.sha256, file.path);
  }
});
