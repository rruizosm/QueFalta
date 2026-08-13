#!/usr/bin/env node

import { chromium } from 'playwright';

const BASE = 'https://www.compraonline.alcampo.es';
const CATEGORY_SITEMAP = 'https://www.compraonline.alcampo.es/sitemaps/sitemap-categories-part1.xml';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const WAIT_MS = Number(process.env.WAIT_MS || 90000);
const DELAY_MS = Number(process.env.DELAY_MS || 4000);
const LIMIT = Number(process.env.PILOT_CATEGORIES || 20);
const PROFILE_DIR = process.env.ALCAMPO_PROFILE || 'C:\\tmp\\alcampo-playwright-profile';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractObject(html, key) {
  const marker = `"${key}"`;
  const markerAt = html.indexOf(marker);
  if (markerAt < 0) return null;
  const start = html.indexOf('{', markerAt + marker.length);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  return null;
}

function countProducts(html) {
  const blob = extractObject(html, 'productEntities');
  if (!blob) return 0;
  try { return Object.keys(JSON.parse(blob)).length; } catch { return 0; }
}

async function categoryUrls() {
  const res = await fetch(CATEGORY_SITEMAP, { headers: { 'User-Agent': UA, Accept: 'application/xml' } });
  if (!res.ok) throw new Error(`sitemap HTTP ${res.status}`);
  const xml = await res.text();
  const all = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  const food = all.filter((url) => {
    if (!url.includes('/categories/')) return false;
    const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
    return ['frescos', 'alimentación', 'alimentacion', 'leche', 'congelados', 'bebidas', 'desayuno', 'comida preparada', 'supermercado ecológico', 'supermercado ecologico', 'sin gluten', 'veganos'].some((term) => path.includes(term));
  });
  return [...new Set(food)].slice(0, LIMIT);
}

async function waitForVerification(page) {
  const title = await page.title();
  if (!/human verification|just a moment|access denied/i.test(title)) return true;
  console.log(`[alcampo-pilot] verificación detectada; resuélvela en el navegador (esperando ${WAIT_MS / 1000}s)`);
  try {
    await page.waitForFunction(() => !/human verification|just a moment|access denied/i.test(document.title), { timeout: WAIT_MS, polling: 500 });
    return true;
  } catch {
    return false;
  }
}

const urls = await categoryUrls();
console.log(`[alcampo-pilot] categorías seleccionadas: ${urls.length}`);
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  headless: false,
  viewport: { width: 1365, height: 900 },
  userAgent: UA,
  locale: 'es-ES',
  extraHTTPHeaders: { 'Accept-Language': 'es-ES,es;q=0.9' },
});

try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto(`${BASE}/categories/alimentación/OCC10`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.log(`[alcampo-pilot] portada: ${e.message}`));
  if (!await waitForVerification(page)) throw new Error('la verificación no se completó dentro del tiempo disponible');

  const results = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      const verified = await waitForVerification(page);
      const html = verified ? await page.content() : '';
      const products = countProducts(html);
      const result = { index: i + 1, status: response?.status() ?? null, products, url };
      results.push(result);
      console.log(JSON.stringify(result));
      if (!verified) break;
    } catch (e) {
      const result = { index: i + 1, status: null, products: 0, error: e.message, url };
      results.push(result);
      console.log(JSON.stringify(result));
    }
    if (i < urls.length - 1) await sleep(DELAY_MS);
  }

  const valid = results.filter((r) => r.products > 0).length;
  const total = results.reduce((sum, r) => sum + r.products, 0);
  console.log(JSON.stringify({ summary: true, attempted: results.length, valid, totalProducts: total, delayMs: DELAY_MS }));
} finally {
  await context.close();
}
