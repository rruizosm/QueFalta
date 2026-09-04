// Offline source review reuse. Explicit editorial facts, never draft -> reviewed.
import {readFileSync} from 'node:fs';
import {datasetHash} from './comparator-strict-dataset.mjs';
import {categoryPath} from './comparator-strict-corpus.mjs';
import {nominalQuantity, pointerValue, CORPUS_MANIFEST_SHA256} from './comparator-strict-corpus-labels.mjs';
import {annotationDecision} from './comparator-strict-labels.mjs';
import {POTATO_REVIEW_SPECS} from './comparator-strict-potato-review-specs.mjs';

export const REVIEW_VERSION = 'ce202-potato-source-review-v1';
export const REVIEW_ATTRIBUTES = ['frozen_storage', 'preparation', 'cut_shape', 'cut_thickness', 'skin', 'coating', 'seasoning', 'organic_claim', 'microwave_use', 'declarations'];
const requiredVariantAttributes = ['frozen_storage', 'preparation', 'cut_shape', 'cut_thickness', 'skin', 'coating', 'seasoning', 'declarations'];
const productDimensions = ['scope', 'identity', 'variants', 'format'];
const commercialDimensions = ['price', 'location', 'availability', 'catalog'];
const assert = (ok, why) => { if (!ok) throw Error(`ce202_potato_${why}`); };
const unique = xs => [...new Set(xs)];
const label = (state, reason, evidence = []) => ({state, reason, evidence: unique(evidence)});
const hash = datasetHash;
const fields = ['/display_name', '/packaging', '/denomination', '/description', '/ingredients', '/conservation', '/preparation', '/category_id', '/category_ids', '/category_name', '/raw/categories', '/raw/productData/description', '/raw/price_instructions', '/raw/has_format', '/raw/formats', '/ean'];
const unknownReason = {
  preparation: 'No se acredita una etapa exacta de prefritura/cruda; «fritas», marca o nombre de gama no bastan.',
  cut_shape: 'No se acredita una geometría mutuamente comparable; no traducir gamas, casero o rústico a una forma exacta.',
  cut_thickness: 'No se acredita fino/grueso; tamaño grande, longitud, ondulación y rústico no son grosores exactos.',
  skin: 'No consta una declaración suficiente con/sin piel en esta proyección; no completar ausencia desde el título.',
  coating: 'Sin declaración inequívoca de rebozado o ausencia; no convertir falta de mención en ausencia.',
  seasoning: 'No está acreditado un perfil completo de condimentación; extractos colorantes o sal no equivalen a sabor picante.',
  organic_claim: 'Sin declaración ecológica suficiente; ausencia de bio no es certificación de convencional.',
  microwave_use: 'No se completa o excluye un método de cocción que la evidencia no especifica.',
  declarations: 'Declaraciones observadas se conservan en la ficha; no se acredita exhaustividad, ámbito de todas ellas ni política completa de compatibilidad.',
};

function taxonomySources(input, root) {
  const records = new Map();
  for (const s of input.sourceFiles.filter(s => s.kind === 'taxonomy')) {
    const text = readFileSync(`${root}/${s.file}`, 'utf8');
    assert(hash(text) === s.sha256, 'taxonomy_hash');
    const rows = JSON.parse(text).payload.rows;
    rows.forEach((value, index) => records.set(`${s.store}:${value.id}`, {
      source: {file: s.file, sha256: s.sha256, pointer: `/payload/rows/${index}`}, value,
    }));
  }
  return records;
}

function reviewProduct(spec, product, input, taxonomy) {
  assert(product && product.source.raw_sha256 === hash(product.raw), 'source_binding');
  const citations = new Map(), inspected = [];
  const cite = pointer => {
    const value = pointerValue(product.raw, pointer), id = hash([product.observation_id, pointer]);
    citations.set(id, {id, kind: 'product_field', product_key: product.key, observation_id: product.observation_id,
      captured_at: product.captured_at, source: product.source, pointer, value});
    return id;
  };
  for (const pointer of fields) {
    let value;
    try { value = pointerValue(product.raw, pointer); } catch {
      inspected.push({pointer, presence: 'absent_in_projection', source_row: product.source}); continue;
    }
    inspected.push({pointer, presence: value === null ? 'null_in_projection' : 'present', evidence: cite(pointer)});
  }
  const categoryEvidence = [];
  for (const c of categoryPath(product.raw, product.store, input.taxonomy)) {
    const t = taxonomy.get(`${product.store}:${c.id}`);
    assert(t, 'missing_taxonomy_source');
    const id = hash([t.source, t.value]);
    citations.set(id, {id, kind: 'original_taxonomy_row', product_key: product.key,
      observation_id: product.observation_id, source: t.source, pointer: '', value: t.value});
    categoryEvidence.push(id);
  }
  if (product.raw.raw?.categories) categoryEvidence.push(cite('/raw/categories'));
  const semanticEvidence = unique([cite('/display_name'), ...categoryEvidence,
    ...inspected.filter(x => ['present', 'null_in_projection'].includes(x.presence) && ['/denomination', '/ingredients', '/description', '/conservation', '/preparation', '/raw/productData/description'].includes(x.pointer)).map(x => x.evidence)]);
  assert(spec.note?.length > 40, 'missing_editorial_reason');
  const excluded = spec.excluded === true;
  const attributes = Object.fromEntries(REVIEW_ATTRIBUTES.map(k => [k, {
    state: 'unknown', value: null, evidence: semanticEvidence,
    reason: excluded ? 'Fuera de las familias del piloto: no aprobar variantes con una taxonomía de patatas congeladas ni evaluar receta comercial completa.' : (unknownReason[k] ?? 'Pendiente de evidencia suficiente para este atributo.'),
  }]));
  let format = {state: 'unknown', count: null, each_mg: null, total_mg: null, nominal_mg: null,
    evidence: [], reason: 'Fuera del piloto: no resolver ni aprobar firma comercial con esta revisión de alcance.'};
  if (!excluded) {
    assert(categoryEvidence.length > 0, 'missing_category_evidence');
    attributes.frozen_storage = {state: 'known', value: 'frozen', evidence: categoryEvidence,
      reason: 'Primera lectura semántica del título/denominación y contexto original de congelados. No procede del campo sampling.family.'};
    assert(new Set(spec.facts.map(f => f.attribute)).size === spec.facts.length, 'duplicate_fact');
    for (const f of spec.facts) {
      assert(REVIEW_ATTRIBUTES.includes(f.attribute) && typeof f.value === 'string', 'fact_contract');
      const value = pointerValue(product.raw, f.pointer);
      assert(typeof value === 'string' && value.trim().length > 0, 'empty_fact');
      attributes[f.attribute] = {state: 'known', value: f.value, evidence: [cite(f.pointer)], reason: spec.note};
    }
    const quantity = pointerValue(product.raw, spec.quantity_pointer);
    const refs = [cite(spec.quantity_pointer)];
    let observed = [];
    if (spec.quantity_pointer === '/raw/price_instructions') observed = [nominalQuantity(quantity.unit_size, quantity.size_format)];
    else for (const m of quantity.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|grs?|g)\b/gi)) observed.push(nominalQuantity(m[1], m[2]));
    assert(Number.isSafeInteger(spec.grams) && spec.grams > 0 && observed.some(q => q?.dimension === 'mass' && q.amount === spec.grams * 1000), 'quantity_evidence');
    if (spec.single) {
      if (product.store === 'mercadona') {
        assert(quantity.is_pack === false && quantity.approx_size === false && quantity.selling_method === 0, 'nonpack_evidence');
      } else {
        assert(product.store === 'plusfresc' && /\bbolsa 1 kg\b/i.test(quantity) && product.raw.raw.has_format === false && product.raw.raw.formats.length === 0, 'single_bag_evidence');
        refs.push(cite('/raw/has_format'), cite('/raw/formats'));
      }
    }
    format = {state: spec.single ? 'known' : 'unknown', count: spec.single ? 1 : null,
      each_mg: spec.single ? spec.grams * 1000 : null, total_mg: spec.single ? spec.grams * 1000 : null,
      nominal_mg: spec.grams * 1000, evidence: refs,
      reason: spec.single ? 'Un paquete fijo no pack o una bolsa nominal explícita, sin alternativa de venta en los campos citados.' : 'Cantidad nominal leída, sin resolver si identifica unidad o total ni número de envases. No inferir count=1 ni usar sell_pack_unit/minimumUnit como envases interiores.'};
  }
  const scope = excluded ? label('incompatible', spec.note, semanticEvidence)
    : label(spec.single ? 'compatible' : 'unknown', spec.single
      ? 'Familia de patatas congeladas y venta nominal fija acreditadas en esta observación.'
      : 'Familia de patatas congeladas revisada; firma/modo de venta completos todavía no acreditados. No es exclusión.', semanticEvidence.concat(format.evidence));
  const out = {version: REVIEW_VERSION, key: product.key, display_name: product.raw.display_name,
    observation_id: product.observation_id, captured_at: product.captured_at, source: product.source,
    review_date: POTATO_REVIEW_SPECS.review_date, authorship: POTATO_REVIEW_SPECS.authorship,
    source_review_complete: true, source_review_depth: excluded ? 'scope_gate_only' : 'family_attributes_and_format', full_product_equivalence_established: false,
    independent_review_completed: false, gold_eligible: false,
    family: excluded ? spec.kind : 'frozen_potatoes', form: spec.form ?? 'outside_pilot',
    scope, format, attributes, note: spec.note, inspected_fields: inspected,
    citations: [...citations.values()]};
  return {...out, review_id: hash(out)};
}

export function formatRelation(a, b) {
  const refs = [...a.evidence, ...b.evidence];
  if ([a, b].some(f => f.state === 'conflicting')) return label('conflicting', 'Conflicto nominal conservado, sin prioridad silenciosa entre fuentes.', refs);
  for (const f of [a, b].filter(f => f.state === 'known')) assert(f.count === 1 && f.each_mg === f.total_mg && Number.isSafeInteger(f.each_mg) && f.each_mg > 0, 'single_format_contract');
  if (a.state === 'known' && b.state === 'known') return label(a.each_mg === b.each_mg ? 'compatible' : 'incompatible',
    `Firmas explícitas: ${a.count}×${a.each_mg} mg frente a ${b.count}×${b.each_mg} mg. Sin tolerancia ni multiplicar compras.`, refs);
  // A single package has equal each/total. A different nominal mass on the other
  // side cannot describe that same single package under either role. Two bare
  // masses, however, could describe unit vs total of the same multipack.
  const single = a.state === 'known' ? a : b.state === 'known' ? b : null;
  const partial = single === a ? b : a;
  if (single && partial.nominal_mg && single.each_mg !== partial.nominal_mg) return label('incompatible',
    `Un envase de ${single.each_mg} mg no es la referencia nominal ${partial.nominal_mg} mg. No se asigna count=1 al dato parcial.`, refs);
  return label('unknown', 'Falta firma completa bilateral. Coincidencias nominales no prueban pack; dos cantidades aisladas diferentes pueden tener distinto papel unidad/total.', refs);
}

export function attributeRelation(a, b) {
  if (a.state === 'conflicting' || b.state === 'conflicting') return 'conflicting';
  if (a.state !== 'known' || b.state !== 'known') return 'unknown';
  return a.value === b.value ? 'compatible' : 'incompatible';
}

export function composePotatoPair(pair, left, right, referenceClock, locations = []) {
  assert(left.key === pair.left && right.key === pair.right && left.key < right.key, 'pair_binding');
  for (const product of [left, right]) {
    const {review_id, ...body} = product;
    assert(review_id === hash(body) && product.source_review_complete === true && product.version === REVIEW_VERSION &&
      product.gold_eligible === false && product.independent_review_completed === false &&
      product.authorship === POTATO_REVIEW_SPECS.authorship, 'review_reuse_binding');
  }
  const refs = [...left.scope.evidence, ...right.scope.evidence];
  const outside = [left, right].some(p => p.scope.state === 'incompatible');
  const labels = {
    scope: outside ? label('incompatible', [left, right].filter(p => p.scope.state === 'incompatible').map(p => `${p.key}: ${p.note}`).join(' '), refs)
      : label([left, right].every(p => p.scope.state === 'compatible') ? 'compatible' : 'unknown', 'Familia contrastada en ambas fichas; venta fija solo aprobada donde la evidencia lo permite.', refs),
    identity: label('unknown', 'Subtipo/uso no completamente resuelto en ambas fichas. No copiar atributos entre tiendas, aunque coincidan marca o EAN.', refs),
    variants: label('unknown', 'Faltan atributos obligatorios o política de declaraciones; coincidencias parciales no acreditan equivalencia.', refs),
    format: outside ? label('unknown', 'La pareja está fuera del piloto; no se aprueba formato para habilitar una comparación excluida.', refs) : formatRelation(left.format, right.format),
  };
  if (outside) {
    if ([left, right].filter(p => p.family === 'frozen_potatoes').length === 1) labels.identity = label('incompatible', 'Patata congelada frente a otra familia/uso explícito; una patata como ingrediente o aperitivo no es la misma identidad.', refs);
  } else if (left.form !== 'unknown' && right.form !== 'unknown') {
    labels.identity = label(left.form === right.form ? 'compatible' : 'incompatible',
      `Matriz revisada: ${left.form} frente a ${right.form}. Corte, piel, preparación y condimentos se validan separadamente; no se aprueban por esta identidad parcial.`, refs);
  }
  const comparisons = Object.fromEntries(REVIEW_ATTRIBUTES.map(k => [k, {
    left: {state: left.attributes[k].state, value: left.attributes[k].value},
    right: {state: right.attributes[k].state, value: right.attributes[k].value},
    relation: outside ? 'unknown' : attributeRelation(left.attributes[k], right.attributes[k]),
    evidence: unique([...left.attributes[k].evidence, ...right.attributes[k].evidence]),
  }]));
  const negatives = Object.entries(comparisons).filter(([,v]) => v.relation === 'incompatible').map(([k]) => k);
  const conflicts = Object.entries(comparisons).filter(([,v]) => v.relation === 'conflicting').map(([k]) => k);
  if (!outside && conflicts.length) labels.variants = label('conflicting', `Evidencias enfrentadas en: ${conflicts.join(', ')}. Requiere arbitraje.`, conflicts.flatMap(k => comparisons[k].evidence));
  else if (!outside && negatives.length) labels.variants = label('incompatible', `Diferencia demostrada: ${negatives.join(', ')}. Los demás atributos desconocidos no se completan.`, negatives.flatMap(k => comparisons[k].evidence));
  else if (!outside && requiredVariantAttributes.every(k => comparisons[k].relation === 'compatible')) labels.variants = label('compatible', 'Todos los atributos obligatorios acreditados bilateralmente; no completa formato ni comercio.', refs);
  if (outside) labels.variants.reason = 'Excluida por alcance: no se aplica una taxonomía de patatas congeladas para aprobar variantes de aperitivos, purés u otros platos.';
  const eans = [left, right].map(p => p.citations.find(c => c.kind === 'product_field' && c.pointer === '/ean'));
  if (eans[0]?.value && eans[0].value === eans[1]?.value && labels.format.state === 'incompatible') labels.identity = label('conflicting', 'EAN coincidente con formatos incompatibles: conservar el conflicto, no aceptar ni resolver por el código.', [...eans.map(c => c.id), ...labels.format.evidence]);
  const commercialReasons = {
    price: 'Precios observados conservados, pero no se verifica base comercial/condiciones bilateralmente en este CP. Sin ahorro declarado.',
    location: 'Consum es aproximación provincial; faltan observaciones locales adquiridas de Carrefour/Mercadona y revalidación retailer del mapa Plusfresc. No hay prueba bilateral del CP.',
    availability: 'Publicado/available global no prueba stock local de ambos productos en este CP y canal.',
    catalog: 'Observaciones históricas vinculadas por hash, sin revisiones completas del futuro perfil/formato/ámbito. No caducar ni rejuvenecer con un TTL de 24 h.',
  };
  const contexts = ['08006', '25001'].map(postcode => {
    const commercial = Object.fromEntries(commercialDimensions.map(k => [k, label('unknown', commercialReasons[k])]));
    return {postcode, channel: 'retailer_online_catalog', reference_clock: referenceClock,
      origin_key: pair.left, candidate_key: pair.right, direction: 'canonical_left_to_right_not_a_savings_claim',
      location_evidence: locations.filter(l => [pair.left, pair.right].includes(l.product_key) &&
        ((l.raw.store === 'plusfresc' && l.raw.location_id === (postcode === '08006' ? '3' : '12')) ||
        (l.raw.store === 'consum' && postcode === '08006' && l.raw.location_id === '575'))).map(l => ({key: l.key, source: l.source, captured_at: l.captured_at, raw_sha256: hash(l.raw)})),
      labels: commercial, decision: annotationDecision(Object.fromEntries(Object.entries({...labels, ...commercial}).map(([k,v]) => [k,v.state])))};
  });
  const out = {version: REVIEW_VERSION, pair_id: hash([pair.left, pair.right]), left: pair.left, right: pair.right,
    observations: [left.observation_id, right.observation_id], product_reviews: [left.review_id, right.review_id],
    cohort: pair.cohort, sampling_stratum_preserved_not_truth: pair.stratum,
    authorship: POTATO_REVIEW_SPECS.authorship, annotation_status: 'first_annotation_composed_from_reviewed_sources',
    review_status: 'awaiting_owner_independent_review', independent_pair_by_pair_review_completed: false,
    independent_review_completed: false, gold_eligible: false, product_labels: labels, attribute_comparisons: comparisons, contexts};
  return {...out, annotation_id: hash(out)};
}

export function buildPotatoReview(input, specs = POTATO_REVIEW_SPECS, root = '.') {
  assert(input.manifest_sha256 === CORPUS_MANIFEST_SHA256, 'manifest');
  assert(specs.version === REVIEW_VERSION, 'version');
  const selected = input.pairs.filter(p => p.family === 'frozen_potatoes');
  const keys = new Set(selected.flatMap(p => [p.left, p.right]));
  const list = [...specs.frozen, ...specs.exclusions.flatMap(g => g.ids.map(id => ({key: `${g.store}:${id}`, excluded: true, kind: g.kind, note: g.note})))];
  assert(list.length === keys.size && new Set(list.map(p => p.key)).size === list.length && list.every(p => keys.has(p.key)), 'exact_cohort_coverage');
  const originals = new Map(input.products.map(p => [p.key, p])), taxonomy = taxonomySources(input, root);
  const products = list.map(s => reviewProduct(s, originals.get(s.key), input, taxonomy)).sort((a,b) => a.key < b.key ? -1 : 1);
  const reviewed = new Map(products.map(p => [p.key, p]));
  const annotations = selected.map(p => composePotatoPair(p, reviewed.get(p.left), reviewed.get(p.right), input.queries[0].reference_clock, input.locations));
  const index = annotations.map(a => ({annotation_id: a.annotation_id, pair_id: a.pair_id, left: a.left, right: a.right, product_reviews: a.product_reviews,
    cohort: a.cohort, states: Object.fromEntries(productDimensions.map(k => [k, a.product_labels[k].state])), decision: a.contexts[0].decision,
    differences: Object.entries(a.attribute_comparisons).filter(([,v]) => v.relation === 'incompatible').map(([k]) => k)}));
  const previous = JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-corpus-v1/editorial.json`, 'utf8'));
  const oldCorpus = previous.filter(p => p.cohort === 'editorial_subset_of_frozen_corpus');
  const union = new Set([...oldCorpus.map(p => p.pair_id), ...annotations.map(p => p.pair_id)]);
  const overlaps = oldCorpus.flatMap(e => {
    const a = annotations.find(a => a.pair_id === e.pair_id);
    return a ? [{previous_id: e.id, pair_id: e.pair_id, previous_annotation_id: e.annotation_id, annotation_id: a.annotation_id,
      changed_product_dimensions: productDimensions.filter(k => e.labels[k].state !== a.product_labels[k].state),
      decision_changed: e.decision !== a.contexts[0].decision}] : [];
  });
  const counts = xs => Object.fromEntries(unique(xs).sort().map(x => [x, xs.filter(v => v === x).length]));
  const report = {version: REVIEW_VERSION, date: specs.review_date,
    status: 'potato_family_first_annotation_complete_via_source_review_reuse_not_independent_review',
    source_reviewed_products: products.length, frozen_potato_products: specs.frozen.length,
    scope_exclusion_products: products.length - specs.frozen.length,
    first_annotations_this_batch: annotations.length, independent_pair_by_pair_reviews_this_batch: 0,
    decision_counts: counts(index.map(a => a.decision)), dimension_counts: Object.fromEntries(productDimensions.map(k => [k, counts(index.map(a => a.states[k]))])),
    attribute_negative_pair_counts: Object.fromEntries(REVIEW_ATTRIBUTES.map(k => [k, index.filter(a => a.differences.includes(k)).length])),
    known_single_package_products: products.filter(p => p.format.state === 'known').length,
    corpus_pairs_unchanged: input.pairs.length, corpus_queries_unchanged: input.queries.length,
    original_origin_count_unchanged: new Set(input.queries.map(q => q.origin)).size,
    cp_assessments_this_batch_correlated_not_new_queries: annotations.length * 2,
    previous_first_annotations_within_corpus: oldCorpus.length, overlapping_previous_annotations: overlaps,
    union_first_annotated_corpus_pairs: union.size, corpus_pairs_pending_first_annotation: input.pairs.length - union.size,
    previous_supplemental_editorial_annotations_not_added_to_corpus: previous.length - oldCorpus.length,
    independent_reviews: 0, gold_pairs: 0, supported_full_positive_equivalences: 0, eligible_savings: 0,
    CE201_complete: false, CE202_complete: false, CE203_complete: false, G2_pass: false,
    remote_project_calls: 0, retailer_calls: 0, new_integrations: 0, commercial_ttl_hours: null,
    source_manifest_sha256: input.manifest_sha256, specs_sha256: hash(specs),
    hashes: {products: hash(products), annotations: hash(annotations), index: hash(index)},
    limitation: 'Semantic facts were authored after source inspection. Pair composition is deterministic and not individual human review; proof of interpretation requires CE-203. Unknowns refer only to the acquired projection; no catalogue-wide absence or market optimum claimed.'};
  return {products, annotations, index, report};
}
