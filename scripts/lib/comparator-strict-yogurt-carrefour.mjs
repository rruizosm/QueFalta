// OFFLINE editorial layer; no network, writes, production imports or draft promotion.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {CORPUS_MANIFEST_SHA256,nominalQuantity,pointerValue} from './comparator-strict-corpus-labels.mjs';
import {categoryPath} from './comparator-strict-corpus.mjs';
import {annotationDecision} from './comparator-strict-labels.mjs';
import {YOGURT_REVIEW_VERSION,YOGURT_ATTRIBUTES,composeYogurtPair,yogurtAttributeRelation,yogurtEANConflict} from './comparator-strict-yogurt-review.mjs';
import {CARREFOUR_LAYER,CARREFOUR_TABLE,CARREFOUR_NOTES,CARREFOUR_DISPUTES} from './comparator-strict-yogurt-carrefour-specs.mjs';
export {CARREFOUR_LAYER};
const assert=(ok,why)=>{if(!ok)throw Error(`ce202_carrefour_${why}`);};
const unique=xs=>[...new Set(xs)];
const counts=xs=>Object.fromEntries(unique(xs).sort().map(k=>[k,xs.filter(x=>x===k).length]));
const label=(state,reason,evidence=[])=>({state,reason,evidence:unique(evidence)});
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const compact=q=>({dimension:q.dimension,amount:q.amount});
const quant=(n,u)=>compact(nominalQuantity(n,u));
const eq=(a,b)=>a&&b&&a.dimension===b.dimension&&a.amount===b.amount;
const excluded=['dessert','kefir','sauce','protein_drink','cake','pet_food','cheese','curd','infant_dessert','cosmetic','icecream','plant_kefir','porridge','icecream_preparation'];
const attrs={milk:['milk_presence','present'],dairy_free:['milk_presence','absent_claim'],
  added:['added_sugar','added'],noadded:['added_sugar','no_added_claim'],sweetened:['sweeteners','present'],
  total_sugar_free:['total_sugar_claim','sugar_free_claim'],cow:['milk_species','cow'],goat:['milk_species','goat'],sheep:['milk_species','sheep'],
  soy:['plant_base','soy'],coconut_base:['plant_base','coconut'],almond_base:['plant_base','almond'],
  greek:['greek_style','declared'],liquid:['liquid_form','liquid'],layered:['fruit_delivery','layered'],
  skimmed:['fat_claim','skimmed'],semi_skimmed:['fat_claim','semi_skimmed'],light:['fat_claim','light'],fat_conflict:['fat_claim',null],
  nolactose:['lactose_claim','lactose_free'],glutenfree:['gluten_claim','gluten_free'],organic:['organic_claim','declared'],
  protein:['protein_claim','declared'],fibre:['fibre_claim','declared'],bifidus:['bifidus_claim','declared'],sterols:['sterols_claim','declared']};
export const carrefourSpecs=()=>CARREFOUR_TABLE.trim().split('\n').map(row=>{
  const c=row.split('|');assert(c.length===5,'spec_columns');const [id,matrix,flavour,tokens,format]=c;
  return {key:`carrefour:${id}`,id,matrix,flavour,tokens:tokens==='-'?[]:tokens.split(' '),format};
});

// Numeric literal validation only. Editorial rows, not regex, choose the facts.
export function carrefourFormatCandidates(raw) {
  const full=[],counts=[],quantities=[];
  for(const pointer of ['/display_name','/raw/name']) {
    const text=pointerValue(raw,pointer);if(typeof text!=='string')continue;const t=fold(text);
    for(const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|ml|g|l)\b/g))quantities.push({quantity:quant(m[1],m[2]),pointer,excerpt:m[0]});
    for(const m of t.matchAll(/(\d+)\s*(?:unidades|bolsitas)\b/g))counts.push({count:Number(m[1]),pointer,excerpt:m[0]});
    for(const m of t.matchAll(/(\d+)\s*(?:unidades|bolsitas)\s+de\s*(\d+(?:[.,]\d+)?)\s*(kg|ml|g|l)\b/g))
      full.push({count:Number(m[1]),each:quant(m[2],m[3]),pointer,excerpt:m[0]});
  }
  return {full,counts,quantities};
}
export function reviewCarrefourFormat(spec,raw,cite=x=>x) {
  const candidates=carrefourFormatCandidates(raw),evidence=['/display_name','/raw/name','/raw/sell_pack_unit','/raw/measure_unit']
    .filter(p=>{try{pointerValue(raw,p);return true;}catch{return false;}}).map(cite);
  const full=/^(\d+)x(\d+)(g|ml)$/.exec(spec.format),countOnly=/(?:^|,)c(\d+)(?:,|$)/.exec(spec.format),nominal=/(?:^|,)q(\d+)(g|ml)(?:,|$)/.exec(spec.format);
  const count=full?Number(full[1]):countOnly?Number(countOnly[1]):null;
  const each=full?quant(full[2],full[3]):null;
  let nominalValue=nominal?quant(nominal[1],nominal[2]):null;
  assert(full||countOnly||nominal||spec.format==='?','format_spec');
  if(full)assert(candidates.full.some(f=>f.count===count&&eq(f.each,each)),`explicit_format_${spec.id}`);
  if(countOnly)assert(candidates.counts.some(f=>f.count===count),`count_${spec.id}`);
  if(nominal)assert(candidates.quantities.some(f=>eq(f.quantity,nominalValue)),`nominal_${spec.id}`);
  if(spec.format==='?')assert(candidates.quantities.length===0&&candidates.counts.length===0,'unreviewed_quantity');
  if(count!==null)assert(candidates.counts.every(c=>c.count===count),`unresolved_count_${spec.id}`);
  if(each) {
    assert(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(each.amount*count),'format_arithmetic');
    assert(candidates.quantities.every(c=>eq(c.quantity,each)||eq(c.quantity,{dimension:each.dimension,amount:each.amount*count})),`unresolved_quantity_${spec.id}`);
  }
  let warning=spec.flavour==='assorted'?'assortment_distribution_unknown':each?null:'unresolved_quantity_role';
  if(new Set(candidates.quantities.map(c=>hash(c.quantity))).size>1&&!each){nominalValue=null;warning='multiple_unassigned_quantities';}
  if(spec.id==='VC4AECOMM-225693'){nominalValue=null;warning='suspect_nominal_quantity';}
  if(spec.format==='?')warning='no_commercial_quantity';
  const state=each&&!warning?'known':'unknown';
  return {state,count,each,total:each?{dimension:each.dimension,amount:each.amount*count}:null,nominal:nominalValue,
    assortment:null,composition:spec.flavour==='assorted'?'unresolved':'single_declared_variant',evidence,warning,observed_candidates:candidates,
    reason:CARREFOUR_NOTES[spec.id]??(state==='known'?'Unidades y contenido por unidad explícitos, total exacto; no prueba receta ni comercio.':'Cantidad aislada o estructura incompleta; no inferir un envase desde sell_pack_unit ni tomar la base nutricional como peso comercial.')};
}
function taxonomyRows(input,root){
  const out=new Map();
  for(const s of input.sourceFiles.filter(s=>s.kind==='taxonomy'&&s.store==='carrefour')){
    const text=readFileSync(`${root}/${s.file}`,'utf8');assert(hash(text)===s.sha256,'taxonomy_hash');
    JSON.parse(text).payload.rows.forEach((value,index)=>out.set(String(value.id),{file:s.file,sha256:s.sha256,pointer:`/payload/rows/${index}`,value}));
  }
  return out;
}
function reviewProduct(spec,p,input,taxonomy){
  assert(p&&p.store==='carrefour'&&hash(p.raw)===p.source.raw_sha256,'source_binding');
  const citations=new Map(),inspected=[];
  const cite=pointer=>{const value=pointerValue(p.raw,pointer),id=hash([p.observation_id,pointer]);
    citations.set(id,{id,kind:'product_field',pointer,value,product_key:p.key,observation_id:p.observation_id,captured_at:p.captured_at,source:p.source});return id;};
  for(const pointer of ['/display_name','/denomination','/ingredients','/allergens','/conservation','/preparation','/nutrition','/ean',
    '/raw/name','/raw/sell_pack_unit','/raw/measure_unit','/raw/parent_category','/category_name','/category_id','/category_ids']){
    let value;try{value=pointerValue(p.raw,pointer);}catch{inspected.push({pointer,presence:'absent_in_projection'});continue;}
    inspected.push({pointer,presence:value===null?'null_in_projection':'present',evidence:cite(pointer)});
  }
  const categories=categoryPath(p.raw,p.store,input.taxonomy).map(c=>{
    const t=taxonomy.get(String(c.id));assert(t,'category_source');const id=hash(t);citations.set(id,{id,kind:'original_taxonomy_row',...t});return id;});
  const semantic=inspected.filter(x=>x.presence==='present'&&['/display_name','/denomination','/ingredients'].includes(x.pointer)).map(x=>x.evidence);
  const outside=excluded.includes(spec.matrix),note=CARREFOUR_NOTES[spec.id]??(outside
    ?`Identidad ${spec.matrix} explícita en los campos revisados; yogur como ingrediente, aroma o categoría vecina no incorpora el producto al piloto.`
    :`Lectura editorial ${p.key}: matriz ${spec.matrix}; solo declaraciones explícitas, sin completar especie, endulzado, estilo o funcionalidad desde marca o referencias vecinas.`);
  const attributes=Object.fromEntries(YOGURT_ATTRIBUTES.map(k=>[k,{state:'unknown',value:null,evidence:semantic,
    reason:outside?'Exclusión de alcance; no se aprueba receta del producto excluido.':'No acreditado suficientemente; ausencia de mención no demuestra ausencia del atributo.'}]));
  if(!outside){
    if(!['unknown','assorted'].includes(spec.flavour))attributes.declared_flavour={state:'known',value:spec.flavour.split('+').sort(),evidence:semantic,reason:'Perfil nominal explícito, no formulación exhaustiva ni ausencia de otros ingredientes.'};
    for(const token of spec.tokens){const a=attrs[token];assert(a,`claim_${token}`);const [k,value]=a;assert(attributes[k].state==='unknown',`duplicate_claim_${spec.id}_${k}`);
      attributes[k]={state:token==='fat_conflict'?'conflicting':'known',value,evidence:semantic,reason:note};}
  }
  const format=outside?{state:'unknown',count:null,each:null,total:null,nominal:null,assortment:null,composition:'not_reviewed_scope_exclusion',evidence:[],warning:null,reason:'Fuera del piloto; sin aprobación de formato.'}:reviewCarrefourFormat(spec,p.raw,cite);
  const scopeRefs=unique([...semantic,...categories,...format.evidence]);
  const scope=outside?label('incompatible',note,scopeRefs):label(spec.matrix==='yogurt'&&format.state==='known'?'compatible':'unknown','Solo yogur declarado con formato completo en alcance verificado; fermentado, vegetal, infantil o matriz ambigua requieren homologación explícita.',scopeRefs);
  const dispute=CARREFOUR_DISPUTES[spec.id]??null;
  const out={version:YOGURT_REVIEW_VERSION,editorial_layer:CARREFOUR_LAYER,key:p.key,display_name:p.raw.display_name,
    observation_id:p.observation_id,captured_at:p.captured_at,source:p.source,source_review_date:'2026-09-03',
    authorship:'assistant_source_review_with_deterministic_pair_composition',source_review_complete:true,
    source_review_depth:outside?'scope_gate_only':'family_attributes_and_format',review_language:'es',matrix:spec.matrix,scope,attributes,format,note,
    caveats:['No es revisión humana independiente ni receta completa. Nutrición, alérgenos y declaraciones funcionales originales se conservan sin homologación automática.'],
    inspected_fields:inspected,citations:[...citations.values()],source_dispute:Boolean(dispute),source_dispute_kind:dispute,
    full_product_equivalence_established:false,independent_review_completed:false,gold_eligible:false};
  return {...out,review_id:hash(out)};
}

// Incremental conservative guard: related cocoa/chocolate/stracciatella profiles
// do not establish disjoint flavours. Neither equality nor a new positive follows.
export function carrefourAttributeRelation(key,a,b){
  const base=yogurtAttributeRelation(key,a,b);
  const related=['cocoa','chocolate','stracciatella'];
  if(key==='declared_flavour'&&base==='incompatible'&&[a,b].every(x=>x.value.some(v=>related.includes(v))))return 'unknown';
  return base;
}
export function composeCarrefourPair(pair,left,right,input){
  const a=composeYogurtPair(pair,left,right,input),outside=a.product_labels.scope.state==='incompatible';
  const flavour=a.attribute_comparisons.declared_flavour;
  a.relationship_policy=CARREFOUR_LAYER;
  a.relationship_adjustments=[];
  if(!outside){
    const relation=carrefourAttributeRelation('declared_flavour',flavour.left,flavour.right);
    if(relation!==flavour.relation){
      a.relationship_adjustments.push({attribute:'declared_flavour',previous_relation:flavour.relation,relation,reason:'Related cocoa/chocolate/stracciatella profiles are not proven disjoint.'});flavour.relation=relation;
      const comparisons=a.attribute_comparisons,conflicts=Object.keys(comparisons).filter(k=>comparisons[k].relation==='conflicting'),negatives=Object.keys(comparisons).filter(k=>comparisons[k].relation==='incompatible');
      const state=conflicts.length?'conflicting':negatives.length?'incompatible':'unknown',keys=conflicts.length?conflicts:negatives;
      a.product_labels.variants=label(state,keys.length?`Oposiciones o conflictos conservados: ${keys.join(', ')}.`:'Perfiles relacionados no prueban diferencia ni equivalencia; faltan declaraciones completas.',keys.flatMap(k=>comparisons[k].evidence));
      const eans=[left,right].map(p=>p.citations.find(c=>c.kind==='product_field'&&c.pointer==='/ean'));
      a.product_labels.identity=yogurtEANConflict(eans,a.product_labels)??label(left.matrix==='yogurt'&&right.matrix==='yogurt'?'compatible':'unknown','Matriz gruesa revisada; no equivalencia completa.',[...left.scope.evidence,...right.scope.evidence]);
    }
  }
  a.editorial_layer=CARREFOUR_LAYER;
  for(const c of a.contexts){
    c.location_observations.push(...input.locations.filter(l=>[pair.left,pair.right].includes(l.product_key)&&l.raw.store==='plusfresc'&&l.raw.location_id===(c.postcode==='08006'?'3':'12')).map(l=>({key:l.key,source:l.source,captured_at:l.captured_at,raw_sha256:hash(l.raw)})));
    c.decision=annotationDecision(Object.fromEntries(Object.entries({...a.product_labels,...c.labels}).map(([k,v])=>[k,v.state])));
  }
  delete a.annotation_id;return {...a,annotation_id:hash(a)};
}
export function buildCarrefourYogurtReview(input,root='.',specs=carrefourSpecs()){
  assert(input.manifest_sha256===CORPUS_MANIFEST_SHA256,'manifest');
  const base=[];
  for(const name of ['yogurt','yogurt-plusfresc']){
    const receipt=JSON.parse(readFileSync(`${root}/docs/comparator-strict/CE-201-202-${name}-evidence.json`,'utf8'));
    for(const f of receipt.files)assert(hash(readFileSync(`${root}/${f.path}`,'utf8'))===f.sha256,`frozen_input_${f.path}`);
    base.push(...JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-${name}-v1/products.json`,'utf8')));
  }
  const block=input.pairs.filter(p=>p.family==='yogurt'),keys=new Set(block.flatMap(p=>[p.left,p.right])),baseKeys=new Set(base.map(p=>p.key));
  const originals=new Map(input.products.map(p=>[p.key,p])),expected=input.products.filter(p=>keys.has(p.key)&&p.store==='carrefour'&&!baseKeys.has(p.key));
  assert(specs.length===expected.length&&new Set(specs.map(p=>p.key)).size===specs.length&&specs.every(s=>expected.some(p=>p.key===s.key)),'exact_source_coverage');
  const taxonomy=taxonomyRows(input,root),products=specs.map(s=>reviewProduct(s,originals.get(s.key),input,taxonomy)).sort((a,b)=>a.key<b.key?-1:1);
  const all=new Map([...base,...products].map(p=>[p.key,p])),newKeys=new Set(products.map(p=>p.key));
  const annotations=block.filter(p=>all.has(p.left)&&all.has(p.right)&&(newKeys.has(p.left)||newKeys.has(p.right))).map(p=>composeCarrefourPair(p,all.get(p.left),all.get(p.right),input));
  const dims=['scope','identity','variants','format'];
  const index=annotations.map(a=>({pair_id:a.pair_id,annotation_id:a.annotation_id,left:a.left,right:a.right,cohort:a.cohort,product_reviews:a.product_reviews,
    states:Object.fromEntries(dims.map(k=>[k,a.product_labels[k].state])),decision:a.contexts[0].decision,source_dispute:a.source_dispute,
    differences:Object.keys(a.attribute_comparisons).filter(k=>a.attribute_comparisons[k].relation==='incompatible'),relationship_adjustments:a.relationship_adjustments}));
  const editorial=JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-corpus-v1/editorial.json`,'utf8')).filter(p=>p.cohort==='editorial_subset_of_frozen_corpus');
  const prior=[...editorial,...['label-potatoes-v1','label-yogurt-v1','label-yogurt-plusfresc-v1'].flatMap(d=>JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/${d}/index.json`,'utf8')))];
  const previous=new Map(prior.map(p=>[p.pair_id,p])),union=new Set([...previous.keys(),...index.map(p=>p.pair_id)]);
  const overlaps=index.filter(p=>previous.has(p.pair_id)).map(p=>{
    const old=previous.get(p.pair_id);
    return {pair_id:p.pair_id,previous_id:old.id??old.annotation_id,annotation_id:p.annotation_id,
      changed_product_dimensions:dims.filter(k=>(old.states?.[k]??old.labels[k].state)!==p.states[k]),decision_changed:old.decision!==p.decision};
  });
  const drafts=new Map(Array.from({length:12},(_,i)=>String(i*500).padStart(4,'0')).flatMap(offset=>
    JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-corpus-v1/index-${offset}.json`,'utf8'))).map(p=>[hash([p.left,p.right]),p]));
  const transitions=index.map(p=>{const draft=drafts.get(p.pair_id);assert(draft,'draft_pair_binding');return `${draft.decision_draft} -> ${p.decision}`;});
  const report={version:CARREFOUR_LAYER,date:'2026-09-03',status:'yogurt_source_block_complete_not_complete_equivalence_or_gold',
    relationship_contract:YOGURT_REVIEW_VERSION,relationship_policy:CARREFOUR_LAYER,
    source_reviewed_products:products.length,reused_unchanged_product_reviews:base.length,yogurt_source_reviews_total:all.size,
    source_review_depth:counts(products.map(p=>p.source_review_depth)),matrix_counts:counts(products.map(p=>p.matrix)),
    first_annotations_this_batch:annotations.length,previous_first_annotated_corpus_pairs:previous.size,newly_first_annotated_corpus_pairs:union.size-previous.size,
    union_first_annotated_corpus_pairs:union.size,corpus_pairs_pending_first_annotation:input.pairs.length-union.size,
    pending_by_family:counts(input.pairs.filter(p=>!union.has(hash([p.left,p.right]))).map(p=>p.family)),remaining_yogurt_source_reviews:counts(input.products.filter(p=>keys.has(p.key)&&!all.has(p.key)).map(p=>p.store)),
    overlapping_previous_annotations:overlaps,decision_counts:counts(index.map(p=>p.decision)),dimension_counts:Object.fromEntries(dims.map(k=>[k,counts(index.map(p=>p.states[k]))])),
    editorial_decision_disagreements_requiring_owner_arbitration:overlaps.filter(p=>p.decision_changed).map(p=>p.previous_id),
    comparison_against_frozen_drafts_not_motor_quality:counts(transitions),
    known_format_products:products.filter(p=>p.format.state==='known').length,
    semantic_title_only_products:products.filter(p=>['/denomination','/ingredients'].every(k=>p.inspected_fields.find(f=>f.pointer===k)?.presence!=='present')).length,
    source_dispute_products:products.filter(p=>p.source_dispute).map(p=>p.key),source_dispute_pairs:index.filter(p=>p.source_dispute).length,
    format_warning_counts:counts(products.filter(p=>p.format.warning).map(p=>p.format.warning)),relationship_adjusted_pairs:index.filter(p=>p.relationship_adjustments.length).length,
    corpus_pairs_unchanged:input.pairs.length,corpus_queries_unchanged:input.queries.length,original_origin_count_unchanged:new Set(input.queries.map(q=>q.origin)).size,
    independent_pair_by_pair_reviews_this_batch:0,independent_reviews:0,gold_pairs:0,supported_full_positive_equivalences:0,eligible_savings:0,
    CE201_complete:false,CE202_complete:false,CE203_complete:false,G2_pass:false,remote_project_calls:0,retailer_calls:0,new_integrations:0,commercial_ttl_hours:null,
    source_manifest_sha256:input.manifest_sha256,specs_sha256:hash(specs),hashes:{products:hash(products),annotations:hash(annotations),index:hash(index)},
    limitation:'Editorial source review plus deterministic pair composition, not individual human pair review, gold, production quality or evidence that no equivalent exists. All yogurt-block observations registered; complete variants and bilateral commerce remain pending.'};
  return {products,annotations,index,report};
}
