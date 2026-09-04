import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLabelCorpus} from './comparator-strict-corpus-labels.mjs';
import {buildWaterReview,waterMatrix} from './comparator-strict-water-review.mjs';
const input=loadLabelCorpus(),packet=buildWaterReview(input),byKey=new Map(packet.products.map(p=>[p.key,p]));
test('water review covers every source and pair while closing no later gate',()=>{
  assert.equal(packet.products.length,771);assert.equal(packet.annotations.length,2485);
  assert.equal(packet.report.union_first_annotated_corpus_pairs,6000);assert.equal(packet.report.corpus_pairs_pending_first_annotation,0);
  assert.equal(packet.report.newly_first_annotated_corpus_pairs,2483);assert.equal(packet.report.supported_full_positive_equivalences,1);
  assert.equal(packet.report.eligible_savings,0);assert.equal(packet.report.independent_reviews,0);assert.equal(packet.report.gold_pairs,0);
  assert.equal(packet.report.CE201_complete,true);assert.equal(packet.report.CE202_complete,true);assert.equal(packet.report.CE203_complete,false);assert.equal(packet.report.G2_pass,false);
});
test('the one nominated positive needs same valid GTIN, exact bottle format and all product dimensions',()=>{
  const a=packet.annotations.find(x=>x.left==='consum:2569879'&&x.right==='mercadona:27232');assert.ok(a);
  assert.equal(a.same_valid_global_gtin,true);assert.equal(a.full_product_equivalence_established,true);
  assert.deepEqual(Object.fromEntries(['scope','identity','variants','format'].map(k=>[k,a.product_labels[k].state])),{scope:'compatible',identity:'compatible',variants:'compatible',format:'compatible'});
  assert.deepEqual(byKey.get(a.left).format.signature,[1,'volume',1500,1500]);assert.equal(byKey.get(a.left).format.container.value,'bottle');
  assert.deepEqual(byKey.get(a.right).format.signature,[1,'volume',1500,1500]);assert.equal(byKey.get(a.right).format.container.value,'bottle');
  assert.equal(a.contexts[0].decision,'abstain');assert.ok(a.contexts.every(c=>Object.values(c.labels).every(l=>l.state==='unknown')));
});
test('quantity, gas, flavour and container differences remain strict and independent',()=>{
  const incompatible=packet.annotations.filter(a=>a.product_labels.format.state==='incompatible');assert.ok(incompatible.length>0);
  assert.ok(packet.annotations.some(a=>a.attribute_comparisons.gas.relation==='incompatible'));
  assert.ok(packet.products.some(p=>p.matrix==='flavoured_water'&&p.attributes.water_flavour.state==='known'));
  assert.ok(packet.annotations.some(a=>/Forma de envase distinta/.test(a.product_labels.format.reason)));
  assert.ok(packet.annotations.every(a=>a.full_product_equivalence_established||a.contexts[0].decision!=='eligible_saving'));
});
test('source conflicts and selectable Plusfresc formats are not repaired silently',()=>{
  for(const key of ['plusfresc:007307','plusfresc:014934','plusfresc:029934','plusfresc:032380','carrefour:prod170182'])assert.equal(byKey.get(key).source_dispute,true,key);
  assert.equal(byKey.get('plusfresc:032380').attributes.gas.state,'conflicting');
  assert.equal(byKey.get('plusfresc:007307').format.state,'conflicting');
  assert.ok(packet.products.filter(p=>p.key.startsWith('plusfresc:')&&p.format.flags.includes('unselected_sale_format')).every(p=>p.format.state!=='known'));
});
test('lexical confusers are outside drinking water without approving their recipe',()=>{
  for(const key of ['mercadona:14390','mercadona:46954','plusfresc:018696','plusfresc:021735','plusfresc:032722','mercadona:9660.2'])assert.equal(byKey.get(key).scope.state,'incompatible',key);
  assert.equal(byKey.get('plusfresc:035538').matrix,'flavoured_water');
  assert.equal(byKey.get('plusfresc:035538').attributes.water_additives.state,'known');
  assert.equal(byKey.get('mercadona:21733').matrix,'soft_drink');
});
test('matrix function does not use corpus family as truth',()=>{
  const p=input.products.find(x=>x.key==='mercadona:14390');assert.equal(waterMatrix(p,[]),'personal_care');
});
