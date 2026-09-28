#!/usr/bin/env node
// Catálogo público de Hipercor → Supabase, resuelto por centro de preparación.
// 1) CP público → page.store_id; 2) una descarga por centro único; 3) ficha
// común + precio/surtido por centro. No usa cuentas, direcciones ni carritos.
import { chromium } from 'playwright';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { markStale } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';
import {
  assertHipercorSharedCenterParity,
  groupHipercorPostalMappings,
  hipercorCatalogFingerprint,
  hipercorCheckpointPath,
  hipercorPostalPlanSignature,
  hipercorProvinceDiscoveryPostalCodes,
  parseHipercorPostalCodes,
} from './lib/hipercor.mjs';

const BASE = 'https://www.hipercor.es';
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY = process.env.DRY_RUN === '1';
const MIN_PRODUCTS = positiveInteger(process.env.MIN_PRODUCTS, 10_000);
const MIN_CATEGORY_COVERAGE = ratio(process.env.HIPERCOR_MIN_CATEGORY_COVERAGE, 0.85);
const MAX_PAGES_PER_CATEGORY = positiveInteger(process.env.MAX_PAGES_PER_CATEGORY, Infinity);
const MAX_POSTAL_CODES = positiveInteger(process.env.HIPERCOR_MAX_POSTAL_CODES, Infinity);
const MAX_CENTERS = positiveInteger(process.env.HIPERCOR_MAX_CENTERS, Infinity);
const NAV_TIMEOUT = positiveInteger(process.env.NAV_TIMEOUT_MS, 45_000);
const PAGE_DELAY_MIN = nonNegativeInteger(process.env.PAGE_DELAY_MIN_MS, 1_500);
const PAGE_DELAY_MAX = Math.max(PAGE_DELAY_MIN, nonNegativeInteger(process.env.PAGE_DELAY_MAX_MS, 3_000));
const CATEGORY_DELAY = nonNegativeInteger(process.env.CATEGORY_DELAY_MS, 15_000);
const LOCATION_DELAY = nonNegativeInteger(process.env.HIPERCOR_LOCATION_DELAY_MS, 2_000);
const RETRY_DELAY = positiveInteger(process.env.RETRY_DELAY_MS, 5_000);
const WAF_COOLDOWN = positiveInteger(process.env.WAF_COOLDOWN_MS, 90_000);
const MAX_ATTEMPTS = positiveInteger(process.env.MAX_ATTEMPTS, 3);
const CHECKPOINT_BASE = process.env.HIPERCOR_CHECKPOINT || 'scripts/logs/hipercor-sync-checkpoint.json';
const LOCATION_CHECKPOINT = process.env.HIPERCOR_LOCATION_CHECKPOINT || 'scripts/logs/hipercor-location-checkpoint.json';
const LOCATION_REPORT = process.env.HIPERCOR_LOCATION_REPORT || 'scripts/logs/hipercor-location-report.json';
const CHECKPOINT_MAX_AGE_HOURS = positiveInteger(process.env.HIPERCOR_CHECKPOINT_MAX_AGE_HOURS, 168);
const RESUME = process.env.RESUME === '1';
const LOCATION_ONLY = process.env.HIPERCOR_LOCATION_ONLY === '1';
const DISCOVER_PROVINCES = process.env.HIPERCOR_DISCOVER_PROVINCES === '1';
const REQUIRE_SHARED_CENTER_PARITY = process.env.HIPERCOR_REQUIRE_SHARED_CENTER_PARITY !== '0';
const LEGACY_CENTER_ID = String(process.env.HIPERCOR_LEGACY_CENTER_ID || '010130');

const ROOT_CATEGORIES = [
  { id: 'alimentacion', path: 'alimentacion', name: 'Alimentación' },
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
const CHECKPOINT_VERSION = 2;
const ROOT_SIGNATURE = ROOT_CATEGORIES.map(({ id, path }) => `${id}:${path}`).join('|');

if (!DRY && (!SUPABASE_URL || !KEY)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
if (LOCATION_ONLY && !process.env.HIPERCOR_POSTAL_CODES && !process.env.HIPERCOR_POSTAL_CODES_FILE && !DISCOVER_PROVINCES) {
  throw new Error('HIPERCOR_LOCATION_ONLY requiere HIPERCOR_POSTAL_CODES, HIPERCOR_POSTAL_CODES_FILE o HIPERCOR_DISCOVER_PROVINCES=1');
}

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
function ratio(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback;
}
function randomInteger(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
async function politeDelay() {
  const delay = randomInteger(PAGE_DELAY_MIN, PAGE_DELAY_MAX);
  if (delay > 0) await sleep(delay);
}

class WafBlockError extends Error {
  constructor(label, { status, title, reference, url, retryAfterMs }) {
    const details = [status ? `HTTP ${status}` : null, title || null, reference || null, url || null].filter(Boolean).join(' · ');
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
function pageUrl(slug, pageNumber) { return `${BASE}/supermercado/${slug}/${pageNumber}/`; }
function parseEuro(value) {
  const match = String(value || '').match(/\d+(?:[.,]\d{1,2})?/);
  return match ? Number(match[0].replace(',', '.')) : null;
}
function parseUnit(value) {
  const text = String(value || '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  return { price: parseEuro(text), unit: text.match(/\/\s*(.+)$/)?.[1]?.replace(/[.)]+$/, '').trim() || null };
}
function chromeUserAgent(version) {
  const platform = process.platform === 'darwin'
    ? 'Macintosh; Intel Mac OS X 10_15_7'
    : process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
}
function newContext(browser) { return browser.newContext({ locale: 'es-ES', userAgent: chromeUserAgent(browser.version()) }); }

async function assertCatalogPage(page, response, label, allowEmpty = false) {
  const title = await page.title().catch(() => '');
  const body = await page.locator('body').innerText().catch(() => '');
  const status = response?.status?.() || null;
  if (status === 403 || status === 429 || /request could not be satisfied|access denied|human verification/i.test(`${title}\n${body}`)) {
    throw new WafBlockError(label, {
      status,
      title: title || 'respuesta sin título',
      reference: body.match(/Reference\s*#[^\s<]+/i)?.[0] || null,
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

async function readPage(page, slug, pageNumber, allowEmpty = false) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await page.goto(pageUrl(slug, pageNumber), { waitUntil: 'domcontentloaded' });
      const hasProducts = await assertCatalogPage(page, response, `${slug} página ${pageNumber}`, allowEmpty || pageNumber > 1);
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
          return {
            id: href?.match(/\/supermercado\/(B\d+)-/)?.[1] || null,
            url: href ? new URL(href, location.origin).href : null,
            name: card.querySelector('.food-product-preview-responsive__description')?.textContent?.trim() || null,
            image: card.querySelector('img')?.getAttribute('src') || null,
            packaging: card.querySelector('.food-product-preview-responsive__sale_type')?.textContent?.replace(/\s*\|\s*/, ' | ').trim() || null,
            finalPriceText: card.querySelector('.food-prices__offer')?.textContent?.trim() || card.querySelector('.food-prices__price')?.textContent?.trim() || null,
            regularPriceText: card.querySelector('.food-prices__price--original')?.textContent?.trim() || null,
            pricePerUnitText: card.querySelector('.food-prices__measurement-unit')?.textContent?.trim() || null,
            promotionText: card.querySelector('.food-promotional-actions__content__title')?.textContent?.trim() || null,
            available: !!card.querySelector('button[class*="--add"]'),
            isNew: /\bnovedad\b/i.test(card.innerText),
          };
        }).filter((product) => product.id && product.name);
        return {
          products,
          centerId,
          declaredCount: declared ? Number(declared.replace(/\./g, '')) : null,
          totalPages: pagination?.totalPages || null,
          empty: false,
        };
      });
      await politeDelay();
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        const waitMs = error instanceof WafBlockError
          ? Math.max(WAF_COOLDOWN, error.retryAfterMs || 0)
          : RETRY_DELAY * attempt;
        console.warn(`[hipercor] ${error.message} · reintento ${attempt + 1}/${MAX_ATTEMPTS} en ${Math.round(waitMs / 1_000)} s`);
        await sleep(waitMs);
      }
    }
  }
  throw lastError;
}

async function chooseHomeDelivery(page, postalCode) {
  const response = await page.goto(pageUrl('alimentacion', 1), { waitUntil: 'domcontentloaded' });
  await assertCatalogPage(page, response, `selector de entrega ${postalCode}`);
  const change = page.getByRole('button', { name: /cambiar entrega/i }).first();
  await change.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  await change.click();
  const choose = page.getByRole('button', { name: /^elegir$/i }).first();
  await choose.waitFor({ state: 'visible', timeout: NAV_TIMEOUT });
  await choose.click();
  let input = page.locator('input[placeholder*="28045"]').first();
  if (!await input.count()) input = page.getByRole('textbox').last();
  await input.fill(postalCode);
  await page.getByRole('button', { name: /^enviar$/i }).last().click();
  try {
    await page.waitForFunction((value) => {
      const text = (document.body.innerText || '').replace(/\s+/g, ' ');
      return text.includes(`Envío a ${value}`);
    }, postalCode, { timeout: NAV_TIMEOUT });
  } catch {
    const body = await page.locator('body').innerText().catch(() => '');
    if (/no (?:realizamos|podemos).*entrega|sin cobertura|no est[aá] disponible|c[oó]digo postal.*(?:incorrecto|inv[aá]lido)/i.test(body)) {
      return { supported: false, failureReason: body.replace(/\s+/g, ' ').slice(0, 500) };
    }
    throw new Error(`${postalCode}: el selector no confirmó la modalidad Envío`);
  }
  const sample = await readPage(page, 'alimentacion', 1, true);
  if (sample.empty || !sample.centerId) {
    return { supported: false, emptyCatalog: true, failureReason: 'Hipercor aceptó el CP pero el catálogo no expuso page.store_id' };
  }
  if (!/^\d{6}$/.test(sample.centerId)) throw new Error(`${postalCode}: store_id inválido: ${sample.centerId}`);
  const cookies = await page.context().cookies();
  const cookieValue = (name) => cookies.find((cookie) => cookie.name === name)?.value ?? null;
  return {
    supported: true,
    centerId: sample.centerId,
    sample,
    cookies: { ff_postal_code: cookieValue('ff_postal_code'), ff_food_center: cookieValue('ff_food_center') },
  };
}

async function resolvePostalCode(browser, postalCode, syncedAt) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const context = await newContext(browser);
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    try {
      const resolved = await chooseHomeDelivery(page, postalCode);
      if (!resolved.supported) {
        return {
          postal_code: postalCode,
          delivery_type: 'home_delivery',
          center_id: null,
          supported: false,
          resolution_status: resolved.emptyCatalog ? 'empty_catalog' : 'unsupported',
          failure_reason: resolved.failureReason,
          published: true,
          raw: {},
          resolved_at: syncedAt,
          synced_at: syncedAt,
        };
      }
      return {
        postal_code: postalCode,
        delivery_type: 'home_delivery',
        center_id: resolved.centerId,
        supported: true,
        resolution_status: 'resolved',
        failure_reason: null,
        published: true,
        raw: {
          sampleFingerprint: hipercorCatalogFingerprint(resolved.sample),
          sampleDeclaredCount: resolved.sample.declaredCount,
          sampleProducts: resolved.sample.products.length,
          selectorCenterId: resolved.cookies.ff_food_center,
          postalCodeCookieMatched: resolved.cookies.ff_postal_code === postalCode,
        },
        resolved_at: syncedAt,
        synced_at: syncedAt,
      };
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        const waitMs = error instanceof WafBlockError
          ? Math.max(WAF_COOLDOWN, error.retryAfterMs || 0)
          : RETRY_DELAY * attempt;
        console.warn(`[hipercor] CP ${postalCode}: ${error.message} · reintento ${attempt + 1}/${MAX_ATTEMPTS} en ${Math.round(waitMs / 1_000)} s`);
        await sleep(waitMs);
      }
    } finally {
      await context.close();
    }
  }
  return {
    postal_code: postalCode,
    delivery_type: 'home_delivery',
    center_id: null,
    supported: false,
    resolution_status: 'error',
    failure_reason: lastError?.message || 'error de resolución desconocido',
    published: true,
    raw: { errorName: lastError?.name || 'Error' },
    resolved_at: syncedAt,
    synced_at: syncedAt,
  };
}

async function postalCodePlan() {
  const inline = parseHipercorPostalCodes(process.env.HIPERCOR_POSTAL_CODES || '');
  const fromFile = process.env.HIPERCOR_POSTAL_CODES_FILE
    ? parseHipercorPostalCodes(await readFile(process.env.HIPERCOR_POSTAL_CODES_FILE, 'utf8'))
    : [];
  const discovered = DISCOVER_PROVINCES ? hipercorProvinceDiscoveryPostalCodes() : [];
  return [...new Set([...inline, ...fromFile, ...discovered])].slice(0, MAX_POSTAL_CODES);
}

async function loadJsonCheckpoint(path, expectedSignature) {
  let checkpoint;
  try { checkpoint = JSON.parse(await readFile(path, 'utf8')); } catch (error) {
    throw new Error(`no se pudo cargar el checkpoint ${path}: ${error.message}`);
  }
  if (checkpoint.version !== CHECKPOINT_VERSION || checkpoint.signature !== expectedSignature) {
    throw new Error(`checkpoint incompatible: elimina ${path} y comienza de nuevo`);
  }
  const savedAt = Date.parse(checkpoint.savedAt);
  const ageMs = Date.now() - savedAt;
  if (!Number.isFinite(savedAt) || ageMs < 0 || ageMs > CHECKPOINT_MAX_AGE_HOURS * 60 * 60 * 1_000) {
    throw new Error(`checkpoint caducado o sin fecha válida: elimina ${path} y comienza de nuevo`);
  }
  return checkpoint;
}
async function saveJsonCheckpoint(path, payload) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, JSON.stringify({ ...payload, version: CHECKPOINT_VERSION, savedAt: new Date().toISOString() }));
  await rename(temporary, path);
}
async function removeCheckpoint(path) {
  await unlink(path).catch((error) => { if (error?.code !== 'ENOENT') throw error; });
}
async function writeLocationReport(mappings, groups) {
  await mkdir(dirname(LOCATION_REPORT), { recursive: true });
  const temporary = `${LOCATION_REPORT}.tmp`;
  await writeFile(temporary, JSON.stringify({
    generatedAt: new Date().toISOString(),
    deliveryType: 'home_delivery',
    parityRequired: REQUIRE_SHARED_CENTER_PARITY,
    postalCodes: mappings,
    centers: groups,
  }, null, 2));
  await rename(temporary, LOCATION_REPORT);
  console.log(`[hipercor] informe postal: ${LOCATION_REPORT}`);
}

async function resolvePostalCodes(browser, postalCodes, syncedAt) {
  const signature = hipercorPostalPlanSignature(postalCodes);
  let nextPostalIndex = 0;
  let mappings = [];
  if (RESUME) {
    const checkpoint = await loadJsonCheckpoint(LOCATION_CHECKPOINT, signature);
    nextPostalIndex = Number(checkpoint.nextPostalIndex);
    mappings = Array.isArray(checkpoint.mappings) ? checkpoint.mappings : [];
    if (!Number.isInteger(nextPostalIndex) || nextPostalIndex < 0 || nextPostalIndex > postalCodes.length) {
      throw new Error(`checkpoint postal inválido: nextPostalIndex=${checkpoint.nextPostalIndex}`);
    }
    console.log(`[hipercor] reanudando resolución postal ${nextPostalIndex}/${postalCodes.length}`);
  } else await removeCheckpoint(LOCATION_CHECKPOINT);
  for (let index = nextPostalIndex; index < postalCodes.length; index++) {
    const mapping = await resolvePostalCode(browser, postalCodes[index], syncedAt);
    mappings.push(mapping);
    console.log(`[hipercor] CP ${mapping.postal_code}: ${mapping.resolution_status}${mapping.center_id ? ` → centro ${mapping.center_id}` : ''}`);
    await saveJsonCheckpoint(LOCATION_CHECKPOINT, { signature, nextPostalIndex: index + 1, mappings });
    if (index + 1 < postalCodes.length && LOCATION_DELAY > 0) await sleep(LOCATION_DELAY);
  }
  return mappings;
}

function normalize(product, slug, categoryName, centerId, postalCode, syncedAt) {
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
    raw: { source: product.url, centerId, postalCode, regularPriceText: product.regularPriceText, pricePerUnitText: product.pricePerUnitText },
    synced_at: syncedAt,
  };
}
function assertExpectedCenter(result, expectedCenterId, label) {
  if (result.centerId !== expectedCenterId) {
    throw new Error(`${label}: cambio de centro durante el crawl (${expectedCenterId} → ${result.centerId || 'nulo'})`);
  }
}
function mergeProduct(products, row) {
  const previous = products.get(row.id);
  if (previous) row.category_ids = [...new Set([...previous.category_ids, ...row.category_ids])];
  products.set(row.id, row);
}

async function crawlCenter(browser, target, syncedAt) {
  const checkpointPath = hipercorCheckpointPath(CHECKPOINT_BASE, target.centerId);
  const signature = `${ROOT_SIGNATURE}|${target.centerId}|${target.representativePostalCode || 'default'}`;
  const context = await newContext(browser);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  const products = new Map();
  const validations = [];
  let startIndex = 0;
  let prefetched = null;
  try {
    if (target.representativePostalCode) {
      const selected = await chooseHomeDelivery(page, target.representativePostalCode);
      if (!selected.supported) throw new Error(`${target.representativePostalCode}: dejó de tener catálogo durante el crawl`);
      if (selected.centerId !== target.centerId) throw new Error(`${target.representativePostalCode}: cambió de centro ${target.centerId} → ${selected.centerId}`);
      prefetched = selected.sample;
    }
    if (RESUME) {
      const checkpoint = await loadJsonCheckpoint(checkpointPath, signature);
      startIndex = Number(checkpoint.nextCategoryIndex);
      if (!Number.isInteger(startIndex) || startIndex < 0 || startIndex > ROOT_CATEGORIES.length) {
        throw new Error(`checkpoint inválido: nextCategoryIndex=${checkpoint.nextCategoryIndex}`);
      }
      for (const row of Array.isArray(checkpoint.products) ? checkpoint.products : []) if (row?.id) products.set(row.id, row);
      validations.push(...(Array.isArray(checkpoint.validations) ? checkpoint.validations : []));
      console.log(`[hipercor] centro ${target.centerId}: reanudando ${startIndex}/${ROOT_CATEGORIES.length} · ${products.size} productos`);
    } else await removeCheckpoint(checkpointPath);

    for (let categoryIndex = startIndex; categoryIndex < ROOT_CATEGORIES.length; categoryIndex++) {
      const category = ROOT_CATEGORIES[categoryIndex];
      const first = categoryIndex === 0 && prefetched ? prefetched : await readPage(page, category.path, 1);
      assertExpectedCenter(first, target.centerId, `${category.name} página 1`);
      const pages = Math.min(first.totalPages || 1, MAX_PAGES_PER_CATEGORY);
      const categoryProducts = new Set();
      const ingest = (result) => {
        assertExpectedCenter(result, target.centerId, category.name);
        for (const product of result.products) {
          categoryProducts.add(product.id);
          mergeProduct(products, normalize(product, category.id, category.name, target.centerId, target.representativePostalCode, syncedAt));
        }
      };
      ingest(first);
      for (let number = 2; number <= pages; number++) {
        const result = await readPage(page, category.path, number);
        if (result.empty) {
          if (number !== pages) throw new Error(`${category.name}: página ${number}/${pages} sin productos; posible catálogo parcial`);
          console.warn(`[hipercor] ${category.name}: última página vacía (${number}); se omite`);
          break;
        }
        ingest(result);
      }
      const validation = { categoryId: category.id, declaredCount: first.declaredCount, observedCount: categoryProducts.size, pages };
      if (!Number.isFinite(MAX_PAGES_PER_CATEGORY) && first.declaredCount != null) {
        const minimum = Math.ceil(first.declaredCount * MIN_CATEGORY_COVERAGE);
        if (categoryProducts.size < minimum) {
          throw new Error(`${category.name}: ${categoryProducts.size}/${first.declaredCount} productos (< ${MIN_CATEGORY_COVERAGE * 100}%)`);
        }
      }
      validations.push(validation);
      console.log(`[hipercor] centro ${target.centerId} · ${category.name}: ${pages} páginas · ${categoryProducts.size} de categoría · ${products.size} únicos`);
      await saveJsonCheckpoint(checkpointPath, { signature, nextCategoryIndex: categoryIndex + 1, products: [...products.values()], validations });
      if (categoryIndex + 1 < ROOT_CATEGORIES.length && CATEGORY_DELAY > 0) await sleep(CATEGORY_DELAY);
    }
  } finally { await context.close(); }

  const rows = [...products.values()].map((row) => ({ ...row, published: true, synced_at: syncedAt }));
  if (rows.length < MIN_PRODUCTS) throw new Error(`centro ${target.centerId}: solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible catálogo parcial`);
  const validationByCategory = new Map(validations.map((validation) => [validation.categoryId, validation]));
  const categories = ROOT_CATEGORIES.map(({ id, name }) => ({
    id,
    name,
    parent_id: null,
    product_count: validationByCategory.get(id)?.observedCount ?? 0,
    published: true,
    synced_at: syncedAt,
  }));
  return { rows, categories, validations, checkpointPath };
}

async function api(path, init, label) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, init);
  if (!response.ok) throw new Error(`${label}: ${response.status} ${await response.text()}`);
  return response;
}
function authHeaders(extra = {}) {
  return { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...extra };
}
async function upsert(table, rows, onConflict = null) {
  if (!rows.length) return;
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : '';
  for (const batch of chunks(rows, 100)) {
    await api(`${table}${suffix}`, {
      method: 'POST',
      headers: authHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(batch),
    }, `upsert ${table}`);
  }
}
async function patch(table, filters, body) {
  await api(`${table}?${filters}`, {
    method: 'PATCH',
    headers: authHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(body),
  }, `patch ${table}`);
}
async function createSyncRun(row) {
  const response = await api('hipercor_sync_runs', {
    method: 'POST',
    headers: authHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row),
  }, 'crear hipercor_sync_runs');
  const payload = await response.json();
  if (!payload?.[0]?.id) throw new Error('hipercor_sync_runs no devolvió id');
  return payload[0].id;
}
async function updateSyncRun(id, body) { await patch('hipercor_sync_runs', `id=eq.${encodeURIComponent(id)}`, body); }
async function existingCenters(ids) {
  if (!ids.length) return new Map();
  const values = ids.map((id) => `"${id}"`).join(',');
  const response = await api(
    `hipercor_centers?select=id,name,selectable,supports_home_delivery,raw&id=in.(${encodeURIComponent(values)})`,
    { headers: authHeaders() },
    'consultar hipercor_centers',
  );
  return new Map((await response.json()).map((row) => [row.id, row]));
}

async function publishLocationDirectory(mappings, groups, syncedAt) {
  const previous = await existingCenters(groups.map((group) => group.centerId));
  const centers = groups.map((group) => {
    const current = previous.get(group.centerId);
    return {
      id: group.centerId,
      name: current?.name || `Hipercor (centro ${group.centerId})`,
      center_kind: 'hipercor',
      supports_home_delivery: true,
      selectable: current?.selectable === true,
      published: true,
      raw: {
        ...(current?.raw || {}),
        source: 'hipercor_delivery_selector',
        representativePostalCode: group.representativePostalCode,
        postalCodesObserved: group.postalCodes,
        selectorCenterId: group.selectorCenterId,
      },
      synced_at: syncedAt,
    };
  });
  await upsert('hipercor_centers', centers);
  await upsert('hipercor_postal_centers', mappings, 'postal_code,delivery_type');
}
function masterRows(rows, syncedAt) {
  return rows.map((row) => ({
    id: row.id,
    retailer_product_id: row.retailer_product_id,
    display_name: row.display_name,
    packaging: row.packaging,
    thumbnail: row.thumbnail,
    product_url: row.raw.source,
    published: true,
    raw: { source: row.raw.source },
    synced_at: syncedAt,
  }));
}
function centerProductRows(centerId, rows, syncRunId, syncedAt) {
  return rows.map((row) => ({
    center_id: centerId,
    product_id: row.id,
    category_id: row.category_id,
    category_name: row.category_name,
    category_ids: row.category_ids,
    unit_price: row.unit_price,
    price_format: row.price_format,
    price_per_unit: row.price_per_unit,
    price_per_unit_unit: row.price_per_unit_unit,
    promo_name: row.promo_name,
    promo_text: row.promo_text,
    promo_price: row.promo_price,
    promo_base_price: row.promo_base_price,
    available: row.available,
    published: true,
    raw: row.raw,
    observed_at: syncedAt,
    synced_at: syncedAt,
    sync_run_id: syncRunId,
  }));
}
async function publishCenter(target, catalog, syncRunId, syncedAt) {
  const centerCategories = catalog.categories.map((category) => ({
    center_id: target.centerId,
    category_id: category.id,
    product_count: category.product_count,
    published: true,
    synced_at: syncedAt,
    sync_run_id: syncRunId,
  }));
  await upsert('hipercor_product_master', masterRows(catalog.rows, syncedAt));
  await upsert('hipercor_center_products', centerProductRows(target.centerId, catalog.rows, syncRunId, syncedAt), 'center_id,product_id');
  await upsert('hipercor_center_categories', centerCategories, 'center_id,category_id');
  const centerFilter = `center_id=eq.${encodeURIComponent(target.centerId)}`;
  await markStale({ url: SUPABASE_URL, key: KEY, table: 'hipercor_center_products', runStart: syncedAt, filters: centerFilter, idColumn: 'product_id' });
  await markStale({ url: SUPABASE_URL, key: KEY, table: 'hipercor_center_categories', runStart: syncedAt, filters: centerFilter, idColumn: 'category_id' });
  await patch('hipercor_centers', `id=eq.${encodeURIComponent(target.centerId)}`, { selectable: true, published: true, synced_at: syncedAt });
}
async function publishLegacy(catalog, syncedAt) {
  await upsert('hipercor_categories', catalog.categories);
  await upsert('hipercor_products', catalog.rows);
  await markStale({ url: SUPABASE_URL, key: KEY, table: 'hipercor_categories', runStart: syncedAt });
  await markStale({ url: SUPABASE_URL, key: KEY, table: 'hipercor_products', runStart: syncedAt });
}

async function resolveDefaultTarget(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  try {
    const sample = await readPage(page, 'alimentacion', 1);
    if (!/^\d{6}$/.test(sample.centerId || '')) throw new Error(`el catálogo por defecto no expuso un store_id válido: ${sample.centerId}`);
    return { centerId: sample.centerId, postalCodes: [], representativePostalCode: null, sampleFingerprint: hipercorCatalogFingerprint(sample) };
  } finally { await context.close(); }
}
async function ensureDefaultCenter(target, syncedAt) {
  const previous = await existingCenters([target.centerId]);
  const current = previous.get(target.centerId);
  await upsert('hipercor_centers', [{
    id: target.centerId,
    name: current?.name || `Hipercor (centro ${target.centerId})`,
    center_kind: 'hipercor',
    supports_home_delivery: current?.supports_home_delivery === true,
    selectable: current?.selectable === true,
    published: true,
    raw: { ...(current?.raw || {}), source: 'default_public_catalog' },
    synced_at: syncedAt,
  }]);
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`[hipercor] inicio ${startedAt}${DRY ? ' (DRY RUN)' : ''} · pausa ${PAGE_DELAY_MIN}-${PAGE_DELAY_MAX} ms/página · ${CATEGORY_DELAY} ms/categoría · checkpoint base=${CHECKPOINT_BASE}`);
  const browser = await chromium.launch({
    channel: process.env.PW_CHANNEL || 'chrome',
    headless: process.env.HEADLESS !== '0',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  let legacyUpdated = false;
  try {
    const postalCodes = await postalCodePlan();
    if (LOCATION_ONLY && !postalCodes.length) {
      throw new Error('HIPERCOR_LOCATION_ONLY no recibió ningún código postal válido');
    }
    let targets;
    if (postalCodes.length) {
      console.log(`[hipercor] resolución postal: ${postalCodes.length} CP públicos configurados`);
      const locationRunId = DRY ? null : await createSyncRun({
        scope: 'postal_mapping',
        delivery_type: 'home_delivery',
        status: 'running',
        started_at: startedAt,
      });
      try {
        const mappings = await resolvePostalCodes(browser, postalCodes, startedAt);
        targets = groupHipercorPostalMappings(mappings);
        await writeLocationReport(mappings, targets);
        if (REQUIRE_SHARED_CENTER_PARITY) assertHipercorSharedCenterParity(mappings);
        const errors = mappings.filter((mapping) => mapping.resolution_status === 'error');
        if (errors.length) throw new Error(`${errors.length} CP terminaron con error técnico: ${errors.map((row) => row.postal_code).join(', ')}`);
        if (!targets.length) throw new Error('ningún código postal resolvió un centro Hipercor');
        if (!DRY) await publishLocationDirectory(mappings, targets, startedAt);
        console.log(`[hipercor] ${mappings.filter((row) => row.supported).length}/${mappings.length} CP con cobertura · ${targets.length} centros únicos`);
        if (!DRY) {
          await updateSyncRun(locationRunId, {
            status: 'completed',
            validation: {
              postalCodes: mappings.length,
              supportedPostalCodes: mappings.filter((row) => row.supported).length,
              uniqueCenters: targets.length,
              sharedCenterParity: REQUIRE_SHARED_CENTER_PARITY,
            },
            finished_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        if (!DRY && locationRunId) {
          await updateSyncRun(locationRunId, {
            status: 'failed',
            error: { name: error.name, message: error.message },
            finished_at: new Date().toISOString(),
          }).catch((runError) => console.error(`[hipercor] no se pudo cerrar el run postal: ${runError.message}`));
        }
        throw error;
      }
      if (LOCATION_ONLY) {
        await removeCheckpoint(LOCATION_CHECKPOINT);
        console.log('[hipercor] OK · resolución postal completada (sin descargar catálogos)');
        return;
      }
    } else {
      console.warn('[hipercor] no se configuraron CP: modo compatible de catálogo público por defecto');
      const target = await resolveDefaultTarget(browser);
      targets = [target];
      if (!DRY) await ensureDefaultCenter(target, startedAt);
    }

    targets = targets.slice(0, MAX_CENTERS);
    const completedCheckpointPaths = [];
    for (const target of targets) {
      const centerStartedAt = new Date().toISOString();
      const runId = DRY ? null : await createSyncRun({
        scope: 'center_catalog',
        center_id: target.centerId,
        delivery_type: 'home_delivery',
        postal_code: target.representativePostalCode,
        status: 'running',
        started_at: centerStartedAt,
      });
      try {
        const catalog = await crawlCenter(browser, target, centerStartedAt);
        console.log(`[hipercor] centro ${target.centerId}: ${catalog.rows.length} productos · ${catalog.categories.length} categorías · ${catalog.rows.filter((row) => row.promo_name).length} ofertas`);
        if (!DRY) {
          const validation = { categories: catalog.validations, representativePostalCode: target.representativePostalCode };
          await updateSyncRun(runId, {
            status: 'validating',
            products_seen: catalog.rows.length,
            categories_seen: catalog.categories.length,
            validation,
          });
          await publishCenter(target, catalog, runId, centerStartedAt);
          if (target.centerId === LEGACY_CENTER_ID) {
            await publishLegacy(catalog, centerStartedAt);
            legacyUpdated = true;
          }
          await updateSyncRun(runId, {
            status: 'completed',
            products_seen: catalog.rows.length,
            products_published: catalog.rows.length,
            categories_seen: catalog.categories.length,
            validation,
            finished_at: new Date().toISOString(),
          });
        }
        completedCheckpointPaths.push(catalog.checkpointPath);
      } catch (error) {
        if (!DRY && runId) {
          await updateSyncRun(runId, {
            status: 'failed',
            error: { name: error.name, message: error.message },
            finished_at: new Date().toISOString(),
          }).catch((runError) => console.error(`[hipercor] no se pudo cerrar el run ${runId}: ${runError.message}`));
        }
        throw error;
      }
    }
    if (!DRY && legacyUpdated) await recordCatalogSync({ url: SUPABASE_URL, key: KEY, store: 'hipercor' });
    for (const checkpointPath of completedCheckpointPaths) await removeCheckpoint(checkpointPath);
    if (postalCodes.length) await removeCheckpoint(LOCATION_CHECKPOINT);
    console.log('[hipercor] OK');
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(`[hipercor] ERROR: ${error.message}`); process.exit(1); });
