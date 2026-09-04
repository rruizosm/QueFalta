#!/usr/bin/env node
// Local source-quality inventory; counts are not equivalence labels or metrics.
import {readFile} from 'node:fs/promises';
import {assembleCorpusInputs} from './lib/comparator-strict-corpus.mjs';
import {datasetHash} from './lib/comparator-strict-dataset.mjs';
const manifest=JSON.parse(await readFile('docs/comparator-strict/dataset/corpus-v1/manifest.json','utf8'));
const pages=[];
for(const source of manifest.source_files){const body=await readFile(source.file,'utf8');if(datasetHash(body)!==source.sha256)throw Error('source_changed');pages.push({...JSON.parse(body),file:source.file,file_hash:source.sha256});}
const input=assembleCorpusInputs(pages);
const result={capture_end:pages.map(p=>p.payload.captured_at).sort().at(-1),transport_bytes:pages.reduce((n,p)=>n+p.transport_bytes,0),returned_rows:pages.reduce((n,p)=>n+p.payload.row_count,0),by_kind:{},stores:[],protocol_versions:{},source_example_refs:[]};
for(const p of pages){result.by_kind[p.payload.kind]=(result.by_kind[p.payload.kind]??0)+p.payload.row_count;result.protocol_versions[p.plan.version]=(result.protocol_versions[p.plan.version]??0)+1;}
for(const store of ['carrefour','consum','mercadona','plusfresc']){
  const rows=input.products.filter(x=>x.store===store),fields={};
  for(const field of ['packaging','ean','ingredients','available','price_per_unit','unit_price'])fields[field]={
    not_selected_or_no_column:rows.filter(x=>!Object.hasOwn(x.raw,field)).length,
    selected_null:rows.filter(x=>Object.hasOwn(x.raw,field)&&x.raw[field]===null).length,
    present:rows.filter(x=>x.raw[field]!=null).length};
  result.stores.push({store,count:rows.length,fields,approximate_weight_flag:rows.filter(x=>x.sampling.variable_weight_evidence).length,
    unsupported_or_adjacent_family:rows.filter(x=>!x.sampling.family).length,unresolved_structure:rows.filter(x=>x.sampling.structure==='unresolved_structure').length,
    availability_false:rows.filter(x=>x.raw.available===false).length});
}
for(const key of ['mercadona:61405','mercadona:20559','mercadona:52441','carrefour:VC4AECOMM-621804','carrefour:VC4AECOMM-652994','consum:7028475','plusfresc:032789']){
  const p=input.products.find(x=>x.key===key);result.source_example_refs.push({key,name:p.raw.display_name,source:p.source,format_evidence:p.sampling.format_evidence,annotation:'unreviewed; no equivalence or savings conclusion'});
}
console.log(JSON.stringify(result));
