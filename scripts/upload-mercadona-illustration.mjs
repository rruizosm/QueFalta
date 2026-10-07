#!/usr/bin/env node
// Uso administrativo:
// node --env-file=.env.local scripts/upload-mercadona-illustration.mjs <id> <archivo.png|webp> [--replace-existing]
// El recurso debe haber sido revisado y tener transparencia real antes de ejecutarlo.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const [productId, filePath, ...flags] = process.argv.slice(2);
const extension = extname(filePath ?? '').toLowerCase();
const replaceExisting = flags.includes('--replace-existing');
if (!/^\d+$/.test(productId ?? '') || !['.png', '.webp'].includes(extension)) {
  throw new Error('Indica un id numérico de Mercadona y un PNG o WebP aprobado.');
}
if (flags.some((flag) => flag !== '--replace-existing')) {
  throw new Error('Opción desconocida. Solo se admite --replace-existing.');
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) throw new Error('Faltan EXPO_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE.');
if (!['auth.quefalta.es', 'gkffvigcnsesbaihycay.supabase.co'].includes(new URL(url).hostname)) {
  throw new Error('Proyecto Supabase inesperado.');
}

const bytes = readFileSync(filePath);
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const isPng = extension === '.png';
const isWebp = extension === '.webp';
if (isPng && !bytes.subarray(0, 8).equals(pngSignature)) throw new Error('El archivo no es PNG.');
if (isWebp && (
  bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
  || bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
)) throw new Error('El archivo no es WebP.');
if (bytes.length > 3 * 1024 * 1024) throw new Error('El recurso supera el límite de 3 MB.');
const contentType = isWebp ? 'image/webp' : 'image/png';

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: product, error: readError } = await db.from('mercadona_products')
  .select('id, display_name, illustration_url').eq('id', productId).maybeSingle();
if (readError) throw readError;
if (!product) throw new Error(`No existe el producto Mercadona ${productId}.`);

const hash = createHash('sha256').update(bytes).digest('hex');
const objectPath = `mercadona/${productId}/${hash.slice(0, 16)}${extension}`;
const bucket = db.storage.from('product-illustrations');
const publicUrl = bucket.getPublicUrl(objectPath).data.publicUrl;
if (product.illustration_url && product.illustration_url !== publicUrl && !replaceExisting) {
  throw new Error(`El producto ${productId} ya tiene otra ilustración; revisa antes de sustituirla.`);
}

const { error: uploadError } = await bucket.upload(objectPath, bytes, {
  contentType, cacheControl: '31536000', upsert: false,
});
if (uploadError && String(uploadError.statusCode) !== '409') throw uploadError;

const response = await fetch(publicUrl);
if (!response.ok) throw new Error(`No se puede leer el recurso subido: HTTP ${response.status}.`);
if (!response.headers.get('content-type')?.startsWith(contentType)) {
  throw new Error(`Content-Type remoto inesperado: ${response.headers.get('content-type')}.`);
}
const remoteBytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(remoteBytes).digest('hex') !== hash) {
  throw new Error('El recurso remoto no coincide con el archivo local.');
}

if (product.illustration_url !== publicUrl) {
  let update = db.from('mercadona_products')
    .update({ illustration_url: publicUrl })
    .eq('id', productId);
  update = product.illustration_url
    ? update.eq('illustration_url', product.illustration_url)
    : update.is('illustration_url', null);
  const { data: updated, error: updateError } = await update
    .select('id, illustration_url').maybeSingle();
  if (updateError) throw updateError;
  if (!updated) throw new Error('La ilustración cambió durante la subida; revisa el producto.');
}

const { data: verified, error: verifyError } = await db.from('mercadona_products')
  .select('id, display_name, illustration_url').eq('id', productId).single();
if (verifyError) throw verifyError;
if (verified.illustration_url !== publicUrl) throw new Error('La URL no quedó guardada en el producto.');
console.log(JSON.stringify({
  productId,
  name: verified.display_name,
  objectPath,
  imageUrl: publicUrl,
  contentType,
  bytes: bytes.length,
  sha256: hash,
}));
