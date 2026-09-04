import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {datasetHash as hash} from '../lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from '../lib/comparator-strict-corpus-labels.mjs';
import {buildYogurtReview} from '../lib/comparator-strict-yogurt-review.mjs';
const dir='docs/comparator-strict/dataset/label-yogurt-v1';
const json=path=>JSON.parse(readFileSync(path,'utf8'));
const packet=buildYogurtReview(loadLabelCorpus()),manifest=json(`${dir}/manifest.json`);
test('yogurt materialized records and all full-annotation hashes exactly regenerate',()=>{
  for(const k of ['products','index','report']) assert.deepEqual(json(`${dir}/${k}.json`),packet[k],k);
  for(const k of ['products','annotations','index']) assert.equal(hash(packet[k]),manifest.hashes[k],k);
  assert.equal(hash(packet.report),manifest.report_sha256);
});
test('yogurt manifest pins generator, editorial policy and actual prior inputs',()=>{
  for(const f of manifest.code_and_preexisting_evidence) assert.equal(hash(readFileSync(f.path,'utf8')),f.sha256,f.path);
  assert.equal(hash(readFileSync('docs/comparator-strict/dataset/corpus-v1/manifest.json','utf8')),manifest.corpus_manifest_sha256);
});
test('previous frozen evidence and production-facing files remain byte-identical',()=>{
  for(const path of ['docs/comparator-strict/CE-201-202-corpus-evidence.json','docs/comparator-strict/CE-201-202-potatoes-evidence.json']){
    const e=json(path);
    for(const f of [...e.files,...(e.protected_files ?? [])]) assert.equal(hash(readFileSync(f.path,'utf8')),f.sha256,f.path);
  }
});
test('133 proposals do not close the family, CE tasks, owner review or G2',()=>{
  assert.equal(packet.report.first_annotations_this_batch,133);
  assert.equal(packet.report.newly_first_annotated_corpus_pairs,133);
  assert.equal(packet.report.union_first_annotated_corpus_pairs,1061);
  assert.equal(packet.report.supported_full_positive_equivalences,0);
  assert.equal(packet.report.independent_pair_by_pair_reviews_this_batch,0);
  assert.equal(packet.report.gold_pairs,0);
  for(const k of ['CE201_complete','CE202_complete','CE203_complete','G2_pass']) assert.equal(manifest[k],false);
});
test('yogurt CLI reproduces dossier and slices while refusing deployment or invalid arguments',()=>{
  const cli='scripts/prepare-comparator-strict-yogurt-review.mjs';
  const run=args=>execFileSync(process.execPath,[cli,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.equal(run(['--artifact=review']),readFileSync(`${dir}/review.md`,'utf8'));
  assert.deepEqual(JSON.parse(run(['--artifact=index','--offset=10','--limit=2'])),packet.index.slice(10,12));
  assert.throws(()=>run(['--artifact=deploy']));
  assert.throws(()=>run(['--artifact=products','--offset=-1','--limit=1']));
  assert.throws(()=>run(['--artifact=report','--offset=0']));
});
