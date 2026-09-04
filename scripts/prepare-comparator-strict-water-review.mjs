#!/usr/bin/env node
// OFFLINE/stdout-only; no deployment, database write or gold promotion.
import {readFileSync} from 'node:fs';
import {loadLabelCorpus} from './lib/comparator-strict-corpus-labels.mjs';
import {buildWaterReview} from './lib/comparator-strict-water-review.mjs';
import {datasetHash as hash} from './lib/comparator-strict-dataset.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{const m=/^--(artifact|offset|limit)=(.+)$/.exec(arg);if(!m)throw Error('Unknown argument');return [m[1],m[2]];}));
const artifact=args.artifact??'report';if(!['products','annotations','index','report','manifest'].includes(artifact))throw Error('Unknown artifact');
const packet=buildWaterReview(loadLabelCorpus()),r=packet.report;
const files=['scripts/lib/comparator-strict-water-review-specs.mjs','scripts/lib/comparator-strict-water-review.mjs',
  'scripts/prepare-comparator-strict-water-review.mjs','scripts/lib/comparator-strict-corpus-labels.mjs',
  'scripts/lib/comparator-strict-corpus.mjs','scripts/lib/comparator-strict-dataset.mjs','scripts/lib/comparator-strict-labels.mjs',
  'scripts/lib/gtin.mjs','docs/comparator-strict/CE-201-202-yogurt-carrefour-evidence.json',
  'docs/comparator-strict/dataset/label-corpus-v1/editorial.json',
  ...['label-potatoes-v1','label-yogurt-v1','label-yogurt-plusfresc-v1','label-yogurt-carrefour-v1'].map(d=>`docs/comparator-strict/dataset/${d}/index.json`),
  ...Array.from({length:12},(_,i)=>`docs/comparator-strict/dataset/label-corpus-v1/index-${String(i*500).padStart(4,'0')}.json`),
  'docs/comparator-strict/CE-202-water-source-review-guide.md'];
const manifest={version:r.version,corpus_manifest_sha256:r.source_manifest_sha256,
  code_policy_and_preexisting_evidence:files.map(path=>({path,sha256:hash(readFileSync(path,'utf8'))})),
  hashes:r.hashes,report_sha256:hash(r),materialization:'Compact report and manifest stored. Full 771 product reviews, 2,485 annotations and index are deterministic stdout artifacts pinned by hash; frozen raw evidence remains in the CE-200 acquisition files.',
  CE201_complete:true,CE202_complete:true,CE203_complete:false,G2_pass:false};
let value=artifact==='manifest'?manifest:packet[artifact];
if(args.offset!==undefined||args.limit!==undefined){const offset=Number(args.offset??0),limit=Number(args.limit??100);if(!Array.isArray(value)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>6000)throw Error('Invalid slice');value=value.slice(offset,offset+limit);}
process.stdout.write(JSON.stringify(value)+'\n');
