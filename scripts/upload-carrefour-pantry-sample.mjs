#!/usr/bin/env node
// Five reviewed cutouts only. Dry run by default; use --publish to upload and link.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { PNG } from 'pngjs';

const flags = process.argv.slice(2);
if (flags.some(flag => flag !== '--publish')) throw new Error('Solo se admite --publish.');
const publish = flags.includes('--publish');
const folder = resolve('assets/product-cutouts/carrefour-20261027-sample');
const manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'));
const verification = JSON.parse(await readFile(join(folder, 'verification.json'), 'utf8'));
const expectedIds = ['520664611', '520660281', '521002680', '521003205', '521001754'];
if (manifest.store !== 'carrefour' || manifest.products.length !== 5
  || new Set(manifest.products.map(p => p.id)).size !== 5
  || manifest.products.some(p => !expectedIds.includes(p.id))) throw new Error('Tanda inesperada.');
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key || !['auth.quefalta.es', 'gkffvigcnsesbaihycay.supabase.co'].includes(new URL(url).hostname)) {
  throw new Error('Falta configuración del proyecto esperado.');
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const excludedIds = new Set(['cat260001', 'cat20037', 'cat20038']);
const excludedNames = new Set(['papeleria', 'bazar', 'calzado']);
const normalized = value => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const { data, error } = await db.from('carrefour_products')
  .select('id, display_name, thumbnail, illustration_url, category_id, category_name, category_ids, published, available')
  .in('id', expectedIds);
if (error) throw error;
if (data.length !== 5) throw new Error('Faltan productos.');
const bucket = db.storage.from('product-illustrations');
const jobs = [];
for (const product of manifest.products) {
  const row = data.find(row => row.id === product.id);
  const receipt = verification.products.find(row => row.id === product.id);
  if (!row.published || !row.available || !row.category_name
    || excludedNames.has(normalized(row.category_name)) || excludedNames.has(normalized(product.categoryName))
    || excludedIds.has(row.category_id) || (row.category_ids ?? []).some(id => excludedIds.has(id))) {
    throw new Error(`Producto fuera de alcance: ${product.id}`);
  }
  if (row.thumbnail !== product.sourceUrl || row.category_name !== product.categoryName) throw new Error(`Fuente o categoría cambiada: ${product.id}`);
  const bytes = await readFile(join(folder, `${product.id}-preview.png`));
  const hash = sha(bytes);
  const originalHash = sha(await readFile(join(folder, `${product.id}-original.jpg`)));
  if (!receipt?.rgbUnchanged || hash !== receipt.outputSha256 || originalHash !== receipt.originalSha256) throw new Error(`Imagen sin verificar: ${product.id}`);
  const image = PNG.sync.read(bytes);
  let transparent = false, opaque = false;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] === 0) transparent = true;
    if (image.data[i] === 255) opaque = true;
  }
  if (!transparent || !opaque || bytes.length > 3 * 1024 * 1024) throw new Error(`PNG inválido: ${product.id}`);
  const objectPath = `carrefour/${product.id}/${hash.slice(0, 16)}.png`;
  const imageUrl = bucket.getPublicUrl(objectPath).data.publicUrl;
  if (row.illustration_url && row.illustration_url !== imageUrl) throw new Error(`Imagen previa diferente: ${product.id}`);
  jobs.push({ row, bytes, hash, objectPath, imageUrl });
}
console.log(JSON.stringify({ publish, count: jobs.length, ids: expectedIds }));
if (!publish) process.exit(0);
for (const job of jobs) {
  const { error } = await bucket.upload(job.objectPath, job.bytes, { contentType: 'image/png', cacheControl: '31536000', upsert: false });
  if (error && String(error.statusCode) !== '409') throw error;
  const response = await fetch(job.imageUrl);
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')
    || sha(Buffer.from(await response.arrayBuffer())) !== job.hash) throw new Error(`Verificación remota fallida: ${job.row.id}`);
}
// All images are verified before changing any product URL. Conditional updates preserve newer edits.
for (const job of jobs) {
  if (job.row.illustration_url === job.imageUrl) continue;
  const { data, error } = await db.from('carrefour_products').update({ illustration_url: job.imageUrl })
    .eq('id', job.row.id).is('illustration_url', null).eq('published', true).eq('available', true)
    .eq('category_name', job.row.category_name).eq('thumbnail', job.row.thumbnail)
    .not('category_ids', 'ov', '{cat260001,cat20037,cat20038}').select('id');
  if (error || data?.length !== 1) throw error ?? new Error(`Cambios concurrentes: ${job.row.id}`);
}
const { data: after, error: afterError } = await db.from('carrefour_products').select('id, illustration_url, thumbnail').in('id', expectedIds);
if (afterError) throw afterError;
for (const job of jobs) {
  const row = after.find(row => row.id === job.row.id);
  if (row?.illustration_url !== job.imageUrl || row.thumbnail !== job.row.thumbnail) throw new Error(`Enlace inesperado: ${job.row.id}`);
}
await writeFile('docs/carrefour-cutouts-publicacion-20261027-5.json', JSON.stringify({
  date: '2026-10-27', table: 'carrefour_products', column: 'illustration_url',
  excludedCategories: ['Papelería', 'Bazar', 'Calzado'], verified: true,
  products: jobs.map(job => ({ id: job.row.id, name: job.row.display_name, url: job.imageUrl, sha256: job.hash, bytes: job.bytes.length })),
}, null, 2) + '\n');
console.log('Cinco fotos subidas, verificadas y vinculadas; thumbnails originales conservados.');
