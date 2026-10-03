import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dir=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(await readFile(path.join(dir,'provenance.json'),'utf8'));
const jobs=[['Anton-Regular.ttf','https://raw.githubusercontent.com/google/fonts/main/ofl/anton/Anton-Regular.ttf'],['Anton-OFL.txt','https://raw.githubusercontent.com/google/fonts/main/ofl/anton/OFL.txt'],...manifest.products.map(p=>[p.id+'.jpg',p.thumbnail])];
for(const [name,url] of jobs){const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`${name}: ${response.status}`);const data=Buffer.from(await response.arrayBuffer());await writeFile(path.join(dir,'assets',name),data);console.log(name,data.length);}
