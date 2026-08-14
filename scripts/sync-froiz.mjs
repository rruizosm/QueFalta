#!/usr/bin/env node
// Catálogo público de Froiz → Supabase. La API publica precio habitual, oferta,
// vigencia, novedades y árbol de categorías sin requerir cuenta ni cookies.
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale } from './lib/stale.mjs';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const SIZE = 100;
const API = 'https://servicios.froiz.com/api/products';
const IMAGE = 'https://imagedelivery.net/laxGYDNZyT04iZVpzPzryw';
// El WAF de Froiz rechaza peticiones sin el contexto de su escaparate público;
// estas cabeceras son las de una navegación normal, no contienen credenciales.
const FROIZ_HEADERS = {
  Accept: 'application/json',
  Origin: 'https://supermercado.froiz.com',
  Referer: 'https://supermercado.froiz.com/',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};
const runStart = new Date().toISOString();
if (!DRY_RUN && (!URL || !KEY)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');

const request = async (url) => {
  const response = await fetch(url, { headers: FROIZ_HEADERS });
  if (!response.ok) throw new Error(`${response.status} ${url}: ${await response.text()}`);
  return response.json();
};
const money = (value) => value == null || value === '' ? null : Number(value);
const imageUrl = (p) => p.image ? `${IMAGE}${p.image}` : p.image_id ? `${IMAGE}/${p.image_id}/desktop` : null;
const upsert = async (table, rows) => {
  if (DRY_RUN || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 200) {
    const r = await fetch(`${URL}/rest/v1/${table}?on_conflict=id`, {
      method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rows.slice(i, i + 200)),
    });
    if (!r.ok) throw new Error(`${table} upsert ${r.status}: ${await r.text()}`);
  }
};

const categories = new Map();
const normalize = (p) => {
  const category = String(p.category_slug || p.category_id || 'otros');
  const family = String(p.family_slug || p.family_id || category);
  const section = String(p.section_slug || p.section_id || family);
  categories.set(category, { id: category, name: p.category_name || 'Otros', parent_id: null, product_count: 0, synced_at: runStart });
  categories.set(`${category}/${family}`, { id: `${category}/${family}`, name: p.family_name || p.section_name || p.category_name || 'Otros', parent_id: category, product_count: 0, synced_at: runStart });
  categories.get(category).product_count++;
  categories.get(`${category}/${family}`).product_count++;
  const price = money(p.order_price ?? p.offer?.price ?? p.base_price);
  const base = money(p.base_price);
  const ppu = canonicalPricePerUnit(p.per_unit_weight, p.measurement_unit);
  return {
    id: String(p.id), retailer_product_id: String(p.id), display_name: p.description || p.name,
    brand: p.brand_name?.trim() || null, thumbnail: imageUrl(p), category_id: `${category}/${family}`,
    category_name: p.category_name || null, category_ids: [category, `${category}/${family}`, section],
    unit_price: price, price_format: price == null ? null : `${price.toFixed(2)} €`,
    price_per_unit: ppu?.value ?? null, price_per_unit_unit: ppu?.unit ?? null,
    promo_name: p.offer?.description || null, promo_text: p.offer?.quantity ? `${p.offer.quantity}` : null,
    promo_price: p.offer?.price != null ? money(p.offer.price) : null,
    promo_base_price: base != null && price != null && base > price ? base : null,
    promo_start: p.offer?.date_from || null, promo_end: p.offer?.date_to || null,
    available: p.enabled !== false, published: p.enabled !== false, raw: p, synced_at: runStart,
  };
};

async function main() {
  const products = new Map();
  for (let page = 1; ; page++) {
    const payload = await request(`${API}?page=${page}&size=${SIZE}`);
    const rows = payload['hydra:member']?.[0] ?? payload.products ?? [];
    if (!Array.isArray(rows) || rows.length === 0) break;
    rows.forEach((p) => products.set(String(p.id), normalize(p)));
    if (rows.length < SIZE) break;
  }
  const rows = [...products.values()];
  if (rows.length < 1000) throw new Error(`solo ${rows.length} productos; respuesta parcial, no se publica`);
  console.log(`[froiz] ${rows.length} productos · ${categories.size} categorías · ${rows.filter(p => p.promo_name).length} ofertas`);
  await upsert('froiz_categories', [...categories.values()]);
  await upsert('froiz_products', rows);
  if (!DRY_RUN) {
    await markStale({ url: URL, key: KEY, table: 'froiz_categories', runStart });
    await markStale({ url: URL, key: KEY, table: 'froiz_products', runStart });
  }
}
main().catch((error) => { console.error('[froiz] ERROR', error); process.exit(1); });
