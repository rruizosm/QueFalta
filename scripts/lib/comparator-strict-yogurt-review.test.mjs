import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {loadLabelCorpus,pointerValue} from './comparator-strict-corpus-labels.mjs';
import {buildYogurtReview,yogurtSpecs,yogurtFormatRelation,yogurtAttributeRelation,composeYogurtPair,yogurtEANConflict} from './comparator-strict-yogurt-review.mjs';
const input = loadLabelCorpus(),packet = buildYogurtReview(input);
const get = key=>packet.products.find(p=>p.key === key);
const attr = (key,name)=>get(key).attributes[name];
const relation = (a,b)=>yogurtFormatRelation(get(a).format,get(b).format).state;
const pair = (a,b)=>{
  const keys = [a,b].sort();
  return composeYogurtPair({left:keys[0],right:keys[1],cohort:'test_only_not_added_to_corpus'},get(keys[0]),get(keys[1]),input);
};
const known = value=>({state:'known',value,evidence:[]});
test('incremental coverage is explicit, no automatic promotion of the remaining 764 sources',()=>{
  assert.equal(yogurtSpecs().length,212); assert.equal(packet.products.length,212);
  assert.deepEqual(packet.report.reviewed_by_store,{carrefour:22,consum:118,mercadona:72});
  assert.equal(packet.report.yogurt_products_remaining_without_source_review,764);
  assert.equal(packet.annotations.length,133);
  for(const a of packet.annotations) assert.ok(input.pairs.some(p=>p.left === a.left && p.right === a.right && p.family === 'yogurt'));
});
test('duplicate/out-of-cohort specifications and changed source manifest fail closed',()=>{
  assert.throws(()=>buildYogurtReview(input,[...yogurtSpecs(),yogurtSpecs()[0]]),/unique_in_scope/);
  assert.throws(()=>buildYogurtReview(input,[{...yogurtSpecs()[0],key:'mercadona:not-real'}]),/unique_in_scope/);
  assert.throws(()=>buildYogurtReview({...input,manifest_sha256:'changed'}),/manifest/);
});
test('every inspected product field and taxonomy row resolves to its original file value',()=>{
  const files = new Map();
  for(const p of packet.products){
    assert.equal(p.review_id,hash(Object.fromEntries(Object.entries(p).filter(([k])=>k !== 'review_id'))));
    const original = input.products.find(x=>x.key === p.key);
    for(const c of p.citations){
      const source = c.kind === 'product_field' ? c.source : c;
      if(!files.has(source.file)){
        const s=readFileSync(source.file,'utf8');assert.equal(hash(s),source.sha256);files.set(source.file,JSON.parse(s));
      }
      const row=pointerValue(files.get(source.file),source.pointer);
      if(c.kind === 'product_field'){
        assert.equal(c.observation_id,p.observation_id);assert.equal(hash(row),source.raw_sha256);
        assert.deepEqual(pointerValue(row,c.pointer),c.value);assert.deepEqual(pointerValue(original.raw,c.pointer),c.value);
      } else assert.deepEqual(row,c.value);
    }
  }
});
test('null and absent ingredients are distinct projection limitations',()=>{
  assert.equal(get('mercadona:20210').inspected_fields.find(x=>x.pointer === '/ingredients').presence,'null_in_projection');
  assert.equal(get('consum:7340870').inspected_fields.find(x=>x.pointer === '/ingredients').presence,'absent_in_projection');
});
test('review facts and source observations cannot be silently replaced during reuse',()=>{
  const a=packet.annotations[0],p=input.pairs.find(p=>p.left === a.left && p.right === a.right);
  const left=structuredClone(get(a.left));left.attributes.added_sugar=known('invented');
  assert.throws(()=>composeYogurtPair(p,left,get(a.right),input),/review_binding/);
  const changed={...input,products:input.products.map(x=>x.key === a.left ? {...x,observation_id:'new'} : x)};
  assert.throws(()=>composeYogurtPair(p,get(a.left),get(a.right),changed),/observation_changed/);
});
test('natural does not supply no-added-sugar, sweetener absence or standard Greek style',()=>{
  for(const key of ['mercadona:20087','mercadona:22313','consum:7340888','carrefour:745416220']){
    assert.equal(attr(key,'added_sugar').state,'unknown'); assert.equal(attr(key,'sweeteners').state,'unknown');
    assert.equal(attr(key,'greek_style').state,'unknown');
  }
});
test('natural and azucarado share flavour, but unknown sugar cannot become no added sugar',()=>{
  const p=pair('consum:7303522','mercadona:52441');
  assert.equal(p.attribute_comparisons.declared_flavour.relation,'compatible');
  assert.equal(p.attribute_comparisons.added_sugar.relation,'unknown');
  assert.notEqual(p.product_labels.variants.state,'compatible');
});
test('explicit added/no-added claims oppose while sweeteners stay independent',()=>{
  const p=pair('consum:7354876','mercadona:20221');
  assert.equal(p.attribute_comparisons.added_sugar.relation,'incompatible');
  assert.equal(attr('mercadona:20221','sweeteners').value,'present');
  assert.equal(attr('mercadona:20221','added_sugar').value,'no_added_claim');
});
test('a retailer source conflict causes abstention even if the format independently differs',()=>{
  const p=pair('carrefour:852100300','mercadona:20210');
  assert.equal(p.product_labels.variants.state,'conflicting');
  assert.equal(p.product_labels.format.state,'incompatible');
  assert.ok(p.contexts.every(c=>c.decision === 'abstain'));
  assert.equal(get('carrefour:852100300').source_dispute,true);
});
test('sugar and sweeteners may coexist; omitted fructose keeps a documentary dispute',()=>{
  for(const key of ['carrefour:522715570','carrefour:647801823']){
    assert.equal(attr(key,'added_sugar').value,'added');assert.equal(attr(key,'sweeteners').value,'present');
    assert.equal(get(key).source_dispute,true);
  }
});
test('sin azúcar is stored separately from sin azúcar añadido',()=>{
  assert.equal(attr('carrefour:590510306','total_sugar_claim').value,'sugar_free_claim');
  assert.equal(attr('carrefour:590510306','added_sugar').state,'unknown');
});
test('bare zero and light do not invent fat or added-sugar values',()=>{
  for(const key of ['consum:7430312','consum:7477003','consum:7358646']){
    assert.equal(attr(key,'fat_claim').state,'unknown');assert.equal(attr(key,'added_sugar').state,'unknown');
  }
  assert.equal(attr('mercadona:52421','fat_claim').state,'unknown');
  assert.equal(attr('mercadona:21358','fat_claim').value,'two_percent');
  assert.equal(attr('consum:7430312','greek_style').state,'unknown');
});
test('skimmed ingredient is not product fat and skimmed/zero are not disjoint claims',()=>{
  assert.equal(attr('carrefour:VC4AECOMM-164662','fat_claim').state,'unknown');
  assert.equal(yogurtAttributeRelation('fat_claim',known('skimmed'),known('zero_percent')),'unknown');
  assert.equal(yogurtAttributeRelation('fat_claim',known('zero_percent'),known('two_percent')),'incompatible');
});
test('soy is not dairy-free and a matching product name never transfers ingredients across stores',()=>{
  assert.equal(attr('carrefour:521029633','milk_presence').value,'present');
  assert.equal(attr('consum:7031974','milk_presence').state,'unknown');
  assert.equal(attr('consum:7031974','plant_base').state,'unknown');
  assert.equal(attr('carrefour:VC4AECOMM-004276','milk_presence').value,'absent_claim');
  assert.equal(pair('carrefour:VC4AECOMM-004276','carrefour:521029633').attribute_comparisons.milk_presence.relation,'incompatible');
});
test('lactose free is not milk free and unspecified milk is not automatically cow',()=>{
  assert.equal(attr('consum:7141542','lactose_claim').value,'lactose_free');
  assert.equal(attr('consum:7141542','milk_presence').state,'unknown');
  assert.equal(attr('mercadona:20087','milk_species').state,'unknown');
  assert.equal(pair('consum:7370984','carrefour:VC4AECOMM-164659').attribute_comparisons.milk_species.relation,'incompatible');
});
test('only explicit out-of-pilot identities are excluded, not vague nearby categories',()=>{
  for(const key of ['consum:7434434','consum:7451784','consum:7482698','mercadona:20029','mercadona:52448'])
    assert.equal(get(key).scope.state,'incompatible');
  for(const key of ['consum:4507471','consum:7173433','mercadona:20629','consum:7275753'])
    assert.equal(get(key).scope.state,'unknown');
  assert.equal(get('consum:7451784').source_review_depth,'scope_gate_only');
});
test('toppings do not become natural plain flavour and truncated taste remains unresolved',()=>{
  assert.deepEqual(attr('mercadona:20859','declared_flavour').value,['cereals','strawberry']);
  assert.deepEqual(attr('mercadona:21336','declared_flavour').value,['almond','chocolate','coconut']);
  assert.equal(attr('consum:7443968','declared_flavour').state,'unknown');
  assert.deepEqual(attr('carrefour:641302318','declared_flavour').value,['strawberry']);
});
test('flavour overlap and broad classes do not create token-based false negatives',()=>{
  for(const [a,b] of [[['strawberry'],['banana','strawberry']],[['forest_fruits'],['wild_fruits']],[['natural'],['strawberry']]])
    assert.equal(yogurtAttributeRelation('declared_flavour',known(a),known(b)),'unknown');
  assert.equal(yogurtAttributeRelation('declared_flavour',known(['lemon']),known(['strawberry'])),'incompatible');
});
test('unequal delivery claims are not necessarily disjoint',()=>{
  assert.equal(yogurtAttributeRelation('fruit_delivery',known('layered'),known('jam')),'unknown');
});
test('6x125 equals 6x125 numerically, not 4x125 nor one 750g container',()=>{
  assert.equal(relation('mercadona:20559','mercadona:52441'),'compatible');
  assert.equal(relation('mercadona:20559','consum:7192008'),'incompatible');
  const single={...get('mercadona:20512').format,each:{dimension:'mass',amount:750000},total:{dimension:'mass',amount:750000}};
  assert.equal(yogurtFormatRelation(get('mercadona:20559').format,single).state,'incompatible');
});
test('same brand or total does not erase unit-count and per-unit differences',()=>{
  assert.equal(relation('mercadona:20087','mercadona:20260'),'incompatible');
  assert.equal(relation('consum:7303522','consum:7192008'),'incompatible');
});
test('4 bolsitas de 70g is supported explicitly without a packaging noun whitelist omission',()=>{
  const f=get('carrefour:653701722').format;
  assert.equal(f.state,'known');assert.equal(f.count,4);assert.equal(f.each.amount,70000);assert.equal(f.total.amount,280000);
});
test('bare quantity and 2 unidades 125g never become an invented pack signature',()=>{
  const f=get('carrefour:VC4AECOMM-084930').format;
  assert.equal(f.count,2);assert.equal(f.each,null);assert.equal(f.total,null);assert.equal(f.nominal.amount,125000);
  assert.equal(f.state,'unknown');assert.equal(get('consum:7463904').format.count,null);
  assert.equal(relation('carrefour:VC4AECOMM-084930','consum:7370984'),'unknown');
});
test('bare quantities can have different unit/total roles; explicit single supports a disproof',()=>{
  assert.equal(relation('consum:7463904','consum:7473692'),'unknown');
  assert.equal(relation('mercadona:20512','consum:7473692'),'incompatible');
});
test('mass/volume is unknown, while count mismatch remains independent',()=>{
  const f=get('carrefour:521029695').format;
  const mass={...f,each:{dimension:'mass',amount:65000},total:{dimension:'mass',amount:520000}};
  assert.equal(yogurtFormatRelation(f,mass).state,'unknown');
  assert.equal(relation('carrefour:521029695','consum:7173433'),'incompatible');
});
test('assortments require recipe distribution and two 8x120 packs can differ',()=>{
  assert.equal(get('carrefour:819115325').format.state,'unknown');
  assert.equal(get('carrefour:804987724').format.state,'unknown');
  assert.equal(get('mercadona:21321').format.state,'unknown');
  assert.deepEqual(get('carrefour:521029416').format.assortment,{strawberry:2,macedonia:2,lemon:2,cookie:2});
  assert.equal(relation('carrefour:521029416','carrefour:521029418'),'incompatible');
});
test('shared EAN never overrides a proven format difference',()=>{
  const labels=pair('carrefour:653701722','mercadona:86331').product_labels;
  const same=[{id:'test-left-ean',value:'same'},{id:'test-right-ean',value:'same'}];
  assert.equal(yogurtEANConflict(same,labels).state,'conflicting');
  assert.equal(yogurtEANConflict([{value:null},{value:null}],labels),null);
  assert.equal(yogurtEANConflict([{value:'a'},{value:'b'}],labels),null);
});
test('a changed numeric transcription fails before any pair is annotated',()=>{
  const specs=yogurtSpecs();specs.find(s=>s.key === 'mercadona:20559').format='6x124';
  assert.throws(()=>buildYogurtReview(input,specs),/mercadona_each/);
  const f=get('mercadona:20559').format;
  assert.throws(()=>yogurtFormatRelation({...f,total:{...f.total,amount:1}},f),/known_format_integrity/);
});
test('commercial dimensions, complete variants, owner review and gold stay unapproved',()=>{
  for(const p of packet.products){assert.equal(p.gold_eligible,false);assert.equal(p.independent_review_completed,false);}
  for(const a of packet.annotations){
    assert.notEqual(a.product_labels.variants.state,'compatible');assert.equal(a.gold_eligible,false);
    for(const c of a.contexts) for(const k of ['price','location','availability','catalog']) assert.equal(c.labels[k].state,'unknown');
    assert.ok(a.contexts.every(c=>!['eligible_saving','equivalent_no_saving'].includes(c.decision)));
  }
  assert.equal(packet.report.commercial_ttl_hours,null);
});
test('progress uses the union of pair IDs and does not count products/CP contexts as new pairs',()=>{
  assert.equal(packet.report.union_first_annotated_corpus_pairs,1061);
  assert.equal(packet.report.corpus_pairs_pending_first_annotation,4939);
  assert.deepEqual(packet.report.pending_by_family,{drinking_water:2483,yogurt:2456});
  assert.deepEqual(packet.report.overlapping_previous_annotations,[]);
  assert.deepEqual(packet.report.decision_counts,{abstain:39,excluded_scope:2,rejected:92});
});
