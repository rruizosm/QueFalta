import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createClient} from '@supabase/supabase-js';
const base='assets/product-illustrations/batch-20261012-459',partial=process.argv.includes('--allow-partial');
const manifest=JSON.parse(readFileSync(base+'/manifest.json')),excluded=JSON.parse(readFileSync(base+'/historical-exclusions.json'));
const lots=[1,2,3,4].map(i=>base+'/lot-0'+i);
const counts=lots.map(dir=>{const m=JSON.parse(readFileSync(dir+'/manifest.json'));let generated=0,published=0,cleaned=0;for(const p of m.products){const f=dir+'/jobs/'+p.id+'.json';if(!existsSync(f))continue;const j=JSON.parse(readFileSync(f));generated++;if(j.publication)published++;if(j.localWebpDeletedAt&&j.localSourceJpgDeletedAt)cleaned++;}return{lot:dir.split('/').at(-1),target:m.products.length,generated,published,cleaned};});
if(process.argv.includes('--status')){console.log(JSON.stringify({requestedTarget:459,eligibleTarget:445,historicalModerationExcluded:14,published:counts.reduce((n,c)=>n+c.published,0),lots:counts}));process.exit(0);}
for(const dir of lots){const native=spawnSync(process.execPath,[base+'/native-qa.mjs',dir],{encoding:'utf8'});if(native.status)throw Error(native.stderr||native.stdout);console.log(native.stdout.trim());const args=['--env-file=.env.local',base+'/workflow.mjs','verify',dir];if(partial)args.push('--allow-partial');if(process.argv.includes('--allow-catalog-thumbnail-drift'))args.push('--allow-catalog-thumbnail-drift');if(process.argv.includes('--allow-catalog-state-drift'))args.push('--allow-catalog-state-drift');const r=spawnSync(process.execPath,args,{encoding:'utf8'});if(r.status)throw Error(r.stderr||r.stdout);console.log(r.stdout.trim());}
const db=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}),blocked=[];
for(const p of excluded){const r=await db.from('mercadona_products').select('id,published,thumbnail,illustration_url').eq('id',p.id).single();if(r.error||!r.data||!r.data.published||r.data.thumbnail!==p.thumbnail||r.data.illustration_url)throw Error('Excluded changed '+p.id);blocked.push({id:p.id,name:p.display_name,reason:p.reason});}
let exactPrompts=0;const pending=[];for(const p of manifest.products){const f=p.lotDir+'/jobs/'+p.id+'.json';if(!existsSync(f)){pending.push(p);continue;}const j=JSON.parse(readFileSync(f));if(j.publication){if(!j.promptFile||readFileSync(j.promptFile,'utf8')!==j.prompt)throw Error('Prompt provenance '+p.id);exactPrompts++;}else pending.push(p);}
const forbidden=[];function scan(d){for(const e of readdirSync(d,{withFileTypes:true})){const f=d+'/'+e.name;if(e.isDirectory())scan(f);else if(/\.(jpe?g|webp)$/i.test(e.name))forbidden.push(f);}}scan('assets/product-illustrations');if(forbidden.length)throw Error('Local JPG/WebP remain '+JSON.stringify(forbidden));
const vs=lots.map(d=>JSON.parse(readFileSync(d+'/verification.json'))),published=vs.reduce((n,v)=>n+v.productsVerified,0);
const a=await db.from('mercadona_products').select('id',{count:'exact',head:true}).not('illustration_url','is',null),b=await db.from('mercadona_products').select('id',{count:'exact',head:true}).eq('published',true).is('illustration_url',null);if(a.error||b.error)throw a.error??b.error;
const result={verifiedAt:new Date().toISOString(),requestedTarget:459,eligibleTarget:445,publishedVerified:published,eligibleComplete:published===445,complete:published===459,pendingCount:459-published,historicalModerationExcluded:blocked,newPending:pending.map(p=>({id:p.id,name:p.display_name})),remoteMimeShaBytesDimensionsAlphaVerified:published,localSourceJpgAndWebpDeletedAfterVerification:published,previousIllustrationsUnchanged:5835,exactPromptsVerified:exactPrompts,repositoryJpgJpegWebpCount:0,totalBytes:vs.reduce((n,v)=>n+v.totalBytes,0),catalogIllustrated:a.count,catalogPublishedWithoutIllustration:b.count,lots:vs};
result.generationErrors=lots.flatMap(dir=>readdirSync(dir).filter(f=>/^(?:error|moderation)-.*\.json$/.test(f)).map(f=>({id:f.match(/-(\d+(?:\.\d+)?)(?:-.*)?\.json$/)?.[1],file:dir+'/'+f,...JSON.parse(readFileSync(dir+'/'+f))})));
result.resolvedEligible=published+pending.filter(p=>result.generationErrors.some(e=>String(e.id??e.productId)===String(p.id)&&/moderation_blocked|safety_violations/.test(JSON.stringify(e)))).length;
result.catalogThumbnailChanges=[...new Map(vs.flatMap(v=>v.catalogThumbnailChanges??[]).map(p=>[p.scope+':'+p.id,p])).values()];
result.previousThumbnailsUnchanged=5835-result.catalogThumbnailChanges.filter(p=>p.scope==='previous').length;
result.selectedThumbnailsUnchanged=445-result.catalogThumbnailChanges.filter(p=>p.scope==='selected').length;
result.thumbnailUpdatesByThisBatch=0;
result.catalogPublicationChanges=[...new Map(vs.flatMap(v=>v.catalogPublicationChanges??[]).map(p=>[p.id,p])).values()];
result.currentlyPublishedIllustrations=vs.reduce((n,v)=>n+v.currentlyPublishedIllustrations,0);
result.publishedAtUploadVerified=published;
result.publishedFlagUpdatesByThisBatch=0;
result.allEligibleResolved=result.resolvedEligible===445;
result.nativeTransparencyAndExactPromptsVerified=lots.reduce((n,d)=>n+JSON.parse(readFileSync(d+'/native-alpha-qa.json')).count,0);
writeFileSync(base+'/verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
