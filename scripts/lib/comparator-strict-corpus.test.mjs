import {test} from 'node:test';
import assert from 'node:assert/strict';
import {corpusProfile,categoryPath,stratifiedSelection} from './comparator-strict-corpus.mjs';
const taxonomy={consum:[{id:'1783',name:'Congelados',parent_id:null,published:true},{id:'2517',name:'Patatas',parent_id:'1783',published:true},{id:'fish',name:'Pescado',parent_id:'1783',published:true}]};
test('Family needs the source category chain, not a potato substring',()=>{
  const base={display_name:'Patatas prefritas',category_id:'2517',category_ids:['2517','1783']};
  assert.equal(corpusProfile(base,'consum',taxonomy).family,'frozen_potatoes');
  assert.equal(corpusProfile(base,'consum',{}).family,null);
  assert.equal(corpusProfile({...base,display_name:'Pulpo con puré de patata',category_id:'fish',category_ids:['fish','1783']},'consum',taxonomy).family,null);
  assert.equal(corpusProfile({...base,display_name:'Tortilla de patatas'},'consum',taxonomy).family,null);
});
test('Yogur griego / griego yogur preserve family and variant words, never equivalence',()=>{
  const base={category_id:'109'};
  const a=corpusProfile({...base,display_name:'Yogur griego natural'},'mercadona');
  const b=corpusProfile({...base,display_name:'Griego yogur natural'},'mercadona');
  const c=corpusProfile({...base,display_name:'Yogur griego azucarado'},'mercadona');
  assert.equal(a.family,b.family);assert.deepEqual(a.literal_flags,b.literal_flags);
  assert.notDeepEqual(a.literal_flags,c.literal_flags);assert.equal(a.equivalence,undefined);
});
test('No unit-count or exact quantity invented from missing metadata',()=>{
  const x=corpusProfile({display_name:'Yogur natural 750 g',category_id:'104'},'mercadona');
  assert.equal(x.structure,'unresolved_structure');assert.deepEqual(x.format_evidence.packClauses,[]);
  assert.equal(x.format_evidence.total_units,undefined);
  const y=corpusProfile({display_name:'Yogur 6x125g',category_id:'104'},'mercadona');
  assert.equal(y.structure,'multipack_evidence');assert.notEqual(x.format_signature,y.format_signature);
});
test('Approximate-weight evidence is quarantined; beverages are not all water',()=>{
  assert.equal(corpusProfile({display_name:'Yogur natural',category_id:'104',raw:{price_instructions:{approx_size:true}}},'mercadona').family,null);
  assert.equal(corpusProfile({display_name:'Zumo naranja 1 L',category_id:'cat650002',category_ids:['cat650002']},'carrefour').family,null);
  assert.equal(corpusProfile({display_name:'Agua de colonia',category_id:'cat20049'},'carrefour').family,null);
});
test('Category cycle terminates and sampling is deterministic without replacement',()=>{
  assert.equal(categoryPath({category_id:'x'},'s',{s:[{id:'x',parent_id:'y'},{id:'y',parent_id:'x'}]}).length,2);
  const rows=Array.from({length:100},(_,i)=>({key:String(i),group:i<70?'a':'b'}));
  const a=stratifiedSelection(rows,20,'test',x=>x.group),b=stratifiedSelection([...rows].reverse(),20,'test',x=>x.group);
  assert.deepEqual(a,b);assert.equal(new Set(a.selected.map(x=>x.key)).size,20);
  assert.equal(a.weights.reduce((n,x)=>n+x.selected,0),20);
  for(const w of a.weights)assert.equal(w.inclusion_probability,w.selected/w.population);
});
test('Sampling refuses impossible targets and too many strata',()=>{
  assert.throws(()=>stratifiedSelection([{key:'a'}],2,'test',x=>x.key),/shortage/);
  assert.throws(()=>stratifiedSelection([{key:'a'},{key:'b'}],1,'test',x=>x.key),/strata/);
});
