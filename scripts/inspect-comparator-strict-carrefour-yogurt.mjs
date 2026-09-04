#!/usr/bin/env node
// Read-only inspection of the frozen corpus. No product facts or labels inferred.
import {readFileSync} from 'node:fs';
import {loadLabelCorpus} from './lib/comparator-strict-corpus-labels.mjs';
import {categoryPath} from './lib/comparator-strict-corpus.mjs';
const input=loadLabelCorpus();
const previous=new Set(JSON.parse(readFileSync('docs/comparator-strict/dataset/label-yogurt-v1/products.json','utf8')).map(p=>p.key));
const keys=new Set(input.pairs.filter(p=>p.family==='yogurt').flatMap(p=>[p.left,p.right]));
const products=input.products.filter(p=>p.store==='carrefour'&&keys.has(p.key)&&!previous.has(p.key)).sort((a,b)=>a.key.localeCompare(b.key));
const [offset=0,limit=25]=process.argv.slice(2).map(Number);
if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>545||process.argv.length>4)throw Error('Invalid inspection slice');
for(const [i,p] of products.slice(offset,offset+limit).entries()) {
  const r=p.raw;
  const fields={denomination:r.denomination,ingredients:r.ingredients,allergens:r.allergens,
    conservation:r.conservation,preparation:r.preparation,nutrition:r.nutrition,ean:r.ean};
  console.log(`${offset+i}|${p.id}|${r.display_name}`);
  for(const [k,v] of Object.entries(fields))if(v!==null&&v!==undefined)console.log(`${k}: ${v}`);
  console.log(`null: ${Object.keys(fields).filter(k=>fields[k]===null).join(',')}`);
  console.log(`raw_name: ${r.raw.name===r.display_name?'SAME':r.raw.name}; sell_pack_unit=${r.raw.sell_pack_unit}; measure=${r.raw.measure_unit}; parent=${JSON.stringify(r.raw.parent_category??null)}`);
  console.log(`category: ${categoryPath(r,p.store,input.taxonomy).map(c=>`${c.id}:${c.name}`).join(' > ')}`);
}
