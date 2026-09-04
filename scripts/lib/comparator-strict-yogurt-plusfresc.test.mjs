import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './comparator-strict-dataset.mjs';
import {loadLabelCorpus,pointerValue} from './comparator-strict-corpus-labels.mjs';
import {yogurtFormatRelation,yogurtAttributeRelation} from './comparator-strict-yogurt-review.mjs';
import {buildPlusfrescYogurtReview,plusfrescSpecs,plusfrescFormatCandidates,reviewPlusfrescFormat} from './comparator-strict-yogurt-plusfresc.mjs';
const input=loadLabelCorpus(),packet=buildPlusfrescYogurtReview(input);
const get=id=>packet.products.find(p=>p.key===`plusfresc:${id}`);
const at=(id,k)=>get(id).attributes[k];
const original=id=>input.products.find(p=>p.key===`plusfresc:${id}`);
const spec=id=>plusfrescSpecs().find(p=>p.id===id);
test('all 219 Plusfresc observations receive an explicit first review, not all Carrefour',()=>{
  assert.equal(packet.products.length,219);assert.equal(new Set(packet.products.map(p=>p.key)).size,219);
  assert.deepEqual(packet.report.source_review_depth,{family_attributes_and_format:207,scope_gate_only:12});
  assert.deepEqual(packet.report.remaining_yogurt_source_reviews,{carrefour:545});
  assert.equal(packet.report.reused_unchanged_product_reviews,212);
});
test('every product/taxonomy citation resolves to the unchanged original value and source hash',()=>{
  const cache=new Map();
  for(const p of packet.products){
    const {review_id,...body}=p;assert.equal(hash(body),review_id);
    assert.equal(hash([p.key,p.captured_at,p.source.raw_sha256]),p.observation_id);
    for(const c of p.citations){
      const s=c.kind==='product_field'?c.source:c;
      if(!cache.has(s.file)){const text=readFileSync(s.file,'utf8');assert.equal(hash(text),s.sha256);cache.set(s.file,JSON.parse(text));}
      const row=pointerValue(cache.get(s.file),s.pointer);
      if(c.kind==='product_field'){assert.equal(hash(row),s.raw_sha256);assert.deepEqual(pointerValue(row,c.pointer),c.value);}
      else assert.deepEqual(row,c.value);
    }
  }
});
test('incomplete coverage, duplicate specs and changed manifest fail closed',()=>{
  assert.throws(()=>buildPlusfrescYogurtReview(input,'.',plusfrescSpecs().slice(1)),/exact_source_coverage/);
  const specs=plusfrescSpecs();specs[1]=specs[0];assert.throws(()=>buildPlusfrescYogurtReview(input,'.',specs),/exact_source_coverage/);
  assert.throws(()=>buildPlusfrescYogurtReview({...input,manifest_sha256:'changed'}),/manifest/);
});
test('a changed raw observation cannot be reused as the same reviewed source',()=>{
  const copy={...input,products:input.products.map(p=>p.key==='plusfresc:004449'?{...p,raw:{...p.raw,display_name:'changed'}}:p)};
  assert.throws(()=>buildPlusfrescYogurtReview(copy),/source_binding/);
});
test('sugar and flavour contradictions survive as conflicting, never guessed winners',()=>{
  assert.equal(at('027336','added_sugar').state,'conflicting');assert.equal(at('027336','sweeteners').value,'present');
  assert.equal(at('027291','declared_flavour').state,'conflicting');assert.equal(at('027291','declared_flavour').value,null);
  for(const a of packet.annotations.filter(a=>['plusfresc:027336','plusfresc:027291'].some(k=>[a.left,a.right].includes(k))))
    assert.ok(a.contexts.every(c=>c.decision==='abstain'));
});
test('two count conflicts abstain even when description has no mass unit',()=>{
  for(const id of ['024113','036733']){
    assert.equal(get(id).format.state,'conflicting');assert.equal(get(id).source_dispute,true);
    assert.deepEqual([...new Set(get(id).format.observed_candidates.counts.map(c=>c.count))].sort(),[6,8]);
  }
});
test('0 percent is not no added sugar; fructose and sweeteners may coexist',()=>{
  assert.equal(at('021893','added_sugar').value,'added');assert.equal(at('021893','sweeteners').value,'present');
  assert.equal(at('021893','fat_claim').state,'unknown');
  assert.equal(at('035827','fat_claim').value,'zero_percent');assert.equal(at('035827','added_sugar').value,'no_added_claim');
  assert.equal(at('035827','sweeteners').value,'present');
});
test('oligofructose and ingredient lactose do not fabricate an added-sugar claim',()=>{
  for(const id of ['012999','013618','013161']) assert.equal(at(id,'added_sugar').state,'unknown');
  assert.equal(at('014523','added_sugar').value,'added');assert.equal(at('014523','sweeteners').value,'present');
});
test('natural, sugar free, no added and sweetened are independent fields',()=>{
  assert.equal(at('005605','added_sugar').state,'unknown');assert.equal(at('005605','sweeteners').state,'unknown');
  assert.equal(at('027687','total_sugar_claim').value,'sugar_free_claim');assert.equal(at('027687','added_sugar').state,'unknown');
  assert.equal(at('036361','added_sugar').value,'no_added_claim');assert.equal(at('036361','total_sugar_claim').state,'unknown');
});
test('milk with soy extract is not dairy free and coconut is not soy by brand',()=>{
  assert.equal(at('012746','milk_presence').value,'present');assert.equal(at('012746','plant_base').state,'unknown');
  assert.equal(at('028550','plant_base').value,'coconut');assert.equal(at('028550','milk_presence').value,'absent_claim');
  assert.equal(at('026479','plant_base').value,'soy+coconut');
  assert.equal(at('027119','milk_presence').state,'unknown');assert.equal(get('027119').matrix,'unknown');
});
test('allergy warning, ingredient skimmed milk and percentages without object are not product attributes',()=>{
  for(const id of ['024895','032117']) assert.equal(at(id,'milk_species').state,'unknown');
  for(const id of ['004537','012251','036186']) assert.equal(at(id,'fat_claim').state,'unknown');
  assert.equal(at('028948','fat_claim').value,'skimmed');
});
test('brand and neighboring category cannot invent Greek or bifidus claims',()=>{
  for(const id of ['008000','019600','025865','028274']) assert.equal(at(id,'greek_style').state,'unknown');
  assert.equal(at('031462','greek_style').value,'declared');assert.equal(at('031462','bifidus_claim').state,'unknown');
});
test('unresolved skyr and a kefir category do not become approved yogurt or automatic exclusions',()=>{
  for(const id of ['027737','035393','035394','035395','034084']) assert.equal(get(id).scope.state,'unknown');
  assert.equal(get('036361').matrix,'plant_fermented');assert.notEqual(get('036361').scope.state,'incompatible');
});
test('yogurt as an ingredient/scent cannot include pet treats, cookies or infant puree',()=>{
  for(const id of ['015192','020315','031243','036245','035948','036225','036359','036360']){
    assert.equal(get(id).scope.state,'incompatible');assert.equal(get(id).source_review_depth,'scope_gate_only');
  }
});
test('pudding is excluded while cheesecake/muffin as fermented-product flavour is not',()=>{
  for(const id of ['034562','034563','034564','035939']) assert.equal(get(id).scope.state,'incompatible');
  for(const id of ['035397','035942','036726']) assert.notEqual(get(id).scope.state,'incompatible');
  assert.deepEqual(at('036726','declared_flavour').value,['blueberry','cake','cookie']);
});
test('nominal profiles preserve overlapping compounds and do not make multifruits a disjoint fruit',()=>{
  assert.equal(at('011548','declared_flavour').state,'unknown');assert.equal(at('034092','declared_flavour').state,'unknown');
  assert.equal(yogurtAttributeRelation('declared_flavour',at('025510','declared_flavour'),{state:'known',value:['apple']}),'unknown');
});
test('no number-minimum heuristic creates counts from unitless multiplication',()=>{
  const raw={display_name:'Yogur',description:'120X4'};
  assert.equal(plusfrescFormatCandidates(raw).counts.length,0);assert.equal(plusfrescFormatCandidates(raw).full.length,0);
  assert.equal(get('016654').format.count,4);assert.equal(get('016654').format.each,null);
});
test('unit-bearing count x each works in both orders without arithmetic inference',()=>{
  assert.equal(get('004449').format.each.amount,120000);assert.equal(get('004449').format.count,4);
  assert.equal(get('012260').format.each.amount,125000);assert.equal(get('012260').format.count,4);
  assert.equal(get('031460').format.each.amount,160000);assert.equal(get('031460').format.count,2);
});
test('unitless 4x120 plus nominal 480g does not approve 4x120g',()=>{
  for(const id of ['004537','004542','025865','035394']){assert.equal(get(id).format.state,'unknown');assert.equal(get(id).format.each,null);}
});
test('explicit one unit or named container can establish one package, bare mass cannot',()=>{
  for(const id of ['022183','022382','025510','029990','032308']) assert.equal(get(id).format.count,1);
  for(const id of ['025506','028947','035940']) assert.equal(get(id).format.count,null);
});
test('unit-vs-total ambiguity stays separate from contradiction',()=>{
  for(const id of ['007388','017148','020990','021056','024581','032312']){
    assert.equal(get(id).format.state,'unknown');assert.equal(get(id).source_dispute,false);
    assert.equal(get(id).format.warning,'unresolved_quantity_role');
  }
  assert.equal(get('033681').format.each,null);assert.equal(get('033682').format.each.amount,120000);
  assert.equal(get('033682').format.state,'known');
});
test('two unassigned quantities never choose an arbitrary nominal amount for a rejection',()=>{
  const f=get('036753').format;assert.equal(f.nominal,null);assert.equal(f.each,null);assert.equal(f.count,null);
  assert.equal(yogurtFormatRelation(f,get('031462').format).state,'unknown');
  assert.equal(get('021895').format.nominal,null);
});
test('mass/volume claims are both retained and neither is silently selected',()=>{
  for(const id of ['013655','019933','034279']){
    const f=get(id).format;assert.equal(f.warning,'unresolved_mass_volume');assert.equal(f.each,null);assert.equal(f.nominal,null);
  }
  assert.equal(get('019933').format.count,1);
});
test('assortment and ambiguous logistics cannot produce a full commercial signature',()=>{
  for(const id of ['014056','015460','026477','033688']) assert.equal(get(id).format.state,'unknown');
  assert.equal(get('036737').format.count,null);assert.equal(get('036737').format.warning,'commercial_count_unverified');
});
test('unselected formats suppress all active numeric components, without erasing observed claims',()=>{
  const raw=structuredClone(original('004449').raw);raw.raw.has_format=true;
  const f=reviewPlusfrescFormat(spec('004449'),raw);
  assert.equal(f.state,'unknown');assert.equal(f.count,null);assert.equal(f.each,null);assert.equal(f.nominal,null);
  assert.ok(f.observed_candidates.full.length>0);
});
test('numeric mistyping and a newly contradictory quantity cannot pass as known format',()=>{
  assert.throws(()=>reviewPlusfrescFormat({...spec('004449'),format:'4x124g'},original('004449').raw),/explicit_format/);
  const raw=structuredClone(original('004449').raw);raw.display_name+=' 999 gramos';
  assert.throws(()=>reviewPlusfrescFormat(spec('004449'),raw),/unresolved_quantity/);
});
test('commercial CP links include the acquired Plusfresc observation without approving stock or price',()=>{
  for(const a of packet.annotations) for(const c of a.contexts){
    const plus=c.location_observations.filter(l=>l.key.startsWith('plusfresc:'));
    const expected=input.locations.filter(l=>[a.left,a.right].includes(l.product_key)&&l.raw.store==='plusfresc'&&l.raw.location_id===(c.postcode==='08006'?'3':'12'));
    assert.equal(plus.length,expected.length);
    for(const l of plus) assert.ok(expected.some(e=>e.key===l.key&&hash(e.raw)===l.raw_sha256));
    for(const value of Object.values(c.labels))assert.equal(value.state,'unknown');
  }
});
test('each pair is an actual new frozen-corpus pair and annotation hashes include local provenance',()=>{
  const old=new Set(JSON.parse(readFileSync('docs/comparator-strict/dataset/label-yogurt-v1/index.json','utf8')).map(p=>p.pair_id));
  for(const a of packet.annotations){
    const {annotation_id,...body}=a;assert.equal(hash(body),annotation_id);assert.ok(!old.has(a.pair_id));
    assert.ok(input.pairs.some(p=>p.left===a.left&&p.right===a.right&&p.family==='yogurt'));
  }
});
test('progress is a union of pairs, not a sum of sources or CP assessments',()=>{
  assert.equal(packet.annotations.length,449);assert.equal(packet.report.newly_first_annotated_corpus_pairs,449);
  assert.equal(packet.report.union_first_annotated_corpus_pairs,1510);assert.equal(packet.report.corpus_pairs_pending_first_annotation,4490);
  assert.deepEqual(packet.report.pending_by_family,{drinking_water:2483,yogurt:2007});
  assert.deepEqual(packet.report.decision_counts,{abstain:155,excluded_scope:23,rejected:271});
});
test('all mandatory unknowns, independent review and gold remain explicit, with no 24h TTL',()=>{
  assert.equal(packet.report.commercial_ttl_hours,null);
  for(const p of packet.products){assert.equal(p.gold_eligible,false);assert.equal(p.independent_review_completed,false);}
  for(const a of packet.annotations){assert.notEqual(a.product_labels.variants.state,'compatible');assert.equal(a.gold_eligible,false);}
  for(const k of ['CE201_complete','CE202_complete','CE203_complete','G2_pass'])assert.equal(packet.report[k],false);
});
