#!/usr/bin/env node
// Sincroniza el catálogo público de Supermercados El Jamón.
//
// La tienda usa Liferay/Comerzzia. Los productos se renderizan en HTML, pero la
// paginación se ejecuta con JavaScript y no se puede recorrer de forma fiable
// construyendo URLs. Por eso este sync usa Playwright y pulsa "Siguiente",
// comprobando que cambian tanto la página seleccionada como el primer SKU.
//
// El catálogo se considera común para todas las ubicaciones. Se fija un único
// centro de recogida de referencia para que el contexto sea reproducible.
//
// Uso seguro (por defecto no publica):
//   DRY_RUN=1 MAX_CATEGORIES=1 MAX_PAGES=2 node scripts/sync-eljamon.mjs
// Publicación (las tablas se crean con 20260923141000_eljamon_catalog.sql):
//   DRY_RUN=0 SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... node scripts/sync-eljamon.mjs

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { markStale } from './lib/stale.mjs';
import { canonicalPricePerUnit } from './lib/price.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';

const BASE = 'https://www.supermercadoseljamon.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const ROOT_CATEGORIES = [
  { id: '01', name: 'Despensa', path: '/categorias/la-despensa/01' },
  { id: '02', name: 'Desayuno y dulce', path: '/categorias/desayuno-y-dulces/02' },
  { id: '03', name: 'Lácteos', path: '/categorias/lacteos/03' },
  { id: '04', name: 'Frescos', path: '/categorias/frescos/04' },
  { id: '05', name: 'Congelados', path: '/categorias/congelados/05' },
  { id: '06', name: 'Bebidas', path: '/categorias/bebidas/06' },
  { id: '07', name: 'Bebés', path: '/categorias/bebes/07' },
  { id: '08', name: 'Perfumería e higiene', path: '/categorias/perfumeria-e-higiene/08' },
  { id: '09', name: 'Droguería y limpieza', path: '/categorias/drogueria-y-limpieza/09' },
  { id: '10', name: 'Mascotas', path: '/categorias/mascotas/10' },
  { id: '11', name: 'Hogar', path: '/categorias/hogar/11' },
];

function loadEnvLine(line) {
  const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!match || process.env[match[1]] != null) return;
  let value = match[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[match[1]] = value;
}

try {
  for (const line of (await readFile(new URL('../.env.local', import.meta.url), 'utf8')).split(/\r?\n/)) loadEnvLine(line);
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}

const DRY_RUN = process.env.DRY_RUN !== '0';
const HEADLESS = process.env.HEADLESS !== '0';
const MAX_CATEGORIES = positiveInt(process.env.MAX_CATEGORIES, ROOT_CATEGORIES.length);
const MAX_PAGES = positiveInt(process.env.MAX_PAGES, Infinity);
const DETAILS_LIMIT = nonNegativeInt(process.env.ELJAMON_DETAILS_LIMIT, 0);
const DETAIL_CONCURRENCY = positiveInt(process.env.ELJAMON_DETAIL_CONCURRENCY, 2);
const PAGE_DELAY_MS = nonNegativeInt(process.env.ELJAMON_PAGE_DELAY_MS, 250);
const WAIT_MS = positiveInt(process.env.ELJAMON_WAIT_MS, 45000);
const MIN_PRODUCTS = positiveInt(process.env.MIN_PRODUCTS, 5000);
const REFERENCE_STORE = process.env.ELJAMON_REFERENCE_STORE || '268';
const SELECT_STORE = process.env.ELJAMON_SELECT_STORE !== '0';
const OUTPUT_FILE = process.env.ELJAMON_OUTPUT || 'logs/eljamon-catalog.json';
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';
const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  throw new Error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function clean(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || null : null;
}

function categoryIdFromUrl(href) {
  try {
    const parts = new URL(href).pathname.split('/').filter(Boolean);
    const id = parts.at(-1);
    return /^\d{2,}$/.test(id || '') ? id : null;
  } catch {
    return null;
  }
}

function categoryParent(id, knownIds) {
  return [...knownIds]
    .filter((candidate) => candidate !== id && id.startsWith(candidate))
    .sort((a, b) => b.length - a.length)[0] || null;
}

async function selectReferencePickupStore(page) {
  if (!SELECT_STORE) return { id: null, label: null, selected: false };
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  const postalTrigger = page.locator('#change-cp:visible');
  if (!await postalTrigger.count()) return { id: null, label: null, selected: false };

  await page.waitForFunction(() => typeof window.abrirPopUp === 'function', null, { timeout: WAIT_MS });
  await postalTrigger.first().click({ force: true });
  const pickupButton = page.locator('#aceptarRecogida:visible');
  await pickupButton.waitFor({ state: 'visible', timeout: WAIT_MS });
  await pickupButton.click({ force: true });

  const storeSelect = page.locator('#_SeleccionarCodPostalFoodPortlet_WAR_comerzziaportletsfood_tiendaRecogida_1020:visible');
  await storeSelect.waitFor({ state: 'visible', timeout: WAIT_MS });
  const options = await storeSelect.locator('option').evaluateAll((nodes) => nodes.map((node) => ({ value: node.value, label: node.textContent?.replace(/\s+/g, ' ').trim() })));
  const requested = options.find((option) => option.value === REFERENCE_STORE);
  if (!requested) throw new Error(`centro de referencia ${REFERENCE_STORE} no encontrado (${options.length} opciones)`);
  await storeSelect.selectOption(REFERENCE_STORE);
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: WAIT_MS }).catch(() => null),
    page.locator('#aceptarTiendaRecogida:visible').click({ force: true }),
  ]);
  await sleep(500);
  return { id: REFERENCE_STORE, label: requested.label || null, selected: true };
}

async function discoverCategoryTree(page, root) {
  const links = await page.locator('a[href*="/categorias/"]').evaluateAll((anchors) => anchors.map((anchor) => ({
    name: anchor.textContent?.replace(/\s+/g, ' ').trim(),
    href: anchor.href,
  })));
  const byId = new Map([[root.id, { id: root.id, name: root.name, parent_id: null, source_url: `${BASE}${root.path}` }]]);
  for (const link of links) {
    const id = categoryIdFromUrl(link.href);
    if (!id || !id.startsWith(root.id) || !link.name) continue;
    byId.set(id, { id, name: link.name, parent_id: null, source_url: link.href });
  }
  const ids = new Set(byId.keys());
  for (const category of byId.values()) category.parent_id = category.id === root.id ? null : categoryParent(category.id, ids);
  return [...byId.values()];
}

async function extractCurrentPage(page, root) {
  const rows = await page.locator('.articulo[id*="_articulo_"]').evaluateAll((cards, rootData) => cards.map((card) => {
    const cleanText = (value) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() || null : null;
    const money = (value) => {
      const normalized = cleanText(value)?.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
      const parsed = Number(normalized);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const id = card.id.match(/_articulo_(\d+)$/)?.[1] || card.querySelector('input[id^="cantidad_"]')?.id.match(/^cantidad_(\d+)_/)?.[1] || null;
    const priceSpans = [...card.querySelectorAll('.wrap-money .precio span')];
    const currentSpan = priceSpans.findLast((span) => !span.classList.contains('tachado')) || priceSpans.at(-1);
    const oldSpan = priceSpans.find((span) => span.classList.contains('tachado'));
    const unitText = cleanText(card.querySelector('.texto-porKilo')?.textContent);
    const unitMatch = unitText?.match(/([\d.,]+)\s*€\s*\/\s*(100\s*ml|100\s*gr|kilo|litro|unidad)/i);
    const badges = [...card.querySelectorAll('.img-caracteristica')].map((image) => cleanText(image.alt || image.title)).filter(Boolean);
    const promoLabels = [...card.querySelectorAll('.wrapper-tag-ofertas img')].map((image) => cleanText(image.alt || image.title)).filter(Boolean);
    const href = card.querySelector('.nombre a')?.href || card.querySelector('a[href*="/detalle/"]')?.href || null;
    const addHandler = card.querySelector('.add-bag')?.getAttribute('onclick') || '';
    const handlerFields = [...addHandler.matchAll(/'([^']*)'/g)].map((match) => match[1]);
    const sourceCategory = cleanText(handlerFields[3]);
    const unitPrice = money(currentSpan?.textContent);
    const basePrice = money(oldSpan?.textContent);
    const hasOfferBadge = badges.some((label) => /oferta/i.test(label));
    return {
      id,
      retailer_product_id: id,
      display_name: cleanText(card.querySelector('.nombre a')?.textContent),
      brand: cleanText(card.querySelector('.marca')?.textContent),
      packaging: null,
      thumbnail: card.querySelector('.imgwrap img')?.src || null,
      product_url: href,
      category_id: rootData.id,
      category_name: rootData.name,
      category_ids: [rootData.id],
      source_category_name: sourceCategory,
      unit_price: unitPrice,
      price_format: unitPrice == null ? null : `${unitPrice.toFixed(2).replace('.', ',')} €`,
      raw_price_per_unit: unitMatch ? money(unitMatch[1]) : null,
      raw_price_per_unit_unit: unitMatch ? unitMatch[2].replace(/\s+/g, '').toLowerCase() : null,
      promo_name: hasOfferBadge ? (promoLabels[0] || 'Oferta') : null,
      promo_text: promoLabels[0] || (hasOfferBadge ? 'Oferta' : null),
      promo_price: hasOfferBadge ? unitPrice : null,
      promo_base_price: hasOfferBadge ? basePrice : null,
      is_new: badges.some((label) => /nuevo/i.test(label)),
      badges,
      available: unitPrice != null,
      published: true,
      raw: { promo_labels: promoLabels, unit_price_text: unitText },
    };
  }), root);
  return rows.map((row) => {
    const canonical = canonicalPricePerUnit(row.raw_price_per_unit, row.raw_price_per_unit_unit);
    const { raw_price_per_unit: _rawValue, raw_price_per_unit_unit: _rawUnit, ...normalized } = row;
    return { ...normalized, price_per_unit: canonical?.value ?? null, price_per_unit_unit: canonical?.unit ?? null };
  });
}

async function currentPagination(page) {
  return page.locator('.paginacion.top').first().evaluate((pagination) => {
    const selected = Number(pagination.querySelector('.selected')?.textContent?.trim()) || 1;
    const pages = [...pagination.querySelectorAll('[onclick*="_pagina="]')].map((node) => Number(node.getAttribute('onclick')?.match(/_pagina=(\d+)/)?.[1])).filter(Number.isFinite);
    return { selected, total: Math.max(selected, ...pages), hasNext: Boolean(pagination.querySelector('img[title="Siguiente"].activo')) };
  }).catch(() => ({ selected: 1, total: 1, hasNext: false }));
}

async function advancePage(page, previousPage, previousFirstSku) {
  const next = page.locator('.paginacion.top img[title="Siguiente"].activo').first();
  if (!await next.count()) return false;
  await page.waitForFunction(() => typeof window._ProductosFoodPortlet_WAR_comerzziaportletsfood_verPagina === 'function', null, { timeout: WAIT_MS });
  // El handler de Liferay puede registrar una navegación aunque sustituya solo
  // el portlet. No dejamos que Playwright espere esa navegación fantasma: la
  // condición fiable es el cambio conjunto de página seleccionada y primer SKU.
  await next.click({ force: true, noWaitAfter: true });
  await page.waitForFunction(({ oldPage, oldSku }) => {
    const selected = Number(document.querySelector('.paginacion.top .selected')?.textContent?.trim()) || 1;
    const firstId = document.querySelector('.articulo[id*="_articulo_"]')?.id || '';
    return selected > oldPage && firstId && firstId !== oldSku;
  }, { oldPage: previousPage, oldSku: previousFirstSku }, { timeout: WAIT_MS });
  if (PAGE_DELAY_MS) await sleep(PAGE_DELAY_MS);
  return true;
}

async function crawlRoot(page, root, products, categories) {
  await page.goto(`${BASE}${root.path}`, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await page.locator('.articulo[id*="_articulo_"]').first().waitFor({ state: 'attached', timeout: WAIT_MS });
  for (const category of await discoverCategoryTree(page, root)) categories.set(category.id, category);

  let pagesRead = 0;
  let expectedTotal = null;
  const seenFingerprints = new Set();
  while (pagesRead < MAX_PAGES) {
    const pagination = await currentPagination(page);
    expectedTotal = expectedTotal ?? pagination.total;
    const rows = await extractCurrentPage(page, root);
    if (!rows.length) throw new Error(`${root.name}: página ${pagination.selected} sin productos`);
    const fingerprint = rows.map((row) => row.id).join(',');
    if (seenFingerprints.has(fingerprint)) throw new Error(`${root.name}: la paginación repitió la página ${pagination.selected}`);
    seenFingerprints.add(fingerprint);
    for (const row of rows) {
      if (!row.id || !row.display_name) continue;
      row.synced_at = runStart;
      const existing = products.get(row.id);
      if (existing) {
        existing.category_ids = [...new Set([...existing.category_ids, ...row.category_ids])];
      } else products.set(row.id, row);
    }
    pagesRead++;
    console.log(`[eljamon] ${root.name}: página ${pagination.selected}/${pagination.total} · ${rows.length} filas · ${products.size} SKU únicos`);
    if (!pagination.hasNext || pagination.selected >= pagination.total || pagesRead >= MAX_PAGES) break;
    const firstSku = await page.locator('.articulo[id*="_articulo_"]').first().getAttribute('id');
    await advancePage(page, pagination.selected, firstSku);
  }
  return { pagesRead, expectedTotal };
}

async function extractDetails(page, product) {
  await page.goto(product.product_url, { waitUntil: 'domcontentloaded', timeout: WAIT_MS });
  await page.locator('h1.tituloProducto').waitFor({ state: 'attached', timeout: WAIT_MS });
  return page.locator('#main-content').evaluate((main) => {
    const categoryPath = [...main.querySelectorAll('a[href*="/categorias/"]')].map((anchor) => ({
      id: anchor.href.split('/').filter(Boolean).at(-1),
      name: anchor.textContent?.replace(/\s+/g, ' ').trim(),
      url: anchor.href,
    })).filter((item) => /^\d{2,}$/.test(item.id || '') && item.name);
    const labeled = {};
    for (const element of main.querySelectorAll('h2,h3,h4,dt,th,strong,b')) {
      const label = element.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
      const key = /ingrediente/.test(label) ? 'ingredients' : /alérgeno|alergeno/.test(label) ? 'allergens' : /nutric/.test(label) ? 'nutrition' : /conserva/.test(label) ? 'conservation' : null;
      if (!key || labeled[key]) continue;
      const candidate = element.nextElementSibling?.textContent || element.parentElement?.textContent || '';
      labeled[key] = candidate.replace(/\s+/g, ' ').trim() || null;
    }
    return { categoryPath, ...labeled };
  });
}

async function enrichProducts(context, products, categories) {
  const selected = products.filter((product) => product.product_url).slice(0, DETAILS_LIMIT);
  if (!selected.length) return;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(DETAIL_CONCURRENCY, selected.length) }, async () => {
    const page = await context.newPage();
    try {
      for (;;) {
        const index = cursor++;
        if (index >= selected.length) break;
        const product = selected[index];
        try {
          const details = await extractDetails(page, product);
          product.ingredients = clean(details.ingredients);
          product.allergens = clean(details.allergens);
          product.nutrition = clean(details.nutrition);
          product.conservation = clean(details.conservation);
          product.detail_synced_at = new Date().toISOString();
          if (details.categoryPath.length) {
            product.category_ids = details.categoryPath.map((item) => item.id);
            product.category_id = product.category_ids.at(-1);
            product.category_name = details.categoryPath.at(-1).name;
            for (let i = 0; i < details.categoryPath.length; i++) {
              const item = details.categoryPath[i];
              categories.set(item.id, { id: item.id, name: item.name, parent_id: details.categoryPath[i - 1]?.id || null, source_url: item.url });
            }
          }
        } catch (error) {
          console.warn(`[eljamon] detalle ${product.id}: ${error.message.split('\n')[0]}`);
        }
        if ((index + 1) % 25 === 0 || index + 1 === selected.length) console.log(`[eljamon] detalles ${index + 1}/${selected.length}`);
        if (PAGE_DELAY_MS) await sleep(PAGE_DELAY_MS);
      }
    } finally {
      await page.close();
    }
  });
  await Promise.all(workers);
}

async function upsert(table, rows) {
  const headers = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  for (let offset = 0; offset < rows.length; offset += 200) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers, body: JSON.stringify(rows.slice(offset, offset + 200)) });
    if (!response.ok) throw new Error(`upsert ${table} ${response.status}: ${await response.text()}`);
  }
}

async function saveSnapshot(payload) {
  await mkdir(dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`[eljamon] snapshot: ${OUTPUT_FILE}`);
}

async function main() {
  console.log(`[eljamon] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({ userAgent: UA, locale: 'es-ES', viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { 'Accept-Language': 'es-ES,es;q=0.9' } });
  const page = await context.newPage();
  const products = new Map();
  const categories = new Map();
  const crawl = [];
  let store;
  try {
    store = await selectReferencePickupStore(page);
    console.log(`[eljamon] centro de recogida: ${store.selected ? `${store.label} (${store.id})` : 'sin selección explícita'}`);
    for (const root of ROOT_CATEGORIES.slice(0, MAX_CATEGORIES)) crawl.push({ root: root.id, ...(await crawlRoot(page, root, products, categories)) });
    await enrichProducts(context, [...products.values()], categories);
  } finally {
    await browser.close();
  }

  const rows = [...products.values()];
  const categoryRows = [...categories.values()].map((category) => ({ ...category, product_count: rows.filter((product) => product.category_ids.includes(category.id)).length, published: true, synced_at: runStart }));
  const report = {
    store,
    root_categories_requested: Math.min(MAX_CATEGORIES, ROOT_CATEGORIES.length),
    pages_read: crawl.reduce((sum, item) => sum + item.pagesRead, 0),
    pages_expected: crawl.reduce((sum, item) => sum + (item.expectedTotal || 0), 0),
    products: rows.length,
    categories: categoryRows.length,
    offers: rows.filter((row) => row.promo_name).length,
    new_products: rows.filter((row) => row.is_new).length,
    missing_prices: rows.filter((row) => row.unit_price == null).length,
    enriched_details: rows.filter((row) => Object.hasOwn(row, 'nutrition')).length,
  };
  console.log(`[eljamon] ${report.products} productos · ${report.categories} categorías · ${report.offers} ofertas · ${report.new_products} nuevos`);
  await saveSnapshot({ source: BASE, synced_at: runStart, common_catalog: true, report, crawl, categories: categoryRows, products: rows });

  if (DRY_RUN) return;
  const completeRoots = MAX_CATEGORIES >= ROOT_CATEGORIES.length && MAX_PAGES === Infinity;
  if (!completeRoots) throw new Error('publicación bloqueada: MAX_CATEGORIES/MAX_PAGES limitan el catálogo');
  if (rows.length < MIN_PRODUCTS) throw new Error(`publicación bloqueada: ${rows.length} productos (< MIN_PRODUCTS=${MIN_PRODUCTS})`);
  await upsert('eljamon_categories', categoryRows);
  await upsert('eljamon_products', rows);
  await markStale({ url: SUPABASE_URL, key: SERVICE_ROLE, table: 'eljamon_products', runStart });
  await markStale({ url: SUPABASE_URL, key: SERVICE_ROLE, table: 'eljamon_categories', runStart });
  await recordCatalogSync({ url: SUPABASE_URL, key: SERVICE_ROLE, store: 'eljamon', syncedAt: runStart });
  console.log('[eljamon] publicación completada');
}

main().catch((error) => {
  console.error('[eljamon] ERROR', error);
  process.exitCode = 1;
});
