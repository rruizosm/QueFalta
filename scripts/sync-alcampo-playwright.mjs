#!/usr/bin/env node

// Sincronizador local de Alcampo. Catálogo SSR y ofertas mediante API anónima;
// ninguna página se confirma hasta completar referencias y paginación.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { canonicalPricePerUnit } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';
import { normalizeAlcampoOffer } from './lib/retailer-offers.mjs';
import { AlcampoApi } from './lib/alcampo-api.mjs';
import { assertAlcampoRegion, runAlcampoOffers } from './lib/alcampo-offers.mjs';
import {
  CHECKPOINT_VERSION, currentPrice, enrichProductPromotion, discoverCampaigns,
  restoreCheckpoint, saveCheckpoint, withRetries, runPending, parseListing,
  completeListing, resolveFoodCategory,
  describeTraversal, reconcileTraversal,
} from './lib/alcampo-crawl.mjs';

const BASE = 'https://www.compraonline.alcampo.es';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FOOD_ROOTS = new Set([
  'Frescos', 'Leche, Huevos, Lácteos, Yogures y Bebidas vegetales', 'Alimentación',
  'Desayuno y Merienda', 'Congelados', 'Comida Preparada', 'Supermercado Ecológico',
  'Bebidas', 'Sin Gluten / Sin Lactosa, Nutrición deportiva y Funcional', 'Veganos',
]);
const DRY_RUN = process.env.DRY_RUN !== '0';
const MAX_LEAVES = Number(process.env.MAX_LEAVES || 0);
const MAX_PROMOTION_LEAVES = Number(process.env.MAX_PROMOTION_LEAVES || MAX_LEAVES || 0);
const MIN_PRODUCTS = Number(process.env.MIN_PRODUCTS || 8000);
const DELAY_MS = Number(process.env.DELAY_MS || 4500);
const WAIT_MS = Number(process.env.WAIT_MS || 90000);
const PROFILE_DIR = process.env.ALCAMPO_PROFILE || 'C:\\tmp\\alcampo-playwright-profile';
const RESUME_FILE = process.env.ALCAMPO_RESUME_FILE || 'logs/alcampo-playwright-checkpoint.json';
const RESUME = process.env.RESUME === '1';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';
const runStart = new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const eur = (v) => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : null;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');
if (!DRY_RUN && (MAX_LEAVES || MAX_PROMOTION_LEAVES)) throw new Error('un recorrido limitado no se puede publicar');

async function apiJson(path) {
  const res = await fetch(`${BASE}/api/webproductpagews${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`árbol de categorías HTTP ${res.status}`);
  return res.json();
}

function slugifyCategorySegment(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' y ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function walkLeaves(node, n1, n2, out, path) {
  const children = node.childCategories || [];
  if (!children.length) {
    if (node.retailerCategoryId) out.push({ rid: node.retailerCategoryId, n1, n2, path });
    return;
  }
  for (const child of children) walkLeaves(child, n1, n2, out, [...path, child.name]);
}

function walkPromotionLeaves(node, trail, out) {
  const nextTrail = [...trail, node.name].filter(Boolean);
  const children = node.childCategories || [];
  if (!children.length) {
    if (node.retailerCategoryId) {
      const sourcePath = nextTrail.join(' > ');
      out.push({
        rid: node.retailerCategoryId,
        sourcePath,
        onlineOnly: /(?:solo|exclusiv[ao]s?)\s+online|online\s+exclusiv[ao]s?/i.test(sourcePath),
      });
    }
    return;
  }
  for (const child of children) walkPromotionLeaves(child, nextTrail, out);
}

async function buildFoodTree() {
  const roots = await apiJson('/v1/categories?decoration=false&categoryDepth=6');
  if (!Array.isArray(roots)) throw new Error('respuesta inválida del árbol de categorías');
  const food = roots.filter((node) => FOOD_ROOTS.has(node.name) && node.retailerCategoryId);
  if (food.length !== FOOD_ROOTS.size) throw new Error(`raíces de alimentación inesperadas: ${food.length}/${FOOD_ROOTS.size}`);
  const catName = new Map(), catParent = new Map(), leaves = [], promotionLeaves = [];
  for (const root of food) {
    const n1 = root.retailerCategoryId;
    catName.set(n1, root.name);
    for (const child of root.childCategories || []) {
      const n2 = child.retailerCategoryId;
      if (!n2) continue;
      catName.set(n2, child.name); catParent.set(n2, n1); walkLeaves(child, n1, n2, leaves, [root.name, child.name]);
    }
  }
  const promotionRoots = roots.filter((node) =>
    (node.name === 'Folletos y Promociones' || node.name === 'Campañas')
    && node.retailerCategoryId,
  );
  if (promotionRoots.length !== 2) {
    throw new Error(`raíces promocionales inesperadas: ${promotionRoots.length}/2`);
  }
  for (const root of promotionRoots) walkPromotionLeaves(root, [], promotionLeaves);
  return {
    catName,
    catParent,
    leaves: MAX_LEAVES ? leaves.slice(0, MAX_LEAVES) : leaves,
    promotionLeaves: MAX_PROMOTION_LEAVES
      ? promotionLeaves.slice(0, MAX_PROMOTION_LEAVES)
      : promotionLeaves,
  };
}

function fallbackCategoryUrl(leaf) {
  const segments = (leaf.path || []).map(slugifyCategorySegment).filter(Boolean);
  return `${BASE}/categories/${segments.join('/')}/${encodeURIComponent(leaf.rid)}`;
}

async function categoryUrls() {
  const res = await fetch(`${BASE}/sitemaps/sitemap-categories-part1.xml`, { headers: { 'User-Agent': UA, Accept: 'application/xml' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`sitemap de categorías HTTP ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => decodeURI(m[1]));
  const categories = new Map(), promotions = new Map();
  for (const raw of urls) {
    const url = new URL(raw);
    const target = url.pathname.includes('/promotions/')
      ? promotions
      : url.pathname.includes('/categories/')
        ? categories
        : null;
    if (!target) continue;
    const parts = url.pathname.split('/').filter(Boolean);
    const rid = parts.at(-1);
    // Hay hojas normales numéricas y algunas campañas/segmentos alfanuméricos
    // (p. ej. OCFyVpremium) que también aparecen en el árbol de alimentación.
    if (rid && /^OC[A-Za-z0-9_-]+$/i.test(rid) && !target.has(rid)) target.set(rid, url.href);
  }
  return { categories, promotions };
}

function imageOf(entity) {
  const image = entity.image || entity.thumbnail;
  if (typeof image === 'string') return image;
  return image?.src || image?.url || entity.images?.[0]?.src || entity.images?.[0]?.url || null;
}

function normalizeEntity(entity, id, leaf, catName) {
  const price = currentPrice(entity);
  const rawUnit = entity.price?.unit?.label ?? entity.price?.unit?.unit ?? entity.unitPrice?.unit;
  const ppuAmount = entity.price?.unit?.current?.amount ?? entity.promoUnitPrice?.price?.amount ?? entity.unitPrice?.price?.amount;
  const ppu = ppuAmount != null ? canonicalPricePerUnit(ppuAmount, rawUnit) : null;
  const offer = normalizeAlcampoOffer(entity);
  const stableId = String(id || entity.productId || entity.retailerProductId || '');
  return {
    id: stableId,
    retailer_product_id: entity.retailerProductId ?? null,
    display_name: (entity.name || entity.displayName || '').trim(),
    brand: (entity.brand || '').trim() || null,
    packaging: (entity.packSizeDescription || entity.packageSize || '').trim() || null,
    thumbnail: imageOf(entity),
    category_id: leaf.n2 ?? leaf.n1,
    category_name: catName.get(leaf.n1) ?? null,
    category_ids: [...new Set([leaf.n1, leaf.n2].filter(Boolean))],
    unit_price: price,
    price_format: price != null ? `${eur(price)} €` : null,
    promo_name: offer?.promo_name ?? null,
    promo_text: offer?.promo_text ?? null,
    promo_price: offer?.promo_price ?? null,
    promo_base_price: offer?.promo_base_price ?? null,
    promo_start: offer?.promo_start ?? null,
    promo_end: offer?.promo_end ?? null,
    promo_online_only: offer?.promo_online_only ?? false,
    promo_details: offer?.promo_details ?? [],
    price_per_unit: ppu?.value ?? null, price_per_unit_unit: ppu?.unit ?? null,
    available: entity.available !== false,
    published: true,
    raw: entity,
    synced_at: runStart,
  };
}

async function waitForVerification(page) {
  const blocked = /human verification|verify you are human|checking your browser|just a moment|access denied|cloudflare/i;
  const isBlocked = async () => page.evaluate((pattern) => {
    const text = `${document.title}\n${document.body?.innerText || ''}`;
    return new RegExp(pattern, 'i').test(text);
  }, blocked.source).catch(() => true);
  if (!await isBlocked()) return true;
  console.log(`[alcampo-pw] verificación detectada; resuélvela en el navegador (máx. ${WAIT_MS / 1000}s)`);
  try {
    await page.waitForFunction((pattern) => {
      const text = `${document.title}\n${document.body?.innerText || ''}`;
      return !new RegExp(pattern, 'i').test(text);
    }, blocked.source, { timeout: WAIT_MS, polling: 500 });
    return true;
  }
  catch { return false; }
}

async function upsert(table, rows) {
  const headers = { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' };
  for (let i = 0; i < rows.length; i += 50) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers, body: JSON.stringify(rows.slice(i, i + 50)) });
    if (!res.ok) throw new Error(`upsert ${table} ${res.status}: ${await res.text()}`);
    console.log(`[alcampo-pw] upsert ${table}: ${Math.min(i + 50, rows.length)}/${rows.length}`);
  }
}

async function main() {
  console.log(`[alcampo-pw] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} · perfil=${PROFILE_DIR}`);
  const api = new AlcampoApi({ delayMs: DELAY_MS });
  const [{ catName, catParent, leaves, promotionLeaves }, sitemap, { regionId }] = await Promise.all([
    buildFoodTree(), categoryUrls(), api.session(),
  ]);
  console.log(`[alcampo-pw] ${leaves.length} hojas de catálogo · ${promotionLeaves.length} hojas promocionales por API · región=${regionId}`);
  const catalogTasks = leaves.map((leaf) => ({ key: `catalog:${leaf.rid}`, kind: 'catalog',
    categoryId: leaf.rid,
    leaf,
    // Alcampo puede publicar una hoja en el árbol API antes de añadirla al sitemap.
    // La URL derivada sigue pasando por la misma validación HTTP/HTML de visit().
    url: sitemap.categories.get(String(leaf.rid)) || fallbackCategoryUrl(leaf),
  }));
  const promotionTasks = promotionLeaves.map((leaf) => ({ key: `api:promotion:${leaf.rid}`,
    categoryId: leaf.rid }));
  // El directorio general cubre campañas que no figuren en ramas especiales.
  if (!MAX_PROMOTION_LEAVES) promotionTasks.unshift({ key: 'api:promotion:all' });
  const traversal = describeTraversal({ catalogTasks, promotionTasks, catName, catParent });
  // Solo para migrar V3 anteriores sin invalidar su progreso si aún coincide
  // exactamente. Los nuevos checkpoints usan la firma estable por IDs.
  const legacyTraversalId = createHash('sha256').update(JSON.stringify({
    catalogTasks, promotionTasks, categories: [...catName], parents: [...catParent],
  })).digest('hex');
  let products = new Map(), campaigns = new Map(), completed = new Set(), seenProductIds = new Set();
  if (RESUME) {
    try {
      const checkpoint = JSON.parse(await readFile(RESUME_FILE, 'utf8'));
      if (checkpoint.regionId) assertAlcampoRegion(regionId, checkpoint.regionId);
      const restored = restoreCheckpoint(checkpoint);
      const reconciliation = reconcileTraversal(checkpoint, restored, traversal, legacyTraversalId);
      ({ products, campaigns, completed, seenProductIds } = restored);
      if (reconciliation.revalidate) {
        campaigns.clear();
        console.warn(`[alcampo-pw] ${reconciliation.reason}; se conservan los productos, se redescubren las campañas y se revalidan las páginas (${reconciliation.discardedPages} marcas anteriores)`);
      }
      console.log(`[alcampo-pw] ${products.size} productos · ${campaigns.size} campañas recuperadas · ${completed.size} páginas verificadas`);
    } catch (error) { throw new Error(`no se pudo cargar el checkpoint ${RESUME_FILE}: ${error.message}`); }
  }
  const persist = () => saveCheckpoint(RESUME_FILE, {
      version: CHECKPOINT_VERSION, traversalId: traversal.id, traversalManifest: traversal.manifest,
      regionId,
      completed: [...completed], seenProductIds: [...seenProductIds],
      products: [...products.values()],
      campaigns: [...campaigns.values()],
  });
  const ingest = (entities, source, catalogLeaf = null) => {
    const resolved = Object.entries(entities).map(([id, entity]) => {
      const leaf = catalogLeaf ?? (products.has(id) ? null : resolveFoodCategory(entity, catName, catParent, FOOD_ROOTS));
      return { id, entity, leaf };
    });
    for (const { id, entity, leaf } of resolved) {
      discoverCampaigns(campaigns, entity, source);
      let row = products.get(id);
      if (!row && !leaf) continue;
      if (!row || !seenProductIds.has(id)) {
        const category = leaf ?? { n1: row.category_ids[0], n2: row.category_id };
        row = normalizeEntity(entity, id, category, catName);
        products.set(id, row);
      }
      enrichProductPromotion(row, entity, source);
      seenProductIds.add(id);
    }
    console.log(`[alcampo-pw] ${source.sourcePath} · ${Object.keys(entities).length} productos completos · ${seenProductIds.size} alimentarios · ${campaigns.size} campañas`);
  };
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, viewport: { width: 1365, height: 900 }, userAgent: UA, locale: 'es-ES', extraHTTPHeaders: { 'Accept-Language': 'es-ES,es;q=0.9' } });
  const page = context.pages()[0] || await context.newPage();
  const retry = (action) => withRetries(action, { delay: () => sleep(DELAY_MS),
    onRetry: (error, attempt) => console.warn(`[alcampo-pw] reintento ${attempt}/3: ${error.message.split('\n')[0]}`) });
  const requestJson = (path, method, body) => retry(async () => {
    // Consulta dentro de la misma sesión y origen que la página. No se guardan
    // cookies ni tokens en el checkpoint. Un bloqueo se considera un fallo.
    const result = await page.evaluate(async ({ path, method, body }) => {
      const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
      const csrf = window.__INITIAL_STATE__?.session?.csrf?.token;
      if (csrf) headers['X-CSRF-TOKEN'] = csrf;
      const response = await fetch(path, { method, headers, credentials: 'same-origin',
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
      return { status: response.status, text: await response.text() };
    }, { path, method, body });
    if (result.status < 200 || result.status >= 300) throw new Error(`consulta de productos HTTP ${result.status}`);
    try { return JSON.parse(result.text); } catch { throw new Error('consulta de productos sin JSON válido'); }
  });
  const visit = async (task) => {
    if (!task.url) throw new Error(`sin URL sitemap para ${task.key}; página pendiente, no se publica`);
    const listing = await retry(async () => {
      if (page.isClosed()) throw new Error('la pestaña se cerró; usa -Resume');
      const response = await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      if (!await waitForVerification(page)) throw new Error('verificación no completada');
      if (!response || response.status() >= 400) throw new Error(`página HTTP ${response?.status() ?? 'sin respuesta'}`);
      const listing = parseListing(await page.content(), 'catalog');
      assertAlcampoRegion(regionId, listing.regionId);
      return listing;
    });
    const entities = await completeListing(listing, { kind: 'catalog', categoryId: task.categoryId,
      requestJson, pause: () => sleep(DELAY_MS) });
    ingest(entities, { sourcePath: new URL(page.url()).pathname }, task.leaf);
    await sleep(DELAY_MS);
  };
  try {
    await runPending(() => catalogTasks, completed, visit, persist);
  } finally { await context.close(); }
  await runAlcampoOffers({ api, regionId, promotionTasks, campaigns, completed, ingest, persist,
    pause: () => sleep(DELAY_MS) });
  const rows = [...products.values()].filter((row) => seenProductIds.has(String(row.id)));
  const catCount = new Map();
  for (const row of rows) for (const id of new Set(row.category_ids)) catCount.set(id, (catCount.get(id) ?? 0) + 1);
  // Al reanudar, las filas del checkpoint conservan el `synced_at` del
  // scrape original. Para que la limpieza final no las considere obsoletas,
  // se sellan con el inicio de esta publicación antes del upsert.
  for (const row of rows) {
    row.published = true;
    row.synced_at = runStart;
  }
  const catRows = [...catName.keys()].map((id) => ({ id, name: catName.get(id), parent_id: catParent.get(id) ?? null, product_count: catCount.get(id) || 0, published: true, synced_at: runStart }));
  const offerRows = rows.filter((row) => row.promo_name);
  const onlineRows = offerRows.filter((row) => row.promo_online_only);
  console.log(`[alcampo-pw] resultado: ${rows.length} productos · ${catRows.length} categorías · ${campaigns.size} campañas · ${offerRows.length} productos con oferta (${onlineRows.length} online) · ${completed.size} páginas completas`);
  for (const row of rows.slice(0, 5)) console.log(`  ${row.display_name} · ${row.unit_price ?? '—'} € · ${row.category_name}`);
  if (DRY_RUN) return;
  if (rows.length < MIN_PRODUCTS) throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); posible scrape parcial, no se escribe`);
  await upsert('alcampo_categories', catRows);
  await upsert('alcampo_products', rows);
  await markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table: 'alcampo_products', runStart });
  await markStaleBatched({ url: SUPABASE_URL, key: SERVICE_ROLE, table: 'alcampo_categories', runStart });
  await recordCatalogSync({ url: SUPABASE_URL, key: SERVICE_ROLE, store: 'alcampo' });
  console.log('[alcampo-pw] OK');
}

main().catch((error) => { console.error('[alcampo-pw] ERROR', error); process.exit(1); });
