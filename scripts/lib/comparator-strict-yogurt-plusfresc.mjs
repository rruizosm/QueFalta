// Incremental OFFLINE layer. Reuses the frozen v1 review/relationship contract,
// not the v1 generator or draft facts. No app imports, network or writes.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {CORPUS_MANIFEST_SHA256,nominalQuantity,pointerValue} from './comparator-strict-corpus-labels.mjs';
import {categoryPath} from './comparator-strict-corpus.mjs';
import {YOGURT_REVIEW_VERSION,YOGURT_ATTRIBUTES,composeYogurtPair} from './comparator-strict-yogurt-review.mjs';
import {PLUSFRESC_LAYER,PLUSFRESC_TABLE,PLUSFRESC_NOTES,PLUSFRESC_FORMAT_WARNINGS} from './comparator-strict-yogurt-plusfresc-specs.mjs';
export {PLUSFRESC_LAYER};
const assert=(ok,why)=>{if(!ok) throw Error(`ce202_plusfresc_${why}`);};
const unique=xs=>[...new Set(xs)];
const label=(state,reason,evidence=[])=>({state,reason,evidence:unique(evidence)});
const countValues=xs=>Object.fromEntries(unique(xs).sort().map(k=>[k,xs.filter(x=>x===k).length]));
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const quant=(n,u)=>nominalQuantity(n,/^gr|^gram/.test(u.toLowerCase())?'g':u);
const compact=q=>q?{dimension:q.dimension,amount:q.amount}:null;
const eq=(a,b)=>a&&b&&a.amount===b.amount&&a.dimension===b.dimension;
const u='(gramos|grs|gr|kg|ml|g|l)',n='(\\d+(?:[.,]\\d+)?)';
const excluded=['biscuit','pet_treat','pudding','kefir','infant_dessert','meal_replacement'];
// Explicit editorial reading of count position in two unitless descriptions.
// Never choose the smaller of two numbers as a generic count heuristic.
const reviewedUnitlessCounts={
  '016654':{count:4,pointer:'/description',excerpt:'4X120'},
  '024113':{count:8,pointer:'/description',excerpt:'8X100'},
};
const attrs={milk:['milk_presence','present'],dairy_free:['milk_presence','absent_claim'],
  added:['added_sugar','added'],noadded:['added_sugar','no_added_claim'],sugar_conflict:['added_sugar',null],
  total_sugar_free:['total_sugar_claim','sugar_free_claim'],sweetened:['sweeteners','present'],
  cow:['milk_species','cow'],goat:['milk_species','goat'],sheep:['milk_species','sheep'],
  soy:['plant_base','soy'],soy_coconut:['plant_base','soy+coconut'],coconut_base:['plant_base','coconut'],
  greek:['greek_style','declared'],liquid:['liquid_form','liquid'],topping:['fruit_delivery','topping'],
  skimmed:['fat_claim','skimmed'],zero_fat:['fat_claim','zero_percent'],
  nolactose:['lactose_claim','lactose_free'],glutenfree:['gluten_claim','gluten_free'],
  organic:['organic_claim','declared'],protein:['protein_claim','declared'],fibre:['fibre_claim','declared'],
  bifidus:['bifidus_claim','declared'],sterols:['sterols_claim','declared']};
export const plusfrescSpecs=()=>PLUSFRESC_TABLE.trim().split('\n').map(row=>{
  const columns=row.split('|');assert(columns.length===5,'spec_columns');
  const [id,matrix,flavour,tokens,format]=columns;
  return {key:`plusfresc:${id}`,id,matrix,flavour,tokens:tokens==='-'?[]:tokens.split(' '),format};
});

// Detect literals only to validate editorial numeric transcriptions. The
// annotator selected the facts; neither these candidates nor a score labels a SKU.
export function plusfrescFormatCandidates(raw) {
  const full=[],counts=[],quantities=[];
  for(const pointer of ['/display_name','/description']) {
    const text=pointerValue(raw,pointer);if(typeof text!=='string')continue;
    const t=fold(text);
    for(const m of t.matchAll(new RegExp(`${n}\\s*${u}\\b`,'g'))) quantities.push({quantity:compact(quant(m[1],m[2])),pointer,excerpt:m[0]});
    for(const pattern of [/(\d+)\s*(?:unidades|uds?\.?|un\.|u\.?)(?=\s|,|$)/g,/pack\s+(\d+)\b/g])
      for(const m of t.matchAll(pattern)) counts.push({count:Number(m[1]),pointer,excerpt:m[0],basis:'count_literal'});
    for(const pattern of [new RegExp(`(\\d+)\\s*[x×]\\s*${n}\\s*${u}\\b`,'g'),new RegExp(`${n}\\s*${u}\\s*[x×]\\s*(\\d+)\\b`,'g')]) {
      const reverse=pattern.source.startsWith(n);
      for(const m of t.matchAll(pattern)) full.push({count:Number(reverse?m[3]:m[1]),each:compact(quant(reverse?m[1]:m[2],reverse?m[2]:m[3])),pointer,excerpt:m[0]});
    }
    for(const pattern of [new RegExp(`\\b1\\s*(?:unidad|u\\.?)\\s*,?\\s*${n}\\s*${u}\\b`,'g'),
      new RegExp(`\\b(?:envase|botella|tarrina|terrina)\\s+(?:de\\s+)?${n}\\s*${u}\\b`,'g')])
      for(const m of t.matchAll(pattern)) full.push({count:1,each:compact(quant(m[1],m[2])),pointer,excerpt:m[0]});
  }
  full.forEach(f=>counts.push({count:f.count,pointer:f.pointer,excerpt:f.excerpt,basis:'explicit_unit_format'}));
  return {full,counts,quantities};
}

export function reviewPlusfrescFormat(spec,raw,cite=x=>x) {
  const candidates=plusfrescFormatCandidates(raw);
  const reviewedCount=reviewedUnitlessCounts[spec.id];
  if(reviewedCount) {
    assert(pointerValue(raw,reviewedCount.pointer).includes(reviewedCount.excerpt),'reviewed_count_literal');
    candidates.counts.push({...reviewedCount,basis:'explicit_editorial_count_position_without_mass_unit'});
  }
  const evidence=unique(['/display_name','/description','/raw/has_format','/raw/formats'].map(cite));
  const full=/^(\d+)x(\d+)(g|ml)$/.exec(spec.format);
  const countOnly=/(?:^|,)c(\d+)(?:,|$)/.exec(spec.format);
  const nominal=/(?:^|,)q(\d+)(g|ml)(?:,|$)/.exec(spec.format);
  let count=full?Number(full[1]):countOnly?Number(countOnly[1]):null;
  let each=full?compact(quant(full[2],full[3])):null;
  let nominalValue=nominal?compact(quant(nominal[1],nominal[2])):null;
  let warning=PLUSFRESC_FORMAT_WARNINGS[spec.id]??null;
  const alternatives=raw.raw.has_format!==false||raw.raw.formats.length>0;
  if(full) assert(candidates.full.some(f=>f.count===count&&eq(f.each,each)),`explicit_format_${spec.id}`);
  if(countOnly && !['019933','036737'].includes(spec.id)) assert(candidates.counts.some(c=>c.count===count),`count_${spec.id}`);
  if(nominal) assert(candidates.quantities.some(c=>eq(c.quantity,nominalValue)),`nominal_${spec.id}`);
  if(spec.id==='019933') assert(candidates.full.every(f=>f.count===1)&&candidates.full.length===2,'single_two_dimensions');
  if(spec.id==='036737') {assert(raw.description.includes('125G P4'),'ambiguous_p4');count=null;}
  if(spec.format==='!') assert(new Set(candidates.counts.map(c=>c.count)).size>1,'count_conflict');
  assert(full||countOnly||nominal||spec.format==='!','format_spec');
  if(alternatives) {warning='unselected_sale_format';count=null;each=null;nominalValue=null;}
  // No silent choice of the mass or volume side. Counts can remain independent.
  if(warning==='unresolved_mass_volume') {each=null;nominalValue=null;}
  if(!each&&new Set(candidates.quantities.map(c=>hash(c.quantity))).size>1) nominalValue=null;
  const composition=spec.flavour==='assorted'?'unresolved':'single_declared_variant';
  const state=spec.format==='!'?'conflicting':each&&!warning&&composition!=='unresolved'?'known':'unknown';
  if(state==='known') {
    assert(Number.isSafeInteger(count)&&count>0&&Number.isSafeInteger(each.amount*count),'format_arithmetic');
    assert(candidates.counts.every(c=>c.count===count),`unresolved_count_${spec.id}`);
    assert(candidates.quantities.every(c=>eq(c.quantity,each)||eq(c.quantity,{dimension:each.dimension,amount:count*each.amount})),`unresolved_quantity_${spec.id}`);
  }
  return {state,count,each,total:each?{dimension:each.dimension,amount:count*each.amount}:null,
    nominal:nominalValue,assortment:null,composition,evidence,warning,
    observed_candidates:candidates,
    reason:PLUSFRESC_NOTES[spec.id]??(state==='known'
      ?'Conteo y contenido unitario explícitos contrastados; total exacto. La receta y el comercio no se aprueban por el formato.'
      :'Firma incompleta: conservar cantidades sin papel y unidades faltantes; no dividir un supuesto total ni inferir count=1.')};
}

function taxonomyRows(input,root) {
  const out=new Map();
  for(const s of input.sourceFiles.filter(s=>s.kind==='taxonomy'&&s.store==='plusfresc')) {
    const t=readFileSync(`${root}/${s.file}`,'utf8');assert(hash(t)===s.sha256,'taxonomy_hash');
    JSON.parse(t).payload.rows.forEach((value,index)=>out.set(String(value.id),{file:s.file,sha256:s.sha256,pointer:`/payload/rows/${index}`,value}));
  }
  return out;
}

function reviewProduct(spec,p,input,taxonomy) {
  assert(p&&p.store==='plusfresc'&&hash(p.raw)===p.source.raw_sha256,'source_binding');
  const citations=new Map(),inspected=[];
  const cite=pointer=>{const value=pointerValue(p.raw,pointer),id=hash([p.observation_id,pointer]);
    citations.set(id,{id,kind:'product_field',pointer,value,product_key:p.key,observation_id:p.observation_id,captured_at:p.captured_at,source:p.source});return id;};
  for(const pointer of ['/display_name','/description','/ingredients','/conservation','/preparation',
    '/category_name','/category_id','/category_ids','/raw/has_format','/raw/formats','/ean']) {
    let value;try {value=pointerValue(p.raw,pointer);}catch{inspected.push({pointer,presence:'absent_in_projection'});continue;}
    inspected.push({pointer,presence:value===null?'null_in_projection':'present',evidence:cite(pointer)});
  }
  const categories=categoryPath(p.raw,p.store,input.taxonomy).map(c=>{
    const t=taxonomy.get(String(c.id));assert(t,'category_source');const id=hash(t);citations.set(id,{id,kind:'original_taxonomy_row',...t});return id;});
  const semantic=inspected.filter(x=>x.presence==='present'&&['/display_name','/description','/ingredients'].includes(x.pointer)).map(x=>x.evidence);
  const outside=excluded.includes(spec.matrix);
  const attributes=Object.fromEntries(YOGURT_ATTRIBUTES.map(k=>[k,{state:'unknown',value:null,evidence:semantic,
    reason:outside?'Revisión solo de alcance; no aprobar receta del producto excluido.':'No acreditado suficientemente en los campos españoles revisados. Ausencia de mención no significa ausencia del atributo.'}]));
  const note=PLUSFRESC_NOTES[spec.id]??(outside
    ?`Título, descripción y categoría original sostienen identidad ${spec.matrix}, ajena al piloto; no incluir por yogur como ingrediente/sabor.`
    :`Lectura editorial ${p.key}: matriz ${spec.matrix}; declaraciones explícitas conservadas. No completar especie, endulzado, estilo ni formato desde marca o categoría.`);
  if(!outside) {
    if(!['unknown','assorted'].includes(spec.flavour)&&!spec.flavour.includes('multifruits')) attributes.declared_flavour={state:spec.flavour==='conflict'?'conflicting':'known',
      value:spec.flavour==='conflict'?null:spec.flavour.split('+').sort(),evidence:semantic,
      reason:spec.flavour==='conflict'?note:'Perfil nominal revisado; no receta exhaustiva ni prueba de ausencia de otros ingredientes.'};
    for(const token of spec.tokens.filter(t=>t!=='bare_zero')) {
      const a=attrs[token];assert(a,`claim_${token}`);const [k,value]=a;
      assert(attributes[k].state==='unknown',`duplicate_claim_${spec.id}_${k}`);
      attributes[k]={state:token==='sugar_conflict'?'conflicting':'known',value,evidence:semantic,reason:note};
    }
  }
  const format=outside?{state:'unknown',count:null,each:null,total:null,nominal:null,assortment:null,composition:'not_reviewed_scope_exclusion',evidence:[],warning:null,
    reason:'Fuera del piloto: no aprobar firma de compra ni interpretar cantidades logísticas.'}:reviewPlusfrescFormat(spec,p.raw,cite);
  const scopeRefs=unique([...semantic,...categories,...format.evidence]);
  const scope=outside?label('incompatible',note,scopeRefs):label(spec.matrix==='yogurt'&&format.state==='known'?'compatible':'unknown',
    'Solo yogur declarado con formato completo queda en alcance verificado; base ambigua, vegetal o skyr no se homologan por nombre de gama.',scopeRefs);
  const out={version:YOGURT_REVIEW_VERSION,editorial_layer:PLUSFRESC_LAYER,key:p.key,display_name:p.raw.display_name,
    observation_id:p.observation_id,captured_at:p.captured_at,source:p.source,source_review_date:'2026-09-03',
    authorship:'assistant_source_review_with_deterministic_pair_composition',source_review_complete:true,
    source_review_depth:outside?'scope_gate_only':'family_attributes_and_format',review_language:'es',
    matrix:spec.matrix,scope,attributes,format,note,
    caveats:spec.tokens.includes('bare_zero')?['0% sin objeto no aprueba grasa ni azúcares.']:[],
    inspected_fields:inspected,citations:[...citations.values()],
    source_dispute:format.state==='conflicting'||Object.values(attributes).some(a=>a.state==='conflicting'),
    full_product_equivalence_established:false,independent_review_completed:false,gold_eligible:false};
  return {...out,review_id:hash(out)};
}

export function buildPlusfrescYogurtReview(input,root='.',specs=plusfrescSpecs()) {
  assert(input.manifest_sha256===CORPUS_MANIFEST_SHA256,'manifest');
  const basePath='docs/comparator-strict/dataset/label-yogurt-v1/products.json';
  const oldReceipt=JSON.parse(readFileSync(`${root}/docs/comparator-strict/CE-201-202-yogurt-evidence.json`,'utf8'));
  for(const f of oldReceipt.files) assert(hash(readFileSync(`${root}/${f.path}`,'utf8'))===f.sha256,`frozen_input_${f.path}`);
  const base=JSON.parse(readFileSync(`${root}/${basePath}`,'utf8'));
  const block=input.pairs.filter(p=>p.family==='yogurt'),keys=new Set(block.flatMap(p=>[p.left,p.right]));
  const originals=new Map(input.products.map(p=>[p.key,p]));
  const expected=input.products.filter(p=>p.store==='plusfresc'&&keys.has(p.key));
  assert(specs.length===expected.length&&new Set(specs.map(s=>s.key)).size===specs.length&&specs.every(s=>expected.some(p=>p.key===s.key)),'exact_source_coverage');
  const taxonomy=taxonomyRows(input,root),products=specs.map(s=>reviewProduct(s,originals.get(s.key),input,taxonomy)).sort((a,b)=>a.key<b.key?-1:1);
  const all=new Map([...base,...products].map(p=>[p.key,p])),newKeys=new Set(products.map(p=>p.key));
  const annotations=block.filter(p=>all.has(p.left)&&all.has(p.right)&&(newKeys.has(p.left)||newKeys.has(p.right))).map(p=>{
    const a=composeYogurtPair(p,all.get(p.left),all.get(p.right),input);
    // v1's contexts only linked Consum observations. Extend provenance, not approval.
    a.editorial_layer=PLUSFRESC_LAYER;
    for(const c of a.contexts) c.location_observations.push(...input.locations.filter(l=>[p.left,p.right].includes(l.product_key)&&l.raw.store==='plusfresc'&&l.raw.location_id===(c.postcode==='08006'?'3':'12'))
      .map(l=>({key:l.key,source:l.source,captured_at:l.captured_at,raw_sha256:hash(l.raw)})));
    delete a.annotation_id;return {...a,annotation_id:hash(a)};
  });
  const dims=['scope','identity','variants','format'];
  const index=annotations.map(a=>({pair_id:a.pair_id,annotation_id:a.annotation_id,left:a.left,right:a.right,cohort:a.cohort,
    product_reviews:a.product_reviews,states:Object.fromEntries(dims.map(k=>[k,a.product_labels[k].state])),decision:a.contexts[0].decision,source_dispute:a.source_dispute,
    differences:Object.keys(a.attribute_comparisons).filter(k=>a.attribute_comparisons[k].relation==='incompatible')}));
  const editorial=JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-corpus-v1/editorial.json`,'utf8')).filter(p=>p.cohort==='editorial_subset_of_frozen_corpus');
  const prior=[...editorial,...['label-potatoes-v1','label-yogurt-v1'].flatMap(d=>JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/${d}/index.json`,'utf8')))];
  const previous=new Map(prior.map(p=>[p.pair_id,p])),union=new Set([...previous.keys(),...index.map(p=>p.pair_id)]);
  const overlaps=index.filter(p=>previous.has(p.pair_id)).map(p=>{const old=previous.get(p.pair_id);return {pair_id:p.pair_id,previous_id:old.id??old.annotation_id,annotation_id:p.annotation_id,
    changed_product_dimensions:dims.filter(k=>(old.states?.[k]??old.labels[k].state)!==p.states[k]),decision_changed:old.decision!==p.decision};});
  const report={version:PLUSFRESC_LAYER,date:'2026-09-03',status:'plusfresc_yogurt_source_block_complete_not_yogurt_family_complete',
    relationship_contract:YOGURT_REVIEW_VERSION,source_reviewed_products:products.length,reused_unchanged_product_reviews:base.length,
    source_review_depth:countValues(products.map(p=>p.source_review_depth)),first_annotations_this_batch:annotations.length,
    previous_first_annotated_corpus_pairs:previous.size,newly_first_annotated_corpus_pairs:union.size-previous.size,
    union_first_annotated_corpus_pairs:union.size,corpus_pairs_pending_first_annotation:input.pairs.length-union.size,
    pending_by_family:countValues(input.pairs.filter(p=>!union.has(hash([p.left,p.right]))).map(p=>p.family)),
    remaining_yogurt_source_reviews:countValues(input.products.filter(p=>keys.has(p.key)&&!all.has(p.key)).map(p=>p.store)),
    overlapping_previous_annotations:overlaps,decision_counts:countValues(index.map(p=>p.decision)),
    dimension_counts:Object.fromEntries(dims.map(k=>[k,countValues(index.map(p=>p.states[k]))])),
    known_format_products:products.filter(p=>p.format.state==='known').length,
    source_dispute_products:products.filter(p=>p.source_dispute).map(p=>p.key),source_dispute_pairs:index.filter(p=>p.source_dispute).length,
    format_warning_counts:countValues(products.filter(p=>p.format.warning).map(p=>p.format.warning)),
    corpus_pairs_unchanged:input.pairs.length,corpus_queries_unchanged:input.queries.length,original_origin_count_unchanged:new Set(input.queries.map(q=>q.origin)).size,
    independent_pair_by_pair_reviews_this_batch:0,independent_reviews:0,gold_pairs:0,supported_full_positive_equivalences:0,eligible_savings:0,
    CE201_complete:false,CE202_complete:false,CE203_complete:false,G2_pass:false,
    remote_project_calls:0,retailer_calls:0,new_integrations:0,commercial_ttl_hours:null,
    source_manifest_sha256:input.manifest_sha256,specs_sha256:hash(specs),
    hashes:{products:hash(products),annotations:hash(annotations),index:hash(index)},
    limitation:'Source review in Spanish plus deterministic composition, not individual human pair review. Unknowns concern the projection; not an evaluation of production, gold or evidence that no equivalent exists.'};
  return {products,annotations,index,report};
}
