// Save root worker's already generated and visually reviewed native outputs.
import { readFile, writeFile, copyFile, readdir, mkdir } from 'node:fs/promises';
import { PNG } from 'pngjs';
import { createHash } from 'node:crypto';
const folder = 'assets/product-cutouts/carrefour-20261027-imagegen-500/lot-03';
const manifest = JSON.parse(await readFile(folder + '/manifest.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
for (const file of await readdir(folder + '/jobs')) {
  const job = JSON.parse(await readFile(folder + '/jobs/' + file));
  try { await readFile(folder + '/receipts/' + job.id + '.json'); continue; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const product = [...manifest.products, ...manifest.reserves].find(product => product.id === job.id);
  if (!product || !job.nativeOutputPath.startsWith('/Users/rruizosmaalohacloud/.codex/generated_images/')) throw new Error('Unexpected job.');
  for (const name of ['prompts', 'images', 'receipts']) await mkdir(folder + '/' + name, { recursive: true });
  await writeFile(folder + '/prompts/' + job.id + '.txt', job.prompt + '\n');
  await copyFile(job.nativeOutputPath, folder + '/images/' + job.id + '.png');
  const bytes = await readFile(job.nativeOutputPath);
  const png = PNG.sync.read(bytes);
  let zero = 0, nonzero = 0;
  for (let index = 3; index < png.data.length; index += 4) {
    if (png.data[index] === 0) zero++; else nonzero++;
  }
  const receipt = { id: job.id, sourceUrl: product.thumbnail,
    sourceSha256: sha(await readFile(folder + '/sources/' + job.id + '.jpg')),
    outputSha256: sha(bytes), tool: 'image_gen__imagegen', promptFile: 'prompts/' + job.id + '.txt',
    nativeOutputPath: job.nativeOutputPath, visualReview: job.visualReview,
    validAlpha: !!zero && !!nonzero,
    visualReviewAccepted: job.accepted !== false && !!zero && !!nonzero && bytes.length <= 3145728,
    bytes: bytes.length };
  await writeFile(folder + '/receipts/' + job.id + '.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ id: job.id, accepted: receipt.visualReviewAccepted, bytes: bytes.length }));
}
