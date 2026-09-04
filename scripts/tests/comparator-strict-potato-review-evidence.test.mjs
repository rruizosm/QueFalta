import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {datasetHash as hash} from '../lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from '../lib/comparator-strict-corpus-labels.mjs';
import {buildPotatoReview} from '../lib/comparator-strict-potato-review.mjs';
const dir = 'docs/comparator-strict/dataset/label-potatoes-v1';
const json = path => JSON.parse(readFileSync(path, 'utf8'));
const packet = buildPotatoReview(loadLabelCorpus()), manifest = json(`${dir}/manifest.json`);
test('new source review manifest pins actual code and previous immutable inputs', () => {
  for (const f of manifest.code_and_preexisting_evidence) assert.equal(hash(readFileSync(f.path, 'utf8')), f.sha256, f.path);
  assert.equal(hash(readFileSync('docs/comparator-strict/dataset/corpus-v1/manifest.json', 'utf8')), manifest.corpus_manifest_sha256);
});
test('all materialized product reviews, index and report exactly regenerate', () => {
  for (const k of ['products', 'index', 'report']) assert.deepEqual(json(`${dir}/${k}.json`), packet[k], k);
  for (const k of ['products', 'index', 'annotations']) assert.equal(hash(packet[k]), manifest.hashes[k], k);
  assert.equal(hash(packet.report), manifest.report_sha256);
});
test('reported decisions are annotation proposals, not approvals of savings or task closure', () => {
  assert.deepEqual(packet.report.decision_counts, {abstain:499,excluded_scope:104,rejected:319});
  assert.equal(packet.report.dimension_counts.format.compatible, 2);
  assert.equal(packet.report.supported_full_positive_equivalences, 0);
  assert.equal(packet.report.independent_pair_by_pair_reviews_this_batch, 0);
  assert.equal(packet.report.gold_pairs, 0);
  for (const k of ['CE201_complete','CE202_complete','CE203_complete','G2_pass']) assert.equal(manifest[k], false);
});
test('402 decision proposals differ from drafts after source review, without overwriting drafts', () => {
  const previousDir = 'docs/comparator-strict/dataset/label-corpus-v1';
  const previous = readdirSync(previousDir).filter(f => /^index-\d+\.json$/.test(f)).flatMap(f => json(`${previousDir}/${f}`));
  const byPair = new Map(previous.map(p => [`${p.left}|${p.right}`,p]));
  assert.equal(packet.index.filter(p => p.decision !== byPair.get(`${p.left}|${p.right}`).decision_draft).length, 402);
  assert.equal(previous.length, 6000);
});
test('the previous CE-201/202 evidence, including its historical progress document, stays byte-identical', () => {
  for (const f of json('docs/comparator-strict/CE-201-202-corpus-evidence.json').files) assert.equal(hash(readFileSync(f.path, 'utf8')), f.sha256, f.path);
});
test('CLI reproduces records and rejects unsupported artifact/negative slices', () => {
  const cli = 'scripts/prepare-comparator-strict-potato-review.mjs';
  const output = args => execFileSync(process.execPath, [cli,...args], {encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.deepEqual(JSON.parse(output(['--artifact=index','--offset=100','--limit=3'])),packet.index.slice(100,103));
  assert.throws(() => output(['--artifact=deploy']));
  assert.throws(() => output(['--artifact=products','--offset=-1','--limit=1']));
});
