import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const require=createRequire(process.cwd()+'/package.json');
const sharp=require('/Users/rruizosmaalohacloud/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const dir='assets/product-illustrations/batch-20261012-459/lot-02',results=[];
for(const file of readdirSync(dir+'/jobs').filter(x=>x.endsWith('.json'))){
 const job=JSON.parse(readFileSync(dir+'/jobs/'+file));
 const metadata=await sharp(job.png).metadata();
 const {data}=await sharp(job.png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let zero=0,solid=0,min=255,max=0;
 for(let i=3;i<data.length;i+=4){const a=data[i];if(a===0)zero++;if(a>=250)solid++;min=Math.min(min,a);max=Math.max(max,a);}
 if(!metadata.hasAlpha||!zero||!solid)throw Error('Native transparency missing '+job.id);
 results.push({id:job.id,nativeHasAlpha:metadata.hasAlpha,transparentPixels:zero,solidPixels:solid,min,max});
}
writeFileSync(dir+'/native-alpha-qa.json',JSON.stringify({verifiedAt:new Date().toISOString(),nativeValidated:results.length,results},null,2)+'\n');
console.log(JSON.stringify({nativeValidated:results.length}));
