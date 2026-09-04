import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {datasetHash as hash} from '../lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from '../lib/comparator-strict-corpus-labels.mjs';
import {buildCarrefourYogurtReview} from '../lib/comparator-strict-yogurt-carrefour.mjs';
const dir='docs/comparator-strict/dataset/label-yogurt-carrefour-v1';
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const packet=buildCarrefourYogurtReview(loadLabelCorpus()),manifest=json(`${dir}/manifest.json`);
test('Carrefour products, index, report and full annotation hashes reproduce exactly',()=>{
  for(const k of ['products','index','report'])assert.deepEqual(json(`${dir}/${k}.json`),packet[k],k);
  for(const k of ['products','annotations','index'])assert.equal(hash(packet[k]),manifest.hashes[k],k);
  assert.equal(hash(packet.report),manifest.report_sha256);
});
test('Carrefour manifest pins actual code, policy, corpus and every frozen draft input',()=>{
  for(const f of manifest.code_and_preexisting_evidence)assert.equal(hash(readFileSync(f.path,'utf8')),f.sha256,f.path);
  assert.equal(hash(readFileSync('docs/comparator-strict/dataset/corpus-v1/manifest.json','utf8')),manifest.corpus_manifest_sha256);
  assert.equal(manifest.code_and_preexisting_evidence.filter(f=>/label-corpus-v1\/index-\d{4}.json$/.test(f.path)).length,12);
});
test('all four previous receipts, their artifacts and protected production files remain unchanged',()=>{
  const pinned={corpus:'8827df528b9071e75aff0b295e0480e2d76bf0aa0c77f3a6b709ca366531ab76',
    potatoes:'75c8a111eb5e97d3388d8be7d1933df8f8028c95befede8947cec576c719d11b',
    yogurt:'938a38a6d379bb5618403e6519bf631df7e5d02de2e0308c9e9271c32025e0ab',
    'yogurt-plusfresc':'ff4c1d4e98039da3e100655a3c18672eaa820adf8c6b0c2d4f3e37490f2dc559'};
  for(const [name,sha]of Object.entries(pinned)){
    const path=`docs/comparator-strict/CE-201-202-${name}-evidence.json`;assert.equal(hash(readFileSync(path,'utf8')),sha,path);
    const e=json(path),previous=e.previous_evidence_preserved,receipts=Array.isArray(previous)?previous:previous?[previous]:[];
    for(const f of [...e.files,...(e.protected_files??[]),...receipts])assert.equal(hash(readFileSync(f.path,'utf8')),f.sha256,f.path);
  }
});
test('new coverage and proposal transitions neither double-count editorials nor close CE or gold gates',()=>{
  assert.equal(packet.report.first_annotations_this_batch,2011);assert.equal(packet.report.newly_first_annotated_corpus_pairs,2007);
  assert.equal(packet.report.union_first_annotated_corpus_pairs,3517);assert.equal(packet.report.corpus_pairs_pending_first_annotation,2483);
  assert.equal(packet.report.supported_full_positive_equivalences,0);assert.equal(packet.report.independent_pair_by_pair_reviews_this_batch,0);
  assert.deepEqual(packet.report.comparison_against_frozen_drafts_not_motor_quality,{'abstain -> abstain':841,'abstain -> excluded_scope':150,'abstain -> rejected':570,'excluded_scope -> excluded_scope':1,'rejected -> excluded_scope':18,'rejected -> rejected':431});
  for(const k of ['CE201_complete','CE202_complete','CE203_complete','G2_pass'])assert.equal(manifest[k],false);
});
test('Carrefour CLI reproduces dossier and slices, and rejects deployment or invalid slicing',()=>{
  const cli='scripts/prepare-comparator-strict-yogurt-carrefour.mjs';
  const run=args=>execFileSync(process.execPath,[cli,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.equal(run(['--artifact=review']),readFileSync(`${dir}/review.md`,'utf8'));
  assert.deepEqual(JSON.parse(run(['--artifact=index','--offset=10','--limit=2'])),packet.index.slice(10,12));
  assert.throws(()=>run(['--artifact=deploy']));assert.throws(()=>run(['--artifact=products','--offset=-1','--limit=1']));
  assert.throws(()=>run(['--artifact=report','--offset=0']));
});
