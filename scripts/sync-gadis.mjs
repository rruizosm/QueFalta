#!/usr/bin/env node
// Sincroniza Gadisline → Supabase. La tienda es Next.js: cada categoría sirve la
// primera página de 50 productos como __NEXT_DATA__. Las categorías se descubren
// desde sus propios slugs estructurados; los productos se deduplican por UUID.
//
// Gadisline resuelve precios por código postal. Este sync usa el surtido público
// por defecto (sin dirección) y nunca intenta iniciar sesión ni aplicar cupones.
// Las ofertas son SOLO `offers[]` explícitas y no cupones de fidelización.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, DRY_RUN=1,
//      MAX_CATEGORIES=N, MIN_PRODUCTS=8000, CONCURRENCY=4.
import { markStale } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';

const BASE = 'https://www.gadisline.com';
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY = process.env.DRY_RUN === '1';
const MAX_CATEGORIES = Number(process.env.MAX_CATEGORIES || Infinity);
const MIN_PRODUCTS = Number(process.env.MIN_PRODUCTS || 8000);
const runStart = new Date().toISOString();
const UA = 'QueFalta catalog sync/1.0 (+https://quefalta.es)';
const ROOT_CATEGORIES = [
  '/alimentacion', '/frescos', '/congelado', '/lacteos', '/bebes-y-ninos',
  '/mascotas', '/bodega-y-bebidas', '/limpieza', '/higiene-y-belleza', '/hogar',
  '/precios-especiales',
];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));

if (!DRY && (!URL || !KEY)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');

async function nextData(path, tries = 4) {
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(`${BASE}${path}`, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
      if (response.ok) {
        const html = await response.text();
        const payload = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
        if (payload) return JSON.parse(payload);
      }
      if (response.status < 429 || attempt === tries - 1) return null;
    } catch (error) {
      if (attempt === tries - 1) console.warn(`[gadis] ${path}: ${error.message}`);
    }
    await wait(700 * (attempt + 1));
  }
  return null;
}

function walk(value, onObject) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) return value.forEach((item) => walk(item, onObject));
  onObject(value);
  Object.values(value).forEach((item) => walk(item, onObject));
}

function languageValue(values) {
  if (!Array.isArray(values)) return null;
  return values.find((item) => item?.language === 'ES')?.value ?? values[0]?.value ?? null;
}

function productPages(data) {
  const pages = [];
  walk(data?.props?.pageProps, (value) => {
    if (Array.isArray(value.elements) && value.page && value.elements.some((item) => item?.id && item?.commercial_description)) pages.push(value);
  });
  return pages;
}

function categoryLinks(data) {
  const links = new Map();
  walk(data?.props?.pageProps, (value) => {
    if (!Array.isArray(value.categories)) return;
    for (const category of value.categories) {
      const path = languageValue(category?.slugs);
      const name = languageValue(category?.names) ?? languageValue(category?.descriptions_translate);
      if (typeof path === 'string' && path.startsWith('/') && name) links.set(path, { id: category.id ?? path, name });
    }
  });
  return links;
}

function normalize(product) {
  const categories = Array.isArray(product.categories) ? product.categories : [];
  const leaf = product.category ?? categories.at(-1) ?? null;
  const offers = Array.isArray(product.offers) ? product.offers : [];
  const publicOffers = offers.filter((offer) => offer?.is_offer_coupon !== true);
  const primaryOffer = publicOffers[0] ?? null;
  const isNew = (product.properties ?? []).some((property) => /nuevo/i.test(languageValue(property?.description) ?? property?.icon?.name ?? ''));
  const ppu = Number(product.price_kilo_litre);
  return {
    id: String(product.id), retailer_product_id: product.product_code != null ? String(product.product_code) : null,
    display_name: languageValue(product.commercial_description)?.trim() ?? '',
    brand: product.brand_description?.trim() || null,
    packaging: product.weight ? `${product.weight}${product.scale ? ` · ${product.scale}` : ''}` : null,
    thumbnail: product.image?.image_thumbnails ?? product.image?.image ?? null,
    category_id: leaf?.id ?? null, category_name: languageValue(leaf?.descriptions_translate),
    category_ids: categories.map((category) => String(category.id)).filter(Boolean),
    unit_price: Number.isFinite(Number(product.price)) ? Number(product.price) : null,
    price_format: Number.isFinite(Number(product.price)) ? `${Number(product.price).toFixed(2).replace('.', ',')} €` : null,
    price_per_unit: Number.isFinite(ppu) ? ppu : null,
    price_per_unit_unit: languageValue(product.price_kilo_litre_suffix) ?? null,
    promo_name: primaryOffer?.icon?.name ?? null,
    promo_text: primaryOffer?.description ?? primaryOffer?.title ?? null,
    promo_end: primaryOffer?.end_date ?? null,
    promo_group_id: primaryOffer?.group_id ?? null,
    promo_is_related: primaryOffer?.is_related === true,
    promo_is_coupon: offers.some((offer) => offer?.is_offer_coupon === true),
    is_new: isNew, published: true, raw: product, synced_at: runStart,
  };
}

async function upsert(table, rows) {
  for (const batch of chunks(rows, 250)) {
    const response = await fetch(`${URL}/rest/v1/${table}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const root = await nextData('/');
  if (!root) throw new Error('no se pudo leer Gadisline');
  // El menú de Gadisline se hidrata en cliente y no siempre deja su árbol en el
  // payload de inicio. Las once raíces son estables y las ramas inferiores se
  // siguen descubriendo desde los slugs estructurados de cada categoría.
  const queue = [...new Set([...ROOT_CATEGORIES, ...categoryLinks(root).keys()])];
  const visited = new Set(); const products = new Map(); const categories = new Map();
  while (queue.length && visited.size < MAX_CATEGORIES) {
    const path = queue.shift();
    if (visited.has(path)) continue;
    visited.add(path);
    const data = await nextData(path);
    if (!data) continue;
    for (const [childPath, category] of categoryLinks(data)) {
      categories.set(String(category.id), { id: String(category.id), name: category.name, parent_id: null, product_count: 0, published: true, synced_at: runStart });
      if (!visited.has(childPath)) queue.push(childPath);
    }
    for (const page of productPages(data)) for (const product of page.elements) {
      const row = normalize(product);
      if (row.display_name) {
        products.set(row.id, row);
        const chain = Array.isArray(product.categories) ? product.categories : [];
        chain.forEach((category, index) => {
          const id = category?.id != null ? String(category.id) : null;
          const name = languageValue(category?.descriptions_translate);
          if (!id || !name) return;
          categories.set(id, {
            id, name,
            parent_id: index > 0 && chain[index - 1]?.id != null ? String(chain[index - 1].id) : null,
            product_count: 0, published: true, synced_at: runStart,
          });
        });
      }
    }
    if (visited.size % 20 === 0) console.log(`[gadis] ${visited.size} categorías · ${products.size} productos`);
    await wait(80);
  }
  const rows = [...products.values()];
  for (const row of rows) for (const id of row.category_ids) {
    const category = categories.get(id);
    if (category) category.product_count++;
  }
  console.log(`[gadis] ${rows.length} productos · ${categories.size} categorías · ${rows.filter((row) => row.is_new).length} nuevos · ${rows.filter((row) => row.promo_name).length} ofertas`);
  if (DRY) return;
  if (rows.length < MIN_PRODUCTS) throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible catálogo parcial`);
  await upsert('gadis_categories', [...categories.values()]);
  await upsert('gadis_products', rows);
  await markStale({ url: URL, key: KEY, table: 'gadis_products', runStart });
  await markStale({ url: URL, key: KEY, table: 'gadis_categories', runStart });
  await recordCatalogSync({ url: URL, key: KEY, store: 'gadis' });
}

main().catch((error) => { console.error('[gadis] ERROR', error); process.exit(1); });
