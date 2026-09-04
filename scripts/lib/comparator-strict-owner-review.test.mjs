import test from 'node:test';
import assert from 'node:assert/strict';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {loadLabelCorpus, pointerValue} from './comparator-strict-corpus-labels.mjs';
import {
  buildOwnerReview,
  OWNER_REVIEWER_PSEUDONYM,
  OWNER_REVIEW_VERSION,
  renderBlindReview,
  validateOwnerResponse,
  validateOwnerResponses
} from './comparator-strict-owner-review.mjs';

const input = loadLabelCorpus();
const packet = buildOwnerReview(input);
const originalProducts = new Map(input.products.map(x => [x.key, x]));

test('CE-203 draw is an exact reproducible 20 percent plus every disputed pair', () => {
  assert.equal(packet.report.population_pairs, 6000);
  assert.equal(packet.report.random_review_target, 1200);
  assert.equal(packet.report.random_review_fraction, 0.2);
  assert.equal(packet.audit.random_selected.size, 1200);
  assert.equal(packet.audit.disputes.size, 175);
  assert.equal(packet.report.random_dispute_overlap, 39);
  assert.equal(packet.report.additional_disputed_pairs, 136);
  assert.equal(packet.audit.selected_ids.size, 1336);
  assert.equal(packet.report.total_blind_review_cases, 1336);
  assert.equal(packet.report.total_batches_of_25, 54);
  assert.equal(packet.report.selection_seed, '57eb418dad5f506e53236c211b177425c6c2964b0797fb14988add4435ee81d7');
  assert.equal(packet.report.random_allocations.reduce((sum, x) => sum + x.population, 0), 6000);
  assert.equal(packet.report.random_allocations.reduce((sum, x) => sum + x.take, 0), 1200);
  for (const id of packet.audit.disputes.keys()) assert(packet.audit.selected_ids.has(id));
  assert.deepEqual(packet.report.mandatory_dispute_reason_occurrences, {
    annotation_disagreement: 6, conflicting_evidence: 117, source_dispute: 146
  });
});

test('blind order and index are unique, stable and contain no selection reasons', () => {
  assert.equal(packet.index.length, 1336);
  assert.equal(new Set(packet.index.map(x => x.case_id)).size, 1336);
  assert.equal(new Set(packet.index.map(x => x.pair_id)).size, 1336);
  assert.deepEqual(packet.index[0], {
    review_position: 1,
    batch: 1,
    case_id: 'CE203-79260E7AD071',
    pair_id: '9f6c898e401b127326dce84e9379dcf30811c278648ea946e6c7f7d81ac1cca2',
    blind_case_sha256: '547655bcf9c47d0d8d08d5fdfdb1d8867c22895d2dbb1dc9e48b855098fdb26a'
  });
  const forbidden = new Set(['source_dispute', 'selection_reason', 'cohort', 'family', 'challenge_reason',
    'stratum', 'first_annotation', 'assistant_proposal', 'engine_output', 'annotation_id', 'review_id']);
  const walk = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert(!forbidden.has(key), `blind key leaked: ${key}`);
      walk(child);
    }
  };
  for (const item of packet.cases) walk(item);
  assert.equal(packet.report.proposals_or_engine_outputs_in_blind_cases, 0);
  assert.equal(packet.report.owner_reviews_completed, 0);
  assert.equal(packet.report.CE203_complete, false);
  assert.equal(packet.report.G2_pass, false);
});

test('every blind fact is bound to the frozen raw observation without inferred labels', () => {
  for (const item of packet.cases) for (const side of ['left', 'right']) {
    const evidence = item.evidence[side], original = originalProducts.get(evidence.product_key);
    assert(original);
    assert.equal(evidence.observation_id, original.observation_id);
    assert.equal(hash(original.raw), original.source.raw_sha256);
    assert.deepEqual(evidence.source, original.source);
    for (const field of evidence.fields) {
      assert.equal(field.evidence_id, hash([original.observation_id, field.pointer]));
      assert.deepEqual(field.value, pointerValue(original.raw, field.pointer));
      assert.equal(field.presence, field.value === null ? 'null_in_projection' : 'present');
    }
    for (const pointer of evidence.absent_fields) assert.throws(() => pointerValue(original.raw, pointer));
  }
});

test('blank response templates never impersonate an owner review or create gold', () => {
  assert.equal(packet.responses.length, 1336);
  for (const response of packet.responses) {
    assert.equal(response.reviewer_pseudonym, OWNER_REVIEWER_PSEUDONYM);
    assert.equal(response.reviewed_at, null);
    assert(Object.values(response.dimensions).every(x => x === null));
    assert.equal(response.decision, null);
    assert.equal(response.review_status, 'awaiting_owner_blind_review');
    assert.equal(response.gold_eligible, false);
  }
  assert.equal(packet.report.gold_pairs, 0);
});

test('owner response validation requires complete coherent labels and cited blind evidence', () => {
  const response = structuredClone(packet.responses[0]);
  response.reviewed_at = '2026-09-03T20:00:00.000Z';
  response.dimensions = Object.fromEntries(Object.keys(response.dimensions).map(key => [key, 'unknown']));
  response.decision = 'abstain';
  response.reason = 'La evidencia proyectada no acredita todas las dimensiones obligatorias.';
  response.evidence_refs = [packet.cases[0].evidence.left.fields[0].evidence_id];
  response.needs_arbitration = false;
  response.review_status = 'owner_blind_review_complete';
  const validated = validateOwnerResponse(response, packet);
  assert.equal(validated.case_id, response.case_id);
  assert.equal(typeof validated.response_sha256, 'string');
  assert.deepEqual(validateOwnerResponses([response], packet), {
    completed: 1,
    pending: 1335,
    all_blind_reviews_complete: false,
    CE203_complete: false,
    reason_CE203_stays_open: 'Confrontation with first annotations and arbitration are a separate post-blind step.'
  });
  for (const mutate of [
    x => { x.decision = 'eligible_saving'; },
    x => { x.evidence_refs = []; },
    x => { x.reviewer_pseudonym = '@rruizosma'; },
    x => { x.assistant_proposal = 'abstain'; }
  ]) {
    const invalid = structuredClone(response); mutate(invalid);
    assert.throws(() => validateOwnerResponse(invalid, packet));
  }
  assert.throws(() => validateOwnerResponses([response, response], packet));
});

test('rendered batch is source-only and does not expose hidden annotation values', () => {
  const rendered = renderBlindReview(packet.cases.slice(0, 2));
  assert.match(rendered, /CE203-79260E7AD071/);
  assert.match(rendered, /Yogur griego bicapa de maracuyá/);
  assert.doesNotMatch(rendered, /source_dispute|selection_reason|challenge_reason|annotation_id|review_id/);
  const hidden = packet.audit.final_annotations.get(packet.index[0].pair_id).annotation;
  assert(!rendered.includes(hidden.annotation_id));
});

test('versioned hashes freeze blind cases, index and untouched response template', () => {
  assert.equal(OWNER_REVIEW_VERSION, 'ce203-owner-independent-review-v1');
  assert.equal(hash(packet.index), packet.report.hashes.index);
  assert.equal(hash(packet.cases), packet.report.hashes.cases);
  assert.equal(hash(packet.responses), packet.report.hashes.response_template);
});
