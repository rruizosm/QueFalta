import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const types={'.html':'text/html','.ttf':'font/ttf','.png':'image/png','.jpg':'image/jpeg','.wav':'audio/wav'};
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const f=path.resolve(dir,'.'+(url.pathname==='/'?'/film.html':decodeURIComponent(url.pathname)));if(!f.startsWith(dir+path.sep))throw Error('invalid path');res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(await readFile(f))}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
page.on('pageerror',e=>{throw e});await page.goto(`http://127.0.0.1:${server.address().port}/?render`);await page.evaluate(()=>window.ready);
const preview=process.argv.includes('--preview');const times=preview?[0,.4,1.15,1.5,2.1,2.9,3.5,4.05,4.65,5.4,6.25,6.8,7.55,8.5,9.983333]:Array.from({length:600},(_,i)=>i/60);
await mkdir(path.join(dir,preview?'review':'frames'),{recursive:true});
for(let i=0;i<times.length;i++){
 const data=await page.evaluate(({t,samples})=>{drawFrame(t,samples);return document.querySelector('canvas').toDataURL('image/jpeg',.985).split(',')[1]},{t:times[i],samples:preview?1:3});
 const name=preview?`review/frame-${times[i].toFixed(2)}.jpg`:`frames/${String(i).padStart(4,'0')}.jpg`;
 await writeFile(path.join(dir,name),Buffer.from(data,'base64'));if(preview||i%60===0)console.log(`${i+1}/${times.length} — ${times[i].toFixed(2)} s`);
}
await browser.close();server.close();
