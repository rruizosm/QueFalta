// CE-203 offline owner-review packet. The blind surface contains source facts only:
// no assistant labels, matcher predictions, selection reasons, gold or production writes.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {annotationDecision, LABEL_DIMENSIONS} from './comparator-strict-labels.mjs';
import {buildEditorialAnnotations, loadLabelCorpus, pointerValue} from './comparator-strict-corpus-labels.mjs';
import {buildPotatoReview} from './comparator-strict-potato-review.mjs';
import {buildYogurtReview} from './comparator-strict-yogurt-review.mjs';
import {buildPlusfrescYogurtReview} from './comparator-strict-yogurt-plusfresc.mjs';
import {buildCarrefourYogurtReview} from './comparator-strict-yogurt-carrefour.mjs';
import {buildWaterReview} from './comparator-strict-water-review.mjs';

export const OWNER_REVIEW_VERSION = 'ce203-owner-independent-review-v1';
export const OWNER_REVIEW_DATE = '2026-09-03';
export const OWNER_REVIEWER_PSEUDONYM = 'owner-01';
export const RANDOM_REVIEW_TARGET = 1200;
export const WATER_CLOSURE_RECEIPT = 'docs/comparator-strict/CE-201-202-water-evidence.json';
export const WATER_CLOSURE_RECEIPT_SHA256 = '4a287019b78979867940c77212e58b811d85544d6212538fe593a7b5fc7eacc6';
const EDITORIAL_SPECS = 'docs/comparator-strict/dataset/label-corpus-v1/editorial-specs.json';
const allowedStates = new Set(['compatible', 'incompatible', 'unknown', 'conflicting']);
const allowedPriceStates = new Set(['cheaper', 'equal_or_higher', 'invalid', 'unknown', 'conflicting']);
const allowedDecisions = new Set(['eligible_saving', 'equivalent_no_saving', 'rejected', 'excluded_scope', 'abstain']);
const assert = (ok, why) => { if (!ok) throw Error(`ce203_owner_review_${why}`); };
const unique = xs => [...new Set(xs)];
const counts = xs => Object.fromEntries(unique(xs).sort().map(k => [k, xs.filter(x => x === k).length]));

const SOURCE_POINTERS = [
  '/display_name', '/brand', '/packaging', '/denomination', '/description', '/ingredients',
  '/conservation', '/preparation', '/ean', '/category_name', '/category_id', '/category_ids',
  '/published', '/available', '/synced_at', '/detail_synced_at', '/unit_price', '/price_format',
  '/price_per_unit', '/price_per_unit_unit', '/promo_base_price', '/promo_offer_price',
  '/promo_start', '/promo_end', '/promo_name', '/promo_text', '/regional_prices', '/center_prices',
  '/regions', '/centers', '/raw/name', '/raw/brand', '/raw/measure_unit', '/raw/sell_pack_unit',
  '/raw/units_in_stock', '/raw/parent_category', '/raw/price_instructions', '/raw/has_format',
  '/raw/formats', '/raw/productData/description'
];

const LOCATION_POINTERS = [
  '/store', '/location_id', '/published', '/available', '/synced_at', '/first_seen_at',
  '/unit_price', '/price_format', '/price_per_unit', '/price_per_unit_unit', '/base_unit_price',
  '/promo_base_price', '/promo_price', '/promo_discount', '/promo_start', '/promo_end',
  '/promo_name', '/promo_text', '/promo_type', '/promotion_id', '/offer_id'
];

function safePointer(root, pointer) {
  try { return {found: true, value: pointerValue(root, pointer)}; }
  catch { return {found: false}; }
}

function evidenceFields(raw, observationId, pointers) {
  const fields = [], absent = [];
  for (const pointer of pointers) {
    const result = safePointer(raw, pointer);
    if (!result.found) { absent.push(pointer); continue; }
    fields.push({
      evidence_id: hash([observationId, pointer]),
      pointer,
      presence: result.value === null ? 'null_in_projection' : 'present',
      value: structuredClone(result.value)
    });
  }
  return {fields, absent_fields: absent};
}

function locationRule(store, postcode) {
  if (store === 'plusfresc') return {
    location_id: postcode === '08006' ? '3' : '12',
    mapping: 'exact_in_local_app_map_last_verified_2026-07-16'
  };
  if (store === 'consum' && postcode === '08006') return {
    location_id: '575', mapping: 'province_approximation_not_exact_postcode'
  };
  return {location_id: null, mapping: 'unverified_for_requested_postcode'};
}

function blindLocationEvidence(product, postcode, input) {
  const rule = locationRule(product.store, postcode);
  const observations = rule.location_id === null ? [] : input.locations
    .filter(x => x.product_key === product.key && x.raw.location_id === rule.location_id)
    .map(x => ({
      location_observation_key: x.key,
      captured_at: x.captured_at,
      source: x.source,
      ...evidenceFields(x.raw, x.key, LOCATION_POINTERS)
    }));
  return {postcode, channel: 'retailer_online_catalog', location_mapping: rule, observations};
}

function blindProductEvidence(product, input) {
  assert(product && hash(product.raw) === product.source.raw_sha256, 'product_source_binding');
  return {
    product_key: product.key,
    store: product.store,
    observation_id: product.observation_id,
    captured_at: product.captured_at,
    source: product.source,
    ...evidenceFields(product.raw, product.observation_id, SOURCE_POINTERS),
    postcode_evidence: ['08006', '25001'].map(postcode => blindLocationEvidence(product, postcode, input))
  };
}

function annotationStates(annotation) {
  return Object.fromEntries([
    ...Object.entries(annotation.labels ?? annotation.product_labels ?? {}),
    ...Object.entries(annotation.contexts?.[0]?.labels ?? {})
  ].map(([key, value]) => [key, value.state]));
}

function annotationDecisionValue(annotation) {
  return annotation.contexts?.[0]?.decision ?? annotation.decision;
}

function hasConflictingEvidence(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.state === 'conflicting' || value.relation === 'conflicting') return true;
  return Object.values(value).some(hasConflictingEvidence);
}

function firstAnnotationLayers(input, root) {
  const specs = JSON.parse(readFileSync(`${root}/${EDITORIAL_SPECS}`, 'utf8'));
  const editorial = buildEditorialAnnotations(specs, input)
    .filter(x => x.cohort === 'editorial_subset_of_frozen_corpus');
  const layers = [
    {name: 'editorial', annotations: editorial},
    {name: 'potatoes', annotations: buildPotatoReview(input, undefined, root).annotations},
    {name: 'yogurt-base', annotations: buildYogurtReview(input, undefined, root).annotations},
    {name: 'yogurt-plusfresc', annotations: buildPlusfrescYogurtReview(input, root).annotations},
    {name: 'yogurt-carrefour', annotations: buildCarrefourYogurtReview(input, root).annotations},
    {name: 'water', annotations: buildWaterReview(input, root).annotations}
  ];
  assert(hash(readFileSync(`${root}/${WATER_CLOSURE_RECEIPT}`, 'utf8')) === WATER_CLOSURE_RECEIPT_SHA256, 'closure_receipt_drift');
  assert(hash(layers.map(x => [x.name, x.annotations.length])) === hash([
    ['editorial', 7], ['potatoes', 922], ['yogurt-base', 133],
    ['yogurt-plusfresc', 449], ['yogurt-carrefour', 2011], ['water', 2485]
  ]), 'layer_counts');
  return layers;
}

function buildPopulation(input, root) {
  const final = new Map(), history = new Map();
  for (const layer of firstAnnotationLayers(input, root)) for (const annotation of layer.annotations) {
    if (!history.has(annotation.pair_id)) history.set(annotation.pair_id, []);
    history.get(annotation.pair_id).push({layer: layer.name, annotation});
    final.set(annotation.pair_id, {layer: layer.name, annotation});
  }
  assert(final.size === input.pairs.length && final.size === 6000, 'complete_population');
  const corpus = new Map(input.pairs.map(pair => [hash([pair.left, pair.right]), pair]));
  assert(corpus.size === 6000 && [...final.keys()].every(id => corpus.has(id)), 'population_binding');
  return {final, history, corpus};
}

function disputeReasons(pairId, finalAnnotation, history) {
  const reasons = [];
  if (finalAnnotation.source_dispute) reasons.push('source_dispute');
  if (hasConflictingEvidence(finalAnnotation)) reasons.push('conflicting_evidence');
  const versions = history.get(pairId);
  if (versions.length > 1) {
    const states = versions.map(x => JSON.stringify(annotationStates(x.annotation)));
    const decisions = versions.map(x => annotationDecisionValue(x.annotation));
    if (new Set(states).size > 1 || new Set(decisions).size > 1) reasons.push('annotation_disagreement');
  }
  return reasons;
}

function allocateRandomReview(pairs, seed) {
  const cells = new Map();
  for (const pair of pairs) {
    const cell = `${pair.family}|${pair.cohort}`;
    if (!cells.has(cell)) cells.set(cell, []);
    cells.get(cell).push(pair);
  }
  const allocations = [...cells].map(([cell, values]) => {
    const exact = values.length * RANDOM_REVIEW_TARGET / pairs.length;
    return {cell, population: values.length, exact, take: Math.floor(exact), tie: hash([seed, 'allocation', cell])};
  });
  let remainder = RANDOM_REVIEW_TARGET - allocations.reduce((sum, x) => sum + x.take, 0);
  for (const row of [...allocations].sort((a, b) =>
    (b.exact - b.take) - (a.exact - a.take) || a.tie.localeCompare(b.tie))) {
    if (remainder > 0) { row.take += 1; remainder -= 1; }
  }
  assert(remainder === 0, 'allocation_remainder');
  const selected = new Set();
  for (const allocation of allocations) {
    const ranked = cells.get(allocation.cell).map(pair => ({
      pair_id: hash([pair.left, pair.right]),
      rank: hash([seed, 'random', allocation.cell, hash([pair.left, pair.right])])
    })).sort((a, b) => a.rank.localeCompare(b.rank) || a.pair_id.localeCompare(b.pair_id));
    for (const row of ranked.slice(0, allocation.take)) selected.add(row.pair_id);
  }
  assert(selected.size === RANDOM_REVIEW_TARGET, 'random_target');
  return {
    selected,
    allocations: allocations.sort((a, b) => a.cell.localeCompare(b.cell)).map(({tie, exact, ...x}) => ({
      ...x, allocation_fraction: x.take / (x.population || 1)
    }))
  };
}

function collectEvidenceIds(value, ids = new Set()) {
  if (!value || typeof value !== 'object') return ids;
  if (typeof value.evidence_id === 'string') ids.add(value.evidence_id);
  for (const child of Object.values(value)) collectEvidenceIds(child, ids);
  return ids;
}

export function buildOwnerReview(input = loadLabelCorpus(), root = '.') {
  const {final, history, corpus} = buildPopulation(input, root);
  const seedMaterial = {
    version: OWNER_REVIEW_VERSION,
    corpus_manifest_sha256: input.manifest_sha256,
    ce201_202_closure_receipt_sha256: WATER_CLOSURE_RECEIPT_SHA256
  };
  const selectionSeed = hash(['CE-203', 'owner-independent-review', seedMaterial]);
  const {selected: randomSelected, allocations} = allocateRandomReview([...corpus.values()], selectionSeed);
  const disputeMap = new Map();
  for (const [pairId, {annotation}] of final) {
    const reasons = disputeReasons(pairId, annotation, history);
    if (reasons.length) disputeMap.set(pairId, reasons);
  }
  const selectedIds = new Set([...randomSelected, ...disputeMap.keys()]);
  const ordered = [...selectedIds].map(pairId => ({
    pair_id: pairId,
    case_id: `CE203-${hash([selectionSeed, 'case', pairId]).slice(0, 12).toUpperCase()}`,
    order: hash([selectionSeed, 'blind-order', pairId])
  })).sort((a, b) => a.order.localeCompare(b.order) || a.pair_id.localeCompare(b.pair_id));
  assert(new Set(ordered.map(x => x.case_id)).size === ordered.length, 'case_id_collision');
  const products = new Map(input.products.map(p => [p.key, p]));
  const cases = ordered.map(({order, ...entry}, index) => {
    const pair = corpus.get(entry.pair_id);
    const left = blindProductEvidence(products.get(pair.left), input);
    const right = blindProductEvidence(products.get(pair.right), input);
    const out = {
      schema_version: 1,
      review_version: OWNER_REVIEW_VERSION,
      review_position: index + 1,
      batch: Math.floor(index / 25) + 1,
      case_id: entry.case_id,
      pair_id: entry.pair_id,
      reference_clock: input.queries[0].reference_clock,
      evidence: {left, right},
      review_form: {
        reviewer_pseudonym: OWNER_REVIEWER_PSEUDONYM,
        reviewed_at: null,
        dimensions: Object.fromEntries(LABEL_DIMENSIONS.map(key => [key, null])),
        decision: null,
        reason: '',
        evidence_refs: [],
        needs_arbitration: null
      }
    };
    return {...out, blind_case_sha256: hash(out)};
  });
  const index = cases.map(x => ({
    review_position: x.review_position,
    batch: x.batch,
    case_id: x.case_id,
    pair_id: x.pair_id,
    blind_case_sha256: x.blind_case_sha256
  }));
  const responses = cases.map(x => ({
    schema_version: 1,
    review_version: OWNER_REVIEW_VERSION,
    case_id: x.case_id,
    pair_id: x.pair_id,
    blind_case_sha256: x.blind_case_sha256,
    reviewer_pseudonym: OWNER_REVIEWER_PSEUDONYM,
    reviewed_at: null,
    dimensions: Object.fromEntries(LABEL_DIMENSIONS.map(key => [key, null])),
    decision: null,
    reason: '',
    evidence_refs: [],
    needs_arbitration: null,
    review_status: 'awaiting_owner_blind_review',
    gold_eligible: false
  }));
  const randomDisputeOverlap = [...disputeMap.keys()].filter(id => randomSelected.has(id)).length;
  const selectedPairs = [...selectedIds].map(id => corpus.get(id));
  const report = {
    version: OWNER_REVIEW_VERSION,
    date: OWNER_REVIEW_DATE,
    status: 'blind_owner_review_packet_ready_owner_review_not_started',
    population_pairs: corpus.size,
    random_review_target: RANDOM_REVIEW_TARGET,
    random_review_fraction: RANDOM_REVIEW_TARGET / corpus.size,
    random_stratification: 'proportional_by_family_and_confirmatory_or_challenge_cohort_hamilton_allocation',
    random_allocations: allocations,
    mandatory_disputed_pairs: disputeMap.size,
    mandatory_dispute_reason_occurrences: counts([...disputeMap.values()].flat()),
    random_dispute_overlap: randomDisputeOverlap,
    additional_disputed_pairs: disputeMap.size - randomDisputeOverlap,
    total_blind_review_cases: selectedIds.size,
    total_batches_of_25: Math.ceil(selectedIds.size / 25),
    selected_by_family: counts(selectedPairs.map(x => x.family)),
    selected_by_cohort: counts(selectedPairs.map(x => x.cohort)),
    owner_reviews_completed: 0,
    owner_reviews_pending: selectedIds.size,
    arbitration_completed: 0,
    gold_pairs: 0,
    CE203_complete: false,
    G2_pass: false,
    proposals_or_engine_outputs_in_blind_cases: 0,
    remote_project_calls: 0,
    retailer_calls: 0,
    new_integrations: 0,
    seed_material: seedMaterial,
    selection_seed: selectionSeed,
    hashes: {index: hash(index), cases: hash(cases), response_template: hash(responses)},
    limitation: 'Selection and a blind source-evidence form are ready. The owner has not submitted any review; disputes are not arbitrated, labels are not gold, partitions and G2 remain pending.'
  };
  const audit = {
    random_selected: randomSelected,
    disputes: disputeMap,
    selected_ids: selectedIds,
    final_annotations: final,
    history,
    evidence_ids: new Map(cases.map(x => [x.case_id, collectEvidenceIds(x.evidence)]))
  };
  return {cases, index, responses, report, audit};
}

export function validateOwnerResponse(response, packet) {
  assert(response && typeof response === 'object' && !Array.isArray(response), 'response_object');
  const item = packet.index.find(x => x.case_id === response.case_id);
  assert(item && item.pair_id === response.pair_id && item.blind_case_sha256 === response.blind_case_sha256, 'response_case_binding');
  assert(response.review_version === OWNER_REVIEW_VERSION, 'response_version');
  assert(response.reviewer_pseudonym === OWNER_REVIEWER_PSEUDONYM, 'response_reviewer');
  assert(Number.isFinite(Date.parse(response.reviewed_at)), 'response_date');
  assert(response.dimensions && Object.keys(response.dimensions).sort().join('|') === [...LABEL_DIMENSIONS].sort().join('|'), 'response_dimensions');
  assert(Object.entries(response.dimensions).every(([key, value]) =>
    (key === 'price' ? allowedPriceStates : allowedStates).has(value)), 'response_state');
  assert(allowedDecisions.has(response.decision), 'response_decision');
  assert(annotationDecision(response.dimensions) === response.decision, 'response_decision_coherence');
  assert(typeof response.reason === 'string' && response.reason.trim().length >= 20, 'response_reason');
  assert(Array.isArray(response.evidence_refs) && response.evidence_refs.length > 0 && response.evidence_refs.every(x => packet.audit.evidence_ids.get(response.case_id).has(x)), 'response_evidence');
  assert(typeof response.needs_arbitration === 'boolean', 'response_arbitration');
  for (const forbidden of ['assistant_proposal', 'engine_output', 'selection_reason', 'gold']) assert(!Object.hasOwn(response, forbidden), `response_forbidden_${forbidden}`);
  const {review_status, gold_eligible, ...body} = response;
  assert(review_status === 'owner_blind_review_complete' && gold_eligible === false, 'response_status');
  return {...body, response_sha256: hash(body)};
}

export function validateOwnerResponses(responses, packet) {
  assert(Array.isArray(responses), 'responses_array');
  assert(new Set(responses.map(x => x.case_id)).size === responses.length, 'response_duplicate');
  const validated = responses.map(x => validateOwnerResponse(x, packet));
  return {
    completed: validated.length,
    pending: packet.index.length - validated.length,
    all_blind_reviews_complete: validated.length === packet.index.length,
    CE203_complete: false,
    reason_CE203_stays_open: 'Confrontation with first annotations and arbitration are a separate post-blind step.'
  };
}

const printable = value => value === null ? 'null (seleccionado pero vacío)' : JSON.stringify(value);

function productMarkdown(title, product) {
  return [
    `### ${title}: ${product.store} · ${product.product_key}`,
    '',
    `Captura: ${product.captured_at}. Fuente: \`${product.source.file}\`, fila \`${product.source.pointer}\`.`,
    '',
    ...product.fields.map(field => `- \`${field.pointer}\`: ${printable(field.value)}`),
    '',
    'Contextos de ubicación incluidos en la captura:',
    '',
    ...product.postcode_evidence.flatMap(context => [
      `- CP ${context.postcode}: ${context.location_mapping.mapping}; ${context.observations.length} observación(es).`,
      ...context.observations.flatMap(observation => observation.fields.map(field =>
        `  - \`${field.pointer}\`: ${printable(field.value)}`))
    ])
  ];
}

export function renderBlindReview(cases) {
  return [
    '# CE-203 — Revisión ciega del propietario',
    '',
    'Solo contiene evidencia fuente. No incluye propuestas del asistente, predicciones del motor, motivo de selección ni estado gold.',
    'Para cada caso registra las ocho dimensiones, decisión, motivo y referencias de evidencia. `unknown` es válido y preferible a completar datos ausentes.',
    '',
    ...cases.flatMap(item => [
      `## ${item.review_position}. ${item.case_id}`,
      '',
      `Pareja: \`${item.pair_id}\`. Reloj: ${item.reference_clock}.`,
      '',
      ...productMarkdown('Producto A', item.evidence.left),
      '',
      ...productMarkdown('Producto B', item.evidence.right),
      '',
      '### Respuesta',
      '',
      '- scope:', '- identity:', '- variants:', '- format:', '- price:', '- location:',
      '- availability:', '- catalog:', '- decision:', '- reason:', '- evidence_refs:', '- needs_arbitration:',
      '',
      '---',
      ''
    ])
  ].join('\n');
}
