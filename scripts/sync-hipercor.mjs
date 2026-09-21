#!/usr/bin/env node
// Catálogo público de Hipercor → Supabase.
//
// Hipercor sirve el listado SSR detrás de Akamai. La POC validó que el canal
// Chrome en GitHub Actions puede leerlo; no se usan sesiones autenticadas ni
// carritos. El surtido depende del centro de entrega: esta primera versión usa
// el centro público que entrega la web sin dirección de usuario.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, DRY_RUN=1, MIN_PRODUCTS=10000,
//      MAX_PAGES_PER_CATEGORY=N, PW_CHANNEL=chrome, HEADLESS=0, RESUME=1.
import { chromium } from 'playwright';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { markStale } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';

const BASE = 'https://www.hipercor.es';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY = process.env.DRY_RUN === '1';
const MIN_PRODUCTS = positiveInteger(process.env.MIN_PRODUCTS, 10_000);
const MAX_PAGES_PER_CATEGORY = positiveInteger(process.env.MAX_PAGES_PER_CATEGORY, Infinity);
const NAV_TIMEOUT = positiveInteger(process.env.NAV_TIMEOUT_MS, 45_000);
const PAGE_DELAY_MIN = nonNegativeInteger(process.env.PAGE_DELAY_MIN_MS, 1_500);
const PAGE_DELAY_MAX = Math.max(PAGE_DELAY_MIN, nonNegativeInteger(process.env.PAGE_DELAY_MAX_MS, 3_000));
const CATEGORY_DELAY = nonNegativeInteger(process.env.CATEGORY_DELAY_MS, 15_000);
const RETRY_DELAY = positiveInteger(process.env.RETRY_DELAY_MS, 5_000);
const WAF_COOLDOWN = positiveInteger(process.env.WAF_COOLDOWN_MS, 90_000);
const MAX_ATTEMPTS = positiveInteger(process.env.MAX_ATTEMPTS, 3);
const CHECKPOINT_PATH = process.env.HIPERCOR_CHECKPOINT || 'scripts/logs/hipercor-sync-checkpoint.json';
const CHECKPOINT_MAX_AGE_HOURS = positiveInteger(process.env.HIPERCOR_CHECKPOINT_MAX_AGE_HOURS, 24);
const RESUME = process.env.RESUME === '1';
const runStart = new Date().toISOString();

// Cada raíz ya incluye todos sus descendientes. Así evitamos recorrer las
// mismas referencias desde cada subcategoría y mantenemos el crawl estable.
const ROOT_CATEGORIES = [
  { id: 'alimentacion', path: 'alimentacion', name: 'Alimentación' },
  // Esta familia usa una ruta de listado distinta de su landing editorial.
  { id: 'desayunos-dulces-y-pan', path: 'desayunos-dulces-y-pan/desayunos-dulces-y-pan', name: 'Desayunos, dulces y pan' },
  { id: 'lacteos', path: 'lacteos', name: 'Lácteos' },
  { id: 'congelados', path: 'congelados', name: 'Congelados' },
  { id: 'bebidas', path: 'bebidas', name: 'Bebidas' },
  { id: 'frescos', path: 'frescos', name: 'Frescos' },
  { id: 'bebes', path: 'bebes', name: 'Bebés' },
  { id: 'cuidado-personal-y-belleza', path: 'cuidado-personal-y-belleza', name: 'Cuidado personal y belleza' },
  { id: 'drogueria-y-limpieza', path: 'drogueria-y-limpieza', name: 'Droguería y limpieza' },
  { id: 'mascotas', path: 'mascotas', name: 'Mascotas' },
];
const CHECKPOINT_VERSION = 1;
const CHECKPOINT_SIGNATURE = ROOT_CATEGORIES.map(({ id, path }) => `${id}:${path}`).join('|');

if (!DRY && (!SUPABASE_URL || !KEY)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, index * size + size));

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function randomInteger(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function politeDelay() {
  const delay = randomInteger(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
  if (delay > 0) await sleep(delay);
}

class WafBlockError extends Error {
  constructor(label, { status, title, reference, url, retryAfterMs }) {
    const details = [
      status ? `HTTP ${status}` : null,
      title || null,
      reference || null,
      url || null,
    ].filter(Boolean).join(' · ');
    super(`Akamai/WAF bloqueo ${label}${details ? `: ${details}` : ''}`);
    this.name = 'WafBlockError';
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : 0;
}

function pageUrl(slug, pageNumber) {
  return `${BASE}/supermercado/${slug}/${pageNumber}/`;
}

function parseEuro(value) {
  const match = String(value || '').match(/\d+(?:[.,]\d{1,2})?/);
  return match ? Number(match[0].replace(',', '.')) : null;
}

function parseUnit(value) {
  const text = String(value || '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  const price = parseEuro(text);
  const unit = text.match(/\/\s*(.+)$/)?.[1]?.replace(/[.)]+$/, '').trim() || null;
  return { price, unit };
}

function chromeUserAgent(version) {
  const platform = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}

async function assertCatalogPage(page, response, label, allowEmpty = false) {
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText().catch(() => '');
  const status = response?.status?.() || null;
  if (status === 403 || status === 429 || /request could not be satisfied|access denied|human verification/i.test(`${title}\n${body}`)) {
    const reference = body.match(/Reference\s*#[^\s<]+/i)?.[0] || null;
    throw new WafBlockError(label, {
      status,
      title: title || 'respuesta sin título',
      reference,
      url: page.url(),
      retryAfterMs: parseRetryAfter(response?.headers?.()['retry-after']),
    });
  }
  try {
    await page.locator('li[data-type="item"][data-pagination]').first().waitFor({ state: 'attached', timeout: NAV_TIMEOUT });
    return true;
  } catch {
    if (allowEmpty) return false;
    throw new Error(`no se encontró el listado de productos en ${label}: ${page.url()} (${title || 'sin título'})`);
  }
}

async function readPage(page, slug, pageNumber) {
  const url = pageUrl(slug, pageNumber);
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      const hasProducts = await assertCatalogPage(page, response, `${slug} página ${pageNumber}`, pageNumber > 1);
      if (!hasProducts) return { products: [], centerId: null, declaredCount: null, totalPages: null, empty: true };
      const result = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const declared = text.match(/\(\s*([\d.]+)\s*\)/)?.[1];
        const pagination = [...document.querySelectorAll('[data-pagination]')]
          .map((element) => { try { return JSON.parse(element.getAttribute('data-pagination') || ''); } catch { return null; } })
          .find((entry) => Number.isInteger(entry?.totalPages));
        const dataLayer = [...document.scripts].map((script) => script.textContent || '').find((script) => script.includes('dataLayer =')) || '';
        const centerId = dataLayer.match(/"store_id"\s*:\s*"([^"]+)"/)?.[1] || null;
        const products = [...document.querySelectorAll('li[data-type="item"][data-pagination]')].map((card) => {
          const link = card.querySelector('a[href*="/supermercado/B"]');
          const href = link?.getAttribute('href') || null;
          const promotion = card.querySelector('.food-promotional-actions__content__title');
          return {
            id: href?.match(/\/supermercado\/(B\d+)-/)?.[1] || null,
            url: href ? new URL(href, location.origin).href : null,
            name: card.querySelector('.food-product-preview-responsive__description')?.textContent?.trim() || null,
            image: card.querySelector('img')?.getAttribute('src') || null,
            packaging: card.querySelector('.food-product-preview-responsive__sale_type')?.textContent?.replace(/\s*\|\s*/, ' | ').trim() || null,
            finalPriceText: card.querySelector('.food-prices__offer')?.textContent?.trim() || card.querySelector('.food-prices__price')?.textContent?.trim() || null,
            regularPriceText: card.querySelector('.food-prices__price--original')?.textContent?.trim() || null,
            pricePerUnitText: card.querySelector('.food-prices__measurement-unit')?.textContent?.trim() || null,
            promotionText: promotion?.textContent?.trim() || null,
            available: !!card.querySelector('button[class*="--add"]'),
            isNew: /\bnovedad\b/i.test(card.innerText),
          };
        }).filter((product) => product.id && product.name);
        return { products, centerId, declaredCount: declared ? Number(declared.replace(/\./g, '')) : null, totalPages: pagination?.totalPages || null, empty: false };
      });
      await politeDelay();
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        const blocked = error instanceof WafBlockError;
        const waitMs = blocked ? Math.max(WAF_COOLDOWN, error.retryAfterMs || 0) : RETRY_DELAY * attempt;
        console.warn(`[hipercor] ${error.message} · reintento ${attempt + 1}/${MAX_ATTEMPTS} en ${Math.round(waitMs / 1_000)} s`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function loadCheckpoint() {
  let checkpoint;
  try {
    checkpoint = JSON.parse(await readFile(CHECKPOINT_PATH, 'utf8'));
  } catch (error) {
    throw new Error(`no se pudo cargar el checkpoint ${CHECKPOINT_PATH}: ${error.message}`);
  }
  if (checkpoint.version !== CHECKPOINT_VERSION || checkpoint.signature !== CHECKPOINT_SIGNATURE) {
    throw new Error(`checkpoint incompatible: elimina ${CHECKPOINT_PATH} y comienza de nuevo`);
  }
  const nextCategoryIndex = Number(checkpoint.nextCategoryIndex);
  if (!Number.isInteger(nextCategoryIndex) || nextCategoryIndex < 0 || nextCategoryIndex > ROOT_CATEGORIES.length) {
    throw new Error(`checkpoint inválido: nextCategoryIndex=${checkpoint.nextCategoryIndex}`);
  }
  const products = Array.isArray(checkpoint.products) ? checkpoint.products : [];
  const savedAt = Date.parse(checkpoint.savedAt);
  const ageMs = Date.now() - savedAt;
  if (!Number.isFinite(savedAt) || ageMs < 0 || ageMs > CHECKPOINT_MAX_AGE_HOURS * 60 * 60 * 1_000) {
    throw new Error(`checkpoint caducado o sin fecha válida: elimina ${CHECKPOINT_PATH} y comienza de nuevo`);
  }
  return { nextCategoryIndex, products };
}

async function saveCheckpoint(nextCategoryIndex, products) {
  await mkdir(dirname(CHECKPOINT_PATH), { recursive: true });
  const temporary = `${CHECKPOINT_PATH}.tmp`;
  await writeFile(temporary, JSON.stringify({
    version: CHECKPOINT_VERSION,
    signature: CHECKPOINT_SIGNATURE,
    savedAt: new Date().toISOString(),
    nextCategoryIndex,
    products: [...products.values()],
  }));
  await rename(temporary, CHECKPOINT_PATH);
}

async function removeCheckpoint() {
  await unlink(CHECKPOINT_PATH).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });
}

function normalize(product, slug, categoryName, centerId) {
  const finalPrice = parseEuro(product.finalPriceText);
  const regularPrice = parseEuro(product.regularPriceText);
  const unit = parseUnit(product.pricePerUnitText);
  const promoBasePrice = regularPrice != null && finalPrice != null && regularPrice > finalPrice ? regularPrice : null;
  const promoText = product.promotionText || null;
  return {
    id: product.id,
    retailer_product_id: product.id,
    display_name: product.name,
    packaging: product.packaging || null,
    thumbnail: product.image ? new URL(product.image, BASE).href : null,
    category_id: slug,
    category_name: categoryName,
    category_ids: [slug],
    unit_price: finalPrice,
    price_format: product.finalPriceText || null,
    price_per_unit: unit.price,
    price_per_unit_unit: unit.unit,
    promo_name: promoBasePrice != null ? 'Descuento' : promoText,
    promo_text: promoText,
    promo_price: promoBasePrice != null ? finalPrice : null,
    promo_base_price: promoBasePrice,
    available: product.available,
    is_new: product.isNew,
    published: true,
    raw: { source: product.url, centerId, regularPriceText: product.regularPriceText, pricePerUnitText: product.pricePerUnitText },
    synced_at: runStart,
  };
}

async function upsert(table, rows) {
  for (const batch of chunks(rows, 100)) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`${table}: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  console.log(
    `[hipercor] inicio ${runStart}${DRY ? ' (DRY RUN)' : ''} · pausa ${PAGE_DELAY_MIN}-${PAGE_DELAY_MAX} ms/página · `
    + `${CATEGORY_DELAY} ms/categoría · checkpoint=${CHECKPOINT_PATH}`,
  );
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: process.env.HEADLESS !== '0', args: ['--disable-blink-features=AutomationControlled'] });
  try {
    const context = await browser.newContext({ locale: 'es-ES', userAgent: chromeUserAgent(browser.version()) });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    const products = new Map();
    const centers = new Set();
    let startIndex = 0;
    if (RESUME) {
      const checkpoint = await loadCheckpoint();
      startIndex = checkpoint.nextCategoryIndex;
      for (const row of checkpoint.products) {
        if (row?.id) products.set(row.id, row);
        if (row?.raw?.centerId) centers.add(row.raw.centerId);
      }
      const resumeAt = startIndex < ROOT_CATEGORIES.length ? `${startIndex + 1}/${ROOT_CATEGORIES.length}` : 'publicación final';
      console.log(`[hipercor] reanudando en ${resumeAt} · ${products.size} productos guardados`);
    } else {
      await removeCheckpoint();
    }
    for (let categoryIndex = startIndex; categoryIndex < ROOT_CATEGORIES.length; categoryIndex++) {
      const category = ROOT_CATEGORIES[categoryIndex];
      const { id, path, name } = category;
      const first = await readPage(page, path, 1);
      const pages = Math.min(first.totalPages || 1, MAX_PAGES_PER_CATEGORY);
      for (const result of [first]) {
        if (result.centerId) centers.add(result.centerId);
        for (const product of result.products) products.set(product.id, normalize(product, id, name, result.centerId));
      }
      for (let number = 2; number <= pages; number++) {
        const result = await readPage(page, path, number);
        if (result.empty) {
          if (number !== pages) throw new Error(`${name}: página ${number}/${pages} sin productos; posible catálogo parcial`);
          console.warn(`[hipercor] ${name}: Hipercor anuncia una última página vacía (${number}); se omite`);
          break;
        }
        if (result.centerId) centers.add(result.centerId);
        for (const product of result.products) products.set(product.id, normalize(product, id, name, result.centerId));
      }
      console.log(`[hipercor] ${name}: ${pages} páginas · ${products.size} productos únicos`);
      await saveCheckpoint(categoryIndex + 1, products);
      if (categoryIndex + 1 < ROOT_CATEGORIES.length && CATEGORY_DELAY > 0) await sleep(CATEGORY_DELAY);
    }
    const rows = [...products.values()];
    for (const row of rows) {
      row.published = true;
      row.synced_at = runStart;
    }
    const categories = ROOT_CATEGORIES.map(({ id, name }) => ({
      id,
      name,
      parent_id: null,
      product_count: rows.filter((row) => row.category_id === id).length,
      published: true,
      synced_at: runStart,
    }));
    console.log(`[hipercor] ${rows.length} productos · ${categories.length} categorías · centros ${[...centers].join(', ') || 'no observado'} · ${rows.filter((row) => row.promo_name).length} ofertas`);
    if (rows.length < MIN_PRODUCTS) throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible catálogo parcial`);
    if (DRY) {
      await removeCheckpoint();
      return;
    }
    await upsert('hipercor_categories', categories);
    await upsert('hipercor_products', rows);
    await markStale({ url: SUPABASE_URL, key: KEY, table: 'hipercor_categories', runStart });
    await markStale({ url: SUPABASE_URL, key: KEY, table: 'hipercor_products', runStart });
    await recordCatalogSync({ url: SUPABASE_URL, key: KEY, store: 'hipercor' });
    await removeCheckpoint();
    console.log('[hipercor] OK');
  } finally {
    await browser.close();
  }
}

main().catch((error) => { console.error(`[hipercor] ERROR: ${error.message}`); process.exit(1); });
