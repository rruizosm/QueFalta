import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DATASET_STORES,datasetHash,importExploratorySample,buildExploratoryPairs,
  buildExploratoryQueries,legacyExposureIndex,prepareExploratoryDataset} from './comparator-strict-dataset.mjs';
const sourcePath='docs/comparator-strict/fixtures/catalog-sample-2026-09-03.json';
const root=new URL('../../',import.meta.url);
const raw=readFileSync(new URL(sourcePath,root),'utf8');
const sample=JSON.parse(raw);
const provenance={sourcePath,sourceSha256:datasetHash(raw)};
const build=value=>prepareExploratoryDataset(value,provenance);

test('CE-200 seed has 72 references, 648 unordered pairs, 144 Q and 432 destination cases',()=>{
  const result=build(sample);
  assert.equal(result.products.length,72);assert.equal(result.pairs.length,648);
  assert.equal(result.queries.length,144);assert.equal(result.report.destination_cases,432);
  assert.equal(new Set(result.pairs.map(p=>p.pair_id)).size,648);
  assert.equal(new Set(result.queries.map(q=>q.query_id)).size,144);
});

test('raw formats, sugar variants, quantities and leading-zero IDs remain untouched',()=>{
  const result=build(sample),p=result.products.find(p=>p.product_key==='plusfresc:000599');
  assert.equal(p.product_id,'000599');assert.match(p.raw.display_name,/5 l/);
  for(const row of sample.products){
    const imported=result.products.find(p=>p.product_key===`${row.store}:${row.product.id}`);
    assert.deepEqual(imported.raw,row.product);
    assert.equal(imported.catalog_revision,null);assert.equal(imported.family_validation,'unreviewed');
  }
});

test('no label, savings minimum, stock, coverage or complete reference set is invented',()=>{
  const result=build(sample);
  assert.equal(result.report.CE200_confirmatory_pairs,0);assert.equal(result.report.CE200_confirmatory_queries,0);
  assert.equal(result.report.strict_equivalence_labels,0);assert.equal(result.report.G2_pass,false);
  for(const q of result.queries)for(const c of q.cases){
    assert.equal(c.expected,null);assert.equal(c.known_cheapest,null);assert.equal(c.known_equivalents,null);
    assert.equal(c.location_evidence,null);assert.equal(c.reference_pool_complete,false);
  }
});

test('reversed observations or duplicated copies do not inflate identity evidence',()=>{
  const duplicated=structuredClone(sample);duplicated.products.push(structuredClone(sample.products[0]));
  const original=build(sample),again=build(duplicated);
  assert.equal(again.products.length,72);assert.deepEqual(again.pairs,original.pairs);
  assert.deepEqual(again.queries,original.queries);
  const reversed=structuredClone(sample);reversed.products.reverse();
  assert.deepEqual(build(reversed).pairs,original.pairs);assert.deepEqual(build(reversed).queries,original.queries);
});

test('same product returned under two lexical hints is merged without calling either a family',()=>{
  const changed=structuredClone(sample);changed.products.push({...structuredClone(sample.products[0]),hint:'water_candidate'});
  const products=importExploratorySample(changed,provenance);
  assert.equal(products.length,72);
  const p=products.find(p=>p.product_key==='carrefour:2047790350');
  assert.deepEqual(p.lexical_cohorts,['potato_candidate','water_candidate']);
  assert.equal(p.family_validation,'unreviewed');
});

test('conflicting versions in the same source are rejected rather than last-write-wins',()=>{
  const changed=structuredClone(sample),row=structuredClone(changed.products[0]);
  row.product.unit_price+=1;changed.products.push(row);
  assert.throws(()=>build(changed),/conflicting_duplicate/);
});

test('unknown project, synthetic data, numeric IDs, unpublished rows and invalid clocks are denied',()=>{
  const mutations=[s=>s.project_ref='other',s=>s.synthetic=true,s=>s.products[0].product.id=599,
    s=>s.products[0].product.published=false,s=>s.captured_at='yesterday',
    s=>s.products[0].hint='confirmed_equivalent',s=>s.products[0].store='another-store'];
  for(const mutate of mutations){const changed=structuredClone(sample);mutate(changed);assert.throws(()=>build(changed));}
});

test('old observation remains replayable without being presented as live commercial evidence',()=>{
  const old=structuredClone(sample);old.captured_at='2020-01-01T12:00:00Z';
  const r=build(old);assert.equal(r.products.length,72);
  assert.ok(r.queries.every(q=>q.reference_clock===old.captured_at));
  assert.ok(r.products.every(p=>p.commercial_context_validation==='not_evaluated'));
});

test('queries keep CPs as strings, exclude origin store and do not multiply destination subsets',()=>{
  const r=build(sample);
  for(const p of r.products){
    const qs=r.queries.filter(q=>q.origin_key===p.product_key);
    assert.equal(qs.length,2);assert.deepEqual(qs.map(q=>q.postcode),['08006','25001']);
    assert.deepEqual(qs[0].requested_stores,DATASET_STORES.filter(s=>s!==p.store));
    for(const q of qs)for(const c of q.cases){
      assert.notEqual(c.store,p.store);
      for(const id of c.explored_pairs){const pair=r.pairs.find(p=>p.pair_id===id);assert.ok([pair.left_key,pair.right_key].includes(p.product_key));}
    }
  }
});

test('malformed, reversed, duplicate or missing pair references are rejected',()=>{
  const p=importExploratorySample(sample,provenance),pairs=buildExploratoryPairs(p);
  assert.throws(()=>buildExploratoryQueries(p,[pairs[0],pairs[0]],sample.captured_at),/duplicate_pair/);
  assert.throws(()=>buildExploratoryQueries(p,[{...pairs[0],right_key:'absent'}],sample.captured_at),/invalid_pair/);
  assert.throws(()=>buildExploratoryQueries(p,[{...pairs[0],left_key:pairs[0].right_key,right_key:pairs[0].left_key}],sample.captured_at),/invalid_pair/);
});

test('legacy index records exposure only, never transfers inferred attributes or equivalence',()=>{
  const rows=[{store:'carrefour',product_id:'001',global_gtin:'123',quantity_base:1,attributes:{sin_azucar:false}},
    {store:'consum',product_id:'001',global_gtin:'123',attributes:{sin_azucar:true}}];
  const result=legacyExposureIndex([...rows,rows[0]]);
  assert.equal(result.length,2);assert.ok(result.every(r=>r.gtin_identity_verified===false));
  assert.equal(result[0].attributes,undefined);assert.equal(result[0].quantity_base,undefined);
  assert.throws(()=>legacyExposureIndex([rows[0],{...rows[0],global_gtin:'456'}]),/conflicting_legacy_identity/);
});

test('same GTIN does not collapse commercial products or assert pack equality',()=>{
  const changed=structuredClone(sample);for(const r of changed.products)r.product.ean='8410000000000';
  const result=build(changed);assert.equal(result.products.length,72);assert.equal(result.pairs.length,648);
  assert.equal(result.report.strict_equivalence_labels,0);
});

test('source page and exploratory expansion have explicit hard limits',()=>{
  const changed=structuredClone(sample);changed.products=Array(501).fill(changed.products[0]);
  assert.throws(()=>build(changed),/invalid_source/);
  const products=Array.from({length:300},(_,i)=>({product_key:`${i<150?'consum':'carrefour'}:${i}`,store:i<150?'consum':'carrefour',lexical_cohorts:['water_candidate']}));
  assert.throws(()=>buildExploratoryPairs(products),/exploratory_pair_limit/);
});

test('seed artifacts regenerate exactly and retain their provenance hashes',()=>{
  const path='docs/comparator-strict/dataset/seed-v1/';
  const manifest=JSON.parse(readFileSync(new URL(path+'manifest.json',root),'utf8'));
  const legacyRaw=readFileSync(new URL('supabase/experiments/comparator-embedding-pilot.jsonl',root),'utf8');
  const r=prepareExploratoryDataset(sample,provenance,legacyRaw.trim().split(/\r?\n/).map(JSON.parse));
  for(const name of ['products','pairs','queries','exposure']){
    const saved=JSON.parse(readFileSync(new URL(path+name+'.json',root),'utf8'));
    assert.deepEqual(saved,r[name]);assert.equal(datasetHash(saved),manifest.content_hashes[name]);
  }
  assert.equal(manifest.NOT_A_HOLDOUT,true);
  assert.equal(manifest.source_files[0].sha256,datasetHash(raw));
  assert.equal(manifest.source_files[1].sha256,datasetHash(legacyRaw));
});
