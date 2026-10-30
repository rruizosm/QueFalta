#!/usr/bin/env node
// Audit and publish ONLY the fixed, user-requested 500-product Carrefour batch.
// Image editing is performed by the integrated ImageGen tool, never this script.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PNG } from 'pngjs';

const flags = process.argv.slice(2);
if (flags.some(flag => flag !== '--publish')) throw new Error('Only --publish is supported.');
const publish = flags.includes('--publish');
const root = resolve('assets/product-cutouts/carrefour-20261027-imagegen-500');
const batch = JSON.parse(await readFile(join(root, 'batch.json'), 'utf8'));
if (batch.target !== 500 || batch.lots.length !== 3) throw new Error('Unexpected batch.');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const eligible = row => row.published && row.available && row.category_name
  && !['Papelería', 'Bazar', 'Calzado'].includes(row.category_name)
  && !['cat260001', 'cat20037', 'cat20038'].includes(row.category_id)
  && !(row.category_ids ?? []).some(id => ['cat260001', 'cat20037', 'cat20038'].includes(id));
const seenIds = new Set(), seenSources = new Set(), seenHashes = new Set();
const jobs = [], lots = [];
for (const lot of batch.lots) {
  const folder = join(root, lot.lot);
  const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
  const allowed = new Map([...manifest.products, ...manifest.reserves].map(product => [product.id, product]));
  const files = await readdir(join(folder, 'receipts')).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  let accepted = 0;
  for (const file of files.filter(file => file.endsWith('.json')).sort()) {
    const receipt = JSON.parse(await readFile(join(folder, 'receipts', file), 'utf8'));
    const product = allowed.get(receipt.id);
    if (receipt.visualReviewAccepted !== true) continue;
    if (!product || !eligible(product) || receipt.tool !== 'image_gen__imagegen'
      || receipt.validAlpha !== true || !receipt.visualReview || !receipt.nativeOutputPath
      || receipt.sourceUrl !== product.thumbnail || !receipt.promptFile) throw new Error(`Invalid receipt ${file}`);
    if (seenIds.has(product.id) || seenSources.has(product.thumbnail)) throw new Error(`Duplicate identity/source ${product.id}`);
    const bytes = await readFile(join(folder, 'images', `${product.id}.png`));
    const hash = sha(bytes);
    if (hash !== receipt.outputSha256 || seenHashes.has(hash)) throw new Error(`Hash mismatch/duplicate ${product.id}`);
    if (sha(await readFile(receipt.nativeOutputPath)) !== hash) throw new Error(`Native output changed ${product.id}`);
    const source = await readFile(join(folder, 'sources', `${product.id}.jpg`)).catch(error => {
      if (error.code === 'ENOENT' && receipt.sourceDeleted === true && /^[a-f0-9]{64}$/.test(receipt.sourceSha256)) return null;
      throw error;
    });
    if (source && sha(source) !== receipt.sourceSha256) throw new Error(`Source hash mismatch ${product.id}`);
    const promptPath = resolve(folder, receipt.promptFile);
    if (!promptPath.startsWith(folder + '/')) throw new Error('Prompt outside lot.');
    if (!(await readFile(promptPath, 'utf8')).trim()) throw new Error('Empty prompt.');
    const png = PNG.sync.read(bytes);
    let zero = 0, nonzero = 0;
    for (let offset = 3; offset < png.data.length; offset += 4) {
      if (png.data[offset] === 0) zero++; else nonzero++;
    }
    if (!zero || !nonzero || bytes.length > 3145728) throw new Error(`Invalid alpha/size ${product.id}`);
    seenIds.add(product.id); seenSources.add(product.thumbnail); seenHashes.add(hash);
    jobs.push({ lot: lot.lot, product, receipt, bytes, hash, width: png.width, height: png.height });
    accepted++;
  }
  if (accepted > lot.target) throw new Error(`Lot exceeds target ${lot.lot}`);
  lots.push({ lot: lot.lot, target: lot.target, accepted });
}
if (jobs.length > 500) throw new Error('Batch exceeds 500.');
console.log(JSON.stringify({ publish, accepted: jobs.length, target: 500, lots }));
if (!publish) process.exit(0);
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!key || !url || new URL(url).hostname !== 'auth.quefalta.es') throw new Error('Unexpected project configuration.');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: baseline, error: baselineError } = await db.from('carrefour_products')
  .select('id, illustration_url').in('id', batch.baselineProducts.map(product => product.id));
if (baselineError) throw baselineError;
if (batch.baselineProducts.some(product => !baseline.some(row => row.id === product.id && row.illustration_url === product.url))) {
  throw new Error('Prior five illustrations changed.');
}
const publicationPath = join(root, 'publication.json');
const publication = await readFile(publicationPath, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return { target: 500, products: [] };
  throw error;
});
const bucket = db.storage.from('product-illustrations');
for (const job of jobs) {
  const objectPath = `carrefour/${job.product.id}/${job.hash.slice(0, 16)}.png`;
  const imageUrl = bucket.getPublicUrl(objectPath).data.publicUrl;
  const { data: row, error } = await db.from('carrefour_products')
    .select('id, published, available, thumbnail, category_id, category_name, category_ids, illustration_url')
    .eq('id', job.product.id).single();
  if (error) throw error;
  if (!eligible(row) || row.thumbnail !== job.product.thumbnail || row.category_name !== job.product.category_name
    || (row.illustration_url && row.illustration_url !== imageUrl)) throw new Error(`Product changed/out of scope ${job.product.id}`);
  if (row.illustration_url === imageUrl && publication.products.some(product => product.id === row.id
    && product.url === imageUrl && product.sha256 === job.hash && product.verified === true)) continue;
  const { error: uploadError } = await bucket.upload(objectPath, job.bytes,
    { contentType: 'image/png', cacheControl: '31536000', upsert: false });
  if (uploadError && String(uploadError.statusCode) !== '409') throw uploadError;
  const response = await fetch(imageUrl);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')
    || sha(Buffer.from(await response.arrayBuffer())) !== job.hash) throw new Error(`Remote file mismatch ${job.product.id}`);
  if (row.illustration_url !== imageUrl) {
    const { data, error } = await db.from('carrefour_products').update({ illustration_url: imageUrl })
      .eq('id', job.product.id).is('illustration_url', null).eq('published', true).eq('available', true)
      .eq('thumbnail', job.product.thumbnail).eq('category_name', job.product.category_name)
      .not('category_ids', 'ov', '{cat260001,cat20037,cat20038}').select('id');
    if (error || data?.length !== 1) throw error ?? new Error(`Concurrent update ${job.product.id}`);
  }
  const { data: verified, error: verifyError } = await db.from('carrefour_products')
    .select('id, illustration_url, thumbnail').eq('id', job.product.id).single();
  if (verifyError || verified.illustration_url !== imageUrl || verified.thumbnail !== job.product.thumbnail) {
    throw verifyError ?? new Error(`Link mismatch ${job.product.id}`);
  }
  const result = { id: job.product.id, lot: job.lot, name: job.product.display_name,
    sourceUrl: job.product.thumbnail, url: imageUrl, sha256: job.hash, bytes: job.bytes.length, verified: true };
  const index = publication.products.findIndex(product => product.id === result.id);
  if (index < 0) publication.products.push(result); else publication.products[index] = result;
  publication.verifiedCount = publication.products.length;
  publication.updatedAt = new Date().toISOString();
  await writeFile(publicationPath, JSON.stringify(publication, null, 2) + '\n');
  console.log(JSON.stringify({ linkedVerified: job.product.id, total: publication.products.length }));
}
