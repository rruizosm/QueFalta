// CE-200: offline EXPLORATORY seed, not an equivalence engine or gold dataset.
// No network, environment, database, label inference, price comparison or writes.
import {createHash} from 'node:crypto';

export const DATASET_STORES=Object.freeze(['carrefour','consum','mercadona','plusfresc']);
export const DATASET_POSTCODES=Object.freeze(['08006','25001']);
export const LEXICAL_COHORTS=Object.freeze(['potato_candidate','water_candidate','yogurt_candidate']);
const PROJECT='gkffvigcnsesbaihycay';
const compare=(a,b)=>a<b?-1:a>b?1:0;
const sorted=values=>[...values].sort(compare);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort(compare).map(k=>[k,stable(value[k])])):value;
export const datasetHash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(stable(value))).digest('hex');
function fail(code){throw new Error(code);}
function text(value){return typeof value==='string'&&value.trim().length>0;}
function timestamp(value){return typeof value==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value));}
const commercialKey=(store,id)=>`${store}:${id}`;

export function importExploratorySample(sample,{sourcePath,sourceSha256}){
  if(sample?.schema_version!==1||sample.project_ref!==PROJECT||sample.synthetic!==false
    ||sample.task!=='CE-104'||!Array.isArray(sample.products)||sample.products.length>500
    ||!timestamp(sample.captured_at)||!text(sample.selection)||!text(sample.projection_limitations)
    ||!text(sourcePath)||!/^[a-f0-9]{64}$/.test(sourceSha256??''))fail('ce200_invalid_source');
  const products=new Map();
  for(const [index,row] of sample.products.entries()){
    const p=row.product;
    if(!DATASET_STORES.includes(row.store)||!LEXICAL_COHORTS.includes(row.hint)
      ||!p||!text(p.id)||!text(p.display_name)||p.published!==true)fail('ce200_invalid_product');
    const productKey=commercialKey(row.store,p.id),rawHash=datasetHash(p);
    const existing=products.get(productKey);
    if(existing){
      if(existing.raw_sha256!==rawHash)fail('ce200_conflicting_duplicate');
      existing.lexical_cohorts=sorted(new Set([...existing.lexical_cohorts,row.hint]));
      existing.source_pointers.push(`/products/${index}/product`);
      continue;
    }
    products.set(productKey,{
      product_key:productKey,observation_id:datasetHash([productKey,sample.captured_at,rawHash]),
      store:row.store,product_id:p.id,raw:structuredClone(p),raw_sha256:rawHash,
      captured_at:sample.captured_at,catalog_revision:null,lexical_cohorts:[row.hint],
      provenance:{path:sourcePath,sha256:sourceSha256},source_pointers:[`/products/${index}/product`],
      family_validation:'unreviewed',publication_evidence:'published in historical snapshot only',
      commercial_context_validation:'not_evaluated',cohort:'exploratory_exposed',
    });
  }
  return [...products.values()].sort((a,b)=>compare(a.product_key,b.product_key));
}

export function buildExploratoryPairs(products){
  if(new Set(products.map(p=>p.product_key)).size!==products.length)fail('ce200_duplicate_product');
  const pairs=[];
  const ordered=[...products].sort((a,b)=>compare(a.product_key,b.product_key));
  for(let i=0;i<ordered.length;i++)for(let j=i+1;j<ordered.length;j++){
    const left=ordered[i],right=ordered[j];
    if(left.store===right.store)continue;
    const cohorts=left.lexical_cohorts.filter(h=>right.lexical_cohorts.includes(h));
    if(!cohorts.length)continue;
    if(pairs.length===10000)fail('ce200_exploratory_pair_limit');
    pairs.push({pair_id:datasetHash([left.product_key,right.product_key]),
      left_key:left.product_key,right_key:right.product_key,lexical_cohorts:sorted(cohorts)});
  }
  return pairs;
}

export function buildExploratoryQueries(products,pairs,referenceClock){
  if(!timestamp(referenceClock))fail('ce200_invalid_clock');
  const byKey=new Map(products.map(p=>[p.product_key,p]));
  const linked=new Map(products.map(p=>[p.product_key,new Map()]));
  const seenPairs=new Set();
  for(const pair of pairs){
    if(seenPairs.has(pair.pair_id))fail('ce200_duplicate_pair');seenPairs.add(pair.pair_id);
    const left=byKey.get(pair.left_key),right=byKey.get(pair.right_key);
    if(!left||!right||left.store===right.store||pair.left_key>=pair.right_key
      ||pair.pair_id!==datasetHash([pair.left_key,pair.right_key]))fail('ce200_invalid_pair');
    linked.get(left.product_key).set(right.product_key,pair.pair_id);
    linked.get(right.product_key).set(left.product_key,pair.pair_id);
  }
  const queries=[];
  for(const origin of [...products].sort((a,b)=>compare(a.product_key,b.product_key))){
    const destinations=DATASET_STORES.filter(s=>s!==origin.store);
    for(const postcode of DATASET_POSTCODES){
      const identity={origin_key:origin.product_key,origin_observation:origin.observation_id,
        requested_stores:destinations,postcode,channel:'online',reference_clock:referenceClock};
      queries.push({query_id:datasetHash(identity),...identity,
        cases:destinations.map(store=>({store,
          explored_pairs:sorted([...linked.get(origin.product_key).entries()]
            .filter(([key])=>byKey.get(key).store===store).map(([,pairId])=>pairId)),
          reference_pool_complete:false,known_equivalents:null,known_cheapest:null,
          location_evidence:null,expected:null})),
        metric_eligibility:'unreviewed_exploratory_not_evaluable'});
    }
  }
  return queries;
}

export function legacyExposureIndex(rows){
  if(!Array.isArray(rows)||rows.length>6000)fail('ce200_invalid_legacy_source');
  const records=new Map();
  for(const row of rows){
    if(!text(row.store)||!text(row.product_id))fail('ce200_invalid_legacy_identity');
    const key=commercialKey(row.store,row.product_id);
    const record={product_key:key,raw_gtin:row.global_gtin??null,
      status:'previously_exposed_legacy_not_a_new_holdout',gtin_identity_verified:false};
    if(records.has(key)&&datasetHash(records.get(key))!==datasetHash(record))fail('ce200_conflicting_legacy_identity');
    records.set(key,record);
  }
  return [...records.values()].sort((a,b)=>compare(a.product_key,b.product_key));
}

export function prepareExploratoryDataset(sample,provenance,legacyRows=[]){
  const products=importExploratorySample(sample,provenance);
  const pairs=buildExploratoryPairs(products);
  const queries=buildExploratoryQueries(products,pairs,sample.captured_at);
  const exposure=legacyExposureIndex(legacyRows);
  const countsBy=(values,get)=>Object.fromEntries(sorted(new Set(values.map(get))).map(k=>[k,values.filter(v=>get(v)===k).length]));
  return {products,pairs,queries,exposure,report:{
    task:'CE-200',status:'in_progress_local_seed_only',scope:'historical exploratory; NOT representative or labelled',
    products:products.length,unique_commercial_pairs:pairs.length,logical_query_drafts:queries.length,
    origin_products:new Set(queries.map(q=>q.origin_key)).size,destination_cases:queries.reduce((n,q)=>n+q.cases.length,0),
    by_store:countsBy(products,p=>p.store),by_lexical_cohort:Object.fromEntries(LEXICAL_COHORTS.map(h=>[h,products.filter(p=>p.lexical_cohorts.includes(h)).length])),
    legacy_exposed_products:exposure.length,legacy_pilot_store_products:exposure.filter(p=>DATASET_STORES.some(s=>p.product_key.startsWith(s+':'))).length,
    seed_overlaps_legacy:products.filter(p=>exposure.some(e=>e.product_key===p.product_key)).map(p=>p.product_key),
    CE200_confirmatory_pairs:0,CE200_confirmatory_queries:0,strict_equivalence_labels:0,
    holdout_assigned:false,G2_pass:false,remote_calls:0,app_changes:false,
    blockers:['documented sampling frame and representative acquisition not available',
      'historical lexical hints are not verified pilot families',
      'full source projection and product/location revision evidence incomplete',
      'required 5000-10000 pairs and at least 1000 queries not established'],
    source_selection:sample.selection,source_projection_limitations:sample.projection_limitations,
    hashes:{products:datasetHash(products),pairs:datasetHash(pairs),queries:datasetHash(queries),exposure:datasetHash(exposure)},
  }};
}
