#!/usr/bin/env node

// Sincronizador local de Alcampo. Usa la pagina visible y su estado SSR, no el
// endpoint JSON que el WAF bloquea despues de la primera peticion.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalPricePerUnit, toNumber } from './lib/price.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';
import {
  extractAlcampoPromotionDetails,
  mergeAlcampoPromotionDetails,
  normalizeAlcampoOffer,
} from './lib/retailer-offers.mjs';

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
const num = (v) => { const n = toNumber(v); return n != null ? n : null; };
const eur = (v) => typeof v === 'number' ? v.toFixed(2).replace('.', ',') : null;

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE');

async function apiJson(path) {
  const res = await fetch(`${BASE}/api/webproductpagews${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`árbol de categorías HTTP ${res.status}`);
  return res.json();
}

function walkLeaves(node, n1, n2, out) {
  const children = node.childCategories || [];
  if (!children.length) { if (node.retailerCategoryId) out.push({ rid: node.retailerCategoryId, n1, n2 }); return; }
  for (const child of children) walkLeaves(child, n1, n2, out);
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
      catName.set(n2, child.name); catParent.set(n2, n1); walkLeaves(child, n1, n2, leaves);
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

function extractObject(html, key) {
  const markerAt = html.indexOf(`"${key}"`);
  if (markerAt < 0) return null;
  const start = html.indexOf('{', markerAt);
  if (start < 0) return null;
  let depth = 0, string = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (string) { if (escaped) escaped = false; else if (ch === '\\') escaped = true; else if (ch === '"') string = false; continue; }
    if (ch === '"') string = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  return null;
}

function ssrEntities(html) {
  const blob = extractObject(html, 'productEntities');
  if (!blob) return null;
  try { return JSON.parse(blob); } catch { return null; }
}

function imageOf(entity) {
  const image = entity.image || entity.thumbnail;
  if (typeof image === 'string') return image;
  return image?.src || image?.url || entity.images?.[0]?.src || entity.images?.[0]?.url || null;
}

function normalizeEntity(entity, id, leaf, catName) {
  const price = num(entity.price?.current?.amount ?? entity.price?.amount ?? entity.currentPrice?.amount);
  const rawUnit = entity.price?.unit?.label ?? entity.price?.unit?.unit ?? entity.unitPrice?.unit;
  const ppuAmount = entity.price?.unit?.current?.amount ?? entity.unitPrice?.price?.amount;
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

function applyOffer(row, offer) {
  row.promo_name = offer?.promo_name ?? null;
  row.promo_text = offer?.promo_text ?? null;
  row.promo_price = offer?.promo_price ?? null;
  row.promo_base_price = offer?.promo_base_price ?? null;
  row.promo_start = offer?.promo_start ?? null;
  row.promo_end = offer?.promo_end ?? null;
  row.promo_online_only = offer?.promo_online_only ?? false;
  row.promo_details = offer?.promo_details ?? [];
}

function enrichProductPromotion(row, entity, source) {
  const discovered = extractAlcampoPromotionDetails(entity, source);
  const allPromotions = mergeAlcampoPromotionDetails(row.promo_details ?? [], discovered);
  applyOffer(row, normalizeAlcampoOffer(entity, { additionalPromotions: allPromotions }));

  // Las landings promocionales publican el precio actual y, en rebajas directas,
  // el anterior tachado. Son la fuente más específica y deben prevalecer.
  const current = num(entity.price?.current?.amount ?? entity.price?.amount);
  if (current != null) {
    row.unit_price = current;
    row.price_format = `${eur(current)} €`;
  }
  return discovered;
}

function campaignFromPromotion(promotion, source) {
  const id = promotion.retailer_promotion_id;
  if (!id) return null;
  return {
    id,
    onlineOnly: Boolean(promotion.online_only || source.onlineOnly),
    sourcePaths: [...new Set([...(promotion.source_paths ?? []), source.sourcePath].filter(Boolean))].slice(0, 8),
  };
}

function mergeCampaign(map, campaign) {
  if (!campaign) return;
  const previous = map.get(campaign.id);
  map.set(campaign.id, {
    id: campaign.id,
    onlineOnly: Boolean(previous?.onlineOnly || campaign.onlineOnly),
    sourcePaths: [...new Set([...(previous?.sourcePaths ?? []), ...(campaign.sourcePaths ?? [])])].slice(0, 8),
  });
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
  const [{ catName, catParent, leaves, promotionLeaves }, sitemap] = await Promise.all([buildFoodTree(), categoryUrls()]);
  console.log(`[alcampo-pw] ${leaves.length} hojas de catálogo · ${promotionLeaves.length} hojas promocionales · ${sitemap.categories.size}/${sitemap.promotions.size} URLs`);
  const context = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, viewport: { width: 1365, height: 900 }, userAgent: UA, locale: 'es-ES', extraHTTPHeaders: { 'Accept-Language': 'es-ES,es;q=0.9' } });
  const page = context.pages()[0] || await context.newPage();
  const products = new Map(), catCount = new Map(), campaigns = new Map();
  let empty = 0;
  let catalogNextIndex = 0, promotionNextIndex = 0, offerNextIndex = 0;
  if (RESUME) {
    try {
      const checkpoint = JSON.parse(await readFile(RESUME_FILE, 'utf8'));
      for (const row of checkpoint.products || []) products.set(row.id, row);
      for (const [id, count] of checkpoint.catCount || []) catCount.set(id, count);
      for (const campaign of checkpoint.campaigns || []) mergeCampaign(campaigns, campaign);
      // Permite corregir un checkpoint creado por la versión anterior, que
      // conservaba `raw.offers` pero todavía no rellenaba las columnas promo_*.
      for (const row of products.values()) {
        applyOffer(row, normalizeAlcampoOffer(row.raw, { additionalPromotions: row.promo_details ?? [] }));
      }
      catalogNextIndex = Number(checkpoint.catalogNextIndex ?? checkpoint.nextIndex ?? 0);
      promotionNextIndex = Number(checkpoint.promotionNextIndex ?? 0);
      offerNextIndex = Number(checkpoint.offerNextIndex ?? 0);
      console.log(`[alcampo-pw] reanudando catálogo ${catalogNextIndex}/${leaves.length} · promociones ${promotionNextIndex}/${promotionLeaves.length} · landings ${offerNextIndex} · ${products.size} productos`);
    } catch (error) { throw new Error(`no se pudo cargar el checkpoint ${RESUME_FILE}: ${error.message}`); }
  }
  const saveCheckpoint = async () => {
    await writeFile(RESUME_FILE, JSON.stringify({
      version: 2,
      catalogNextIndex,
      promotionNextIndex,
      offerNextIndex,
      products: [...products.values()],
      catCount: [...catCount.entries()],
      campaigns: [...campaigns.values()],
    }));
  };
  try {
    await page.goto(`${BASE}/categories/alimentación/OCC10`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch((e) => console.warn(`[alcampo-pw] portada: ${e.message.split('\n')[0]}`));
    if (!await waitForVerification(page)) throw new Error('verificación no completada; abortado sin publicar');

    for (let index = catalogNextIndex; index < leaves.length; index++) {
      const leaf = leaves[index];
      if (page.isClosed()) throw new Error('la pestaña se cerró; ejecución detenida, usa RESUME=1 para continuar');
      const url = sitemap.categories.get(String(leaf.rid));
      let count = 0;
      if (!url) {
        empty++;
        console.warn(`[alcampo-pw] sin URL sitemap para ${leaf.rid}`);
      } else try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (!await waitForVerification(page)) throw new Error('verificación no completada; ejecución detenida sin avanzar el checkpoint');
        const entities = ssrEntities(await page.content());
        if (!entities) throw new Error('SSR sin productEntities; ejecución detenida sin avanzar el checkpoint');
        for (const [id, entity] of Object.entries(entities)) {
          const row = normalizeEntity(entity, id, leaf, catName);
          if (!row.id || !row.display_name) continue;
          const existing = products.get(row.id);
          if (existing) {
            enrichProductPromotion(existing, entity, {});
          } else {
            products.set(row.id, row);
            count++;
            for (const cat of [leaf.n1, leaf.n2]) if (cat) catCount.set(cat, (catCount.get(cat) || 0) + 1);
          }
          for (const promotion of extractAlcampoPromotionDetails(entity)) {
            mergeCampaign(campaigns, campaignFromPromotion(promotion, {}));
          }
        }
        if (response && response.status() >= 400) console.warn(`[alcampo-pw] ${leaf.rid}: HTTP ${response.status()} pero SSR usable`);
      } catch (e) {
        // Un bloqueo/verificación no es una categoría vacía: avanzar aquí
        // perdería el punto de reanudación. Se conserva el checkpoint anterior.
        if (/verificación|productEntities|pestaña se cerró/i.test(e.message)) throw e;
        empty++;
        console.warn(`[alcampo-pw] ${leaf.rid}: ${e.message.split('\n')[0]}`);
      }
      catalogNextIndex = index + 1;
      await saveCheckpoint();
      if (catalogNextIndex % 25 === 0 || catalogNextIndex === leaves.length) console.log(`[alcampo-pw] catálogo ${catalogNextIndex}/${leaves.length} · +${count} · ${products.size} productos · ${campaigns.size} promociones`);
      if (catalogNextIndex < leaves.length) await sleep(DELAY_MS);
    }

    // Las ramas especiales son el directorio de campañas. Se recorren para
    // descubrir promociones que no aparezcan en las primeras tarjetas de una
    // categoría normal y para identificar ramas exclusivas online.
    for (let index = promotionNextIndex; index < promotionLeaves.length; index++) {
      const leaf = promotionLeaves[index];
      const url = sitemap.promotions.get(String(leaf.rid));
      if (!url) {
        empty++;
        console.warn(`[alcampo-pw] sin URL promocional para ${leaf.rid}`);
      } else try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (!await waitForVerification(page)) throw new Error('verificación no completada; ejecución detenida sin avanzar promociones');
        const entities = ssrEntities(await page.content());
        if (!entities) throw new Error('SSR promocional sin productEntities; ejecución detenida sin avanzar');
        const source = { sourceOnlineOnly: leaf.onlineOnly, sourcePath: new URL(url).pathname, onlineOnly: leaf.onlineOnly };
        for (const [id, entity] of Object.entries(entities)) {
          const details = extractAlcampoPromotionDetails(entity, source);
          for (const promotion of details) mergeCampaign(campaigns, campaignFromPromotion(promotion, source));
          const row = products.get(String(id || entity.productId || entity.retailerProductId || ''));
          if (row) enrichProductPromotion(row, entity, source);
        }
      } catch (e) {
        if (/verificación|productEntities|pestaña se cerró/i.test(e.message)) throw e;
        empty++;
        console.warn(`[alcampo-pw] promo ${leaf.rid}: ${e.message.split('\n')[0]}`);
      }
      promotionNextIndex = index + 1;
      await saveCheckpoint();
      if (promotionNextIndex % 25 === 0 || promotionNextIndex === promotionLeaves.length) console.log(`[alcampo-pw] directorio promo ${promotionNextIndex}/${promotionLeaves.length} · ${campaigns.size} campañas`);
      if (promotionNextIndex < promotionLeaves.length) await sleep(DELAY_MS);
    }

    // La landing canónica de cada promoción contiene todos sus productos en un
    // único productEntities, evitando depender de la primera página de cada hoja.
    const campaignQueue = [...campaigns.values()].sort((a, b) => a.id.localeCompare(b.id));
    for (let index = offerNextIndex; index < campaignQueue.length; index++) {
      const campaign = campaignQueue[index];
      try {
        const response = await page.goto(`${BASE}/offers/x/${encodeURIComponent(campaign.id)}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
        if (!await waitForVerification(page)) throw new Error('verificación no completada; ejecución detenida sin avanzar landings');
        const entities = ssrEntities(await page.content());
        if (!entities) throw new Error('landing sin productEntities; ejecución detenida sin avanzar');
        const source = {
          sourceOnlineOnly: campaign.onlineOnly,
          sourcePath: new URL(response?.url() || page.url()).pathname,
          onlineOnly: campaign.onlineOnly,
        };
        let matched = 0;
        for (const [id, entity] of Object.entries(entities)) {
          const row = products.get(String(id || entity.productId || entity.retailerProductId || ''));
          if (!row) continue;
          enrichProductPromotion(row, entity, source);
          matched++;
        }
        console.log(`[alcampo-pw] oferta ${index + 1}/${campaignQueue.length} ${campaign.id} · ${Object.keys(entities).length} productos · ${matched} en catálogo`);
      } catch (e) {
        if (/verificación|productEntities|pestaña se cerró/i.test(e.message)) throw e;
        empty++;
        console.warn(`[alcampo-pw] oferta ${campaign.id}: ${e.message.split('\n')[0]}`);
      }
      offerNextIndex = index + 1;
      await saveCheckpoint();
      if (offerNextIndex < campaignQueue.length) await sleep(DELAY_MS);
    }
  } finally { await context.close(); }
  const rows = [...products.values()];
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
  console.log(`[alcampo-pw] resultado: ${rows.length} productos · ${catRows.length} categorías · ${campaigns.size} campañas · ${offerRows.length} productos con oferta (${onlineRows.length} online) · ${empty} incidencias`);
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
