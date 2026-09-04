import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from '../lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from '../lib/comparator-strict-corpus-labels.mjs';
import {buildWaterReview} from '../lib/comparator-strict-water-review.mjs';
const dir='docs/comparator-strict/dataset/label-water-v1',json=path=>JSON.parse(readFileSync(path,'utf8'));
const packet=buildWaterReview(loadLabelCorpus()),report=json(`${dir}/report.json`),manifest=json(`${dir}/manifest.json`);

test('stored compact evidence reproduces the complete stdout layer exactly',()=>{
  assert.deepEqual(report,packet.report);
  for(const key of ['products','annotations','index'])assert.equal(hash(packet[key]),manifest.hashes[key],key);
  assert.equal(hash(packet.report),manifest.report_sha256);
  const cliManifest=JSON.parse(execFileSync(process.execPath,['scripts/prepare-comparator-strict-water-review.mjs','--artifact=manifest'],{encoding:'utf8'}));
  assert.deepEqual(manifest,cliManifest);
});

test('manifest pins policy, generator, corpus inputs and every previous index',()=>{
  for(const file of manifest.code_policy_and_preexisting_evidence)assert.equal(hash(readFileSync(file.path,'utf8')),file.sha256,file.path);
  assert.equal(manifest.code_policy_and_preexisting_evidence.filter(f=>/label-corpus-v1\/index-\d{4}\.json$/.test(f.path)).length,12);
  assert.equal(manifest.corpus_manifest_sha256,'15da91ad7ae616199da7a50b53dba2abca4e3c43c1420a4a413b23ad02b9abd7');
});

test('previous receipts and protected production files remain byte-identical',()=>{
  const latestPath='docs/comparator-strict/CE-201-202-yogurt-carrefour-evidence.json';
  assert.equal(hash(readFileSync(latestPath,'utf8')),'6a21151f4ccb05955b70560c30f60d021cc6e36d3be1961777a0e2b432d8fea1');
  const latest=json(latestPath);
  for(const file of [...latest.files,...latest.protected_files,...latest.previous_evidence_preserved])assert.equal(hash(readFileSync(file.path,'utf8')),file.sha256,file.path);
});

test('coverage closes CE-201/202 only and preserves the one source-backed product positive',()=>{
  assert.equal(report.union_first_annotated_corpus_pairs,6000);assert.equal(report.corpus_pairs_pending_first_annotation,0);
  assert.equal(report.supported_full_positive_equivalences,1);assert.equal(report.eligible_savings,0);
  assert.equal(report.CE201_complete,true);assert.equal(report.CE202_complete,true);
  assert.equal(report.CE203_complete,false);assert.equal(report.G2_pass,false);assert.equal(report.gold_pairs,0);
  assert.deepEqual(report.supported_full_positive_pairs,[{pair_id:'b974ef4338a479c95f448eac2a05814d500f6c27bb3b3f72216e25258e20a783',left:'consum:2569879',right:'mercadona:27232',decision:'abstain'}]);
});

test('CLI supports bounded inspection and rejects mutation-like or invalid artifacts',()=>{
  const run=args=>execFileSync(process.execPath,['scripts/prepare-comparator-strict-water-review.mjs',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  assert.deepEqual(JSON.parse(run(['--artifact=index','--offset=0','--limit=2'])),packet.index.slice(0,2));
  assert.deepEqual(JSON.parse(run(['--artifact=annotations','--offset=2484','--limit=1'])),packet.annotations.slice(2484,2485));
  assert.throws(()=>run(['--artifact=deploy']));assert.throws(()=>run(['--artifact=products','--offset=-1','--limit=1']));
  assert.throws(()=>run(['--artifact=report','--offset=0']));
});

test('closure receipt pins CE-201/202 without claiming CE-203 or production work',()=>{
  const receipt=json('docs/comparator-strict/CE-201-202-water-evidence.json');
  assert.deepEqual(receipt.tasks,['CE-201','CE-202']);
  assert.equal(receipt.status,'complete');
  assert.equal(receipt.report.union_first_annotated_corpus_pairs,6000);
  assert.equal(receipt.report.corpus_pairs_pending_first_annotation,0);
  assert.equal(receipt.report.supported_full_positive_equivalences,1);
  assert.equal(receipt.report.eligible_savings,0);
  assert.equal(receipt.report.CE203_complete,false);
  assert.equal(receipt.report.G2_pass,false);
  assert.equal(receipt.quality.tests.pass,579);
  assert.equal(receipt.safety.supabase_calls,0);
  assert.equal(receipt.safety.retailer_calls,0);
  for(const file of [...receipt.files,...receipt.protected_files,...receipt.previous_evidence_preserved]){
    assert.equal(hash(readFileSync(file.path,'utf8')),file.sha256,file.path);
  }
});
