// Run: node --env-file=.env.local scripts/setup-respira-campaign.mjs
// Administrative credentials stay in this script's environment, never in the app.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) throw new Error('Missing Supabase administrative environment');
if (!['auth.quefalta.es', 'gkffvigcnsesbaihycay.supabase.co'].includes(new URL(url).hostname)) throw new Error('Unexpected project');
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const bytes = readFileSync(new URL('../assets/promotions/respira/respira-banner-2400x800.jpg', import.meta.url));
const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
const imagePath = `respira/banner-${hash}.jpg`;
const { error: uploadError } = await db.storage.from('promotions').upload(imagePath, bytes, {
  contentType: 'image/jpeg', cacheControl: '31536000', upsert: false,
});
if (uploadError && !['409', '400'].includes(String(uploadError.statusCode))) throw uploadError;
const imageUrl = db.storage.from('promotions').getPublicUrl(imagePath).data.publicUrl;
const response = await fetch(imageUrl);
if (!response.ok) throw new Error(`Image unavailable: ${response.status}`);
const remote = Buffer.from(await response.arrayBuffer());
if (!bytes.equals(remote)) throw new Error('Uploaded image does not match source');
const { data: existing, error: readError } = await db.from('sponsor_campaigns').select('id').eq('slug', 'respira').maybeSingle();
if (readError) throw readError;
if (!existing) {
  const { error } = await db.from('sponsor_campaigns').insert({
    slug: 'respira', sponsor_name: 'Respira', image_path: imagePath,
    destination_ios: 'https://apps.apple.com/us/app/respira-pollen-allergy/id6759206565',
    destination_android: 'https://respiraapp.fit',
    accessibility_label_es: '¿Alergia al polen? Consulta solo el polen de tus alergias, la previsión a cinco días y recibe avisos. Ejemplo mostrado: riesgo alto por gramíneas. Disponible en App Store.',
    accessibility_label_ca: "Al·lèrgia al pol·len? Consulta només el pol·len de les teves al·lèrgies, la previsió a cinc dies i rep avisos. Exemple mostrat: risc alt per gramínies. Disponible a l’App Store.",
    enabled: true,
  });
  if (error) throw error;
}
console.log(JSON.stringify({ campaign: 'respira', imagePath, imageVerified: true, created: !existing }));
