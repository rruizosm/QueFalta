#!/usr/bin/env node
// Deterministic local-only rebuild. Does not load env, write files or call services.
import {readFile,readdir} from 'node:fs/promises';
import {assembleCorpusInputs,buildCorpus} from './lib/comparator-strict-corpus.mjs';
import {datasetHash} from './lib/comparator-strict-dataset.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const m=/^--(artifact|offset|limit)=(.+)$/.exec(x);if(!m)throw Error('Unknown argument');return[m[1],m[2]];}));
const artifact=args.artifact??'report';
if(!['report','selection','manifest','pairs','queries','pools','profiles','aliases'].includes(artifact))throw Error('Unknown artifact');
const dir='docs/comparator-strict/dataset/acquisition-v1';
const pages=[];
for(const name of (await readdir(dir)).sort()){
  const file=`${dir}/${name}`,body=await readFile(file,'utf8');
  if(!name.endsWith('.json'))continue;
  const p=JSON.parse(body);if(!p.payload)continue;
  pages.push({...p,file,file_hash:datasetHash(body)});
}
const legacy=JSON.parse(await readFile('docs/comparator-strict/dataset/seed-v1/exposure.json','utf8'));
const seed=JSON.parse(await readFile('docs/comparator-strict/dataset/seed-v1/products.json','utf8'));
const input=assembleCorpusInputs(pages,legacy,seed);
const result=buildCorpus(input);
const pairs=result.pairs.map(p=>({left:p.left,right:p.right,cohort:p.cohort,family:p.family,stratum:p.stratum??null,challenge_reason:p.challenge_reason??null,annotation_status:'unreviewed'}));
const profiles=input.products.map(({raw,...p})=>p);
const report={...result.report,stability:input.stability,source_pages:input.sourceFiles.length,
  quantities_are_sampling_evidence_not_normalized_truth:true,
  location_observations_for_target_mapping:input.locations.filter(l=>(l.raw.store==='consum'&&l.raw.location_id==='575')||(l.raw.store==='plusfresc'&&['3','12'].includes(l.raw.location_id))).length};
const selection={...result.selection,alias_groups:input.alias_groups,coverage:result.report.coverage};
const manifest={schema_version:1,task:'CE-200',corpus_version:'corpus-v1',status:'acquired_and_sampled_unlabelled',
  source_files:input.sourceFiles,source_frame_sha256:datasetHash(profiles),products:input.products.length,locations:input.locations.length,
  hashes:{pairs:datasetHash(pairs),queries:datasetHash(result.queries),pools:datasetHash(result.pools),selection:datasetHash(selection)},
  generator_files:await Promise.all(['scripts/lib/comparator-strict-corpus.mjs','scripts/prepare-comparator-strict-corpus.mjs','scripts/lib/comparator-strict-dataset.mjs'].map(async file=>({file,sha256:datasetHash(await readFile(file,'utf8'))}))),
  annotation_status:'unreviewed; annotation records in CE202 are separate; no implicit negatives',G2_pass:false,
  external_calls:0,commercial_ttl_hours:null,report};
let value=({report,selection,manifest,pairs,queries:result.queries,pools:result.pools,profiles,aliases:input.alias_groups})[artifact];
if(Array.isArray(value)&&args.limit){const offset=Number(args.offset??0),limit=Number(args.limit);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>6000)throw Error('Bad slice');value=value.slice(offset,offset+limit);}
console.log(JSON.stringify(value));
