import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const sharp=require('/Users/rruizosmaalohacloud/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const dir=process.argv[2];
if(!/^assets\/product-illustrations\/batch-20261012-459\/lot-0[1-4]$/.test(dir))throw Error('Explicit lot required');
const manifest=JSON.parse(readFileSync(dir+'/manifest.json'));
const records=[];
for(const p of manifest.products){
 const file=dir+'/jobs/'+p.id+'.json';if(!existsSync(file))continue;
 const j=JSON.parse(readFileSync(file)),meta=await sharp(j.png).metadata();
 const {data,info}=await sharp(j.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let zero=0,full=0,max=0;
 for(let i=3;i<data.length;i+=4){const a=data[i];if(a===0)zero++;if(a===255)full++;max=Math.max(max,a);}
 if(!meta.hasAlpha||!zero||max<250)throw Error('Native transparency '+p.id);
 if(readFileSync(j.promptFile,'utf8')!==j.prompt)throw Error('Exact prompt provenance '+p.id);
 records.push({id:p.id,png:j.png,width:info.width,height:info.height,hasAlpha:meta.hasAlpha,zero,full,max});
}
const result={checkedAt:new Date().toISOString(),count:records.length,records};
writeFileSync(dir+'/native-alpha-qa.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({count:records.length,nativeTransparency:true,exactPrompts:true}));
