// User explicitly requested deleting downloaded sources after ImageGen completes.
import { readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { createHash } from 'node:crypto';
const root = 'assets/product-cutouts/carrefour-20261027-imagegen-500';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const includeDownloads = process.argv.includes('--downloads');
let removed = 0, bytesRemoved = 0;
for (const lot of ['lot-01', 'lot-02', 'lot-03']) {
  const folder = join(root, lot);
  const files = await readdir(join(folder, 'receipts'));
  for (const file of files.filter(file => file.endsWith('.json'))) {
    const receiptPath = join(folder, 'receipts', file);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    if (receipt.tool !== 'image_gen__imagegen' || !receipt.outputSha256 || !receipt.sourceSha256) continue;
    const output = await readFile(join(folder, 'images', `${receipt.id}.png`));
    if (sha(output) !== receipt.outputSha256 || sha(await readFile(receipt.nativeOutputPath)) !== receipt.outputSha256) {
      throw new Error(`Output verification failed ${receipt.id}`);
    }
    const sourcePath = join(folder, 'sources', `${receipt.id}.jpg`);
    const source = await readFile(sourcePath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (source) {
      if (sha(source) !== receipt.sourceSha256) throw new Error(`Source hash changed ${receipt.id}`);
      receipt.sourceBytes = source.length;
      await unlink(sourcePath);
      removed++; bytesRemoved += source.length;
    }
    if (includeDownloads) {
      const filename = basename(new URL(receipt.sourceUrl).pathname);
      const downloadPath = join('/Users/rruizosmaalohacloud/Downloads', filename);
      const duplicate = await readFile(downloadPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (duplicate && sha(duplicate) === receipt.sourceSha256) {
        await unlink(downloadPath);
        removed++; bytesRemoved += duplicate.length;
        receipt.matchingBrowserDownloadDeleted = true;
      }
    }
    receipt.sourceDeleted = true;
    receipt.sourceDeletedAt ??= new Date().toISOString();
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  }
}
console.log(JSON.stringify({ removed, bytesRemoved, includeDownloads }));
