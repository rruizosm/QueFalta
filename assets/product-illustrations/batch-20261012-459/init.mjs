import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const base='assets/product-illustrations/batch-20261012-459',tmp='/private/tmp/mercadona-batch-20261012-459';
const rows=JSON.parse(readFileSync(base+'/pending-at-start.json')),excluded=JSON.parse(readFileSync(base+'/historical-exclusions.json')),skip=new Set(excluded.map(p=>p.id));
const db=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}}),snapshot=[];
for(let start=0;;start+=1000){const r=await db.from('mercadona_products').select('id,published,thumbnail,illustration_url').not('illustration_url','is',null).order('id').range(start,start+999);if(r.error)throw r.error;snapshot.push(...r.data.filter(p=>p.illustration_url));if(r.data.length<1000)break;}
if(snapshot.length!==5835)throw Error('Baseline changed '+snapshot.length);
writeFileSync(base+'/existing-illustrations-before.json',JSON.stringify(snapshot,null,2)+'\n');
const eligible=rows.filter(p=>!skip.has(p.id));let offset=0;const counts=[112,111,111,111];
const all=[];for(let i=0;i<4;i++){const lot='lot-0'+(i+1),dir=base+'/'+lot;mkdirSync(dir+'/actual-prompts',{recursive:true});mkdirSync(tmp+'/'+lot,{recursive:true});const products=eligible.slice(offset,offset+counts[i]).map((p,k)=>{const url=new URL(p.thumbnail);url.searchParams.set('h','1000');url.searchParams.set('w','1000');return{...p,index:k+1,globalIndex:offset+k+1,lot:i+1,lotDir:dir,slug:p.display_name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100),originalPath:tmp+'/'+lot+'/originals/mercadona-'+p.id+'-original.jpg',sourceDownloadUrl:url.href,webpTempPath:tmp+'/'+lot+'/webp/mercadona-'+p.id+'.webp',sourceGalleryDir:tmp+'/'+lot};});offset+=counts[i];all.push(...products);writeFileSync(dir+'/manifest.json',JSON.stringify({createdAt:new Date().toISOString(),lot:i+1,target:products.length,products},null,2)+'\n');}
if(all.length!==445||new Set(all.map(p=>p.id)).size!==445)throw Error('Selection mismatch');
writeFileSync(base+'/manifest.json',JSON.stringify({createdAt:new Date().toISOString(),requestedTarget:459,eligibleTarget:445,excludedHistorical:14,previousIllustrations:snapshot.length,products:all},null,2)+'\n');
console.log(JSON.stringify({requested:rows.length,eligible:all.length,excluded:excluded.length,baseline:snapshot.length,lots:counts}));
