// OFFLINE incremental editorial layer. No network, draft promotion or writes.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {categoryPath} from './comparator-strict-corpus.mjs';
import {CORPUS_MANIFEST_SHA256, nominalQuantity, pointerValue} from './comparator-strict-corpus-labels.mjs';
import {annotationDecision} from './comparator-strict-labels.mjs';
import {YOGURT_REVIEW_VERSION as VERSION, YOGURT_REVIEW_AUTHOR as AUTHOR,
  YOGURT_REVIEW_DATE as DATE, YOGURT_TABLES, YOGURT_NOTES, YOGURT_ASSORTMENTS} from './comparator-strict-yogurt-review-specs.mjs';

export {VERSION as YOGURT_REVIEW_VERSION};
const assert = (ok, reason) => { if (!ok) throw Error(`ce202_yogurt_${reason}`); };
const unique = xs => [...new Set(xs)];
const sameQuantity = (a,b) => a && b && a.dimension === b.dimension && a.amount === b.amount;
const label = (state, reason, evidence = []) => ({state, reason, evidence: unique(evidence)});
const dimensions = ['scope','identity','variants','format'];
const commercialDimensions = ['price','location','availability','catalog'];
const excludedMatrices = ['dessert','kefir','infant_dessert','candy','icecream','meal_replacement','cake'];
const inspectedPointers = ['/display_name','/packaging','/denomination','/description','/ingredients',
  '/conservation','/preparation','/category_name','/category_id','/category_ids','/raw/categories',
  '/raw/productData/description','/raw/price_instructions','/raw/has_format','/raw/formats','/ean'];
export const YOGURT_ATTRIBUTES = ['declared_flavour','added_sugar','total_sugar_claim','sweeteners',
  'milk_species','milk_presence','plant_base','fat_claim','greek_style','liquid_form','fruit_delivery',
  'lactose_claim','gluten_claim','organic_claim','protein_claim','fibre_claim','bifidus_claim','sterols_claim',
  'declarations_complete'];
const claims = {
  added: ['added_sugar','added'], noadded: ['added_sugar','no_added_claim'],
  sugar_conflict: ['added_sugar',null], total_sugar_free: ['total_sugar_claim','sugar_free_claim'],
  sweetened: ['sweeteners','present'], goat: ['milk_species','goat'], sheep: ['milk_species','sheep'], cow: ['milk_species','cow'],
  milk: ['milk_presence','present'], dairy_free: ['milk_presence','absent_claim'], soy: ['plant_base','soy'],
  zero_fat: ['fat_claim','zero_percent'], two_fat: ['fat_claim','two_percent'], skimmed: ['fat_claim','skimmed'],
  greek: ['greek_style','declared'], liquid: ['liquid_form','liquid'], layered: ['fruit_delivery','layered'],
  topping: ['fruit_delivery','topping'], jam: ['fruit_delivery','jam'], nolactose: ['lactose_claim','lactose_free'],
  glutenfree: ['gluten_claim','gluten_free'], organic: ['organic_claim','declared'],
  protein: ['protein_claim','declared'], fibre: ['fibre_claim','declared'], bifidus: ['bifidus_claim','declared'],
  sterols: ['sterols_claim','declared'],
};
export function yogurtSpecs(tables = YOGURT_TABLES) {
  return Object.entries(tables).flatMap(([store, table]) => table.trim().split('\n').map(row => {
    const parts = row.split('|'); assert(parts.length === 5, 'table_columns');
    const [id,matrix,flavour,tokens,format] = parts;
    return {key:`${store}:${id}`,matrix,flavour,tokens:tokens === '-' ? [] : tokens.split(' '),format};
  }));
}

function originalTaxonomy(input, root) {
  const out = new Map();
  for (const s of input.sourceFiles.filter(s => s.kind === 'taxonomy')) {
    const text = readFileSync(`${root}/${s.file}`,'utf8'); assert(hash(text) === s.sha256, 'taxonomy_hash');
    JSON.parse(text).payload.rows.forEach((value,index) => out.set(`${s.store}:${value.id}`,
      {file:s.file,sha256:s.sha256,pointer:`/payload/rows/${index}`,value}));
  }
  return out;
}

function reviewedFormat(spec, product, cite) {
  // Numeric transcription is editorial; these checks only verify its source binding.
  // No title parser chooses the annotation or resolves a missing role.
  const v = /^(?:(\d+)x|\?(\d+):)?(\d+)(ml)?$/.exec(spec.format);
  assert(v, 'format_spec');
  const count = v[1] ? Number(v[1]) : v[2] ? Number(v[2]) : null;
  const amount = Number(v[3]) * (v[4] ? 1 : 1000), dimension = v[4] ? 'volume' : 'mass';
  const each = v[1] ? {amount,dimension} : null;
  const p = product.raw, refs = [];
  if (product.store === 'mercadona') {
    const pi = p.raw.price_instructions;
    assert(pi.approx_size === false && pi.selling_method === 0, 'mercadona_fixed_sale');
    assert((pi.is_pack ? pi.total_units : 1) === count, 'mercadona_count');
    assert(sameQuantity(nominalQuantity(pi.is_pack ? pi.pack_size : pi.unit_size, pi.size_format),each), 'mercadona_each');
    const total = nominalQuantity(pi.unit_size,pi.size_format);
    assert(total.dimension === dimension && total.amount === count * amount, 'mercadona_total');
    refs.push(cite('/raw/price_instructions'));
  } else if (product.store === 'consum') {
    const s = p.packaging.trim();
    const m = /^(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(gr|g|kg|ml)$/i.exec(s);
    assert(m && (m[1] ? Number(m[1]) : null) === count, 'consum_quantity_role');
    assert(sameQuantity(nominalQuantity(m[2],m[3]),{amount,dimension}), 'consum_quantity');
    refs.push(cite('/packaging'));
  } else {
    assert(product.store === 'carrefour', 'unsupported_store');
    const s = p.display_name;
    if (v[1]) {
      const m = /pack de (\d+) (?:unidades|bolsitas) de (\d+)\s*(g|ml)\b/i.exec(s);
      assert(m && Number(m[1]) === count && sameQuantity(nominalQuantity(m[2],m[3]),each), 'carrefour_pack');
    } else if (v[2]) {
      const m = /pack de (\d+) unidades (\d+)\s*g\b/i.exec(s);
      assert(m && Number(m[1]) === count && Number(m[2]) * 1000 === amount, 'carrefour_unknown_role');
    } else {
      const m = /(\d+)\s*g\.?$/.exec(s);
      assert(m && Number(m[1]) * 1000 === amount, 'carrefour_bare_quantity');
    }
    refs.push(cite('/display_name'));
  }
  const assortment = YOGURT_ASSORTMENTS[spec.key] ?? null;
  const compositionUnknown = ['assorted','unspecified_fruits'].includes(spec.flavour) && !assortment;
  if (assortment) {
    assert(Object.values(assortment).reduce((a,b)=>a+b,0) === count, 'assortment_count');
    refs.push(cite('/denomination'));
  }
  return {state:each && !compositionUnknown ? 'known' : 'unknown',count,each,
    total:each ? {dimension,amount:count * amount} : null,
    nominal:each ? null : {dimension,amount},
    assortment, composition:assortment ? 'explicit_assortment' : compositionUnknown ? 'unresolved' : 'single_declared_variant',
    evidence:unique(refs), reason:compositionUnknown
      ? 'Conteo y cantidad unitarios conservados; composición/reparto de sabores no acreditados. No aprobar la firma completa.'
      : each ? 'Conteo y contenido nominal unitario revisados; total exacto. La firma numérica no aprueba receta ni variante.'
        : 'Cantidad sin papel unitario/total acreditado. No asumir count=1 ni dividir la cantidad para inventar contenido unitario.'};
}

function reviewProduct(spec, product, input, taxonomy) {
  assert(product && hash(product.raw) === product.source.raw_sha256, 'source_binding');
  const citations = new Map(), inspected = [];
  const cite = pointer => {
    const value = pointerValue(product.raw,pointer), id = hash([product.observation_id,pointer]);
    citations.set(id,{id,kind:'product_field',pointer,value,product_key:product.key,
      observation_id:product.observation_id,captured_at:product.captured_at,source:product.source});
    return id;
  };
  for (const pointer of inspectedPointers) {
    let value;
    try { value = pointerValue(product.raw,pointer); } catch {
      inspected.push({pointer,presence:'absent_in_projection'}); continue;
    }
    inspected.push({pointer,presence:value === null ? 'null_in_projection' : 'present',evidence:cite(pointer)});
  }
  const categories = categoryPath(product.raw,product.store,input.taxonomy).map(c => {
    const t = taxonomy.get(`${product.store}:${c.id}`); assert(t, 'taxonomy_missing');
    const id = hash(t); citations.set(id,{id,kind:'original_taxonomy_row',...t}); return id;
  });
  if (product.raw.raw?.categories) categories.push(cite('/raw/categories'));
  const semantic = inspected.filter(x => x.presence === 'present' && ['/display_name','/denomination','/ingredients','/description','/raw/productData/description'].includes(x.pointer)).map(x=>x.evidence);
  const excluded = excludedMatrices.includes(spec.matrix);
  const attributes = Object.fromEntries(YOGURT_ATTRIBUTES.map(k => [k,{
    state:'unknown',value:null,evidence:semantic,
    reason:excluded ? 'Revisión de alcance; no se aprueba receta ni variantes del producto excluido.'
      : 'No acreditado de forma suficiente en esta proyección. Ausencia de mención no implica ausencia del atributo.',
  }]));
  const caveats = [];
  if (!excluded) {
    if (!['unknown','assorted','unspecified_fruits'].includes(spec.flavour)) attributes.declared_flavour = {
      state:'known',value:spec.flavour.split('+').sort(),evidence:semantic,
      reason:'Perfil nominal declarado revisado, no receta exhaustiva ni prueba de ausencia de trozos/otros ingredientes.',
    };
    for (const token of spec.tokens) {
      if (['bare_zero','light'].includes(token)) {
        caveats.push(token === 'bare_zero' ? '0%/00% sin objeto: no inferir grasa, azúcar total ni añadido.' : 'Ligero sin porcentaje: no convertir a desnatado ni 0% MG.'); continue;
      }
      const mapping = claims[token]; assert(mapping, `unknown_claim_${token}`);
      const [attribute,value] = mapping;
      assert(attributes[attribute].state === 'unknown', `duplicate_attribute_${spec.key}_${attribute}`);
      attributes[attribute] = {state:token === 'sugar_conflict' ? 'conflicting' : 'known',value,evidence:semantic,
        reason:YOGURT_NOTES[spec.key] ?? 'Declaración explícita revisada en los campos citados; no completa atributos ausentes.'};
    }
  }
  const format = excluded ? {state:'unknown',count:null,each:null,total:null,nominal:null,assortment:null,
    composition:'not_reviewed_scope_exclusion',evidence:[],reason:'Fuera del piloto: no aprobar formato de comparación.'}
    : reviewedFormat(spec,product,cite);
  const scopeRefs = [...semantic,...categories];
  const note = YOGURT_NOTES[spec.key] ?? (excluded
    ? `Identidad explícita ${spec.matrix} en título/categoría original; no usar yogur como ingrediente/sabor para incluir el producto en el piloto.`
    : `Lectura de la ficha ${spec.key}: matriz declarada ${spec.matrix}; sabor y claims solo donde constan. Marca, categoría cercana y ausencia de calificativos no completan especie, azúcar, grasa ni receta.`);
  const scope = excluded ? label('incompatible',note,scopeRefs)
    : label(spec.matrix === 'yogurt' && format.state === 'known' ? 'compatible' : 'unknown',
      spec.matrix === 'yogurt' ? 'Yogur declarado; modo nominal fijo y firma completa se aprueban únicamente donde están respaldados.'
        : 'Bífidus, leche fermentada, vegetal o bebida no acreditan por sí solos el subtipo exacto de yogur del piloto. No excluir ni aceptar por categoría o marca.',scopeRefs.concat(format.evidence));
  const out = {version:VERSION,key:product.key,display_name:product.raw.display_name,
    observation_id:product.observation_id,captured_at:product.captured_at,source:product.source,
    source_review_date:DATE,authorship:AUTHOR,source_review_complete:true,
    source_review_depth:excluded ? 'scope_gate_only' : 'family_attributes_and_format',
    matrix:spec.matrix,scope,attributes,format,note,caveats,inspected_fields:inspected,citations:[...citations.values()],
    source_dispute: ['carrefour:852100300','carrefour:522715570','carrefour:647801823','carrefour:819115325'].includes(spec.key),
    full_product_equivalence_established:false,independent_review_completed:false,gold_eligible:false};
  return {...out,review_id:hash(out)};
}

export function yogurtFormatRelation(a,b) {
  const refs = [...a.evidence,...b.evidence];
  for (const f of [a,b].filter(f=>f.state === 'known'))
    assert(Number.isSafeInteger(f.count) && f.count > 0 && f.each && f.total &&
      Number.isSafeInteger(f.each.amount) && f.each.amount > 0 && Number.isSafeInteger(f.total.amount) &&
      f.each.dimension === f.total.dimension && f.each.amount * f.count === f.total.amount, 'known_format_integrity');
  if ([a,b].some(x=>x.state === 'conflicting')) return label('conflicting','Conflicto de fuentes de formato conservado.',refs);
  // Any independent incompatible component suffices; never compare g with ml.
  if (a.count !== null && b.count !== null && a.count !== b.count) return label('incompatible','Número de envases diferente; independiente del papel de otras cantidades o masa/volumen.',refs);
  for (const k of ['each','total']) if (a[k] && b[k] && a[k].dimension === b[k].dimension && a[k].amount !== b[k].amount)
    return label('incompatible',`Contenido nominal ${k} diferente, en la misma dimensión; sin tolerancia.`,refs);
  const single = a.state === 'known' && a.count === 1 ? a : b.state === 'known' && b.count === 1 ? b : null;
  const partial = single === a ? b : a;
  if (single && partial.nominal && single.each.dimension === partial.nominal.dimension && single.each.amount !== partial.nominal.amount)
    return label('incompatible','Un envase unitario completo no coincide con la otra cantidad nominal, sea esta unidad o total.',refs);
  if (a.state === 'known' && b.state === 'known') {
    if (a.each.dimension !== b.each.dimension) return label('unknown','Masa/volumen sin densidad acreditada: no aceptar ni rechazar por conversión inventada.',refs);
    if (a.assortment && b.assortment && hash(a.assortment) !== hash(b.assortment))
      return label('incompatible','Surtidos con distribución de recetas explícita diferente.',refs);
    if (Boolean(a.assortment) !== Boolean(b.assortment)) return label('unknown','Composición de surtido frente a receta única: falta contraste completo.',refs);
    return label('compatible','Mismo conteo, contenido unitario y total exactos, con composición declarada contrastada. No prueba equivalencia semántica.',refs);
  }
  return label('unknown','Falta firma completa bilateral; dos cantidades aisladas pueden referirse a unidad o total.',refs);
}

export function yogurtAttributeRelation(key,a,b) {
  if ([a,b].some(x=>x.state === 'conflicting')) return 'conflicting';
  if ([a,b].some(x=>x.state !== 'known')) return 'unknown';
  if (hash(a.value) === hash(b.value)) return 'compatible';
  // Unequal claims are NOT generally disjoint: skimmed and 0% may overlap;
  // layered fruit can also be jam, liquid can be Greek, etc.
  if (['added_sugar','milk_presence','milk_species'].includes(key)) return 'incompatible';
  if (key === 'fat_claim' && [a.value,b.value].every(x=>['zero_percent','two_percent'].includes(x))) return 'incompatible';
  // milk_species is the explicitly named dairy base in this reviewed cohort,
  // not a species found anywhere in ingredients. Mixed/unspecified bases remain unknown.
  // Named flavour profiles can overlap; don't turn taxonomy synonyms into false negatives.
  if (key === 'declared_flavour') {
    const broad = ['natural','macedonia','wild_fruits','forest_fruits','red_fruits','tropical','cereals','muesli'];
    if ([...a.value,...b.value].some(x=>broad.includes(x))) return 'unknown';
    if (!a.value.some(x=>b.value.includes(x))) return 'incompatible';
  }
  return 'unknown';
}

export function yogurtEANConflict(eans,labels) {
  if (eans[0]?.value && eans[0].value === eans[1]?.value && ['variants','format'].some(k=>labels[k].state === 'incompatible'))
    return label('conflicting','EAN coincidente con una oposición acreditada: conservar disputa, nunca saltar validadores por el código.',[...eans.map(c=>c.id),...labels.variants.evidence,...labels.format.evidence]);
  return null;
}

export function composeYogurtPair(pair,left,right,input) {
  assert(left.key === pair.left && right.key === pair.right && pair.left < pair.right, 'pair_binding');
  for (const r of [left,right]) {
    const {review_id,...body} = r;
    assert(hash(body) === review_id && r.source_review_complete === true && r.version === VERSION &&
      r.authorship === AUTHOR && r.gold_eligible === false && r.independent_review_completed === false, 'review_binding');
    const original = input.products.find(p=>p.key === r.key);
    assert(original && original.observation_id === r.observation_id && hash(original.raw) === r.source.raw_sha256 &&
      hash([r.key,r.captured_at,r.source.raw_sha256]) === r.observation_id &&
      hash(original.source) === hash(r.source), 'observation_changed');
  }
  const refs = [...left.scope.evidence,...right.scope.evidence], outside = [left,right].some(p=>p.scope.state === 'incompatible');
  const labels = {
    scope:label(outside ? 'incompatible' : [left,right].every(p=>p.scope.state === 'compatible') ? 'compatible' : 'unknown',
      outside ? 'Al menos un producto es explícitamente ajeno al piloto; ver ficha y criterio de exclusión.' : 'Alcance y formato fijo contrastados, sin aprobar categorías ambiguas.',refs),
    identity:label(!outside && left.matrix === 'yogurt' && right.matrix === 'yogurt' ? 'compatible' : 'unknown',
      'Matriz gruesa de yogur declarado; subtipo/estilo, base y receta se conservan en variantes sin aprobar ausencias.',refs),
    variants:label('unknown','Faltan atributos obligatorios de receta, especie, endulzado o declaraciones completas.',refs),
    format:outside ? label('unknown','Revisión limitada a exclusión; no validar el formato comercial.',refs) : yogurtFormatRelation(left.format,right.format),
  };
  const comparisons = Object.fromEntries(YOGURT_ATTRIBUTES.map(k=>[k,{
    left:{state:left.attributes[k].state,value:left.attributes[k].value},
    right:{state:right.attributes[k].state,value:right.attributes[k].value},
    relation:outside ? 'unknown' : yogurtAttributeRelation(k,left.attributes[k],right.attributes[k]),
    evidence:unique([...left.attributes[k].evidence,...right.attributes[k].evidence]),
  }]));
  const conflicts = Object.keys(comparisons).filter(k=>comparisons[k].relation === 'conflicting');
  const negatives = Object.keys(comparisons).filter(k=>comparisons[k].relation === 'incompatible');
  if (!outside && conflicts.length) labels.variants = label('conflicting',`Fuentes enfrentadas: ${conflicts.join(', ')}. Abstenerse y arbitrar.`,conflicts.flatMap(k=>comparisons[k].evidence));
  else if (!outside && negatives.length) labels.variants = label('incompatible',`Oposición explícita revisada: ${negatives.join(', ')}. No completa las demás dimensiones.`,negatives.flatMap(k=>comparisons[k].evidence));
  const eans = [left,right].map(p=>p.citations.find(c=>c.kind === 'product_field' && c.pointer === '/ean'));
  labels.identity = yogurtEANConflict(eans,labels) ?? labels.identity;
  const commercial = {
    price:'No se acredita base/condición de precio bilateral por CP; no declarar ahorro.',
    location:'Falta prueba bilateral exacta de ubicación/canal; Consum es aproximación provincial y no hay adquisición local completa de todas las tiendas.',
    availability:'Catálogo activo/global no prueba disponibilidad bilateral en este CP.',
    catalog:'Observación congelada trazable; faltan revisiones completas del futuro perfil/formato/precio/ámbito. Sin caducidad artificial de 24 h.',
  };
  const contexts = ['08006','25001'].map(postcode=>{
    const commercialLabels = Object.fromEntries(commercialDimensions.map(k=>[k,label('unknown',commercial[k])]));
    return {postcode,channel:'retailer_online_catalog',reference_clock:input.queries[0].reference_clock,
      direction:'canonical_left_to_right_not_a_savings_claim',labels:commercialLabels,
      location_observations:input.locations.filter(l=>[pair.left,pair.right].includes(l.product_key) && l.raw.store === 'consum' && postcode === '08006' && l.raw.location_id === '575')
        .map(l=>({key:l.key,source:l.source,captured_at:l.captured_at,raw_sha256:hash(l.raw)})),
      decision:annotationDecision(Object.fromEntries(Object.entries({...labels,...commercialLabels}).map(([k,v])=>[k,v.state])))};
  });
  const out = {version:VERSION,pair_id:hash([pair.left,pair.right]),left:pair.left,right:pair.right,
    cohort:pair.cohort,sampling_stratum_preserved_not_truth:pair.stratum,
    observations:[left.observation_id,right.observation_id],product_reviews:[left.review_id,right.review_id],
    authorship:AUTHOR,annotation_status:'first_annotation_composed_from_reviewed_sources',
    review_status:'awaiting_owner_independent_review',independent_pair_by_pair_review_completed:false,
    independent_review_completed:false,gold_eligible:false,product_labels:labels,attribute_comparisons:comparisons,
    source_dispute:left.source_dispute || right.source_dispute,contexts};
  return {...out,annotation_id:hash(out)};
}

export function buildYogurtReview(input, specs = yogurtSpecs(), root = '.') {
  assert(input.manifest_sha256 === CORPUS_MANIFEST_SHA256, 'manifest');
  const pairs = input.pairs.filter(p=>p.family === 'yogurt'), corpusKeys = new Set(pairs.flatMap(p=>[p.left,p.right]));
  const keys = new Set(specs.map(s=>s.key));
  assert(keys.size === specs.length && specs.every(s=>corpusKeys.has(s.key)), 'unique_in_scope_specs');
  const taxonomy = originalTaxonomy(input,root), originals = new Map(input.products.map(p=>[p.key,p]));
  const products = specs.map(s=>reviewProduct(s,originals.get(s.key),input,taxonomy)).sort((a,b)=>a.key < b.key ? -1 : 1);
  const reviewed = new Map(products.map(p=>[p.key,p]));
  const annotations = pairs.filter(p=>keys.has(p.left) && keys.has(p.right)).map(p=>composeYogurtPair(p,reviewed.get(p.left),reviewed.get(p.right),input));
  const index = annotations.map(a=>({pair_id:a.pair_id,annotation_id:a.annotation_id,left:a.left,right:a.right,
    product_reviews:a.product_reviews,cohort:a.cohort,states:Object.fromEntries(dimensions.map(k=>[k,a.product_labels[k].state])),
    decision:a.contexts[0].decision,source_dispute:a.source_dispute,
    differences:Object.keys(a.attribute_comparisons).filter(k=>a.attribute_comparisons[k].relation === 'incompatible')}));
  const editorial = JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-corpus-v1/editorial.json`,'utf8'))
    .filter(p=>p.cohort === 'editorial_subset_of_frozen_corpus');
  const potatoes = JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-potatoes-v1/index.json`,'utf8'));
  const prior = new Map([...editorial,...potatoes].map(p=>[p.pair_id,p]));
  const union = new Set([...prior.keys(),...index.map(p=>p.pair_id)]);
  const overlaps = index.filter(p=>prior.has(p.pair_id)).map(p=>{
    const old = prior.get(p.pair_id);
    return {pair_id:p.pair_id,previous_id:old.id ?? old.annotation_id,annotation_id:p.annotation_id,
      changed_product_dimensions:dimensions.filter(k=>(old.states?.[k] ?? old.labels[k].state) !== p.states[k]),decision_changed:old.decision !== p.decision};
  });
  const counts = xs=>Object.fromEntries(unique(xs).sort().map(k=>[k,xs.filter(x=>x === k).length]));
  const report = {version:VERSION,date:DATE,status:'incremental_yogurt_first_annotation_not_family_complete',
    source_reviewed_products:products.length,reviewed_by_store:counts(products.map(p=>p.key.split(':')[0])),
    source_review_depth:counts(products.map(p=>p.source_review_depth)),first_annotations_this_batch:annotations.length,
    newly_first_annotated_corpus_pairs:union.size-prior.size,previous_first_annotated_corpus_pairs:prior.size,
    overlapping_previous_annotations:overlaps,union_first_annotated_corpus_pairs:union.size,
    corpus_pairs_pending_first_annotation:input.pairs.length-union.size,
    pending_by_family:counts(input.pairs.filter(p=>!union.has(hash([p.left,p.right]))).map(p=>p.family)),
    yogurt_products_remaining_without_source_review:corpusKeys.size-products.length,
    decision_counts:counts(index.map(p=>p.decision)),dimension_counts:Object.fromEntries(dimensions.map(k=>[k,counts(index.map(p=>p.states[k]))])),
    source_dispute_products:products.filter(p=>p.source_dispute).map(p=>p.key),source_dispute_pairs:index.filter(p=>p.source_dispute).length,
    known_format_products:products.filter(p=>p.format.state === 'known').length,
    corpus_pairs_unchanged:input.pairs.length,corpus_queries_unchanged:input.queries.length,
    original_origin_count_unchanged:new Set(input.queries.map(q=>q.origin)).size,
    independent_pair_by_pair_reviews_this_batch:0,independent_reviews:0,gold_pairs:0,supported_full_positive_equivalences:0,eligible_savings:0,
    CE201_complete:false,CE202_complete:false,CE203_complete:false,G2_pass:false,
    remote_project_calls:0,retailer_calls:0,new_integrations:0,commercial_ttl_hours:null,
    source_manifest_sha256:input.manifest_sha256,specs_sha256:hash(specs),
    hashes:{products:hash(products),annotations:hash(annotations),index:hash(index)},
    limitation:'Editorial source review and deterministic pair composition; not individual human review, gold, matcher evaluation or general-purpose extractor. Unknowns concern this projection. Only pairs with both reviewed observations are counted.'};
  return {products,annotations,index,report};
}
