import {before, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {datasetHash} from '../lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus, buildCorpusLabelDrafts, buildEditorialAnnotations, validateCorpusDrafts} from '../lib/comparator-strict-corpus-labels.mjs';
const dir = 'docs/comparator-strict/dataset/label-corpus-v1';
const json = p => JSON.parse(readFileSync(p, 'utf8'));
let input, packet, manifest, report, editorial, index;
before(() => {
  input = loadLabelCorpus(); packet = buildCorpusLabelDrafts(input);
  manifest = json(`${dir}/manifest.json`); report = json(`${dir}/report.json`); editorial = json(`${dir}/editorial.json`);
  index = readdirSync(dir).sort().filter(f => /^index-\d+\.json$/.test(f)).flatMap(f => json(`${dir}/${f}`));
});
test('frozen source manifest and all annotation code/spec hashes match', () => {
  assert.equal(datasetHash(readFileSync(manifest.corpus_manifest.path, 'utf8')), manifest.corpus_manifest.sha256);
  for (const f of manifest.code_and_editorial_sources) assert.equal(datasetHash(readFileSync(f.path, 'utf8')), f.sha256, f.path);
  assert.deepEqual(manifest.report, report);
  for (const kind of ['products', 'locations', 'annotations']) assert.equal(datasetHash(packet[kind]), report.hashes[kind]);
});
test('6000 drafts and compact index preserve pairs, cohorts and source observations', () => {
  assert.equal(index.length, 6000); assert.equal(new Set(index.map(a => a.id)).size, 6000);
  assert.equal(datasetHash(index), report.index_sha256);
  const expected = packet.annotations.map(a => ({id: a.annotation_id, left: a.left, right: a.right, cohort: a.cohort,
    states: Object.fromEntries(Object.entries(a.product_labels).map(([k, v]) => [k, v.state])), decision_draft: a.contexts[0].decision,
    editorial_id: editorial.find(e => e.pair_id === a.pair_id)?.id ?? null}));
  assert.deepEqual(index, expected); assert.equal(packet.products.length, 1893);
  assert.equal(validateCorpusDrafts(packet, input), true);
});
test('drafts are not silently promoted to first reviews, gold, independent tests or extra queries', () => {
  for (const a of packet.annotations) {
    assert.equal(a.annotation_status, 'requires_first_semantic_review'); assert.equal(a.gold_eligible, false);
    assert.equal(a.independent_review_completed, false); assert.equal(a.contexts.length, 2);
    for (const c of a.contexts) for (const dimension of ['price', 'location', 'availability', 'catalog']) assert.equal(c.labels[dimension].state, 'unknown');
  }
  assert.equal(report.unique_CE200_queries_unchanged, 1200); assert.equal(report.underlying_origins_unchanged, 600);
  assert.equal(report.postcode_assessments, 12000); assert.equal(report.CE201_complete, false); assert.equal(report.CE202_complete, false); assert.equal(report.G2_pass, false);
});
test('20 editorial annotations exactly regenerate and do not inflate the CE200 sample', () => {
  const expected = buildEditorialAnnotations(json(`${dir}/editorial-specs.json`), input);
  assert.deepEqual(editorial, expected); assert.equal(datasetHash(editorial), report.editorial_sha256);
  assert.equal(editorial.length, 20); assert.equal(report.editorial_within_frozen_corpus, 7); assert.equal(report.editorial_supplemental_challenges, 13);
  assert.equal(report.first_semantic_reviews, 7); assert.equal(report.drafts_pending_first_semantic_review, 5993);
  for (const e of editorial) { assert.equal(e.gold_eligible, false); assert.equal(e.review_status, 'awaiting_owner_independent_review'); }
});
test('actual 6×125 Greek pairs have positive format but no approved variant or saving', () => {
  for (const id of ['E01', 'E02', 'E03', 'E04']) {
    const e = editorial.find(e => e.id === id); assert.equal(e.labels.format.state, 'compatible'); assert.equal(e.labels.variants.state, 'unknown'); assert.equal(e.decision, 'abstain');
    const pi = e.citations.find(c => c.pointer === '/raw/price_instructions').value;
    assert.equal(pi.total_units, 6); assert.equal(pi.pack_size, 0.125); assert.equal(pi.unit_size, 0.75);
  }
});
test('actual 2kg vs 1kg/500g and same-pack different-flavour are explicit editorial negatives', () => {
  for (const id of ['E08', 'E09']) { const e = editorial.find(e => e.id === id); assert.equal(e.labels.format.state, 'incompatible'); assert.equal(e.decision, 'rejected'); }
  const e = editorial.find(e => e.id === 'E07'); assert.equal(e.labels.format.state, 'compatible'); assert.equal(e.labels.variants.state, 'incompatible'); assert.equal(e.decision, 'rejected');
});
test('actual selector, sugar contradiction, 6/8 count and quantity-role cases abstain explicitly', () => {
  for (const id of ['E10', 'E12', 'E13', 'E14', 'E15', 'E19']) assert.equal(editorial.find(e => e.id === id).decision, 'abstain');
  assert.equal(editorial.find(e => e.id === 'E12').labels.variants.state, 'conflicting');
  assert.equal(editorial.find(e => e.id === 'E13').labels.format.state, 'conflicting');
  assert.equal(editorial.find(e => e.id === 'E19').labels.format.state, 'unknown');
});
test('historical seed, pilot and sources remain byte-identical to their evidence', () => {
  for (const f of json('docs/comparator-strict/CE-200-evidence.json').files) assert.equal(datasetHash(readFileSync(f.path, 'utf8')), f.sha256, f.path);
  const old = json('docs/comparator-strict/dataset/label-pilot-v1/report.json');
  for (const f of old.source_files) assert.equal(datasetHash(readFileSync(f.path, 'utf8')), f.sha256, f.path);
});
