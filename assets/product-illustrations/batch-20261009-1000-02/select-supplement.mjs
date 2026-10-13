import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const root='assets/product-illustrations/batch-20261009-1000-02',dir=root+'/lot-11-supplement';
const existing=existsSync(dir+'/manifest.json')?JSON.parse(readFileSync(dir+'/manifest.json')):{products:[]};
const original=JSON.parse(readFileSync(root+'/manifest.json'));
const blocked=JSON.parse(readFileSync(root+'/moderation-blocked.json'));
const blockedRows=Array.isArray(blocked)?blocked:blocked.products??blocked.blocked??[];
const count=blockedRows.length-existing.products.length;
if(!count)throw Error('No replacement needed');
const exclude=new Set([...original.products.map(p=>String(p.id)),...existing.products.map(p=>String(p.id)),...original.excludedContentRejectedIds,...blockedRows.map(p=>String(p.id))]);
const db=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const {data,error}=await db.from('mercadona_products').select('id,display_name,thumbnail,illustration_url,published').eq('published',true).is('illustration_url',null).ilike('display_name','Patata%').order('id');
if(error)throw error;
const candidates=data.filter(p=>!exclude.has(String(p.id))&&/^\d+$/.test(String(p.id))&&p.thumbnail?.startsWith('https://prod-mercadona.imgix.net/'));
if(candidates.length<count)throw Error('Insufficient unrelated replacements');
const products=candidates.slice(0,count).map((p,i)=>{const tmp='/private/tmp/mercadona-batch-20261009-1000-02/lot-11-supplement',u=new URL(p.thumbnail);u.searchParams.set('h','1000');u.searchParams.set('w','1000');return {...original.products[0],...p,id:String(p.id),index:i+1,globalIndex:1001+i,lot:11,lotDir:dir,slug:p.display_name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,140),originalPath:tmp+'/originals/mercadona-'+p.id+'-original.jpg',sourceDownloadUrl:u.href,webpTempPath:tmp+'/webp/mercadona-'+p.id+'.webp',sourceGalleryDir:tmp,prompt:original.products[0].prompt.split('\nSpecific subject:')[0]+'\nSpecific subject: '+p.display_name+', Mercadona product ID '+p.id+'. Image1 is the exact product, Image2 only the approved illustration style. Preserve all source packaging, brands, quantities and negations. No invented claims. Transparent background, no exterior shadow.'};});
for(const p of products){p.index+=existing.products.length;p.globalIndex+=existing.products.length;}
mkdirSync(dir,{recursive:true});writeFileSync(dir+'/manifest.json',JSON.stringify({createdAt:existing.createdAt??new Date().toISOString(),replacementFor:blockedRows.map(p=>String(p.id)),products:[...existing.products,...products]},null,2)+'\n');
console.log(JSON.stringify(products.map(p=>({id:p.id,name:p.display_name}))));
