import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const server=createServer(async(req,res)=>{try{const f=path.join(dir,decodeURIComponent(req.url.split('?')[0]==='/'?'/film.html':req.url.split('?')[0]));const body=await readFile(f);res.setHeader('Content-Type',f.endsWith('.ttf')?'font/ttf':f.endsWith('.png')?'image/png':'text/html');res.end(body)}catch{res.statusCode=404;res.end()}});
await new Promise(r=>server.listen(4387,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,args:['--disable-gpu','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1080,height:1920},deviceScaleFactor:1});
page.on('pageerror',e=>console.error(e));
await page.goto('http://127.0.0.1:4387');await page.evaluate(()=>window.ready);
const preview=process.argv.includes('--preview');
const times=preview?[.05,.65,1.3,1.9,2.5,3.1,3.65,4.6,5.5,6.15,6.9,7.8,8.6,9.7]:Array.from({length:600},(_,i)=>i/60);
for(let i=0;i<times.length;i++){
 const data=await page.evaluate(({t,preview})=>{drawFrame(t,preview?1:3);return document.querySelector('canvas').toDataURL('image/jpeg',.99).split(',')[1]},{t:times[i],preview});
 const file=preview?`review/frame-${times[i].toFixed(2)}.jpg`:`frames/${String(i).padStart(4,'0')}.jpg`;
 await writeFile(path.join(dir,file),Buffer.from(data,'base64'));
 if(preview||i%60===0)console.log(`${i+1}/${times.length} — ${times[i].toFixed(2)} s`);
}
await browser.close();server.close();
