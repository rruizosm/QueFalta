import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json');
const base='assets/product-illustrations/batch-20261009-1000-02';
const manifest=JSON.parse(readFileSync(base+'/manifest.json'));
const original=Array.isArray(manifest)?manifest:manifest.products;
const blocked=existsSync(base+'/moderation-blocked.json')?JSON.parse(readFileSync(base+'/moderation-blocked.json')):[];
const supplement=existsSync(base+'/lot-11-supplement/manifest.json')?JSON.parse(readFileSync(base+'/lot-11-supplement/manifest.json')).products:[];
const blockedIds=new Set(blocked.map(p=>String(p.id)));
const products=[...original.filter(p=>!blockedIds.has(p.id)),...supplement];
if(new Set(products.map(p=>p.id)).size!==products.length)throw Error('Duplicate effective selection');
const snapshot=JSON.parse(readFileSync(base+'/existing-illustrations-before.json'));
const jobs=products.map(p=>{const d=p.lotDir+'/jobs/'+p.id+'.json';return existsSync(d)?JSON.parse(readFileSync(d)):null;});
const pending=products.filter((p,i)=>!jobs[i]?.publication).map(p=>({id:p.id,index:p.globalIndex,lot:p.lot,display_name:p.display_name}));
const published=jobs.filter(j=>j?.publication).length;
const counts={target:1000,selectedOriginal:original.length,blocked:blocked.length,supplementSelected:supplement.length,effectiveSelected:products.length,generated:jobs.filter(Boolean).length,prepared:jobs.filter(j=>j?.sha256).length,reviewed:jobs.filter(j=>j?.visualReviewed).length,published,pending:1000-published};
if(process.argv.includes('--status')){console.log(JSON.stringify({counts,lots:Array.from({length:10},(_,i)=>({lot:i+1,generated:jobs.filter((j,k)=>j&&products[k].lot===i+1).length,published:jobs.filter((j,k)=>j?.publication&&products[k].lot===i+1).length}))}));process.exit(0);}
if((pending.length||products.length!==1000)&&!process.argv.includes('--allow-partial'))throw Error('Incomplete batch: '+JSON.stringify(counts));
const {createClient}=require('@supabase/supabase-js');
const sharp=require('/Users/rruizosmaalohacloud/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const db=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const ids=[...new Set([...original.map(p=>p.id),...supplement.map(p=>p.id),...snapshot.map(p=>p.id)])],remote=new Map();
for(let i=0;i<ids.length;i+=200){const {data,error}=await db.from('mercadona_products').select('id,thumbnail,illustration_url,published').in('id',ids.slice(i,i+200));if(error)throw error;for(const r of data)remote.set(String(r.id),r);}
for(const p of snapshot){const r=remote.get(String(p.id));if(r?.illustration_url!==p.illustration_url||r?.thumbnail!==p.thumbnail)throw Error('Previous illustration changed '+p.id);}
for(const p of [...original,...supplement])if(remote.get(p.id)?.thumbnail!==p.thumbnail)throw Error('Selected source thumbnail changed '+p.id);
for(const p of original.filter(p=>blockedIds.has(p.id)))if(remote.get(p.id)?.illustration_url)throw Error('Blocked ID unexpectedly published '+p.id);
let totalBytes=0,verified=0,cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<products.length){const i=cursor++,p=products[i],j=jobs[i];if(!j?.publication)continue;const r=remote.get(p.id);if(r?.published!==true||r?.illustration_url!==j.publication.imageUrl||j.status!=='published'||!j.visualReviewed||!existsSync(j.png)||j.generationTool!=='built-in image_gen'||!j.prompt?.trim()||existsSync(p.webpTempPath)||existsSync(p.originalPath)||!j.localWebpDeletedAt||!j.localSourceJpgDeletedAt)throw Error('Publication metadata '+p.id);const response=await fetch(j.publication.imageUrl);if(!response.ok||response.headers.get('content-type')?.split(';')[0]!=='image/webp')throw Error('Remote MIME '+p.id);const b=Buffer.from(await response.arrayBuffer()),hash=createHash('sha256').update(b).digest('hex');if(b.length!==j.bytes||hash!==j.sha256||hash!==j.publication.sha256||j.publication.contentType!=='image/webp')throw Error('Remote SHA/bytes '+p.id);const meta=await sharp(b).metadata();if(meta.format!=='webp'||!meta.hasAlpha||meta.width!==j.width||meta.height!==j.height||Math.max(meta.width,meta.height)>768)throw Error('Remote dimensions/alpha '+p.id);const {data,info}=await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});let transparent=0,opaque=0,border=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const a=data[(y*info.width+x)*4+3];if(!a)transparent++;if(a===255)opaque++;if((!x||!y||x===info.width-1||y===info.height-1)&&a)border++;}if(!transparent||!opaque||border)throw Error('Remote alpha border '+p.id);totalBytes+=b.length;verified++;if(verified%100===0)console.log(JSON.stringify({verified}));}}));
const forbidden=[];function walk(d){for(const x of readdirSync(d,{withFileTypes:true})){const p=d+'/'+x.name;if(x.isDirectory())walk(p);else if(/\.(jpe?g|webp)$/i.test(x.name))forbidden.push(p);}}walk('assets/product-illustrations');if(forbidden.length)throw Error('Unexpected local JPG/JPEG/WebP: '+forbidden.length);
const result={verifiedAt:new Date().toISOString(),complete:verified===1000&&pending.length===0&&products.length===1000,...counts,remoteMimeShaBytesDimensionsAlphaVerified:verified,localJpgAndWebpDeletedAfterUpload:verified,previousIllustrationsUnchanged:snapshot.length,selectedThumbnailsUnchanged:original.length+supplement.length,forbiddenAssetsFound:0,totalBytes};
writeFileSync(base+'/aggregate-verification.json',JSON.stringify(result,null,2)+'\n');writeFileSync(base+'/pending-products.json',JSON.stringify(pending,null,2)+'\n');console.log(JSON.stringify(result));
