// CE-201/202: OFFLINE annotation integrity, not a product matcher or a gold oracle.
// Relationships below are supplied by an annotator, never inferred from titles.
import {DATASET_POSTCODES, datasetHash} from './comparator-strict-dataset.mjs';

export const LABEL_GUIDE_VERSION = 'ce202-v1';
export const LABEL_DIMENSIONS = Object.freeze([
  'scope', 'identity', 'variants', 'format', 'price', 'location', 'availability', 'catalog',
]);
export const LABEL_STATES = Object.freeze(['compatible', 'incompatible', 'unknown', 'conflicting']);
const PRICE_STATES = ['cheaper', 'equal_or_higher', 'invalid', 'unknown', 'conflicting'];
const requiredText = value => typeof value === 'string' && value.trim().length > 0;
const fail = code => { throw new Error(`ce202_${code}`); };
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');

function validateStates(states) {
  if (!exactKeys(states, LABEL_DIMENSIONS)) fail('dimensions');
  for (const name of LABEL_DIMENSIONS) {
    if (!(name === 'price' ? PRICE_STATES : LABEL_STATES).includes(states[name])) fail('state');
  }
}

// Only checks consistency of an annotation. A returned value is NOT engine output.
export function annotationDecision(states) {
  validateStates(states);
  if (Object.values(states).includes('conflicting')) return 'abstain';
  if (states.scope === 'incompatible') return 'excluded_scope';
  if (Object.entries(states).some(([key, value]) => key !== 'scope' && value === 'incompatible')
    || states.price === 'invalid') return 'rejected';
  if (Object.values(states).includes('unknown')) return 'abstain';
  return states.price === 'cheaper' ? 'eligible_saving' : 'equivalent_no_saving';
}

export function evidenceRef(product, field) {
  if (!Object.hasOwn(product.raw, field)) fail('missing_source_field');
  return {product_key: product.product_key, observation_id: product.observation_id,
    raw_sha256: product.raw_sha256, field, value: structuredClone(product.raw[field])};
}

const statesOf = labels => Object.fromEntries(LABEL_DIMENSIONS.map(key => [key, labels[key]?.state]));

export function validateAnnotation(record, {products, pairs}) {
  if (!exactKeys(record, ['schema_version', 'annotation_id', 'case_id', 'guide_version', 'target',
    'cohort', 'authorship', 'review_status', 'gold_eligible', 'labels', 'decision', 'reason', 'regressions'])
    || record.schema_version !== 1 || record.guide_version !== LABEL_GUIDE_VERSION
    || record.cohort !== 'exploratory_exposed' || record.authorship !== 'assistant_proposal'
    || record.review_status !== 'awaiting_independent_review' || record.gold_eligible !== false
    || !requiredText(record.case_id) || !requiredText(record.reason)
    || !Array.isArray(record.regressions) || !record.regressions.length
    || !record.regressions.every(id => /^T\d{2}$/.test(id))) fail('record');
  const t = record.target;
  if (!exactKeys(t, ['pair_id', 'origin_key', 'candidate_key', 'origin_observation',
    'candidate_observation', 'postcode', 'channel', 'reference_clock'])
    || !DATASET_POSTCODES.includes(t.postcode) || t.channel !== 'online') fail('target');
  const origin = products.find(p => p.product_key === t.origin_key);
  const candidate = products.find(p => p.product_key === t.candidate_key);
  const keys = [t.origin_key, t.candidate_key].sort();
  const pair = pairs.find(p => p.pair_id === t.pair_id);
  if (!origin || !candidate || origin.store === candidate.store || !pair
    || pair.left_key !== keys[0] || pair.right_key !== keys[1]
    || t.pair_id !== datasetHash(keys) || t.origin_observation !== origin.observation_id
    || t.candidate_observation !== candidate.observation_id
    || t.reference_clock !== origin.captured_at || t.reference_clock !== candidate.captured_at
    || !Number.isFinite(Date.parse(t.reference_clock))) fail('observation_binding');
  for (const p of [origin, candidate]) {
    if (datasetHash(p.raw) !== p.raw_sha256
      || datasetHash([p.product_key, p.captured_at, p.raw_sha256]) !== p.observation_id) fail('source_hash');
  }
  if (record.annotation_id !== datasetHash([LABEL_GUIDE_VERSION, t])) fail('annotation_id');
  if (!exactKeys(record.labels, LABEL_DIMENSIONS)) fail('dimensions');
  const states = statesOf(record.labels);
  validateStates(states);
  for (const dimension of LABEL_DIMENSIONS) {
    const label = record.labels[dimension];
    if (!exactKeys(label, ['state', 'reason', 'evidence']) || !requiredText(label.reason)
      || !Array.isArray(label.evidence)) fail('label');
    const known = !['unknown', 'conflicting'].includes(label.state);
    if ((known || label.state === 'conflicting') && !label.evidence.length) fail('evidence_required');
    const sides = new Set();
    const seen = new Set();
    for (const ref of label.evidence) {
      if (!exactKeys(ref, ['product_key', 'observation_id', 'raw_sha256', 'field', 'value'])) fail('evidence_shape');
      const p = [origin, candidate].find(row => row.product_key === ref.product_key);
      if (!p || ref.observation_id !== p.observation_id || ref.raw_sha256 !== p.raw_sha256
        || !Object.hasOwn(p.raw, ref.field) || datasetHash(ref.value) !== datasetHash(p.raw[ref.field])) fail('evidence_mismatch');
      if (known && (ref.value === null || ref.value === '')) fail('empty_evidence');
      const key = `${ref.product_key}/${ref.field}`;
      if (seen.has(key)) fail('duplicate_evidence');
      seen.add(key); sides.add(p.product_key);
    }
    if (['compatible', 'cheaper', 'equal_or_higher'].includes(label.state) && sides.size !== 2) fail('bilateral_evidence');
    if (['identity', 'variants', 'format'].includes(dimension) && label.state === 'incompatible'
      && sides.size !== 2) fail('bilateral_evidence');
    // This particular projection has no CP/channel, stock or catalog-revision evidence.
    // Numeric global prices and published=true cannot promote an exploratory snapshot.
    if (['price', 'location', 'availability', 'catalog'].includes(dimension)
      && label.state !== 'unknown') fail('seed_commercial_evidence_absent');
  }
  if (record.decision !== annotationDecision(states)) fail('decision_inconsistent');
  return true;
}

const unknownReasons = {
  scope: 'No se ha verificado la pertenencia de ambos productos al piloto; una pista léxica no basta.',
  identity: 'No se han comprobado todos los atributos de identidad/subtipo en ambos lados.',
  variants: 'Faltan atributos obligatorios o evidencia negativa explícita; ausencia de palabras no implica false.',
  format: 'Falta una firma completa verificada: modo de venta, conteo, contenido unitario, total y composición.',
  price: 'Precios globales del snapshot sin ámbito comercial verificado; no acreditan ahorro local.',
  location: 'La proyección no demuestra servicio/precio para este CP y canal en ambos lados.',
  availability: 'published=true no acredita disponibilidad en la ubicación.',
  catalog: 'No se exportaron revisiones completas compatibles de producto, precio y ámbito.',
};

export function buildAnnotationPacket(specs, dataset) {
  if (!Array.isArray(specs) || specs.length > 100) fail('packet_limit');
  const records = specs.map(spec => {
    const origin = dataset.products.find(p => p.product_key === spec.origin);
    const candidate = dataset.products.find(p => p.product_key === spec.candidate);
    if (!origin || !candidate) fail('unknown_product');
    const target = {pair_id: datasetHash([spec.origin, spec.candidate].sort()),
      origin_key: spec.origin, candidate_key: spec.candidate,
      origin_observation: origin.observation_id, candidate_observation: candidate.observation_id,
      postcode: spec.postcode ?? '08006', channel: 'online', reference_clock: origin.captured_at};
    const labels = Object.fromEntries(LABEL_DIMENSIONS.map(key => [key,
      {state: 'unknown', reason: unknownReasons[key], evidence: []}]));
    for (const [dimension, assertion] of Object.entries(spec.assertions)) {
      if (!LABEL_DIMENSIONS.includes(dimension)) fail('dimension');
      labels[dimension] = {state: assertion.state, reason: assertion.reason,
        evidence: assertion.refs.map(([side, field]) => {
          if (!['origin', 'candidate'].includes(side)) fail('evidence_side');
          return evidenceRef(side === 'origin' ? origin : candidate, field);
        })};
    }
    // expected is manually authored in the specification, not computed from labels.
    const record = {schema_version: 1, annotation_id: datasetHash([LABEL_GUIDE_VERSION, target]),
      case_id: spec.id, guide_version: LABEL_GUIDE_VERSION, target,
      cohort: 'exploratory_exposed', authorship: 'assistant_proposal',
      review_status: 'awaiting_independent_review', gold_eligible: false,
      labels, decision: spec.expected, reason: spec.reason, regressions: spec.regressions};
    validateAnnotation(record, dataset);
    return record;
  });
  if (new Set(records.map(r => r.annotation_id)).size !== records.length
    || new Set(records.map(r => r.case_id)).size !== records.length) fail('duplicate_annotation');
  return records;
}

export function annotationReport(records) {
  return {tasks: ['CE-201', 'CE-202'], status: 'in_progress_exploratory_proposals_only',
    proposals: records.length, unique_pairs: new Set(records.map(r => r.target.pair_id)).size,
    decisions: Object.fromEntries(['eligible_saving', 'equivalent_no_saving', 'rejected', 'abstain', 'excluded_scope']
      .map(key => [key, records.filter(r => r.decision === key).length])),
    reviewed_gold_pairs: 0, confirmatory_pairs: 0, CE203_completed: false, G2_pass: false,
    data_sha256: datasetHash(records), engine_evaluated: false};
}

export function buildSyntheticLabelCases(spec, legacy, provenance) {
  if (spec?.schema_version !== 1 || spec.synthetic !== true || legacy?.synthetic !== true
    || !requiredText(spec.baseline_premises) || !Array.isArray(spec.cases)
    || spec.cases.length > 100 || !/^[a-f0-9]{64}$/.test(provenance?.sha256 ?? '')
    || !requiredText(provenance?.path)) fail('synthetic_source');
  validateStates(spec.baseline_states);
  const originals = [...legacy.cases, ...legacy.price_and_freshness_scenarios];
  const reused = new Set();
  const result = spec.cases.map(row => {
    const old = row.legacy_id ? originals.find(c => c.id === row.legacy_id) : null;
    if (!requiredText(row.id) || !requiredText(row.note) || !Array.isArray(row.regressions)
      || !row.regressions.length || !row.regressions.every(id => /^T\d{2}$/.test(id))
      || (row.legacy_id && (!old || reused.has(row.legacy_id)))) fail('synthetic_case');
    if (old) reused.add(row.legacy_id);
    if (!old && (!requiredText(row.source) || !requiredText(row.candidate))) fail('synthetic_text');
    const states = {...spec.baseline_states, ...row.override};
    if (annotationDecision(states) !== row.expected) fail('synthetic_decision');
    return {case_id: row.id, synthetic: true, cohort: 'synthetic_contract_not_ce200',
      gold_eligible: false, regressions: row.regressions,
      premises: spec.baseline_premises, clarification: row.note,
      source: old?.source ?? row.source ?? null, candidate: old?.candidate ?? row.candidate ?? null,
      historical_fixture: old ? structuredClone(old) : null,
      historical_provenance: old ? {...provenance, case_id: old.id} : null,
      states, expected_decision: row.expected,
      engine_output: null, review_status: 'editorial_contract_not_independent_review'};
  });
  if (reused.size !== originals.length) fail('legacy_fixture_not_accounted_for');
  if (new Set(result.map(r => r.case_id)).size !== result.length) fail('duplicate_synthetic');
  return result;
}
