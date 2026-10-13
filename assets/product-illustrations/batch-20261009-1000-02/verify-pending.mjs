import {readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const {createClient} = require('@supabase/supabase-js');
const base = 'assets/product-illustrations/batch-20261009-1000-02';
const pending = JSON.parse(readFileSync(base + '/pending-products.json'));
const db = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, {auth: {persistSession: false}});
const remote = new Map();
for (let i = 0; i < pending.length; i += 200) {
  const {data, error} = await db.from('mercadona_products').select('id,published,illustration_url').in('id', pending.slice(i, i + 200).map(p => p.id));
  if (error) throw error;
  for (const row of data) remote.set(String(row.id), row);
}
for (const p of pending) {
  const r = remote.get(String(p.id));
  if (!r || r.published !== true || r.illustration_url !== null) throw Error('Pending product changed: ' + p.id);
}
const result = {verifiedAt: new Date().toISOString(), pending: pending.length, publishedTrueAndIllustrationNull: pending.length};
writeFileSync(base + '/pending-verification.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
