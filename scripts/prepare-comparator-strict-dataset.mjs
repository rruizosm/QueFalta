#!/usr/bin/env node
// Read-only local CLI. Prints artifacts to stdout; no .env, network or writes.
import {readFileSync} from 'node:fs';
import {datasetHash,prepareExploratoryDataset} from './lib/comparator-strict-dataset.mjs';
const root=new URL('../',import.meta.url);
const samplePath='docs/comparator-strict/fixtures/catalog-sample-2026-09-03.json';
const legacyPath='supabase/experiments/comparator-embedding-pilot.jsonl';
const permitted=new Set(['report','products','pairs','queries','exposure','manifest']);
const arg=process.argv[2]??'--artifact=report';
if(process.argv.length>3||!arg.startsWith('--artifact=')||!permitted.has(arg.slice(11)))throw new Error('Usage: --artifact=report|products|pairs|queries|exposure|manifest');
const artifact=arg.slice(11);
const sampleText=readFileSync(new URL(samplePath,root),'utf8');
const legacyText=readFileSync(new URL(legacyPath,root),'utf8');
const result=prepareExploratoryDataset(JSON.parse(sampleText),{sourcePath:samplePath,sourceSha256:datasetHash(sampleText)},
  legacyText.trim().split(/\r?\n/).map(line=>JSON.parse(line)));
result.manifest={schema_version:1,task:'CE-200',cohort:'exploratory_exposed',
  NOT_A_HOLDOUT:true,labels:'none; raw hints and legacy annotations are not truth',
  pair_identity:'unordered commercial IDs; reciprocal direction/CP do not add identity evidence',
  query_identity:'origin observation + full other-store set + postcode + channel + fixed replay clock',
  price_and_location:'unknown until evidence and review; published is not stock',
  observation_age_policy:'historical replay has no age TTL; not evidence of live commerce',
  source_files:[{path:samplePath,sha256:datasetHash(sampleText)},{path:legacyPath,sha256:datasetHash(legacyText)}],
  row_counts:{products:result.products.length,pairs:result.pairs.length,queries:result.queries.length,exposure:result.exposure.length},
  content_hashes:result.report.hashes};
// One compact record per line keeps the machine corpus inspectable and small.
const value=result[artifact];
process.stdout.write(Array.isArray(value)?'[\n'+value.map(row=>'  '+JSON.stringify(row)).join(',\n')+'\n]\n':JSON.stringify(value,null,2)+'\n');
