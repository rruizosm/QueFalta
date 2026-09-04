// CE-201/202 offline evidence-assisted drafts. NOT production matching or gold truth.
// Missing evidence remains unknown. Editorial/owner review is a separate event.
import {readFileSync, readdirSync} from 'node:fs';
import {datasetHash} from './comparator-strict-dataset.mjs';
import {assembleCorpusInputs} from './comparator-strict-corpus.mjs';
import {annotationDecision, LABEL_DIMENSIONS} from './comparator-strict-labels.mjs';

export const CORPUS_LABEL_VERSION = 'ce202-corpus-v1';
export const CORPUS_MANIFEST_SHA256 = '15da91ad7ae616199da7a50b53dba2abca4e3c43c1420a4a413b23ad02b9abd7';
const ROOT = 'docs/comparator-strict/dataset/corpus-v1';
const assert = (ok, why) => { if (!ok) throw Error(`ce202_corpus_${why}`); };
const fold = x => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const unique = xs => [...new Set(xs)];
const label = (state, reason, evidence = []) => ({state, reason, evidence: unique(evidence)});

export function pointerValue(root, pointer) {
  assert(typeof pointer === 'string' && (pointer === '' || pointer.startsWith('/')), 'pointer');
  let value = root;
  for (const segment of pointer.split('/').slice(1)) {
    assert(!/~(?![01])/u.test(segment), 'pointer_escape');
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    assert(value !== null && typeof value === 'object' && Object.hasOwn(value, key), 'missing_pointer');
    value = value[key];
  }
  return value;
}

export function loadLabelCorpus(root = '.') {
  const text = p => readFileSync(`${root}/${p}`, 'utf8');
  const json = p => JSON.parse(text(p));
  const manifestText = text(`${ROOT}/manifest.json`), manifest = JSON.parse(manifestText);
  assert(datasetHash(manifestText) === CORPUS_MANIFEST_SHA256, 'frozen_manifest_changed');
  assert(manifest.status === 'acquired_and_sampled_unlabelled', 'manifest_status');
  const pages = manifest.source_files.map(s => {
    assert(/^docs\/comparator-strict\/dataset\/acquisition-v1\/[^/]+\.json$/.test(s.file), 'source_path');
    const body = text(s.file); assert(datasetHash(body) === s.sha256, 'source_hash');
    return {...JSON.parse(body), file: s.file, file_hash: s.sha256};
  });
  for (const s of manifest.generator_files) assert(datasetHash(text(s.file)) === s.sha256, 'generator_drift');
  const input = assembleCorpusInputs(pages, json('docs/comparator-strict/dataset/seed-v1/exposure.json'), json('docs/comparator-strict/dataset/seed-v1/products.json'));
  assert(datasetHash(input.products.map(({raw, ...p}) => p)) === manifest.source_frame_sha256, 'frame_drift');
  const files = readdirSync(`${root}/${ROOT}`).sort();
  const pairs = files.filter(f => /^pairs-\d+\.json$/.test(f)).flatMap(f => json(`${ROOT}/${f}`));
  const queries = files.filter(f => /^queries-\d+\.json$/.test(f)).flatMap(f => json(`${ROOT}/${f}`));
  assert(datasetHash(pairs) === manifest.hashes.pairs && datasetHash(queries) === manifest.hashes.queries, 'corpus_drift');
  assert(pairs.length === 6000 && queries.length === 1200, 'corpus_count');
  return {...input, pairs, queries, manifest, manifest_sha256: datasetHash(manifestText)};
}

// Exact decimal conversion to integer mg/ml. Never infer quantity from price.
export function nominalQuantity(value, unit) {
  const m = /^(\d+)(?:[.,](\d{1,6}))?$/.exec(String(value));
  const u = fold(unit).replace(/\.$/, '');
  const mass = {kg: 1000000, g: 1000, gr: 1000, grs: 1000, gramos: 1000};
  const volume = {l: 1000, litro: 1000, litros: 1000, ml: 1, cl: 10};
  const factor = mass[u] ?? volume[u];
  if (!m || !factor) return null;
  const denominator = 10n ** BigInt(m[2]?.length ?? 0);
  const scaled = BigInt(m[1] + (m[2] ?? '')) * BigInt(factor);
  if (scaled % denominator !== 0n || scaled <= 0n || scaled / denominator > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {dimension: mass[u] ? 'mass' : 'volume', amount: Number(scaled / denominator), unit: mass[u] ? 'mg' : 'ml'};
}

function buildEvidence(product) {
  const citations = new Map();
  const cite = path => {
    const value = pointerValue(product.raw, path);
    const ref = {id: datasetHash([product.observation_id, path]), product_key: product.key,
      observation_id: product.observation_id, captured_at: product.captured_at,
      source: product.source, pointer: path, value: structuredClone(value)};
    citations.set(ref.id, ref); return ref.id;
  };
  const optional = path => { try { return {value: pointerValue(product.raw, path), ref: cite(path)}; } catch { return null; } };
  return {citations, cite, optional};
}

const formatSignature = x => [x.count ?? null, x.each?.dimension ?? x.total?.dimension ?? null, x.each?.amount ?? null, x.total?.amount ?? null];
const units = '(kg|grs?|g|ml|cl|litros?|l)';
const number = '(\\d+(?:[.,]\\d+)?)';

export function productLabelEvidence(product) {
  const {citations, cite, optional} = buildEvidence(product);
  const claims = [], flags = [], ambiguousQuantities = [], raw = product.raw;
  const name = optional('/display_name');
  const fields = ['/display_name', '/packaging', '/description', '/raw/productData/description']
    .map(optional).filter(x => typeof x?.value === 'string' && x.value.trim());
  const pushFormat = (count, each, total, refs, basis) => {
    if (count !== null && (!Number.isSafeInteger(count) || count <= 0)) return;
    if (count && each && !total) {
      if (!Number.isSafeInteger(count * each.amount)) return;
      total = {...each, amount: count * each.amount};
    }
    claims.push({count, each, total, evidence: unique(refs), basis});
  };
  const pi = raw.raw?.price_instructions;
  if (pi) {
    const refs = ['/raw/price_instructions/is_pack', '/raw/price_instructions/approx_size', '/raw/price_instructions/selling_method', '/raw/price_instructions/unit_size', '/raw/price_instructions/size_format'].map(optional).filter(Boolean).map(x => x.ref);
    if (pi.approx_size === true || pi.selling_method !== 0) flags.push('variable_or_unverified_selling_method');
    if (pi.approx_size === false && pi.selling_method === 0) {
      const total = nominalQuantity(pi.unit_size, pi.size_format);
      if (pi.is_pack === false && total) pushFormat(1, total, total, refs, 'explicit_nonpack_nominal');
      if (pi.is_pack === true) {
        const each = nominalQuantity(pi.pack_size, pi.size_format);
        const extra = ['/raw/price_instructions/pack_size', '/raw/price_instructions/total_units'].map(optional).filter(Boolean).map(x => x.ref);
        pushFormat(Number.isSafeInteger(pi.total_units) ? pi.total_units : null, each, total, [...refs, ...extra], 'explicit_pack_nominal');
      }
    }
  }
  // Formats are selectable alternatives, not a selected commercial line.
  if (raw.raw?.has_format === true || raw.raw?.formats?.some(x => x.options?.length > 1)) {
    flags.push('unselected_sale_format'); optional('/raw/has_format'); optional('/raw/formats');
  }
  for (const f of fields) {
    const t = fold(f.value);
    if (/\b(aprox|aproximad|granel|peso variable)/.test(t)) flags.push('variable_or_unverified_selling_method');
    if (/\b(surtid[oa]|variad[oa]s?|sabores)\b|\bsabor\b[^.]*[,y][^.]*/.test(t)) flags.push('assorted_composition_unverified');
    // Explicit count × per-unit content, with units, no inferred division.
    const patterns = [new RegExp(`(\\d+)\\s*[x×]\\s*${number}\\s*${units}\\b`, 'g'),
      new RegExp(`(?:pack de\\s*)?(\\d+)\\s*(?:unidades|uds?\\.?|botellas|envases|vasos)\\s*(?:de|x|×)\\s*${number}\\s*${units}\\b`, 'g')];
    let packed = false;
    for (const pattern of patterns) for (const m of t.matchAll(pattern)) {
      const each = nominalQuantity(m[2], m[3]);
      if (each) { pushFormat(Number(m[1]), each, null, [f.ref], 'literal_count_times_each'); packed = true; }
    }
    if (!packed) {
      // "4 uds. 440 g" gives a count but does NOT identify total vs per-unit.
      const totalPattern = new RegExp(`(\\d+)\\s*(?:unidades|uds?\\.?)\\s*${number}\\s*${units}\\b`, 'g');
      for (const m of t.matchAll(totalPattern)) {
        pushFormat(Number(m[1]), null, null, [f.ref], 'literal_count_quantity_role_unknown');
        ambiguousQuantities.push({quantity: nominalQuantity(m[2], m[3]), evidence: [f.ref]}); packed = true;
      }
    }
    if (!packed && !/\b(pack|lote|unidades|uds?\b)|\d\s*[x×+]\s*\d/.test(t)) {
      const singlePattern = new RegExp(`\\b(?:una?\\s+)?(?:botella|garrafa|bolsa|tarrina|bote|envase|paquete)\\s+(?:de\\s+)?${number}\\s*${units}\\b`, 'g');
      for (const m of t.matchAll(singlePattern)) { const each = nominalQuantity(m[1], m[2]); if (each) pushFormat(1, each, each, [f.ref], 'explicit_container_nominal'); }
      // A bare amount is not assigned to an individual container or a pack.
    }
  }
  const allFormatRefs = unique(claims.flatMap(c => c.evidence));
  let conflict = claims.some(c => c.count && c.each && c.total && (c.each.dimension !== c.total.dimension || c.count * c.each.amount !== c.total.amount));
  for (const a of claims) for (const b of claims) {
    if (a.count && b.count && a.count !== b.count) conflict = true;
    for (const field of ['each', 'total']) if (a[field] && b[field]) {
      if (a[field].dimension !== b[field].dimension) flags.push('unresolved_mass_volume_evidence');
      else if (a[field].amount !== b[field].amount) conflict = true;
    }
  }
  const best = claims.find(x => x.count && x.each && x.total) ?? claims[0] ?? null;
  if (ambiguousQuantities.some(a => a.quantity && best?.each && best?.total && ![best.each, best.total].some(q => datasetHash(q) === datasetHash(a.quantity)))) flags.push('unresolved_quantity_role');
  const complete = !!best?.count && !!best?.each && !!best?.total;
  const format = {state: conflict ? 'conflicting' : flags.length ? 'unknown' : complete ? 'known' : 'unknown',
    signature: conflict || flags.length || !complete ? null : formatSignature(best),
    components: best, claims, ambiguous_quantities: ambiguousQuantities, evidence: allFormatRefs,
    reason: conflict ? 'Fuentes incompatibles de conteo/cantidad; no resolver por prioridad silenciosa.' : flags.includes('unselected_sale_format') ? 'La referencia admite formatos de venta alternativos sin selección acreditada.' : complete ? 'Conteo y contenido nominal explícitos; total comprobado por multiplicación exacta.' : 'Firma incompleta: no suponer una unidad ni dividir total para deducir contenido unitario.'};

  // Finite literal assertions for drafting only. These do not complete a variant.
  const attributes = Object.fromEntries(['water_class', 'gas', 'water_flavour', 'water_additives', 'dairy_base', 'milk_species', 'flavour_composition', 'fat', 'added_sugar', 'sweeteners', 'lactose_claim', 'greek_style', 'declarations', 'frozen_storage', 'preparation', 'potato_cut', 'skin', 'seasoning'].map(k => [k, {state: 'unknown', value: null, evidence: [], reason: 'No hay declaración explícita suficiente en los campos examinados; aplicabilidad por familia pendiente de revisión.'}]));
  const add = (key, value, ref) => {
    const old = attributes[key];
    if (old.state === 'conflicting') { old.evidence = unique([...old.evidence, ref]); return; }
    if (old.state === 'known' && old.value !== value) attributes[key] = {state: 'conflicting', value: null, evidence: unique([...old.evidence, ref]), reason: 'Declaraciones explícitas contradictorias.'};
    else attributes[key] = {state: 'known', value, evidence: unique([...old.evidence, ref]), reason: 'Declaración literal; no se completa ningún atributo ausente.'};
  };
  const variantFields = ['/display_name', '/denomination', '/description', '/raw/productData/description'].map(optional).filter(x => typeof x?.value === 'string');
  for (const f of variantFields) {
    const t = fold(f.value);
    if (/\bsin gas\b/.test(t)) add('gas', 'without_gas', f.ref);
    if (/\bcon gas\b/.test(t)) add('gas', 'with_gas', f.ref);
    if (/\bsin azucares? anadidos?\b/.test(t)) add('added_sugar', 'no_added_sugar_claim', f.ref);
    if (/\b(?:natural )?azucarad[oa]s?\b|\bcon azucar(?: de cana)?\b/.test(t)) add('added_sugar', 'added_sugar_declared', f.ref);
    if (/\b(?:edulcorad[oa]s?|con edulcorantes?)\b/.test(t)) add('sweeteners', 'present_declared', f.ref);
    if (/\bsin edulcorantes?\b/.test(t)) add('sweeteners', 'absent_declared', f.ref);
    if (/\bsin lactosa\b/.test(t)) add('lactose_claim', 'lactose_free_claim', f.ref);
    if (/\b(?:yogur(?:t)?\s+griego|griego\s+yogur(?:t)?)\b/.test(t)) add('greek_style', 'greek', f.ref);
    if (/\b(?:ultra)?congelad[oa]s?\b/.test(t)) add('frozen_storage', 'frozen', f.ref);
    if (/\bcorte (?:fino|finas?)\b|\bpatatas finas\b/.test(t)) add('potato_cut', 'thin', f.ref);
    if (/\bcorte grueso\b/.test(t)) add('potato_cut', 'thick', f.ref);
    if (/\bsin piel\b/.test(t)) add('skin', 'without_skin', f.ref);
    if (/\bcon piel\b/.test(t)) add('skin', 'with_skin', f.ref);
  }
  // Ancestor categories are inventory evidence, not a truth label. Keep original paths.
  optional('/category_ids'); optional('/category_id'); optional('/category_name');
  optional('/raw/categories'); optional('/raw/info_tags'); optional('/conservation');
  for (const path of ['/unit_price', '/available', '/published', '/synced_at', '/ean', '/ingredients', '/source_wh', '/regions', '/raw/productData/temporaryOutOfStock']) optional(path);
  const t = fold(name?.value);
  let exclusion = null;
  if (/\b(agua de colonia|agua oxigenada|agua micelar|filtro de agua|pelador|spray nasal)\b/.test(t)) exclusion = 'non_pilot_use_explicit';
  if (/^(galletas?|tortitas?|salsa|champu|gel de|caramelo|ambientador|comida para|alimento para)\b/.test(t)) exclusion = 'different_product_explicit';
  if (pi?.approx_size === true || fields.some(f => /\b(?:peso variable|a granel|aprox\b)/.test(fold(f.value)))) exclusion = 'explicit_variable_weight';
  return {key: product.key, observation_id: product.observation_id, captured_at: product.captured_at, source: product.source,
    display_name: raw.display_name, authorship: 'rule_assisted_draft', editorial_reviewed: false, gold_eligible: false,
    format, attributes, exclusion, flags: unique(flags), citations: [...citations.values()]};
}

function pairProductLabels(left, right) {
  const allNames = [left, right].flatMap(p => p.citations.filter(c => c.pointer === '/display_name').map(c => c.id));
  const labels = Object.fromEntries(LABEL_DIMENSIONS.map(k => [k, label('unknown', ({scope: 'El marco de muestreo no verifica por sí solo familia real y modo de venta.', identity: 'No se han verificado todos los atributos de identidad/subtipo/uso en ambos productos.', variants: 'Faltan atributos obligatorios; coincidencias parciales no acreditan una variante completa.', format: 'Falta la firma nominal completa de uno o ambos productos.', price: 'El precio global no acredita ahorro para el CP y canal solicitados.', location: 'No hay mapeo exacto y evidencia bilateral suficiente del CP.', availability: 'No se acredita disponibilidad local bilateral; publicado no significa stock.', catalog: 'Huellas de catálogo conservadas, pero faltan revisiones de perfiles/formato/precio/ámbito del futuro comparador.'})[k]) ]));
  if ([left, right].some(p => p.exclusion)) labels.scope = label('incompatible', 'Uso explícitamente ajeno al piloto o peso variable declarado en cuarentena.', [...allNames, ...[left, right].filter(p => p.exclusion === 'explicit_variable_weight').flatMap(p => p.citations.filter(c => c.pointer === '/raw/price_instructions/approx_size' || c.pointer === '/packaging').map(c => c.id))]);
  const conflicts = [left, right].flatMap(p => Object.values(p.attributes).filter(a => a.state === 'conflicting').flatMap(a => a.evidence));
  const differing = Object.keys(left.attributes).filter(k => left.attributes[k].state === 'known' && right.attributes[k].state === 'known' && left.attributes[k].value !== right.attributes[k].value);
  if (conflicts.length) labels.variants = label('conflicting', 'Declaraciones enfrentadas dentro de una observación.', conflicts);
  else if (differing.length) labels.variants = label('incompatible', `Diferencia explícita en: ${differing.join(', ')}. No completa otros atributos.`, differing.flatMap(k => [...left.attributes[k].evidence, ...right.attributes[k].evidence]));
  const lf = left.format, rf = right.format;
  const refs = [...lf.evidence, ...rf.evidence];
  if (lf.state === 'conflicting' || rf.state === 'conflicting') labels.format = label('conflicting', 'Evidencia nominal contradictoria en la fuente; requiere arbitraje.', refs);
  else if (left.flags.length || right.flags.length) labels.format = label('unknown', `Firma no resuelta (${unique([...left.flags, ...right.flags]).join(', ')}): no fijarla por defecto.`, refs);
  else {
    // Partial evidence can disprove equality, but never proves a complete match.
    const a = lf.components, b = rf.components;
    const differences = [];
    if (a?.count && b?.count && a.count !== b.count) differences.push('count');
    for (const k of ['each', 'total']) if (a?.[k] && b?.[k] && a[k].dimension === b[k].dimension && a[k].amount !== b[k].amount) differences.push(k);
    if (differences.length) labels.format = label('incompatible', `Diferencia nominal explícita: ${differences.join(', ')}; sin tolerancia.`, refs);
    else if (lf.state === 'known' && rf.state === 'known' && datasetHash(lf.signature) === datasetHash(rf.signature)) labels.format = label('compatible', 'Coinciden conteo, dimensión, contenido nominal unitario y total; no acredita identidad/variante/ahorro.', refs);
    else labels.format = label('unknown', 'Cantidad parcial o dimensiones no comparables; no dividir total, asumir unidad ni convertir masa a volumen.', refs);
  }
  const ean = p => p.citations.find(c => c.pointer === '/ean');
  const a = ean(left), b = ean(right);
  if (a?.value && b?.value && a.value === b.value && labels.format.state === 'incompatible') labels.identity = label('conflicting', 'El mismo EAN está asociado a formatos contrarios; no prevalece sobre la evidencia nominal.', [a.id, b.id, ...refs]);
  return labels;
}

export function buildCorpusLabelDrafts(input) {
  const used = new Set(input.pairs.flatMap(p => [p.left, p.right]));
  const products = input.products.filter(p => used.has(p.key)).map(productLabelEvidence);
  const byKey = new Map(products.map(p => [p.key, p]));
  const referenceClock = input.queries[0].reference_clock;
  const locations = input.locations.filter(l => used.has(l.product_key)).map(l => ({...l,
    observation_id: datasetHash([l.product_key, l.key, l.captured_at, datasetHash(l.raw)]), raw_sha256: datasetHash(l.raw)}));
  const annotations = input.pairs.map(pair => {
    const left = byKey.get(pair.left), right = byKey.get(pair.right);
    assert(left && right, 'missing_product');
    const labels = pairProductLabels(left, right);
    const contexts = ['08006', '25001'].map(postcode => ({postcode, channel: 'retailer_online_catalog', reference_clock: referenceClock,
      origin_key: pair.left, candidate_key: pair.right,
      direction_policy: 'canonical_left_to_right_for_draft_only; reverse price requires another assessment',
      location_evidence: locations.filter(l => [pair.left, pair.right].includes(l.product_key) && ((l.raw.store === 'plusfresc' && l.raw.location_id === (postcode === '08006' ? '3' : '12')) || (l.raw.store === 'consum' && postcode === '08006' && l.raw.location_id === '575'))).map(l => l.key),
      location_limitation: 'Consum: province approximation/unmapped; Carrefour/Mercadona: no acquired local rows; Plusfresc: app map not reverified with retailer. No bilateral verified CP.',
      labels: Object.fromEntries(['price', 'location', 'availability', 'catalog'].map(k => [k, labels[k]])),
      decision: annotationDecision(Object.fromEntries(LABEL_DIMENSIONS.map(k => [k, labels[k].state])))}));
    const productLabels = Object.fromEntries(['scope', 'identity', 'variants', 'format'].map(k => [k, labels[k]]));
    return {schema_version: 1, annotation_id: datasetHash([CORPUS_LABEL_VERSION, pair.left, pair.right, left.observation_id, right.observation_id]),
      pair_id: datasetHash([pair.left, pair.right]), left: pair.left, right: pair.right,
      observations: [left.observation_id, right.observation_id], cohort: pair.cohort,
      corpus_family_stratum_not_truth: pair.family, challenge_reason_not_label: pair.challenge_reason,
      guide_version: CORPUS_LABEL_VERSION, authorship: 'rule_assisted_draft', annotation_status: 'requires_first_semantic_review',
      gold_eligible: false, independent_review_completed: false, product_labels: productLabels, contexts};
  });
  const count = values => Object.fromEntries(unique(values).sort().map(v => [v, values.filter(x => x === v).length]));
  const report = {version: CORPUS_LABEL_VERSION, status: 'drafts_complete_semantic_annotation_in_progress',
    unique_pairs: annotations.length, products: products.length, postcode_assessments: annotations.length * 2,
    unique_CE200_queries_unchanged: input.queries.length, underlying_origins_unchanged: new Set(input.queries.map(q => q.origin)).size,
    product_dimensions: Object.fromEntries(['scope', 'identity', 'variants', 'format'].map(k => [k, count(annotations.map(a => a.product_labels[k].state))])),
    decisions_per_unique_pair: count(annotations.map(a => a.contexts[0].decision)),
    product_format_states: count(products.map(p => p.format.state)),
    products_with_unselected_formats: products.filter(p => p.flags.includes('unselected_sale_format')).length,
    positive_format_pairs_not_equivalents: annotations.filter(a => a.product_labels.format.state === 'compatible').length,
    eligible_savings: 0, reviewed_gold_pairs: 0, independent_reviews: 0, first_semantic_reviews: 0,
    CE201_complete: false, CE202_complete: false, CE203_complete: false, G2_pass: false,
    unknown_is_not_negative: true, remote_project_calls: 0, commercial_ttl_hours: null,
    hashes: {products: datasetHash(products), locations: datasetHash(locations), annotations: datasetHash(annotations)},
    source_manifest_sha256: input.manifest_sha256,
    remaining: ['First semantic annotation beyond finite literal drafting rules.', 'Real fully supported positive equivalence/commerce cases; format compatibility alone is not a positive.', 'CE203 owner review and disputes; partition/holdout and evaluation remain separate.']};
  return {products, locations, annotations, report};
}

export function validateCorpusDrafts(packet, input) {
  const sourceProducts = new Map(input.products.map(p => [p.key, p]));
  for (const p of packet.products) {
    const original = sourceProducts.get(p.key); assert(original, 'source_product');
    assert(p.observation_id === original.observation_id && p.captured_at === original.captured_at && datasetHash(p.source) === datasetHash(original.source), 'binding');
    for (const c of p.citations) {
      assert(c.product_key === p.key && c.observation_id === p.observation_id && c.captured_at === p.captured_at && datasetHash(c.source) === datasetHash(p.source), 'citation_binding');
      assert(c.id === datasetHash([p.observation_id, c.pointer]) && datasetHash(c.value) === datasetHash(pointerValue(original.raw, c.pointer)), 'citation_value');
    }
  }
  // Deterministic integrity, not a test that the author's semantic interpretation is right.
  const rebuilt = buildCorpusLabelDrafts(input);
  for (const key of ['products', 'locations', 'annotations', 'report']) assert(datasetHash(packet[key]) === datasetHash(rebuilt[key]), `draft_drift_${key}`);
  return true;
}

// Explicit editorial assertions supplied after inspecting source fields; not model predictions.
// Separate from draft generation so a rerun cannot silently replace an annotation.
export function buildEditorialAnnotations(specs, input) {
  const byKey = new Map(input.products.map(p => [p.key, p]));
  const pairKeys = new Set(input.pairs.map(p => `${p.left}|${p.right}`));
  const result = specs.map(spec => {
    const keys = [...spec.products].sort();
    assert(keys.length === 2 && keys[0] !== keys[1] && keys[0].split(':')[0] !== keys[1].split(':')[0], 'editorial_pair');
    const products = keys.map(key => byKey.get(key)); assert(products.every(Boolean), 'editorial_source');
    assert(typeof spec.id === 'string' && typeof spec.reason === 'string' && spec.reason.length > 20, 'editorial_spec');
    const citations = new Map();
    const labels = Object.fromEntries(LABEL_DIMENSIONS.map(d => [d, label('unknown', ['price', 'location', 'availability', 'catalog'].includes(d)
      ? 'Revisada la limitación del corpus: no hay evidencia bilateral de CP/precio/disponibilidad/revisiones. No inferirla de publicación ni de antigüedad.'
      : 'Revisado como no resuelto en esta anotación; la evidencia disponible no verifica esta dimensión completa.')]));
    for (const [dimension, assertion] of Object.entries(spec.assertions)) {
      assert(['scope', 'identity', 'variants', 'format'].includes(dimension), 'editorial_dimension');
      assert(['compatible', 'incompatible', 'unknown', 'conflicting'].includes(assertion.state) && typeof assertion.reason === 'string' && assertion.reason.length > 20, 'editorial_assertion');
      const refs = assertion.refs.map(([key, pointer]) => {
        const p = products.find(p => p.key === key); assert(p, 'editorial_foreign_evidence');
        const value = pointerValue(p.raw, pointer);
        const c = {id: datasetHash([p.observation_id, pointer]), product_key: key, observation_id: p.observation_id, captured_at: p.captured_at, source: p.source, pointer, value};
        citations.set(c.id, c); return c.id;
      });
      assert(refs.length > 0, 'editorial_missing_evidence');
      const sides = new Set(refs.map(id => citations.get(id).product_key));
      if (assertion.state === 'compatible' || (assertion.state === 'incompatible' && dimension !== 'scope')) assert(sides.size === 2, 'editorial_bilateral');
      if (!['unknown', 'conflicting'].includes(assertion.state)) assert(refs.every(id => citations.get(id).value !== null && citations.get(id).value !== ''), 'editorial_empty_evidence');
      labels[dimension] = label(assertion.state, assertion.reason, refs);
    }
    const decision = annotationDecision(Object.fromEntries(LABEL_DIMENSIONS.map(d => [d, labels[d].state])));
    assert(decision === spec.expected, 'editorial_expected');
    return {schema_version: 1, id: spec.id, annotation_id: datasetHash([CORPUS_LABEL_VERSION, 'editorial', spec]),
      pair_id: datasetHash(keys), products: keys, observations: products.map(p => p.observation_id),
      guide_version: CORPUS_LABEL_VERSION, authorship: 'assistant_editorial_first_annotation',
      review_status: 'awaiting_owner_independent_review', gold_eligible: false,
      cohort: pairKeys.has(keys.join('|')) ? 'editorial_subset_of_frozen_corpus' : 'supplemental_editorial_challenge_not_CE200_sample',
      selection: 'purposeful_exposed_not_representative_not_CE203_random20',
      reference_clock: input.queries[0].reference_clock, postcode_contexts: ['08006', '25001'],
      commercial_direction: 'not_assessed_no_savings_claim', labels, decision, reason: spec.reason,
      tags: spec.tags, citations: [...citations.values()]};
  });
  assert(new Set(result.map(r => r.id)).size === result.length && new Set(result.map(r => r.pair_id)).size === result.length, 'editorial_duplicate');
  return result;
}
