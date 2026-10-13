// Publicación administrativa de la única ilustración revisada de este encargo.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const dir = new URL('./', import.meta.url);
const asset = JSON.parse(await readFile(new URL('export.json', dir), 'utf8'));
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key || !['auth.quefalta.es', 'gkffvigcnsesbaihycay.supabase.co'].includes(new URL(url).hostname)) {
  throw new Error('Configuración administrativa de QuéFalta ausente o inesperada.');
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await readFile(asset.file);
if (sha(bytes) !== asset.sha256 || bytes.length !== asset.bytes || bytes.subarray(0, 4).toString() !== 'RIFF' || bytes.subarray(8, 12).toString() !== 'WEBP') {
  throw new Error('El WebP ya no coincide con el recurso revisado.');
}
const checkActive = async () => {
  const { data, error } = await db.from('lidl_store_products')
    .select('store_id, lidl_stores!inner(published, selectable)')
    .eq('product_id', asset.productId).eq('published', true)
    .eq('lidl_stores.published', true).eq('lidl_stores.selectable', true).limit(1);
  if (error) throw error;
  if (!data.length) throw new Error('El producto ya no está publicado en una tienda activa.');
};
await checkActive();
const { data: before, error: readError } = await db.from('lidl_product_master')
  .select('id, display_name, thumbnail, published, illustration_url').eq('id', asset.productId).single();
if (readError) throw readError;
if (!before.published || before.thumbnail !== asset.thumbnail || before.illustration_url) {
  throw new Error('El producto cambió o ya tiene una ilustración; no se sobrescribe.');
}
await writeFile(new URL('product-before.json', dir), JSON.stringify(before, null, 2) + '\n');
const objectPath = `lidl/${asset.productId}/${asset.sha256.slice(0, 16)}.webp`;
const bucket = db.storage.from('product-illustrations');
const imageUrl = bucket.getPublicUrl(objectPath).data.publicUrl;
const { error: uploadError } = await bucket.upload(objectPath, bytes, {
  contentType: 'image/webp', cacheControl: '31536000', upsert: false,
});
if (uploadError && String(uploadError.statusCode) !== '409') throw uploadError;
const response = await fetch(imageUrl);
if (!response.ok || !response.headers.get('content-type')?.startsWith('image/webp')) throw new Error('Lectura pública WebP fallida.');
const remote = Buffer.from(await response.arrayBuffer());
if (remote.length !== bytes.length || sha(remote) !== asset.sha256) throw new Error('SHA/bytes remotos distintos.');
await checkActive();
const { data: updated, error: updateError } = await db.from('lidl_product_master')
  .update({ illustration_url: imageUrl }).eq('id', asset.productId).eq('published', true)
  .eq('thumbnail', before.thumbnail).is('illustration_url', null)
  .select('id, display_name, thumbnail, published, illustration_url').maybeSingle();
if (updateError) throw updateError;
if (!updated) throw new Error('El producto cambió durante la publicación.');
const { data: after, error: verifyError } = await db.from('lidl_product_master')
  .select('id, display_name, thumbnail, published, illustration_url').eq('id', asset.productId).single();
if (verifyError) throw verifyError;
if (after.illustration_url !== imageUrl || !after.published || after.thumbnail !== before.thumbnail) throw new Error('Verificación de ficha fallida.');
await checkActive();
const receipt = { ...asset, objectPath, imageUrl, contentType: 'image/webp',
  sourceThumbnailUnchanged: true, published: true, publishedInActiveStore: true,
  verifiedAt: new Date().toISOString(), productAfter: after };
await writeFile(new URL('verification.json', dir), JSON.stringify(receipt, null, 2) + '\n');
await unlink(asset.file);
await writeFile(new URL('cleanup.json', dir), JSON.stringify({ removed: asset.file, afterVerifiedUpload: true, at: new Date().toISOString() }, null, 2) + '\n');
console.log(JSON.stringify(receipt));
