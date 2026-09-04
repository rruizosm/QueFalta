import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {loadLabelCorpus,pointerValue} from './comparator-strict-corpus-labels.mjs';
import {yogurtFormatRelation,yogurtAttributeRelation} from './comparator-strict-yogurt-review.mjs';
import {buildCarrefourYogurtReview,carrefourSpecs,carrefourFormatCandidates,reviewCarrefourFormat,carrefourAttributeRelation} from './comparator-strict-yogurt-carrefour.mjs';
const input=loadLabelCorpus(),packet=buildCarrefourYogurtReview(input);
const get=id=>packet.products.find(p=>p.key===`carrefour:${id}`),at=(id,k)=>get(id).attributes[k];
const orig=id=>input.products.find(p=>p.key===`carrefour:${id}`),spec=id=>carrefourSpecs().find(s=>s.id===id);
test('545 new sources plus 431 unchanged sources complete the 976-observation yogurt block',()=>{
  assert.equal(packet.products.length,545);assert.equal(new Set(packet.products.map(p=>p.key)).size,545);
  assert.equal(packet.report.reused_unchanged_product_reviews,431);assert.equal(packet.report.yogurt_source_reviews_total,976);
  assert.deepEqual(packet.report.source_review_depth,{family_attributes_and_format:445,scope_gate_only:100});
  assert.deepEqual(packet.report.remaining_yogurt_source_reviews,{});
});
test('all original product and taxonomy citations resolve byte-for-byte and reviews are hash-bound',()=>{
  const cache=new Map();
  for(const p of packet.products){
    const {review_id,...body}=p;assert.equal(hash(body),review_id);
    assert.equal(hash([p.key,p.captured_at,p.source.raw_sha256]),p.observation_id);
    for(const c of p.citations){const s=c.kind==='product_field'?c.source:c;
      if(!cache.has(s.file)){const t=readFileSync(s.file,'utf8');assert.equal(hash(t),s.sha256);cache.set(s.file,JSON.parse(t));}
      const row=pointerValue(cache.get(s.file),s.pointer);
      if(c.kind==='product_field'){assert.equal(hash(row),s.raw_sha256);assert.deepEqual(pointerValue(row,c.pointer),c.value);}
      else assert.deepEqual(row,c.value);
    }
    const ids=new Set(p.citations.map(c=>c.id));
    for(const x of [p.scope,p.format,...Object.values(p.attributes)])for(const id of x.evidence)assert.ok(ids.has(id));
  }
});
test('missing and duplicate editorial specifications fail closed',()=>{
  assert.throws(()=>buildCarrefourYogurtReview(input,'.',carrefourSpecs().slice(1)),/exact_source_coverage/);
  const specs=carrefourSpecs();specs[1]=specs[0];assert.throws(()=>buildCarrefourYogurtReview(input,'.',specs),/exact_source_coverage/);
});
test('changed corpus manifest or raw observation cannot reuse source review authority',()=>{
  assert.throws(()=>buildCarrefourYogurtReview({...input,manifest_sha256:'changed'}),/manifest/);
  const copy={...input,products:input.products.map(p=>p.key==='carrefour:521029389'?{...p,raw:{...p.raw,display_name:'changed'}}:p)};
  assert.throws(()=>buildCarrefourYogurtReview(copy),/source_binding/);
});
test('natural does not establish no added sugar, sweetener absence or complete declarations',()=>{
  for(const id of ['521029389','VC4AECOMM-737854']){
    assert.equal(at(id,'added_sugar').state,'unknown');assert.equal(at(id,'sweeteners').state,'unknown');
  }
  for(const p of packet.products)assert.equal(p.attributes.declarations_complete.state,'unknown');
});
test('explicit no-added and sweetened coexist, neither becomes sugar free',()=>{
  const id='VC4AECOMM-674002';assert.equal(at(id,'added_sugar').value,'no_added_claim');
  assert.equal(at(id,'sweeteners').value,'present');assert.equal(at(id,'total_sugar_claim').state,'unknown');
  assert.equal(at('VC4AECOMM-741813','sweeteners').value,'present');assert.equal(at('VC4AECOMM-741813','added_sugar').state,'unknown');
});
test('denomination and ingredients establish sugar omitted from the title without making a conflict',()=>{
  assert.equal(at('VC4AECOMM-945603','added_sugar').value,'added');assert.equal(get('VC4AECOMM-945603').source_dispute,false);
  assert.equal(at('VC4AECOMM-945603','declared_flavour').state,'unknown');
});
test('soy, coconut and almond bases are distinct; lactose-free alone never implies dairy-free',()=>{
  assert.equal(at('VC4AECOMM-721664','plant_base').value,'soy');assert.equal(at('VC4AECOMM-721664','milk_presence').state,'unknown');
  assert.equal(at('VC4AECOMM-696604','plant_base').value,'coconut');assert.equal(at('VC4AECOMM-696608','plant_base').value,'almond');
  assert.equal(at('VC4AECOMM-712744','milk_species').value,'goat');assert.equal(at('VC4AECOMM-712753','milk_species').value,'sheep');
});
test('brands cannot supply functional claims, Greek style, sterols or protein',()=>{
  assert.equal(at('VC4AECOMM-710153','sterols_claim').state,'unknown');
  assert.equal(at('VC4AECOMM-724573','sterols_claim').state,'unknown');
  assert.equal(at('VC4AECOMM-689183','protein_claim').state,'unknown');
  assert.equal(at('VC4AECOMM-724502','greek_style').state,'unknown');
});
test('fat of milk ingredient is not a product claim and light is not zero percent',()=>{
  for(const id of ['fprod1210088','VC4AECOMM-475662','VC4AECOMM-737853','VC4AECOMM-737854'])assert.equal(at(id,'fat_claim').state,'unknown');
  assert.equal(at('VC4AECOMM-673393','fat_claim').value,'light');
});
test('conflicting skimmed and semi-skimmed fields preserve conflict and force abstention',()=>{
  const id='VC4AECOMM-715028';assert.equal(at(id,'fat_claim').state,'conflicting');assert.equal(get(id).source_dispute,true);
  const pairs=packet.annotations.filter(a=>[a.left,a.right].includes(`carrefour:${id}`));assert.ok(pairs.length>0);
  for(const a of pairs)for(const c of a.contexts)assert.equal(c.decision,'abstain');
});
test('nutrition anomalies and partial recipes remain disputes without inventing corrected values',()=>{
  assert.equal(packet.report.source_dispute_products.length,8);
  for(const id of ['prod64313','VC4AECOMM-593783','VC4AECOMM-593780','VC4AECOMM-384263','prod395624','VC4AECOMM-127708'])assert.equal(get(id).source_dispute,true);
  assert.equal(get('prod64313').citations.find(c=>c.pointer==='/nutrition').value,orig('prod64313').raw.nutrition);
  assert.equal(at('VC4AECOMM-593780','declared_flavour').state,'known');
});
test('explicit sauce, cheese and dry porridge are not yogurt just because of category or ingredients',()=>{
  for(const id of ['546306276','VC4AECOMM-503693','VC4AECOMM-703385'])assert.equal(get(id).scope.state,'incompatible');
  for(const p of packet.products.filter(p=>p.scope.state==='incompatible')){
    assert.equal(p.source_review_depth,'scope_gate_only');assert.ok(Object.values(p.attributes).every(a=>a.state==='unknown'));
  }
});
test('infant yogurt and yogurt cream stay unresolved rather than blanket excluded or approved',()=>{
  for(const id of ['2002870194','590206223','642101679'])assert.equal(get(id).scope.state,'unknown');
});
test('kefir declared only in detail is excluded; incomplete bifidus is not inferred to be kefir',()=>{
  assert.equal(get('VC4AECOMM-724521').matrix,'kefir');assert.equal(get('VC4AECOMM-724521').scope.state,'incompatible');
  assert.equal(get('VC4AECOMM-696597').scope.state,'incompatible');
  assert.equal(get('521029602').matrix,'bifidus_unspecified');assert.equal(get('521029602').scope.state,'unknown');
});
test('chocolate, cookie and cake components are preserved instead of flattening to fruit',()=>{
  assert.deepEqual(at('VC4AECOMM-724552','declared_flavour').value,['blueberry','cake','cookie']);
  assert.deepEqual(at('638901810','declared_flavour').value,['chocolate','strawberry']);
});
test('related cocoa and stracciatella are uncertain not automatically disjoint or equivalent',()=>{
  const a={state:'known',value:['cocoa']},b={state:'known',value:['stracciatella']};
  assert.equal(yogurtAttributeRelation('declared_flavour',a,b),'incompatible');
  assert.equal(carrefourAttributeRelation('declared_flavour',a,b),'unknown');
  assert.equal(carrefourAttributeRelation('declared_flavour',a,a),'compatible');
  assert.equal(carrefourAttributeRelation('declared_flavour',a,{state:'known',value:['lemon']}),'incompatible');
  assert.equal(carrefourAttributeRelation('declared_flavour',{state:'unknown',value:null},b),'unknown');
});
test('one conservative flavour adjustment preserves its independent format rejection',()=>{
  const adjusted=packet.annotations.filter(a=>a.relationship_adjustments.length);assert.equal(adjusted.length,1);
  const a=adjusted[0];assert.equal(a.attribute_comparisons.declared_flavour.relation,'unknown');
  assert.equal(a.product_labels.format.state,'incompatible');assert.equal(a.contexts[0].decision,'rejected');
});
test('sell_pack_unit one is not package count and a bare quantity is not a single container',()=>{
  assert.equal(orig('521029389').raw.raw.sell_pack_unit,1);assert.equal(get('521029389').format.count,8);
  assert.equal(get('VC4AECOMM-880869').format.count,null);assert.equal(get('VC4AECOMM-880869').format.each,null);
});
test('explicit count and each enforce 8x120 versus 4x120 and 4x125',()=>{
  assert.equal(yogurtFormatRelation(get('521029389').format,get('521029387').format).state,'incompatible');
  assert.equal(yogurtFormatRelation(get('521029387').format,get('521029785').format).state,'incompatible');
  assert.equal(get('521029389').format.total.amount,960000);
});
test('missing de cannot be repaired from count and nominal size; partial count still has independent force',()=>{
  const f=get('VC4AECOMM-213094').format;assert.equal(f.count,4);assert.equal(f.each,null);assert.equal(f.nominal.amount,115000);assert.equal(f.state,'unknown');
  assert.equal(yogurtFormatRelation(f,get('521029389').format).state,'incompatible');
});
test('suspect 25g remains literal evidence but not an active rejection quantity',()=>{
  const f=get('VC4AECOMM-225693').format;assert.equal(f.count,4);assert.equal(f.nominal,null);assert.equal(f.each,null);
  assert.equal(f.warning,'suspect_nominal_quantity');assert.ok(f.observed_candidates.quantities.some(q=>q.quantity.amount===25000));
  assert.equal(yogurtFormatRelation(f,get('521029387').format).state,'unknown');
});
test('truncated pack title cannot borrow nutrition 100g or logistics count',()=>{
  const f=get('VC4AECOMM-720359').format;
  assert.equal(f.count,null);assert.equal(f.nominal,null);assert.equal(f.warning,'no_commercial_quantity');
  assert.equal(carrefourFormatCandidates(orig('VC4AECOMM-720359').raw).quantities.length,0);
});
test('count-to-each relation tolerates missing whitespace and a prefix typo, not missing de',()=>{
  assert.equal(get('prod930141').format.state,'unknown');assert.equal(get('prod930141').format.count,8);
  assert.equal(get('prod930141').format.each.amount,125000);assert.equal(get('prod930141').format.warning,'assortment_distribution_unknown');
  assert.equal(get('VC4AECOMM-720405').format.each.amount,160000);
  assert.throws(()=>reviewCarrefourFormat({...spec('521029387'),format:'4x121g'},orig('521029387').raw),/explicit_format/);
});
test('litres and kilograms normalize exactly without price-unit or density conversion',()=>{
  assert.deepEqual(get('VC4AECOMM-741159').format.nominal,{dimension:'volume',amount:1500});
  assert.deepEqual(get('VC4AECOMM-741780').format.nominal,{dimension:'mass',amount:1000000});
  assert.deepEqual(get('prod72290').format.nominal,{dimension:'volume',amount:500});
  const a={...get('521029387').format,count:4,each:{dimension:'volume',amount:120},total:{dimension:'volume',amount:480}};
  assert.equal(yogurtFormatRelation(a,get('521029387').format).state,'unknown');
});
test('unresolved assortment distribution never becomes a complete format',()=>{
  for(const id of ['VC4AECOMM-553826','VC4AECOMM-598995','VC4AECOMM-798997']){
    const f=get(id).format;assert.equal(f.state,'unknown');assert.equal(f.assortment,null);assert.equal(f.warning,'assortment_distribution_unknown');
  }
  const raw=structuredClone(orig('521029387').raw);raw.display_name+=' 999 g';
  assert.throws(()=>reviewCarrefourFormat(spec('521029387'),raw),/unresolved_quantity/);
});
test('null and absent source fields remain distinct and 281 title-only observations are explicit',()=>{
  assert.equal(packet.report.semantic_title_only_products,281);
  assert.equal(get('VC4AECOMM-727123').inspected_fields.find(f=>f.pointer==='/raw/sell_pack_unit').presence,'absent_in_projection');
  assert.equal(get('VC4AECOMM-727123').inspected_fields.find(f=>f.pointer==='/ingredients').presence,'null_in_projection');
});
test('2011 compositions add 2007 pairs, preserve four editorials and route E07 disagreement to owner',()=>{
  assert.equal(packet.annotations.length,2011);assert.equal(packet.report.newly_first_annotated_corpus_pairs,2007);
  assert.equal(packet.report.union_first_annotated_corpus_pairs,3517);assert.equal(packet.report.corpus_pairs_pending_first_annotation,2483);
  assert.deepEqual(packet.report.pending_by_family,{drinking_water:2483});
  assert.deepEqual(packet.report.overlapping_previous_annotations.map(x=>x.previous_id).sort(),['E05','E06','E07','E17']);
  assert.deepEqual(packet.report.editorial_decision_disagreements_requiring_owner_arbitration,['E07']);
  for(const a of packet.annotations){const {annotation_id,...body}=a;assert.equal(hash(body),annotation_id);assert.ok(input.pairs.some(p=>p.left===a.left&&p.right===a.right&&p.family==='yogurt'));}
});
test('commercial source links preserve CP provenance, not price, stock, savings or a 24h TTL',()=>{
  for(const a of packet.annotations)for(const c of a.contexts){
    assert.equal(c.location_observations.filter(l=>l.key.startsWith('plusfresc:')).length,input.locations.filter(l=>[a.left,a.right].includes(l.product_key)&&l.raw.store==='plusfresc'&&l.raw.location_id===(c.postcode==='08006'?'3':'12')).length);
    for(const v of Object.values(c.labels))assert.equal(v.state,'unknown');
  }
  assert.equal(packet.report.commercial_ttl_hours,null);assert.equal(packet.report.eligible_savings,0);
});
test('reviewed source block is not gold, full equivalence, owner review or a CE/G2 closure',()=>{
  for(const k of ['CE201_complete','CE202_complete','CE203_complete','G2_pass'])assert.equal(packet.report[k],false);
  assert.equal(packet.report.supported_full_positive_equivalences,0);assert.equal(packet.report.gold_pairs,0);
  for(const p of packet.products){assert.equal(p.gold_eligible,false);assert.equal(p.independent_review_completed,false);}
  for(const a of packet.annotations){assert.equal(a.gold_eligible,false);assert.equal(a.independent_pair_by_pair_review_completed,false);assert.notEqual(a.product_labels.variants.state,'compatible');}
  assert.deepEqual(packet.report.decision_counts,{abstain:841,excluded_scope:169,rejected:1001});
});
