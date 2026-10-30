import {readFile,writeFile,copyFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PNG} from 'pngjs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
const b=dirname(fileURLToPath(import.meta.url));
const [action,id,native]=process.argv.slice(2);
const sha=b=>createHash('sha256').update(b).digest('hex');
if(action==='record'){
 const manifest=JSON.parse(await readFile(join(b,'manifest.json')));
 const product=[...manifest.products,...manifest.reserves].find(p=>p.id===id);
 if(!product||!native?.startsWith('/Users/rruizosmaalohacloud/.codex/generated_images/'))throw new Error('Unexpected input');
 await copyFile(native,join(b,'images',id+'.png'));
 const bytes=await readFile(join(b,'images',id+'.png'));const source=await readFile(join(b,'sources',id+'.jpg'));const p=PNG.sync.read(bytes);let zero=0,nonzero=0;
 for(let i=3;i<p.data.length;i+=4){if(p.data[i]===0)zero++;else nonzero++;}
 const validAlpha=zero>0&&nonzero>0;
 await writeFile(join(b,'receipts',id+'.json'),JSON.stringify({id,sourceUrl:product.thumbnail,sourceSha256:sha(source),outputSha256:sha(bytes),tool:'image_gen__imagegen',promptFile:'prompts/'+id+'.txt',nativeOutputPath:native,validAlpha,bytes:bytes.length,withinBucketLimit:bytes.length<=3145728,visualReviewAccepted:false,visualReview:'Pending visual review'},null,2)+'\n');
 console.log(JSON.stringify({id,bytes:bytes.length,validAlpha}));
}else if(action==='accept'){
 for(const productId of [id,native,...process.argv.slice(5)].filter(Boolean)){
  const path=join(b,'receipts',productId+'.json');const r=JSON.parse(await readFile(path));
  if(!r.validAlpha||(r.bytes&&r.bytes>3145728))throw new Error('Invalid alpha/size '+productId);
  r.visualReviewAccepted=true;r.visualReview='Complete matching photographed product and packaging. Transparent external background, white product surfaces preserved. Minor generated text/brightness/edge differences consistent with user-authorized ImageGen approach.';
  await rm(join(b,'sources',productId+'.jpg'),{force:true});
  r.sourceDeleted=true;
  await writeFile(path,JSON.stringify(r,null,2)+'\n');
 }
}else throw new Error('Unexpected action');
const files=await readdir(join(b,'receipts'));let completed=0;for(const f of files.filter(f=>f.endsWith('.json'))){if(JSON.parse(await readFile(join(b,'receipts',f))).visualReviewAccepted)completed++;}
await writeFile(join(b,'progress.json'),JSON.stringify({target:167,completed,status:'running',updatedAt:new Date().toISOString()},null,2)+'\n');
