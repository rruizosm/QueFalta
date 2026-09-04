import {before,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {assembleCorpusInputs,buildCorpus} from '../lib/comparator-strict-corpus.mjs';
import {datasetHash} from '../lib/comparator-strict-dataset.mjs';
const root='docs/comparator-strict/dataset/corpus-v1';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
let manifest,input,result,pairs,queries,pages;
before(async()=>{
  manifest=await json(`${root}/manifest.json`);pages=[];
  for(const source of manifest.source_files){const body=await readFile(source.file,'utf8');assert.equal(datasetHash(body),source.sha256,source.file);pages.push({...JSON.parse(body),file:source.file,file_hash:source.sha256});}
  input=assembleCorpusInputs(pages,await json('docs/comparator-strict/dataset/seed-v1/exposure.json'),await json('docs/comparator-strict/dataset/seed-v1/products.json'));
  result=buildCorpus(input);
  const files=(await readdir(root)).sort();
  pairs=(await Promise.all(files.filter(f=>/^pairs-\d+.json$/.test(f)).map(f=>json(`${root}/${f}`)))).flat();
  queries=(await Promise.all(files.filter(f=>/^queries-\d+.json$/.test(f)).map(f=>json(`${root}/${f}`)))).flat();
});
test('All original source files and generator hashes match the frozen manifest',async()=>{
  for(const s of manifest.generator_files)assert.equal(datasetHash(await readFile(s.file,'utf8')),s.sha256,s.file);
  const profiles=input.products.map(({raw,...p})=>p);
  assert.equal(datasetHash(profiles),manifest.source_frame_sha256);
  assert.equal(input.products.length,4176);assert.equal(input.locations.length,5189);
});
test('6000 unique pairs and 1200 Q exactly rebuild from acquisition, not synthetic padding',()=>{
  assert.equal(pairs.length,6000);assert.equal(queries.length,1200);
  assert.equal(new Set(pairs.map(p=>`${p.left}|${p.right}`)).size,6000);
  assert.equal(new Set(queries.map(q=>q.key)).size,1200);
  assert.equal(new Set(queries.map(q=>q.origin)).size,600);
  assert.equal(datasetHash(pairs),manifest.hashes.pairs);assert.equal(datasetHash(queries),manifest.hashes.queries);
  assert.deepEqual(queries,result.queries);
  const compact=result.pairs.map(p=>({left:p.left,right:p.right,cohort:p.cohort,family:p.family,stratum:p.stratum??null,challenge_reason:p.challenge_reason??null,annotation_status:'unreviewed'}));
  assert.deepEqual(pairs,compact);
});
test('Sampling weights match selected cells; historical IDs and possible aliases do not inflate confirmatory evidence',async()=>{
  const selection=await json(`${root}/selection.json`);
  assert.equal(datasetHash(selection),manifest.hashes.selection);
  const byId=new Map(input.products.map(p=>[p.key,p]));
  const signatures=new Set();
  for(const p of pairs){assert.notEqual(byId.get(p.left).store,byId.get(p.right).store);assert.ok(p.left<p.right);
    if(p.cohort==='confirmatory')for(const key of [p.left,p.right]){assert.equal(byId.get(key).alias_group_exposed,false);assert.equal(byId.get(key).alias_representative,true);}
    const k=[byId.get(p.left).sampling.alias_signature,byId.get(p.right).sampling.alias_signature].sort().join('|');assert.ok(!signatures.has(k));signatures.add(k);
  }
  for(const s of selection.pair_strata){assert.equal(pairs.filter(p=>p.cohort==='confirmatory'&&p.stratum===s.stratum).length,s.selected);assert.equal(s.inclusion_probability,s.selected/s.population);}
  assert.equal(selection.pair_strata.reduce((n,s)=>n+s.population,0),selection.pair_population);
});
test('All families/stores occur; query truth is not capped at 50 and unknown commerce remains unknown',()=>{
  assert.ok(result.report.coverage.every(x=>x.source_supported>0&&x.query_origins>0));
  for(const q of queries){assert.equal(q.destination_stores.length,3);assert.ok(!q.destination_stores.includes(q.origin.split(':')[0]));assert.equal(q.commercial_ttl_hours,null);
    for(const d of q.destinations){assert.equal(d.known_equivalents,null);assert.equal(d.known_minimum_price,null);assert.equal(d.decision,null);assert.equal(d.truth_not_limited_to_retrieval_cap,true);}
  }
  assert.ok(input.stability.every(x=>x.status==='all_content_fingerprints_match'));
  assert.equal(result.report.G2_pass,false);assert.equal(result.report.gold_labels,0);
});
test('Requested formats exist in real evidence and the 2 kg frozen reference occurs in pairs',()=>{
  const p=input.products.find(p=>p.key==='mercadona:61405');assert.equal(p.raw.raw.price_instructions.unit_size,2);
  assert.ok(pairs.some(x=>x.left===p.key||x.right===p.key));
  const yog=input.products.find(p=>p.key==='mercadona:20559');assert.equal(yog.raw.raw.price_instructions.total_units,6);assert.equal(yog.raw.raw.price_instructions.pack_size,0.125);
  assert.ok(input.products.some(p=>p.sampling.family==='drinking_water'&&p.raw.raw?.price_instructions?.unit_size===1&&p.raw.raw.price_instructions.is_pack===false));
});
test('Changed fingerprints and duplicate source identities fail closed',()=>{
  const changed=structuredClone(pages);const f=changed.find(p=>p.payload.kind==='fingerprints'&&p.payload.rows.length);f.payload.rows[0].source_row_md5='different';
  assert.throws(()=>assembleCorpusInputs(changed),/source_changed/);
  const product=pages.find(p=>p.payload.kind==='products');
  assert.throws(()=>assembleCorpusInputs([...pages,product]),/duplicate_product/);
});
