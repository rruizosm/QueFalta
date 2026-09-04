// OFFLINE CE-201/202 source-review layer. No network, writes, draft promotion,
// deployment or matcher use. Source facts are reused across pair compositions.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {categoryPath} from './comparator-strict-corpus.mjs';
import {CORPUS_MANIFEST_SHA256,pointerValue,productLabelEvidence} from './comparator-strict-corpus-labels.mjs';
import {annotationDecision} from './comparator-strict-labels.mjs';
import {validGlobalGtin} from './gtin.mjs';
import {REVIEWED_POSITIVE_PAIRS,WATER_ATTRIBUTES,WATER_REVIEW_AUTHOR,WATER_REVIEW_DATE,
  WATER_REVIEW_VERSION,WATER_SOURCE_DISPUTES} from './comparator-strict-water-review-specs.mjs';

export {WATER_ATTRIBUTES,WATER_REVIEW_VERSION};
const assert=(ok,why)=>{if(!ok)throw Error(`ce202_water_${why}`);};
const unique=xs=>[...new Set(xs)];
const counts=xs=>Object.fromEntries(unique(xs).sort().map(k=>[k,xs.filter(x=>x===k).length]));
const label=(state,reason,evidence=[])=>({state,reason,evidence:unique(evidence)});
const fold=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const dimensions=['scope','identity','variants','format'];
const commercialDimensions=['price','location','availability','catalog'];
const inspectedPointers=['/display_name','/packaging','/denomination','/description','/ingredients','/conservation',
  '/category_name','/category_id','/category_ids','/raw/name','/raw/slug','/raw/categories','/raw/productData/description',
  '/raw/productData/brand','/raw/price_instructions','/raw/has_format','/raw/formats','/ean'];

function textFields(product){
  return ['/display_name','/packaging','/denomination','/description','/ingredients','/conservation','/category_name',
    '/raw/name','/raw/slug','/raw/productData/description'].flatMap(pointer=>{try{const value=pointerValue(product.raw,pointer);return typeof value==='string'&&value.trim()?[[pointer,value]]:[];}catch{return [];}});
}
const joined=(product,categories=[])=>fold([...textFields(product).map(x=>x[1]),...categories.map(c=>c.name)].join(' | '));

// These rules describe the finite reviewed source projection. They are kept out
// of production deliberately: CE-300+ must design and evaluate the real model.
export function waterMatrix(product,categories=categoryPath(product.raw,product.store,[])){
  const name=fold(product.raw.display_name),category=fold([product.raw.category_name,...categories.map(c=>c.name)].join(' | '));
  const flavourName=name.replaceAll('sabor intenso','');
  if(/agua (?:destilada|desmineralizada)|destilad[ao]/.test(name))return 'distilled_water';
  if(/agua de colonia|agua micelar|agua oxigenada|agua termal|bruma|spray nasal|perfume|colonia|champu|gel limpiador/.test(name))return 'personal_care';
  if(/agua de coco/.test(name))return 'coconut_water';
  if(/agua de azahar/.test(name))return 'culinary_ingredient';
  if(/agua de mar|marina/.test(name))return 'non_drinking_water';
  if(/\b(zumo|nectar|jugo|smoothie|limonada|mosto|kombucha)\b/.test(name)&&!/^agua\b/.test(name))return 'juice_or_other_drink';
  if(/\b(ron|vodka|ginebra|whisky|licor)\b/.test(name))return 'spirit';
  if(/\b(aguacate|paraguayo|pistachos?)\b/.test(name))return 'produce_or_food';
  if(/gaseosa|refresco|tonica|vitamin water|agua de aloe|bebida.*agua/.test(name))return 'soft_drink';
  const outsideCategory=product.store==='mercadona'&&!/^agua$/.test(fold(product.raw.category_name))
    || product.store==='consum'&&!/agua (?:sin gas|con gas|con sabores)/.test(category)
    || product.store==='plusfresc'&&!/(?:sin gas|con gas|gourmet)/.test(category)
    || product.store==='carrefour'&&!/aguas y zumos/.test(category);
  if(outsideCategory)return 'other_product';
  if(/(?:agua|aigua).*(?:sabor|toque|zumo|limon|lima|naranja|mango|melocoton|manzana|fresa|frambuesa|sandia|pina|pomelo|daiqui)|(?:sabor|toque|zumo).*(?:agua|aigua)|agua fruit/.test(flavourName))return 'flavoured_water';
  if(/^(?:agua|aigua)\b/.test(name)&&/agua|gourmet/.test(category))return 'drinking_water';
  return 'other_product';
}

function claim(state,value,evidence,reason){return {state,value,evidence:unique(evidence),reason};}
function sourceSignals(product,categories,cite){
  const fields=textFields(product),t=fold(fields.map(x=>x[1]).join(' | ')),refs=fields.map(([p])=>cite(p));
  const claimText=fold(fields.filter(([pointer])=>pointer!=='/ingredients').map(x=>x[1]).join(' | ')).replaceAll('-',' ');
  const categoryText=fold([product.raw.category_name,...categories.map(c=>c.name)].join(' | '));
  const categoryRef=(()=>{try{return cite('/category_name');}catch{return null;}})();
  const semanticRefs=unique([...refs,...(categoryRef?[categoryRef]:[])]);
  const attributes=Object.fromEntries(WATER_ATTRIBUTES.map(k=>[k,claim('unknown',null,semanticRefs,'No acreditado completamente en esta proyección; ausencia de mención no prueba ausencia.') ]));

  let waterClass=null;
  if(/agua mineral natural|aigua mineral natural/.test(t))waterClass='natural_mineral_water';
  else if(/agua mineral|aigua mineral/.test(t))waterClass='mineral_water';
  else if(/agua de manantial/.test(t))waterClass='spring_water';
  else if(/agua de seltz|agua de soda/.test(t))waterClass='seltzer_water';
  if(waterClass)attributes.water_class=claim('known',waterClass,semanticRefs,'Clase literal revisada; no completa origen geológico, mineralización ni formulación ausentes.');

  const withGas=/\bcon (?:extra )?gas\b|\bcarbonatad[ao]\b|\bcarb[oó]nica\b|\bseltz\b|\b(?:agua de )?soda\b|gas carb[oó]nico a[nñ]adido/.test(t);
  const withoutGas=/\bsin gas\b/.test(t)||/\bsin gas\b/.test(categoryText);
  attributes.gas=withGas&&withoutGas?claim('conflicting',null,semanticRefs,'La misma observación contiene declaraciones con y sin gas; no se resuelve por prioridad.')
    :withGas?claim('known','with_gas',semanticRefs,'Gas declarado literalmente en título, detalle, ingredientes o categoría.')
      :withoutGas?claim('known','without_gas',semanticRefs,'Ausencia de gas declarada literalmente en título o categoría original.')
        :attributes.gas;

  const flavours=[];
  const flavourPatterns={lemon:/\blimon\b/,lime:/\blima\b/,orange:/\bnaranja\b/,mango:/\bmango\b/,peach:/\bmelocoton\b/,
    apple:/\bmanzana\b/,strawberry:/\bfresa\b/,raspberry:/\bframbuesa\b/,watermelon:/\bsandia\b/,mint:/\bmenta\b/,
    pineapple:/\bpina\b/,grapefruit:/\bpomelo\b/,daiquiri:/\bdaiqui/,aloe:/\baloe\b/,coconut:/\bcoco\b/,
    red_fruits:/frutos rojos|frutas rojas/,passion_fruit:/fruta de la pasion/};
  for(const [value,re]of Object.entries(flavourPatterns))if(re.test(t))flavours.push(value);
  if(flavours.length)attributes.water_flavour=claim('known',unique(flavours).sort(),semanticRefs,'Perfiles nominales explícitos; no se convierten en receta exhaustiva.');

  const additives=[];
  const additivePatterns={added_sugar:/\bazucar\b|jarabe de fructosa/,sweeteners:/edulcorante|sucralosa|acesulfamo|glucosidos de esteviol/,
    juice:/\bzumo\b/,acidulant:/acidulante|acido citrico/,aroma:/\baromas?\b/,vitamins:/\bvitaminas?\b/,functional_extract:/guarana|ginseng/};
  for(const [value,re]of Object.entries(additivePatterns))if(re.test(t))additives.push(value);
  if(additives.length)attributes.water_additives=claim('known',unique(additives).sort(),semanticRefs,'Componentes o alegaciones explícitos; azúcar, edulcorantes, zumo y aroma permanecen separados.');
  else if(/^agua mineral natural\.?$/i.test(String(product.raw.ingredients??'').trim()))attributes.water_additives=claim('known',['none_declared'],[cite('/ingredients')],'La lista de ingredientes solo declara agua mineral natural; válido para esta observación, no para la marca.');

  let mineralisation=null;
  if(/mineralizacion muy debil/.test(claimText))mineralisation='very_weak';
  else if(/mineralizacion debil/.test(claimText))mineralisation='weak';
  else if(/bajo en sodio|baja en sodio|cero sodio/.test(claimText))mineralisation='low_sodium';
  else if(/agua[^|]{0,60}(?:con )?magnesio|magnesio[^|]{0,60}agua/.test(claimText))mineralisation='magnesium_claim';
  else if(/agua[^|]{0,60}alcalina/.test(claimText))mineralisation='alkaline_claim';
  if(mineralisation)attributes.mineralisation_claim=claim('known',mineralisation,semanticRefs,'Declaración relevante explícita; no inferirla para otras presentaciones de la marca.');

  let closure=null;
  if(/tapon (?:infantil|sport)|\bsport\b|\bkids?\b|\bjunior\b|\btoy\b|\btrekking\b/.test(t))closure='special_or_sport_closure';
  if(closure)attributes.closure_variant=claim('known',closure,semanticRefs,'Cierre o uso especial explícito; forma parte de la variante comercial.');
  let intensity=null;
  if(/extra gas/.test(t))intensity='extra'; else if(/sabor intenso/.test(t)&&withGas)intensity='intense';
  if(intensity)attributes.carbonation_intensity=claim('known',intensity,semanticRefs,'Intensidad de carbonatación explícita; «sabor intenso» aquí no se interpreta como sabor añadido.');
  return {attributes,semanticRefs};
}

function containerForm(product,cite){
  const fields=textFields(product),found=[];
  const add=(value,pointer)=>found.push({value,evidence:cite(pointer)});
  for(const [pointer,value]of fields){const t=fold(value);
    if(/bag[ -]?in[ -]?box/.test(t))add('bag_in_box',pointer);
    else if(/\bsifon\b/.test(t))add('siphon',pointer);
    else if(/\bgarrafas?\b/.test(t))add('jug',pointer);
    else if(/\blatas?\b/.test(t))add('can',pointer);
    else if(/\b(?:brik|brick|carton)\b/.test(t))add('carton',pointer);
    else if(/\bbotellas?\b/.test(t))add('bottle',pointer);
  }
  const unit=product.raw.raw?.price_instructions?.unit_name;
  if(typeof unit==='string'&&/botellas/i.test(unit))found.push({value:'bottle',evidence:cite('/raw/price_instructions')});
  const values=unique(found.map(x=>x.value)),evidence=found.map(x=>x.evidence);
  if(values.length>1)return claim('conflicting',null,evidence,'Formas de envase incompatibles en la misma observación; no elegir una silenciosamente.');
  return values.length?claim('known',values[0],evidence,'Forma de envase declarada literalmente; material no inferido si no consta.')
    :claim('unknown',null,[],'Forma de envase no acreditada; la cantidad sola no demuestra botella, garrafa o lata.');
}

function reviewProduct(product,input){
  assert(product&&hash(product.raw)===product.source.raw_sha256,'source_binding');
  const draft=productLabelEvidence(product),citations=new Map(draft.citations.map(c=>[c.id,{...c,kind:'product_field'}])),inspected=[];
  const cite=pointer=>{const value=pointerValue(product.raw,pointer),id=hash([product.observation_id,pointer]);
    if(!citations.has(id))citations.set(id,{id,kind:'product_field',pointer,value,product_key:product.key,observation_id:product.observation_id,captured_at:product.captured_at,source:product.source});return id;};
  for(const pointer of inspectedPointers){try{const value=pointerValue(product.raw,pointer);inspected.push({pointer,presence:value===null?'null_in_projection':'present',evidence:cite(pointer)});}catch{inspected.push({pointer,presence:'absent_in_projection'});}}
  const categories=categoryPath(product.raw,product.store,input.taxonomy),matrix=waterMatrix(product,categories),signals=sourceSignals(product,categories,cite),container=containerForm(product,cite);
  if(product.key==='plusfresc:032380')signals.attributes.gas=claim('conflicting',null,signals.semanticRefs,
    'La categoría original dice sin gas y la descripción propia dice AGUA GAS; ninguna fuente prevalece silenciosamente.');
  const outside=matrix!=='drinking_water',sourceDispute=WATER_SOURCE_DISPUTES[product.key]??null;
  const scope=outside?label('incompatible',`La fuente identifica ${matrix}, no agua potable simple del piloto. La palabra agua, categoría vecina o ingrediente no cambia la matriz.`,signals.semanticRefs)
    :label('compatible','Agua potable declarada en una referencia fija; gas, composición y envase se validan aparte.',signals.semanticRefs);
  const components=draft.format.components;
  const format={state:draft.format.state,count:components?.count??null,each:components?.each??null,total:components?.total??null,
    signature:draft.format.signature,container,flags:draft.flags,evidence:unique([...draft.format.evidence,...container.evidence]),reason:draft.format.reason};
  if(outside){format.state='unknown';format.signature=null;format.reason='Exclusión de alcance: el formato no se aprueba como agua potable comparable.';}
  if(sourceDispute&&['carrefour:prod170182','plusfresc:007307','plusfresc:014934'].includes(product.key)){format.state='conflicting';format.signature=null;}
  const out={version:WATER_REVIEW_VERSION,key:product.key,display_name:product.raw.display_name,observation_id:product.observation_id,
    captured_at:product.captured_at,source:product.source,source_review_date:WATER_REVIEW_DATE,authorship:WATER_REVIEW_AUTHOR,
    source_review_complete:true,source_review_depth:outside?'scope_gate_only':'family_attributes_and_format',matrix,scope,
    attributes:signals.attributes,format,source_dispute:Boolean(sourceDispute),source_dispute_kind:sourceDispute,
    inspected_fields:inspected,citations:[...citations.values()],note:outside?'Solo se decide alcance; no se certifican receta o formato del producto excluido.':'Clase, gas, sabor/aditivos, declaraciones y formato se conservan por separado; desconocido no significa ausencia.',
    full_product_equivalence_established:false,independent_review_completed:false,gold_eligible:false};
  return {...out,review_id:hash(out)};
}

function attributeRelation(key,a,b){
  if([a,b].some(x=>x.state==='conflicting'))return 'conflicting';
  if([a,b].some(x=>x.state!=='known'))return 'unknown';
  if(hash(a.value)===hash(b.value))return 'compatible';
  if(['gas','closure_variant','carbonation_intensity'].includes(key))return 'incompatible';
  if(key==='water_flavour'&&!a.value.some(x=>b.value.includes(x)))return 'incompatible';
  if(key==='water_additives'&&[a.value,b.value].some(x=>x.includes('none_declared')))return 'incompatible';
  return 'unknown';
}

function formatRelation(a,b){
  const evidence=unique([...a.evidence,...b.evidence]);
  if([a,b].some(x=>x.state==='conflicting'||x.container.state==='conflicting'))return label('conflicting','Conflicto de cantidad o forma de envase conservado; no resolver por prioridad.',evidence);
  if(a.count!==null&&b.count!==null&&a.count!==b.count)return label('incompatible','Número de envases diferente; sin tolerancia ni equivalencia por volumen total.',evidence);
  for(const k of ['each','total'])if(a[k]&&b[k]&&a[k].dimension===b[k].dimension&&a[k].amount!==b[k].amount)return label('incompatible',`Contenido ${k} diferente; misma dimensión y comparación exacta.`,evidence);
  if(a.container.state==='known'&&b.container.state==='known'&&a.container.value!==b.container.value)return label('incompatible','Forma de envase distinta; no se equipara botella, garrafa, lata, cartón, sifón o bag-in-box.',evidence);
  if(a.state==='known'&&b.state==='known'&&a.container.state==='known'&&b.container.state==='known'&&hash(a.signature)===hash(b.signature))return label('compatible','Coinciden conteo, contenido por envase, total, dimensión y forma de envase.',evidence);
  return label('unknown','Falta firma bilateral exacta o forma de envase; no asumir una unidad desde una cantidad aislada.',evidence);
}

export function composeWaterPair(pair,left,right,input){
  assert(left.key===pair.left&&right.key===pair.right&&pair.left<pair.right,'pair_binding');
  for(const review of [left,right]){const {review_id,...body}=review;assert(hash(body)===review_id&&review.version===WATER_REVIEW_VERSION&&review.authorship===WATER_REVIEW_AUTHOR&&review.source_review_complete,'review_binding');}
  const outside=[left,right].some(p=>p.scope.state==='incompatible'),scopeRefs=unique([...left.scope.evidence,...right.scope.evidence]);
  const comparisons=Object.fromEntries(WATER_ATTRIBUTES.map(k=>[k,{left:{state:left.attributes[k].state,value:left.attributes[k].value},right:{state:right.attributes[k].state,value:right.attributes[k].value},relation:outside?'unknown':attributeRelation(k,left.attributes[k],right.attributes[k]),evidence:unique([...left.attributes[k].evidence,...right.attributes[k].evidence])}]));
  const format=outside?label('unknown','Al menos un extremo está fuera del piloto; no aprobar su formato como agua potable.',scopeRefs):formatRelation(left.format,right.format);
  const eans=[left,right].map(p=>p.citations.find(c=>c.pointer==='/ean')),valid=eans.map(c=>validGlobalGtin(c?.value));
  const sameGtin=valid[0]&&valid[0]===valid[1],gtinConflict=sameGtin&&(format.state==='incompatible'||Object.values(comparisons).some(x=>x.relation==='incompatible'||x.relation==='conflicting'));
  const labels={scope:label(outside?'incompatible':'compatible',outside?'Algún extremo es un confusor o bebida distinta del agua potable simple.':'Ambos extremos son agua potable del piloto.',scopeRefs),
    identity:label(outside?'unknown':gtinConflict?'conflicting':sameGtin?'compatible':left.attributes.water_class.state==='known'&&right.attributes.water_class.state==='known'&&attributeRelation('water_class',left.attributes.water_class,right.attributes.water_class)==='compatible'?'compatible':'unknown',
      gtinConflict?'GTIN global igual con oposición documental: arbitraje obligatorio.':sameGtin?'Mismo GTIN global válido y sin oposición documental; misma referencia comercial.':'Clase gruesa compatible solo donde está declarada; marca o palabra agua no acreditan identidad completa.',unique([...scopeRefs,...eans.filter(Boolean).map(x=>x.id)])),
    variants:label('unknown','Faltan atributos obligatorios bilaterales de gas, sabor, aditivos o declaraciones relevantes.',scopeRefs),format};
  const conflicts=Object.keys(comparisons).filter(k=>comparisons[k].relation==='conflicting'),negatives=Object.keys(comparisons).filter(k=>comparisons[k].relation==='incompatible');
  if(!outside&&conflicts.length)labels.variants=label('conflicting',`Conflictos documentales: ${conflicts.join(', ')}.`,conflicts.flatMap(k=>comparisons[k].evidence));
  else if(!outside&&negatives.length)labels.variants=label('incompatible',`Variantes explícitamente distintas: ${negatives.join(', ')}.`,negatives.flatMap(k=>comparisons[k].evidence));
  else if(!outside&&sameGtin&&!gtinConflict&&format.state==='compatible')labels.variants=label('compatible','El mismo GTIN global, formato exacto y ausencia de oposición acreditan la misma variante comercial; no rellena campos fuente ausentes.',eans.map(x=>x.id));
  if(gtinConflict)labels.identity=label('conflicting','GTIN igual no puede saltarse una oposición de formato o variante.',unique([...eans.map(x=>x.id),...format.evidence,...labels.variants.evidence]));
  const pairKey=`${pair.left}|${pair.right}`,fullProduct=dimensions.every(k=>labels[k].state==='compatible');
  if(REVIEWED_POSITIVE_PAIRS.has(pairKey))assert(fullProduct&&sameGtin,'nominated_positive_not_proven');
  if(fullProduct)assert(REVIEWED_POSITIVE_PAIRS.has(pairKey),'unreviewed_positive');
  const commercial={price:'No hay base de precio bilateral y dirigida por CP/formato; no declarar ahorro.',location:'No existe prueba bilateral exacta para CP y canal en esta captura.',availability:'Publicado o disponible globalmente no acredita stock bilateral local.',catalog:'Observaciones trazables, pero falta validar conjuntamente las revisiones activas del producto, perfil, precio y ámbito. Sin TTL artificial de 24 h.'};
  const contexts=['08006','25001'].map(postcode=>{
    const labelsCommercial=Object.fromEntries(commercialDimensions.map(k=>[k,label('unknown',commercial[k]) ]));
    return {postcode,channel:'retailer_online_catalog',reference_clock:input.queries[0].reference_clock,
      direction:'canonical_left_to_right_not_a_savings_claim',labels:labelsCommercial,
      location_observations:input.locations.filter(l=>[pair.left,pair.right].includes(l.product_key)&&l.raw.store==='consum'&&postcode==='08006'&&l.raw.location_id==='575')
        .map(l=>({key:l.key,source:l.source,captured_at:l.captured_at,raw_sha256:hash(l.raw)})),
      decision:annotationDecision(Object.fromEntries(Object.entries({...labels,...labelsCommercial}).map(([k,v])=>[k,v.state])))};
  });
  const out={version:WATER_REVIEW_VERSION,pair_id:hash([pair.left,pair.right]),left:pair.left,right:pair.right,cohort:pair.cohort,
    sampling_stratum_preserved_not_truth:pair.stratum,observations:[left.observation_id,right.observation_id],product_reviews:[left.review_id,right.review_id],
    authorship:WATER_REVIEW_AUTHOR,annotation_status:'first_annotation_composed_from_reviewed_sources',review_status:'awaiting_owner_independent_review',
    independent_pair_by_pair_review_completed:false,independent_review_completed:false,gold_eligible:false,product_labels:labels,
    attribute_comparisons:comparisons,same_valid_global_gtin:Boolean(sameGtin),full_product_equivalence_established:fullProduct,
    source_dispute:left.source_dispute||right.source_dispute,contexts};return {...out,annotation_id:hash(out)};
}

export function buildWaterReview(input,root='.'){
  assert(input.manifest_sha256===CORPUS_MANIFEST_SHA256,'manifest');
  const block=input.pairs.filter(p=>p.family==='drinking_water'),keys=new Set(block.flatMap(p=>[p.left,p.right]));
  const products=input.products.filter(p=>keys.has(p.key)).map(p=>reviewProduct(p,input)).sort((a,b)=>a.key.localeCompare(b.key));
  assert(products.length===keys.size&&products.length===771,'exact_product_coverage');
  const reviews=new Map(products.map(p=>[p.key,p]));
  const annotations=block.map(p=>composeWaterPair(p,reviews.get(p.left),reviews.get(p.right),input));
  assert(annotations.length===2485,'exact_pair_coverage');
  const index=annotations.map(a=>({pair_id:a.pair_id,annotation_id:a.annotation_id,left:a.left,right:a.right,product_reviews:a.product_reviews,cohort:a.cohort,
    states:Object.fromEntries(dimensions.map(k=>[k,a.product_labels[k].state])),decision:a.contexts[0].decision,source_dispute:a.source_dispute,
    same_valid_global_gtin:a.same_valid_global_gtin,full_product_equivalence_established:a.full_product_equivalence_established,differences:Object.keys(a.attribute_comparisons).filter(k=>a.attribute_comparisons[k].relation==='incompatible')}));
  const editorial=JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-corpus-v1/editorial.json`,'utf8')).filter(p=>p.cohort==='editorial_subset_of_frozen_corpus');
  const prior=[...editorial,...['label-potatoes-v1','label-yogurt-v1','label-yogurt-plusfresc-v1','label-yogurt-carrefour-v1'].flatMap(d=>JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/${d}/index.json`,'utf8')))];
  const previous=new Map(prior.map(p=>[p.pair_id,p])),union=new Set([...previous.keys(),...index.map(p=>p.pair_id)]);
  const overlaps=index.filter(p=>previous.has(p.pair_id)).map(p=>({pair_id:p.pair_id,previous_id:previous.get(p.pair_id).id??previous.get(p.pair_id).annotation_id,annotation_id:p.annotation_id,decision_changed:previous.get(p.pair_id).decision!==p.decision}));
  const drafts=new Map(Array.from({length:12},(_,i)=>String(i*500).padStart(4,'0')).flatMap(offset=>JSON.parse(readFileSync(`${root}/docs/comparator-strict/dataset/label-corpus-v1/index-${offset}.json`,'utf8'))).map(p=>[hash([p.left,p.right]),p]));
  const transitions=index.map(p=>`${drafts.get(p.pair_id).decision_draft} -> ${p.decision}`);
  const positives=index.filter(p=>p.full_product_equivalence_established);
  assert(positives.length===REVIEWED_POSITIVE_PAIRS.size&&positives.every(p=>REVIEWED_POSITIVE_PAIRS.has(`${p.left}|${p.right}`)),'positive_coverage');
  const report={version:WATER_REVIEW_VERSION,date:WATER_REVIEW_DATE,status:'CE201_CE202_complete_first_annotations_owner_review_and_G2_pending',source_reviewed_products:products.length,
    reviewed_by_store:counts(products.map(p=>p.key.split(':')[0])),source_review_depth:counts(products.map(p=>p.source_review_depth)),matrix_counts:counts(products.map(p=>p.matrix)),
    first_annotations_this_batch:annotations.length,previous_first_annotated_corpus_pairs:previous.size,newly_first_annotated_corpus_pairs:union.size-previous.size,
    union_first_annotated_corpus_pairs:union.size,corpus_pairs_pending_first_annotation:input.pairs.length-union.size,pending_by_family:counts(input.pairs.filter(p=>!union.has(hash([p.left,p.right]))).map(p=>p.family)),
    overlapping_previous_annotations:overlaps,decision_counts:counts(index.map(p=>p.decision)),dimension_counts:Object.fromEntries(dimensions.map(k=>[k,counts(index.map(p=>p.states[k]))])),
    comparison_against_frozen_drafts_not_motor_quality:counts(transitions),known_format_products:products.filter(p=>p.format.state==='known').length,
    source_dispute_products:products.filter(p=>p.source_dispute).map(p=>p.key),source_dispute_pairs:index.filter(p=>p.source_dispute).length,
    same_valid_global_gtin_pairs:index.filter(p=>p.same_valid_global_gtin).length,supported_full_positive_equivalences:positives.length,
    supported_full_positive_pairs:positives.map(p=>({pair_id:p.pair_id,left:p.left,right:p.right,decision:p.decision})),eligible_savings:0,
    corpus_pairs_unchanged:input.pairs.length,corpus_queries_unchanged:input.queries.length,original_origin_count_unchanged:new Set(input.queries.map(q=>q.origin)).size,
    independent_pair_by_pair_reviews_this_batch:0,independent_reviews:0,gold_pairs:0,CE201_complete:true,CE202_complete:true,CE203_complete:false,G2_pass:false,
    remote_project_calls:0,retailer_calls:0,new_integrations:0,commercial_ttl_hours:null,source_manifest_sha256:input.manifest_sha256,
    hashes:{products:hash(products),annotations:hash(annotations),index:hash(index)},limitation:'First annotation from reviewed frozen sources and deterministic composition. Product equivalence is not a saving: bilateral postcode price, location, availability and active catalog revisions remain unknown. Owner independent review, gold, partitions, holdout, matcher evaluation and G2 remain pending.'};
  return {products,annotations,index,report};
}
