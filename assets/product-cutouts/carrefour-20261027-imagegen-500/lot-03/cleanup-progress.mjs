import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
const f = 'assets/product-cutouts/carrefour-20261027-imagegen-500/lot-03';
const m = JSON.parse(await readFile(f + '/manifest.json'));
const own = new Set([...m.products.slice(0, 116), ...m.reserves.slice(10)].map(p => p.id));
let accepted = 0; const rejected = [];
for (const file of await readdir(f + '/receipts')) {
  const r = JSON.parse(await readFile(f + '/receipts/' + file));
  if (!own.has(r.id)) continue;
  if (r.sourceSha256 && !r.sourceDeleted) {
    await unlink(f + '/sources/' + r.id + '.jpg').catch(e => { if (e.code !== 'ENOENT') throw e; });
    r.sourceDeleted = true;
    await writeFile(f + '/receipts/' + file, JSON.stringify(r, null, 2) + '\n');
  }
  if (r.visualReviewAccepted) accepted++; else rejected.push(r.id);
}
const progress = { worker: 'carrefour_lot_03', target: 116, assignedRange: [0,115], rootAssignedRange:[116,165], accepted, rejected, sourceDeletionEnabled:true };
await writeFile(f + '/worker-progress.json', JSON.stringify(progress,null,2)+'\n');
console.log(JSON.stringify(progress));
