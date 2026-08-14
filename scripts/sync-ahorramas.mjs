#!/usr/bin/env node
// Catálogo público Ahorramás (SFCC/Demandware) → Supabase. Las categorías y el
// listado son HTML público; no se autentica ni se muta ninguna cesta. Ahorramás
// asigna una tienda por CP: esta primera pasada conserva el surtido de referencia.
import { readFileSync } from 'node:fs';
import { markStale } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';

const BASE = 'https://www.ahorramas.com';
const ROOTS = new Set(['alimentacion', 'frescos', 'bebidas', 'lacteos', 'limpieza', 'cuidado-personal', 'congelados', 'hogar', 'bebe', 'mascotas']);
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY = process.env.DRY_RUN === '1';
const MAX_CATEGORIES = Number(process.env.MAX_CATEGORIES || Infinity);
const MIN_PRODUCTS = Number(process.env.MIN_PRODUCTS || 5000);
const runStart = new Date().toISOString();
const cookies = new Map();

function loadEnvLocal() {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0 && !line.trim().startsWith('#') && process.env[line.slice(0, i).trim()] == null) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
    }
  } catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
loadEnvLocal();
if (!DRY && (!SUPABASE_URL || !KEY)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const htmlDecode = (value = '') => value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, dec) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10))).replace(/&[a-z]+;/gi, (entity) => ({ '&aacute;':'á','&eacute;':'é','&iacute;':'í','&oacute;':'ó','&uacute;':'ú','&ntilde;':'ñ','&uuml;':'ü','&euro;':'€' }[entity.toLowerCase()] ?? entity));
const clean = (value = '') => htmlDecode(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const number = (value) => { const parsed = Number(String(value ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(parsed) ? parsed : null; };
const dateISO = (value) => { const m = String(value ?? '').match(/(\d{2})\/(\d{2})\/(\d{2,4})/); return m ? `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2]}-${m[1]}` : null; };
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, i * size + size));

async function request(path, retries = 3) {
  const target = path.startsWith('http') ? path : `${BASE}${path}`;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(target, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'QueFalta catalog sync/1.0 (+https://quefalta.es)', ...(cookies.size ? { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) }, signal: AbortSignal.timeout(30000) });
      for (const header of response.headers.getSetCookie?.() ?? []) { const [pair] = header.split(';'); const i = pair.indexOf('='); if (i > 0) cookies.set(pair.slice(0, i), pair.slice(i + 1)); }
      if (response.ok) return response.text();
      if (response.status < 429 || attempt === retries - 1) throw new Error(`${response.status} ${target}`);
    } catch (error) { if (attempt === retries - 1) throw error; }
    await sleep(750 * (attempt + 1));
  }
}

function categoryPath(href) {
  try {
    const path = new URL(href, BASE).pathname.replace(/^\/+|\/+$/g, '');
    const parts = path.split('/').filter(Boolean);
    return ROOTS.has(parts[0]) && parts.length <= 4 && !path.endsWith('.html') ? path : null;
  } catch { return null; }
}

function categoryLinks(html) {
  const result = new Map();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const path = categoryPath(match[1]); const name = clean(match[2]);
    if (path && name && !/^ver todo$/i.test(name)) result.set(path, name);
  }
  return result;
}

function productTiles(html, path) {
  const out = [];
  const marker = /<div class="product"\s+data-pid="([^"]+)"[\s\S]*?(?=<div class="product"\s+data-pid=|<div class="product-container|$)/gi;
  for (const match of html.matchAll(marker)) {
    const id = match[1]; const tile = match[0];
    const name = clean(tile.match(/<h2[^>]*class="[^"]*product-name-gtm[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)?.[1] ?? '');
    if (!name) continue;
    const image = htmlDecode(tile.match(/<img[^>]*class="tile-image"[^>]*src="([^"]+)"/i)?.[1] ?? '').replace(/&amp;/g, '&') || null;
    const brand = htmlDecode(tile.match(/data-brand="([^"]*)"/i)?.[1] ?? '').trim() || null;
    const current = number(tile.match(/<span class="sales">[\s\S]*?<span class="value" content="([^"]+)"/i)?.[1] ?? tile.match(/data-price="([^"]+)"/i)?.[1]);
    const base = number(tile.match(/<del>[\s\S]*?<span class="value" content="([^"]+)"/i)?.[1]);
    const unitText = clean(tile.match(/unit-price-per-unit grey">([\s\S]*?)<\/span>/i)?.[1] ?? '');
    const unitPrice = number(unitText);
    const unit = unitText.match(/\/[\s]*([^\s<]+)/)?.[1]?.toLowerCase() ?? null;
    const promoText = clean(tile.match(/tile-promo-callout red[\s\S]*?<div>([\s\S]*?)<\/div>/i)?.[1] ?? '');
    const dates = [...promoText.matchAll(/\d{2}\/\d{2}\/\d{2,4}/g)].map((d) => dateISO(d[0]));
    const crumbs = path.split('/');
    out.push({
      id, retailer_product_id: id, display_name: name, brand, packaging: null, thumbnail: image,
      category_id: path, category_name: crumbs.at(-1)?.replace(/-/g, ' ') ?? null,
      category_ids: crumbs.map((_, i) => crumbs.slice(0, i + 1).join('/')),
      unit_price: current, price_format: current == null ? null : `${current.toFixed(2).replace('.', ',')} €`,
      price_per_unit: unitPrice, price_per_unit_unit: unit, promo_name: promoText || (base && current && base > current ? 'Descuento' : null),
      promo_text: promoText || null, promo_price: current != null && base != null && base > current ? current : null,
      promo_base_price: base != null && current != null && base > current ? base : null,
      promo_start: dates[0] ?? null, promo_end: dates[1] ?? null, published: true,
      raw: { source: 'ahorramas-plp', path, productId: id, unitText, promoText }, synced_at: runStart,
    });
  }
  return out;
}

function nextPage(html) {
  const value = html.match(/class="btn[^"']*more[^"']*"[\s\S]{0,300}?data-url="([^"]+)"/i)?.[1];
  return value ? htmlDecode(value).replace(/&amp;/g, '&') : null;
}

async function upsert(table, rows) {
  for (const batch of chunks(rows, 200)) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch) });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const home = await request('/');
  const queue = [...categoryLinks(home).keys()];
  const seen = new Set(); const categories = new Map(); const products = new Map();
  while (queue.length && seen.size < MAX_CATEGORIES) {
    const path = queue.shift(); if (seen.has(path)) continue; seen.add(path);
    const html = await request(`/${path}/`);
    for (const [child, name] of categoryLinks(html)) if (!seen.has(child)) queue.push(child);
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const id = parts.slice(0, i + 1).join('/');
      categories.set(id, { id, name: i === parts.length - 1 ? (categoryLinks(home).get(path) ?? parts[i].replace(/-/g, ' ')) : parts[i].replace(/-/g, ' '), parent_id: i ? parts.slice(0, i).join('/') : null, product_count: 0, published: true, synced_at: runStart });
    }
    let page = html;
    for (;;) {
      for (const row of productTiles(page, path)) products.set(row.id, row);
      const more = nextPage(page); if (!more) break;
      page = await request(more); await sleep(100);
    }
    if (seen.size % 25 === 0) console.log(`[ahorramas] ${seen.size} categorías · ${products.size} productos`);
    await sleep(80);
  }
  const rows = [...products.values()];
  for (const row of rows) for (const id of row.category_ids) { const category = categories.get(id); if (category) category.product_count++; }
  console.log(`[ahorramas] ${rows.length} productos · ${categories.size} categorías · ${rows.filter((row) => row.promo_name).length} ofertas`);
  if (DRY) return;
  if (rows.length < MIN_PRODUCTS) throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible catálogo parcial`);
  await upsert('ahorramas_categories', [...categories.values()]);
  await upsert('ahorramas_products', rows);
  await markStale({ url: SUPABASE_URL, key: KEY, table: 'ahorramas_categories', runStart });
  await markStale({ url: SUPABASE_URL, key: KEY, table: 'ahorramas_products', runStart });
  await recordCatalogSync({ url: SUPABASE_URL, key: KEY, store: 'ahorramas' });
}
main().catch((error) => { console.error('[ahorramas] ERROR', error); process.exit(1); });
