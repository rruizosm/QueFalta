// Offline CE-200 sampling, NOT the production parser/matcher or gold labels.
import {createHash} from 'node:crypto';
import {datasetHash} from './comparator-strict-dataset.mjs';
export const CORPUS_SEED='ce1-ce200-v1-2026-09-03';
export const CORPUS_STORES=['carrefour','consum','mercadona','plusfresc'];
export const CORPUS_FAMILIES=['drinking_water','yogurt','frozen_potatoes'];
const fold=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const sorted=x=>[...x].sort();
const rank=(purpose,key)=>createHash('sha256').update(`${CORPUS_SEED}|${purpose}|${key}`).digest('hex');
const byKey=(a,b)=>a.key<b.key?-1:a.key>b.key?1:0;
const assert=(ok,code)=>{if(!ok)throw Error(code);};

export function categoryPath(row,store,taxonomy){
  const map=new Map((taxonomy[store]??[]).map(x=>[String(x.id),x]));
  const seen=new Set(),out=[];
  for(const leaf of [row.category_id,...(row.category_ids??[])]){
    let id=String(leaf??'');
    for(let i=0;i<12&&id&&!seen.has(id);i++){
      seen.add(id);const c=map.get(id);if(!c)break;out.push(c);id=c.parent_id==null?'':String(c.parent_id);
    }
  }
  return out;
}

export function corpusProfile(row,store,taxonomy={}){
  const name=fold(row.display_name),cat=fold(row.category_name),path=categoryPath(row,store,taxonomy);
  const rootText=fold(path.map(x=>x.name).join(' '));
  const rawCategories=row.raw?.categories??[];
  const frozen=rootText.includes('congelad')||rawCategories.some(x=>/congelad/i.test(x.name??''));
  const potatoCategory=store==='mercadona'?String(row.category_id)==='145':
    (row.category_ids??[]).includes(({carrefour:'cat32544703',consum:'2517',plusfresc:'03030104'})[store]);
  const waterCategory=store==='mercadona'?String(row.category_id)==='156':
    store==='carrefour'?(row.category_ids??[]).includes('cat650002'):
    store==='consum'?cat.includes('agua'):['020101','020102'].includes(String(row.category_id));
  const yogurtCategory=store==='mercadona'?['103','104','105','107','108','109'].includes(String(row.category_id)):
    store==='carrefour'?(row.category_ids??[]).includes('cat390008'):
    store==='consum'?/yogur|bifidus/.test(cat):String(row.category_id).startsWith('0404');
  let family=null,evidence=[];
  if(waterCategory&&/^aguas?\b/.test(name)&&!/(colonia|oxigenad|de coco|micelar)/.test(name)){
    family='drinking_water';evidence=['display_name','category_id','category_name'];
  }else if(yogurtCategory&&/yogur|yogh|iogur|bifidus|activia/.test(name)
    &&!/(kefir|petit|flan|natilla|queso|gelatina|arroz con leche)/.test(name)){
    family='yogurt';evidence=['display_name','category_id','category_name'];
  }else if(potatoCategory&&frozen&&/patat/.test(name)&&!/(salchicha|bacalao|pulpo|pollo|tortilla|judias|verduras|rancheras|dulces|boniato)/.test(name)){
    family='frozen_potatoes';evidence=['display_name',store==='mercadona'?'raw.categories':'category_ids + category tree'];
  }
  const pi=row.raw?.price_instructions;
  const text=[row.display_name,row.packaging,row.raw?.productData?.description].filter(Boolean).join(' | ');
  const quantities=[...text.matchAll(/\d+(?:[.,]\d+)?\s*(?:kg|grs?|g|ml|cl|litros?|l)\b/gi)].map(x=>x[0]);
  const packClauses=[...text.matchAll(/(?:pack(?: de)?\s*\d+|\d+\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:g|kg|ml|l)|\d+\s*(?:unidades|und\.?|ud\.?)\b)/gi)].map(x=>x[0]);
  // Never divide a total or turn absent pack metadata into one unit.
  const structure=pi?.is_pack===true||packClauses.length?'multipack_evidence':
    pi?.is_pack===false?'single_explicit':'unresolved_structure';
  const formatEvidence=pi?Object.fromEntries(['is_pack','unit_size','pack_size','total_units','size_format','approx_size','selling_method'].map(k=>[k,pi[k]??null])):{quantities,packClauses};
  const rawBrand=row.brand??row.raw?.brand??row.raw?.productData?.brand?.name??null;
  const brand=typeof rawBrand==='string'?rawBrand:null;
  const privateLiteral=/\b(hacendado|carrefour|consum|alteza)\b/.exec(fold([brand,row.display_name].join(' ')))?.[0]??null;
  const brandClass=privateLiteral?'retailer_label_literal':brand?'named_brand':'unresolved_brand';
  const hints=[];
  if(/agua|aigua|water/.test(name+' '+cat))hints.push('drinking_water');
  if(/yogu|yogh|iogur|bifidus|postre|kefir/.test(name+' '+cat))hints.push('yogurt');
  if(/patat/.test(name+' '+cat))hints.push('frozen_potatoes');
  const literalFlags=['griego','natural','azucarado','edulcorado','sin azucar','sin lactosa','con gas','sin gas','sabor'].filter(x=>name.includes(x));
  const variable=pi?.approx_size===true||/\baprox\b|a granel|peso variable/.test(fold(text));
  return {family:variable?null:family,family_evidence:evidence,category_path:path.map(x=>({id:x.id,name:x.name,parent_id:x.parent_id,published:x.published})),
    family_status:family&&!variable?'source_supported_sampling_family_not_gold':'outside_or_unresolved_pilot_family',
    structure,format_evidence:formatEvidence,format_signature:datasetHash(formatEvidence),quantity_evidence:quantities,
    brand,private_label_literal:privateLiteral,brand_class:brandClass,literal_flags:literalFlags,hints,variable_weight_evidence:variable,
    // Names + original format only group possible aliases conservatively inside
    // one store; this is NOT a validated GTIN/entity relation for CE-204.
    alias_signature:datasetHash([store,name,brand,formatEvidence])};
}

export function assembleCorpusInputs(pages,legacyExposure=[],seedProducts=[]){
  const taxonomy=Object.fromEntries(CORPUS_STORES.map(s=>[s,pages.filter(p=>p.payload?.kind==='taxonomy'&&p.payload.store===s).flatMap(p=>p.payload.rows)]));
  const exposed=new Set([...legacyExposure.map(x=>x.product_key),...seedProducts.map(x=>x.product_key)]);
  const products=[],locations=[],sourceFiles=[];
  for(const p of [...pages].sort((a,b)=>a.file<b.file?-1:1)){
    if(!p.payload)continue;
    assert(p.payload.project_ref==='gkffvigcnsesbaihycay','ce200_wrong_source');
    assert(p.payload.rows.length===p.payload.row_count&&p.payload.row_count<=500,'ce200_source_count');
    sourceFiles.push({file:p.file,sha256:p.file_hash,kind:p.payload.kind,store:p.payload.store,captured_at:p.payload.captured_at,row_count:p.payload.row_count,job:p.payload.job_key});
    if(['products','supplement'].includes(p.payload.kind))p.payload.rows.forEach((row,index)=>{
      assert(row.published===true&&typeof row.id==='string'&&row.id.length,'ce200_inactive_or_id');
      const key=`${p.payload.store}:${row.id}`,rawHash=datasetHash(row);
      products.push({key,store:p.payload.store,id:row.id,observation_id:datasetHash([key,p.payload.captured_at,rawHash]),captured_at:p.payload.captured_at,
        source:{file:p.file,sha256:p.file_hash,pointer:`/payload/rows/${index}`,raw_sha256:rawHash,source_row_md5:row.source_row_md5},
        previously_exposed:exposed.has(key),raw:row,sampling:corpusProfile(row,p.payload.store,taxonomy)});
    });
    if(p.payload.kind==='locations')p.payload.rows.forEach((row,index)=>locations.push({key:row.id,product_key:`${row.store}:${row.product_id}`,captured_at:p.payload.captured_at,source:{file:p.file,sha256:p.file_hash,pointer:`/payload/rows/${index}`},raw:row}));
  }
  assert(products.length<=6000&&locations.length<=12000,'ce200_export_cap');
  assert(new Set(products.map(x=>x.key)).size===products.length,'ce200_duplicate_product');
  assert(new Set(locations.map(x=>x.key)).size===locations.length,'ce200_duplicate_location');
  const stability=[];
  for(const store of CORPUS_STORES){
    for(const [kind,observations] of [['fingerprints',products.filter(x=>x.store===store).map(x=>({id:x.id,hash:x.source.source_row_md5}))],['location-fingerprints',locations.filter(x=>x.raw.store===store).map(x=>({id:x.key,hash:x.raw.source_row_md5}))]]){
      const verification=pages.filter(p=>p.payload?.kind===kind&&p.payload.store===store).flatMap(p=>p.payload.rows);
      assert(pages.some(p=>p.payload?.kind===kind&&p.payload.store===store),'ce200_missing_verification');
      const m=new Map(verification.map(x=>[x.id,x.source_row_md5]));
      assert(m.size===observations.length&&observations.every(x=>m.get(x.id)===x.hash),'ce200_source_changed');
      stability.push({store,kind,rows:m.size,status:'all_content_fingerprints_match',atomic_snapshot:false});
    }
  }
  const aliases=new Map();
  for(const p of products){const a=aliases.get(p.sampling.alias_signature)??[];a.push(p);aliases.set(p.sampling.alias_signature,a);}
  for(const group of aliases.values()){
    group.sort(byKey);const contaminated=group.some(x=>x.previously_exposed);
    group.forEach((p,i)=>{p.alias_representative=i===0;p.alias_group_size=group.length;p.alias_group_exposed=contaminated;});
  }
  return {products:products.sort(byKey),locations:locations.sort(byKey),taxonomy,sourceFiles,stability,alias_groups:[...aliases.entries()].filter(([,a])=>a.length>1).map(([signature,a])=>({signature,keys:a.map(x=>x.key),status:'potential_alias_not_verified_identity'}))};
}

export function stratifiedSelection(candidates,target,purpose,keyOf){
  assert(Number.isSafeInteger(target)&&target>=0&&target<=candidates.length,'ce200_sample_shortage');
  const groups=new Map();for(const p of candidates){const k=keyOf(p),g=groups.get(k)??[];g.push(p);groups.set(k,g);}
  const cells=[...groups].sort(([a],[b])=>a<b?-1:1).map(([key,items])=>({key,items,n:1}));
  assert(cells.length<=target,'ce200_more_strata_than_sample');
  // Equal family emphasis is handled outside this function. Within each family,
  // guarantee one per observed stratum, then deterministic largest-deficit seats.
  for(let n=cells.length;n<target;n++){
    let best=null,deficit=-Infinity;
    for(const c of cells){if(c.n>=c.items.length)continue;const d=(target*c.items.length/candidates.length)-c.n;if(d>deficit){deficit=d;best=c;}}
    assert(best,'ce200_allocation');best.n++;
  }
  const selected=[],weights=[];
  for(const c of cells){
    const ranked=c.items.map(x=>({x,r:rank(purpose,x.key)})).sort((a,b)=>a.r<b.r?-1:a.r>b.r?1:byKey(a.x,b.x));
    const inclusion=c.n/c.items.length;
    weights.push({stratum:c.key,population:c.items.length,selected:c.n,inclusion_probability:inclusion,inverse_probability_weight:1/inclusion});
    selected.push(...ranked.slice(0,c.n).map(({x})=>({...x,stratum:c.key,inclusion_probability:inclusion,inverse_probability_weight:1/inclusion})));
  }
  return {selected,weights};
}

const pair=(a,b)=>{
  const [left,right]=[a,b].sort(byKey);
  return {key:`${left.key}|${right.key}`,left:left.key,right:right.key,family:a.sampling.family,
    stores:[left.store,right.store],brands:sorted([a.sampling.brand_class,b.sampling.brand_class]),structures:sorted([a.sampling.structure,b.sampling.structure])};
};
const pairStratum=p=>[p.family,...p.stores,...p.brands,...p.structures].join('|');
const annotation=()=>({status:'unreviewed',equivalence:null,identity:null,variants:null,format:null,price:null,location:null,availability:null,decision:null});

export function buildCorpus(input){
  const {products,locations}=input,byId=new Map(products.map(p=>[p.key,p]));
  const eligible=products.filter(p=>p.sampling.family&&p.alias_representative&&!p.alias_group_exposed);
  const population=[];
  for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
    const a=eligible[i],b=eligible[j];if(a.store!==b.store&&a.sampling.family===b.sampling.family)population.push(pair(a,b));
  }
  const allocations=Object.fromEntries(CORPUS_FAMILIES.map(f=>[f,Math.min(f==='frozen_potatoes'?1000:1500,population.filter(p=>p.family===f).length)]));
  let remaining=4000-Object.values(allocations).reduce((a,b)=>a+b,0);
  for(const f of ['drinking_water','yogurt']){const extra=Math.min(remaining,population.filter(p=>p.family===f).length-allocations[f]);allocations[f]+=extra;remaining-=extra;}
  assert(remaining===0,'ce200_confirmatory_shortage');
  const confirmatory=[],weights=[];
  for(const f of CORPUS_FAMILIES){const s=stratifiedSelection(population.filter(p=>p.family===f),allocations[f],`confirmatory-${f}`,pairStratum);confirmatory.push(...s.selected.map(p=>({...p,cohort:'confirmatory',annotation:annotation()})));weights.push(...s.weights);}
  const used=new Set(confirmatory.map(p=>p.key)),challenge=[];
  const addChallenge=(candidates,target,reason)=>{
    const unique=new Map(candidates.filter(p=>!used.has(p.key)).map(p=>[p.key,p]));
    const sortedCandidates=[...unique.values()].map(x=>({x,r:rank(`challenge-${reason}`,x.key)})).sort((a,b)=>a.r<b.r?-1:1);
    assert(sortedCandidates.length>=target,`ce200_challenge_shortage:${reason}:${sortedCandidates.length}`);
    for(const {x} of sortedCandidates.slice(0,target)){used.add(x.key);challenge.push({...x,cohort:'challenge',challenge_reason:reason,inclusion_probability:null,inverse_probability_weight:null,annotation:annotation()});}
  };
  // Source evidence contrasts, NOT preassigned negatives or matcher predictions.
  addChallenge(population.filter(p=>byId.get(p.left).sampling.format_signature!==byId.get(p.right).sampling.format_signature),500,'different_format_evidence');
  addChallenge(population.filter(p=>datasetHash(byId.get(p.left).sampling.literal_flags)!==datasetHash(byId.get(p.right).sampling.literal_flags)),500,'variant_word_contrast');
  addChallenge(population.filter(p=>p.brands.includes('unresolved_brand')||p.structures.includes('unresolved_structure')),500,'missing_structured_evidence');
  const confusing=[];
  for(const b of products.filter(p=>!p.sampling.family&&p.alias_representative)){
    for(const f of b.sampling.hints){
      const alternatives=eligible.filter(a=>a.store!==b.store&&a.sampling.family===f).map(a=>({a,r:rank('confuser-link',`${a.key}|${b.key}`)})).sort((a,b)=>a.r<b.r?-1:1).slice(0,12);
      for(const {a} of alternatives)confusing.push({...pair(a,b),family:f});
    }
  }
  addChallenge(confusing,500,'lexical_confuser_outside_supported_family');
  const pairs=[...confirmatory,...challenge].sort(byKey);
  assert(pairs.length===6000&&new Set(pairs.map(p=>p.key)).size===6000,'ce200_pair_count');
  const originSelection=stratifiedSelection(eligible,600,'origins',p=>[p.sampling.family,p.store,p.sampling.brand_class,p.sampling.structure].join('|'));
  const origins=originSelection.selected;
  const pools=Object.fromEntries(CORPUS_FAMILIES.flatMap(f=>CORPUS_STORES.map(s=>[`${f}:${s}`,products.filter(p=>p.store===s&&p.sampling.family===f).map(p=>p.key)])));
  // A fixed replay clock. Product/location observed times remain separate.
  const referenceClock=sorted(input.sourceFiles.map(x=>x.captured_at)).at(-1);
  const queries=origins.flatMap(p=>['08006','25001'].map(postcode=>({
    key:datasetHash([p.observation_id,postcode,CORPUS_STORES.filter(s=>s!==p.store),referenceClock]),origin:p.key,origin_observation:p.observation_id,
    postcode,channel:'retailer_online_catalog',reference_clock:referenceClock,
    origin_sampling:{stratum:p.stratum,inclusion_probability:p.inclusion_probability,inverse_probability_weight:p.inverse_probability_weight},
    destination_stores:CORPUS_STORES.filter(s=>s!==p.store),
    destinations:CORPUS_STORES.filter(s=>s!==p.store).map(store=>({store,candidate_inventory_pool:`${p.sampling.family}:${store}`,
      retrieval_cap_future_engine:50,truth_not_limited_to_retrieval_cap:true,known_equivalents:null,known_minimum_price:null,
      location_context:store==='plusfresc'?{location_id:postcode==='08006'?'3':'12',mapping:'exact_in_local_app_map_last_verified_2026-07-16',live_service_confirmed:null}:
        store==='consum'?{location_id:postcode==='08006'?'575':null,mapping:postcode==='08006'?'province_approximation':'unmapped',live_service_confirmed:null}:
        {location_id:null,mapping:'unverified_for_requested_postcode',live_service_confirmed:null},
      annotation_status:'unreviewed',decision:null})),
    source_location_evidence:locations.filter(l=>l.product_key===p.key&&((p.store==='plusfresc'&&l.raw.location_id===(postcode==='08006'?'3':'12'))||(p.store==='consum'&&postcode==='08006'&&l.raw.location_id==='575'))).map(l=>l.key),
    independent_unit:p.sampling.alias_signature,correlated_postcode_contexts:true,commercial_ttl_hours:null,annotation_status:'unreviewed'
  })));
  const coverage=CORPUS_FAMILIES.flatMap(f=>CORPUS_STORES.map(store=>({family:f,store,source_supported:products.filter(p=>p.store===store&&p.sampling.family===f).length,
    new_confirmatory_eligible:eligible.filter(p=>p.store===store&&p.sampling.family===f).length,query_origins:origins.filter(p=>p.store===store&&p.sampling.family===f).length})));
  assert(coverage.every(c=>c.source_supported>0&&c.new_confirmatory_eligible>0&&c.query_origins>0),'ce200_family_store_gap');
  return {pairs,queries,pools,selection:{algorithm:'ce200-stratified-v1',seed:CORPUS_SEED,frame:'source-supported family, active catalogue; conservative alias representatives; prior-exposed groups excluded',
    frame_is_not:'all application traffic, all possible unclassified products, a gold set, or a holdout',pair_population:population.length,family_allocations:allocations,
    pair_strata:weights,origin_strata:originSelection.weights,challenge_quotas:{different_format_evidence:500,variant_word_contrast:500,missing_structured_evidence:500,lexical_confuser_outside_supported_family:500},
    prior_exposure_policy:'CE104 and legacy excluded by product/possible-alias group; CE204 must additionally group verified GTIN/entities before partitioning',
    origin_count:origins.length,distinct_queries:queries.length,counts_do_not_establish_independence:true},
    report:{products:products.length,locations:locations.length,unique_pairs:pairs.length,confirmatory_pairs:confirmatory.length,challenge_pairs:challenge.length,queries:queries.length,destination_cases:queries.length*3,
      confirmatory_eligible_products:eligible.length,source_supported_products:products.filter(p=>p.sampling.family).length,potential_alias_groups:input.alias_groups.length,
      supported_family_exposed:products.filter(p=>p.sampling.family&&p.alias_group_exposed).length,coverage,gold_labels:0,holdout_assigned:false,G2_pass:false,
      missing_location_tables_for_pilot:['carrefour','mercadona'],corpus_ready_for_CE201_CE202:true}};
}
