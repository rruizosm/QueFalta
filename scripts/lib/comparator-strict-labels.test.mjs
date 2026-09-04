import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {datasetHash} from './comparator-strict-dataset.mjs';
import {LABEL_DIMENSIONS, LABEL_GUIDE_VERSION, annotationDecision, buildAnnotationPacket,
  validateAnnotation, annotationReport, evidenceRef, buildSyntheticLabelCases} from './comparator-strict-labels.mjs';

const root = new URL('../../', import.meta.url);
const dir = 'docs/comparator-strict/dataset/label-pilot-v1/';
const read = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const data = {products: read('docs/comparator-strict/dataset/seed-v1/products.json'),
  pairs: read('docs/comparator-strict/dataset/seed-v1/pairs.json')};
const specs = read(dir + 'real-case-specs.json');
const synthetic = read(dir + 'contract-case-specs.json');
const legacyPath = 'docs/comparator-strict/fixtures/contract-cases-v1.json';
const legacyText = readFileSync(new URL(legacyPath, root), 'utf8');
const legacy = JSON.parse(legacyText);
const provenance = {path: legacyPath, sha256: datasetHash(legacyText)};
const packet = () => buildAnnotationPacket(specs, data);
const contracts = () => buildSyntheticLabelCases(synthetic, legacy, provenance);
const allKnown = () => Object.fromEntries(LABEL_DIMENSIONS.map(k => [k, k === 'price' ? 'cheaper' : 'compatible']));
const rebind = r => { r.annotation_id = datasetHash([LABEL_GUIDE_VERSION, r.target]); return r; };

test('CE-201/202: 22 real proposals, no real approved positives or representative gold', () => {
  const rows = packet(), report = annotationReport(rows);
  assert.equal(report.proposals, 22); assert.equal(report.unique_pairs, 22);
  assert.deepEqual(report.decisions, {eligible_saving: 0, equivalent_no_saving: 0, rejected: 8, abstain: 5, excluded_scope: 9});
  assert.equal(report.confirmatory_pairs, 0); assert.equal(report.reviewed_gold_pairs, 0);
  assert.equal(report.CE203_completed, false); assert.equal(report.G2_pass, false);
  assert.ok(rows.every(r => r.authorship === 'assistant_proposal' && !r.gold_eligible));
});

test('observations, directions, CP and source quotes are preserved without mutating inputs', () => {
  const before = datasetHash({data, specs});
  for (const r of packet()) {
    assert.equal(validateAnnotation(r, data), true);
    assert.equal(r.target.postcode, '08006');
    assert.equal(r.target.reference_clock, '2026-09-03T08:08:57.223041+00:00');
    assert.ok(Object.values(r.labels).every(l => l.reason.length > 0));
  }
  assert.equal(datasetHash({data, specs}), before);
  assert.equal(packet().find(r => r.case_id === 'R10').target.candidate_key, 'plusfresc:000599');
});

test('natural is not silently labelled unsweetened, including when pack already rejects', () => {
  for (const id of ['R14', 'R20']) {
    const r = packet().find(r => r.case_id === id);
    assert.equal(r.labels.format.state, 'incompatible');
    assert.equal(r.labels.variants.state, 'unknown');
    assert.equal(r.decision, 'rejected');
  }
  assert.equal(packet().find(r => r.case_id === 'R19').labels.variants.state, 'incompatible');
});

test('matching mentioned volume, prefried titles and infant labels do not prove complete format/identity', () => {
  for (const id of ['R11', 'R12', 'R13', 'R18', 'R21']) {
    const r = packet().find(r => r.case_id === id);
    assert.equal(r.decision, 'abstain');
    assert.equal(r.labels.format.state, 'unknown');
  }
});

test('a single unknown mandatory dimension blocks an otherwise compatible annotation', () => {
  for (const dimension of LABEL_DIMENSIONS) {
    const states = allKnown(); states[dimension] = 'unknown';
    assert.equal(annotationDecision(states), 'abstain', dimension);
  }
  assert.equal(annotationDecision(allKnown()), 'eligible_saving');
  assert.equal(annotationDecision({...allKnown(), price: 'equal_or_higher'}), 'equivalent_no_saving');
});

test('conflicts remain abstentions even with same identifier or another mismatch', () => {
  for (const dimension of LABEL_DIMENSIONS) {
    assert.equal(annotationDecision({...allKnown(), format: 'incompatible', [dimension]: 'conflicting'}), 'abstain');
  }
  assert.equal(annotationDecision({...allKnown(), format: 'incompatible'}), 'rejected');
  assert.equal(annotationDecision({...allKnown(), scope: 'incompatible'}), 'excluded_scope');
  assert.equal(annotationDecision({...allKnown(), price: 'invalid'}), 'rejected');
});

test('missing dimensions, false/NA defaults, extra fields and unknown states are denied', () => {
  const incomplete = allKnown(); delete incomplete.variants;
  for (const states of [incomplete, {...allKnown(), surprise: 'compatible'},
    {...allKnown(), variants: false}, {...allKnown(), variants: 'not_applicable'}, {...allKnown(), price: 'compatible'}]) {
    assert.throws(() => annotationDecision(states), /ce202_/);
  }
  const r = packet()[0]; delete r.labels.identity;
  assert.throws(() => validateAnnotation(r, data), /dimensions/);
});

test('invented, edited, unrelated and duplicate source citations are denied', () => {
  const mutations = [r => r.labels.scope.evidence[0].value = 'inventado',
    r => r.labels.scope.evidence[0].field = 'not_selected',
    r => r.labels.scope.evidence[0].product_key = 'plusfresc:000599',
    r => r.labels.scope.evidence[0].observation_id = 'old-observation',
    r => r.labels.scope.evidence.push(structuredClone(r.labels.scope.evidence[0])),
    r => r.labels.scope.evidence[0].raw_sha256 = '0'.repeat(64)];
  for (const mutate of mutations) { const r = packet()[0]; mutate(r); assert.throws(() => validateAnnotation(r, data)); }
});

test('assertions need quotes and comparisons need both products, not only the candidate', () => {
  const r = packet()[0]; r.labels.scope.evidence = [];
  assert.throws(() => validateAnnotation(r, data), /evidence_required/);
  const p = packet().find(r => r.case_id === 'R10'); p.labels.format.evidence.pop();
  assert.throws(() => validateAnnotation(p, data), /bilateral_evidence/);
  const c = packet()[0]; c.labels.scope.state = 'compatible';
  assert.throws(() => validateAnnotation(c, data), /bilateral_evidence/);
});

test('null projection fields cannot support a known positive or negative', () => {
  const r = packet().find(r => r.case_id === 'R10');
  const p = data.products.find(p => p.product_key === r.target.candidate_key);
  r.labels.format.evidence[1] = evidenceRef(p, 'packaging');
  assert.throws(() => validateAnnotation(r, data), /empty_evidence/);
  assert.throws(() => evidenceRef(p, 'field_not_selected'), /missing_source_field/);
});

test('numeric prices and published flags cannot upgrade absent commercial source evidence', () => {
  for (const dimension of ['price', 'location', 'availability', 'catalog']) {
    const r = packet().find(r => r.case_id === 'R11');
    r.labels[dimension] = {state: dimension === 'price' ? 'cheaper' : 'compatible', reason: 'Incorrect promotion',
      evidence: [r.target.origin_key, r.target.candidate_key].map(key =>
        evidenceRef(data.products.find(p => p.product_key === key), dimension === 'price' ? 'unit_price' : 'published'))};
    assert.throws(() => validateAnnotation(r, data), /seed_commercial_evidence_absent/);
  }
});

test('human approval, predictions, gold promotion and inconsistent final decisions are denied', () => {
  const mutations = [r => r.review_status = 'approved_by_owner', r => r.authorship = 'human',
    r => r.gold_eligible = true, r => r.model_score = 0.99, r => r.decision = 'eligible_saving',
    r => r.cohort = 'confirmatory'];
  for (const mutate of mutations) { const r = packet()[0]; mutate(r); assert.throws(() => validateAnnotation(r, data)); }
});

test('changing direction, observation, CP or replay clock invalidates its annotation identity', () => {
  const mutations = [r => r.target.postcode = 8006, r => r.target.postcode = '08001',
    r => r.target.origin_observation = 'other', r => r.target.reference_clock = '2026-09-04T00:00:00Z',
    r => r.target.origin_key = r.target.candidate_key, r => r.target.channel = 'global'];
  for (const mutate of mutations) { const r = packet()[0]; mutate(r); rebind(r); assert.throws(() => validateAnnotation(r, data)); }
  const r = packet()[0]; r.target.postcode = '25001';
  assert.throws(() => validateAnnotation(r, data), /annotation_id/);
});

test('source raw mutation and malformed pair identity are detected', () => {
  const altered = structuredClone(data);
  altered.products.find(p => p.product_key === specs[0].candidate).raw.display_name = 'Otro producto';
  assert.throws(() => validateAnnotation(packet()[0], altered), /source_hash/);
  const r = packet()[0]; r.target.pair_id = 'other'; rebind(r);
  assert.throws(() => validateAnnotation(r, data), /observation_binding/);
});

test('packet duplicates, unknown products, evidence sides and overlarge packets are denied', () => {
  assert.throws(() => buildAnnotationPacket([specs[0], specs[0]], data), /duplicate_annotation/);
  assert.throws(() => buildAnnotationPacket(Array(101).fill(specs[0]), data), /packet_limit/);
  assert.throws(() => buildAnnotationPacket([{...specs[0], candidate: 'missing'}], data), /unknown_product/);
  const spec = structuredClone(specs[0]); spec.assertions.scope.refs[0][0] = 'other';
  assert.throws(() => buildAnnotationPacket([spec], data), /evidence_side/);
});

test('replicating a pair in another CP does not increase unique commercial pair count', () => {
  const rows = buildAnnotationPacket([specs[0], {...specs[0], id: 'R01-other-CP', postcode: '25001'}], data);
  assert.equal(annotationReport(rows).proposals, 2);
  assert.equal(annotationReport(rows).unique_pairs, 1);
  assert.equal(annotationReport(rows).confirmatory_pairs, 0);
});

test('56 synthetic editorial cases reuse all 32 F1 cases and cover T01–T29 without claiming engine tests', () => {
  const rows = contracts(); assert.equal(rows.length, 56);
  assert.equal(rows.filter(r => r.historical_fixture).length, 32);
  const ids = new Set(rows.flatMap(r => r.regressions));
  for (let i = 1; i <= 29; i++) assert.ok(ids.has(`T${String(i).padStart(2, '0')}`));
  for (const row of rows) {
    assert.equal(row.synthetic, true); assert.equal(row.gold_eligible, false);
    assert.equal(row.engine_output, null);
    assert.equal(annotationDecision(row.states), row.expected_decision);
  }
});

test('F1 ambiguities have explicit clarifications without rewriting the historical source', () => {
  const rows = contracts();
  assert.equal(rows.find(r => r.case_id === 'S07').states.variants, 'incompatible');
  assert.match(rows.find(r => r.case_id === 'S07').clarification, /evidencia independiente/);
  assert.equal(rows.find(r => r.case_id === 'S34').states.variants, 'unknown');
  const conflict = rows.find(r => r.case_id === 'S24');
  assert.equal(conflict.historical_fixture.expected.equivalence, 'not_equivalent');
  assert.equal(conflict.expected_decision, 'abstain');
  assert.equal(datasetHash(readFileSync(new URL(legacyPath, root), 'utf8')), provenance.sha256);
});

test('synthetic artifacts cannot omit old fixtures, duplicate, invent legacy IDs or change expectations silently', () => {
  const mutations = [s => s.cases.pop(), s => s.cases.shift(), s => s.cases[0].legacy_id = 'absent',
    s => s.cases.push(s.cases[0]), s => s.cases[0].expected = 'rejected', s => s.synthetic = false];
  // Removing a new optional case is valid; removing a legacy case is not.
  const valid = structuredClone(synthetic); mutations.shift()(valid);
  assert.equal(buildSyntheticLabelCases(valid, legacy, provenance).length, 55);
  for (const mutate of mutations) { const s = structuredClone(synthetic); mutate(s); assert.throws(() => buildSyntheticLabelCases(s, legacy, provenance)); }
});

test('age alone remains compatible in hypothetical contracts, without a hidden 24h/7day TTL', () => {
  for (const id of ['S31', 'S55']) assert.equal(contracts().find(r => r.case_id === id).expected_decision, 'eligible_saving');
  assert.equal(contracts().find(r => r.case_id === 'S52').expected_decision, 'rejected');
});

test('checked-in annotations and synthetic overlay regenerate as identical JSON values', () => {
  assert.deepEqual(read(dir + 'annotations.json'), packet());
  assert.deepEqual(read(dir + 'contracts.json'), contracts());
});

test('CLI is offline, reproducible, rejects unapproved options and does not require environment credentials', () => {
  const cli = new URL('../prepare-comparator-strict-labels.mjs', import.meta.url);
  const stdout = execFileSync(process.execPath, [cli.pathname], {env: {}, encoding: 'utf8'});
  const report = JSON.parse(stdout);
  assert.equal(report.remote_project_calls, 0); assert.equal(report.data_sha256, annotationReport(packet()).data_sha256);
  assert.deepEqual(report, read(dir + 'report.json'));
  assert.throws(() => execFileSync(process.execPath, [cli.pathname, '--apply'], {env: {}, stdio: 'pipe'}));
  const review = execFileSync(process.execPath, [cli.pathname, '--artifact=review'], {env: {}, encoding: 'utf8'});
  assert.equal(review, readFileSync(new URL(dir + 'review.md', root), 'utf8'));
  for (const artifact of ['annotations', 'contracts']) {
    const generated = execFileSync(process.execPath, [cli.pathname, `--artifact=${artifact}`], {env: {}, encoding: 'utf8'});
    assert.equal(generated, readFileSync(new URL(dir + artifact + '.json', root), 'utf8'));
  }
});
