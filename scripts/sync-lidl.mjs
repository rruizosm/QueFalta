#!/usr/bin/env node
// Sincroniza el catálogo público de Lidl Plus España para una tienda concreta.
// No inicia sesión ni usa Scan&Go: los códigos de la API pública
// son identificadores internos y `ean` queda NULL hasta disponer de una fuente
// de barcode autorizada.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      LIDL_STORE_ID=ES3572, LIDL_COUNTRY=ES, LIDL_LANGUAGE=es
//      CONCURRENCY=4, PAGE_SIZE=100, MIN_PRODUCTS=2200, MIN_LEAVES=35
//      MIN_NONEMPTY_LEAVES=40, EMPTY_LEAF_RETRIES=3
//      MIN_MATCHED_OFFERS=1
//      MIN_COVERAGE_RATIO=0.85 (respecto al catálogo publicado anterior)
//      DRY_RUN=1, MAX_LEAVES=N (solo permitido con DRY_RUN)
import { lidlMinimumProducts } from './lib/lidl-store-coverage.mjs';
import { lidlRequest, sortedLidlRows } from './lib/lidl-http.mjs';
import { readFile } from 'node:fs/promises';
import { markStale } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';
import {
  applyLidlCampaign,
  assertLidlCampaignCatalog,
  fetchLidlCampaignCatalog,
  isLidlCampaignCandidate,
  lidlCampaignMatchesDetail,
  lidlCampaignPriceForRegion,
} from './lib/lidl-campaigns.mjs';
import {
  applyLidlOffer,
  isLidlOfferCandidate,
  isLiveLidlStoreOffer,
  lidlCategoryId,
  lidlOfferMatchesDetail,
  lidlProductMasterRow,
  lidlStoreCategoryRow,
  lidlStoreProductRow,
  normalizeLidlProduct,
} from './lib/lidl.mjs';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const COUNTRY = String(process.env.LIDL_COUNTRY || 'ES').toUpperCase();
const STORE_ID = String(process.env.LIDL_STORE_ID || 'ES3572').toUpperCase();
const LANGUAGE = String(process.env.LIDL_LANGUAGE || 'es').toLowerCase();
const CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.CONCURRENCY || 4)));
const PAGE_SIZE = Math.min(500, Math.max(20, Number(process.env.PAGE_SIZE || 100)));
const MIN_PRODUCTS = lidlMinimumProducts(STORE_ID, Math.max(1, Number(process.env.MIN_PRODUCTS || 2200)));
const MIN_LEAVES = Math.max(1, Number(process.env.MIN_LEAVES || 35));
const MIN_NONEMPTY_LEAVES = Math.max(1, Number(process.env.MIN_NONEMPTY_LEAVES || 40));
const MIN_MATCHED_OFFERS = Math.max(0, Number(process.env.MIN_MATCHED_OFFERS || 1));
const EMPTY_LEAF_RETRIES = Math.max(0, Number(process.env.EMPTY_LEAF_RETRIES || 3));
const MIN_COVERAGE_RATIO = Math.min(1, Math.max(0.5, Number(process.env.MIN_COVERAGE_RATIO || 0.85)));
const MAX_LEAVES = process.env.MAX_LEAVES ? Math.max(1, Number(process.env.MAX_LEAVES)) : Infinity;
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.REQUEST_DELAY_MS || 50));
const CAMPAIGNS_FILE = String(process.env.LIDL_CAMPAIGNS_FILE || '').trim() || null;
const CAMPAIGNS_DISABLED = process.env.LIDL_CAMPAIGNS_DISABLED === '1';
const CAMPAIGNS_REQUIRED = process.env.LIDL_CAMPAIGNS_REQUIRED === '1';
const ENV_OFFER_REGION = String(process.env.LIDL_OFFER_REGION || '').trim() || null;
const runStart = new Date().toISOString();
const BASE = `https://product-catalog.lidlplus.com/api/app/v1/${COUNTRY}/store/${STORE_ID}`;
const OFFERS_URL = `https://offers.lidlplus.com/app/api/v4/${COUNTRY}/${STORE_ID}/offers`;
const headers = {
  Accept: 'application/json',
  'Accept-Language': LANGUAGE,
  'User-Agent': 'QueFalta catalog sync/1.0 (+https://quefalta.es)',
};

if (!/^[A-Z]{2}$/.test(COUNTRY)) throw new Error(`LIDL_COUNTRY inválido: ${COUNTRY}`);
if (!/^[A-Z]{2}\d+$/.test(STORE_ID)) throw new Error(`LIDL_STORE_ID inválido: ${STORE_ID}`);
if (!DRY_RUN && (!URL || !KEY)) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
if (!DRY_RUN && Number.isFinite(MAX_LEAVES)) throw new Error('MAX_LEAVES solo se permite con DRY_RUN=1');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, index * size + size));

async function getJson(path, tries = 5) {
  return lidlRequest(`${BASE}${path}`, { headers }, { label: path, attempts: tries });
}

async function getOffersJson(tries = 5) {
  return lidlRequest(OFFERS_URL, { headers }, { label: 'ofertas', attempts: tries });
}

async function discoverCategories() {
  const payload = await getJson('/categories');
  const roots = Array.isArray(payload?.categories) ? payload.categories : [];
  if (!roots.length) throw new Error('Lidl no devolvió categorías raíz');

  const categories = new Map();
  const leaves = [];
  for (const root of roots) {
    const rootId = String(root.id);
    categories.set(rootId, {
      id: rootId,
      api_id: rootId,
      name: root.name,
      parent_id: null,
      image_url: root.imageUrl ?? null,
      product_count: 0,
      published: true,
      synced_at: runStart,
    });
    if (!root.hasSubcategories) {
      leaves.push({ id: rootId, apiId: rootId, rootId, name: root.name, path: `/categories/${rootId}/products` });
      continue;
    }

    const childrenPayload = await getJson(`/categories/${rootId}/categories`);
    const children = Array.isArray(childrenPayload?.categories) ? childrenPayload.categories : [];
    if (!children.length) throw new Error(`categoría ${rootId} marcada con subcategorías pero vacía`);
    for (const child of children) {
      const childId = lidlCategoryId(rootId, child.id);
      categories.set(childId, {
        id: childId,
        api_id: String(child.id),
        name: child.name,
        parent_id: rootId,
        image_url: child.imageUrl ?? null,
        product_count: 0,
        published: true,
        synced_at: runStart,
      });
      leaves.push({
        id: childId,
        apiId: String(child.id),
        rootId,
        name: child.name,
        path: `/categories/${rootId}/categories/${child.id}/products`,
      });
    }
  }
  return { roots, categories, leaves };
}

async function fetchLeafOnce(leaf) {
  const products = [];
  let total = null;
  for (let skip = 0; total == null || skip < total; skip += PAGE_SIZE) {
    const payload = await getJson(`${leaf.path}?skip=${skip}&limit=${PAGE_SIZE}`);
    const page = Array.isArray(payload?.products) ? payload.products : [];
    const reportedTotal = Number(payload?.totalProducts);
    if (!Number.isFinite(reportedTotal) || reportedTotal < 0) throw new Error(`${leaf.id}: totalProducts inválido`);
    if (total == null) total = reportedTotal;
    if (reportedTotal !== total) throw new Error(`${leaf.id}: totalProducts cambió durante la paginación (${total} → ${reportedTotal})`);
    if (!page.length && skip < total) throw new Error(`${leaf.id}: página vacía en ${skip}/${total}`);
    products.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
  }
  if (products.length !== total) throw new Error(`${leaf.id}: se esperaban ${total} productos y llegaron ${products.length}`);
  return products;
}

async function fetchLeaf(leaf) {
  for (let attempt = 0; attempt <= EMPTY_LEAF_RETRIES; attempt++) {
    const products = await fetchLeafOnce(leaf);
    if (products.length || attempt === EMPTY_LEAF_RETRIES) return products;
    const waitMs = 1000 * 2 ** attempt;
    console.warn(`[lidl] ${leaf.id} (${leaf.name}) devolvió 0 productos; reintento ${attempt + 1}/${EMPTY_LEAF_RETRIES} en ${waitMs} ms`);
    await sleep(waitMs);
  }
  return [];
}

function mergeProduct(current, incoming) {
  if (!current) return incoming;
  current.category_ids = [...new Set([...current.category_ids, ...incoming.category_ids])];
  return current;
}

async function mergeCurrentOffers(rows) {
  const payload = await getOffersJson();
  const sourceOffers = Array.isArray(payload?.offers) ? payload.offers : null;
  const reportedTotal = Number(payload?.totalOffers);
  if (!sourceOffers || !Number.isFinite(reportedTotal) || reportedTotal !== sourceOffers.length) {
    throw new Error(`respuesta de ofertas incompleta: total=${payload?.totalOffers ?? 'n/a'} filas=${sourceOffers?.length ?? 'n/a'}`);
  }

  const liveOffers = sourceOffers.filter((offer) => isLiveLidlStoreOffer(offer, runStart));
  const detailCache = new Map();
  const detailFor = (id) => {
    if (!detailCache.has(id)) detailCache.set(id, getJson(`/products/${encodeURIComponent(id)}`));
    return detailCache.get(id);
  };

  const offerQueue = liveOffers.map((offer, index) => ({ offer, index }));
  const resolved = new Array(liveOffers.length);
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const queued = offerQueue.shift();
      if (!queued) break;
      const { offer, index } = queued;
      const candidates = rows.filter((row) => isLidlOfferCandidate(row.raw, offer));
      const verified = [];
      for (const candidate of candidates) {
        const detail = await detailFor(candidate.id);
        if (lidlOfferMatchesDetail(detail, offer)) verified.push(candidate);
      }
      resolved[index] = { offer, candidates: candidates.length, verified };
      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
    }
  }));

  let matched = 0;
  let matchedProducts = 0;
  const unmatched = [];
  const promotedIds = new Set();
  for (const result of resolved) {
    if (result.verified.length > 0) {
      let applied = 0;
      for (const row of result.verified) {
        if (promotedIds.has(row.id)) continue;
        Object.assign(row, applyLidlOffer(row, result.offer));
        promotedIds.add(row.id);
        matchedProducts++;
        applied++;
      }
      if (applied > 0) matched++;
    } else {
      unmatched.push(`${result.offer.title} (${result.candidates} candidatos)`);
    }
  }

  console.log(`[lidl] ofertas: ${sourceOffers.length} publicadas · ${liveOffers.length} vigentes en tienda · ${matched} campañas enlazadas a ${matchedProducts} productos · ${unmatched.length} sin enlace`);
  if (unmatched.length) console.warn(`[lidl] ofertas sin producto verificable: ${unmatched.join(' · ')}`);
  return { live: liveOffers.length, matched };
}

async function loadCampaignCatalog() {
  if (CAMPAIGNS_DISABLED) return null;
  try {
    const catalog = CAMPAIGNS_FILE
      ? JSON.parse(await readFile(CAMPAIGNS_FILE, 'utf8'))
      : await fetchLidlCampaignCatalog({ fetchedAt: runStart });
    return assertLidlCampaignCatalog(catalog);
  } catch (error) {
    if (CAMPAIGNS_REQUIRED) throw error;
    console.warn(`[lidl] campañas web omitidas: ${error.message}`);
    return null;
  }
}

async function mergeWeeklyCampaigns(rows, offerRegion) {
  if (!offerRegion) {
    console.warn('[lidl] campañas web omitidas: la tienda no tiene offer_region');
    return { source: 0, regional: 0, matched: 0 };
  }
  const catalog = await loadCampaignCatalog();
  if (!catalog) return { source: 0, regional: 0, matched: 0 };

  const priority = new Map([
    ['weekend', 50],
    ['weekly', 40],
    ['xxl', 30],
    ['price_drops', 20],
    ['unbeatable', 10],
  ]);
  const entries = catalog.campaigns
    .flatMap((campaign) => campaign.products.map((product) => ({ campaign, product })))
    .sort((a, b) => (priority.get(b.campaign.key) ?? 0) - (priority.get(a.campaign.key) ?? 0));
  const regionalEntries = entries.filter(({ product }) =>
    lidlCampaignPriceForRegion(product, offerRegion, runStart));
  const detailCache = new Map();
  const detailFor = (id) => {
    if (!detailCache.has(id)) detailCache.set(id, getJson(`/products/${encodeURIComponent(id)}`));
    return detailCache.get(id);
  };
  const queue = regionalEntries.map((entry, index) => ({ ...entry, index }));
  const resolved = new Array(regionalEntries.length);
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const queued = queue.shift();
      if (!queued) break;
      const candidates = rows.filter((row) => isLidlCampaignCandidate(row.raw, queued.product));
      const verified = [];
      for (const candidate of candidates) {
        if (lidlCampaignMatchesDetail(await detailFor(candidate.id), queued.product)) verified.push(candidate);
      }
      resolved[queued.index] = { ...queued, candidates: candidates.length, verified };
      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
    }
  }));

  const promotedIds = new Set();
  let matched = 0;
  let matchedProducts = 0;
  const unmatched = [];
  for (const result of resolved) {
    let applied = 0;
    for (const row of result.verified) {
      if (promotedIds.has(row.id)) continue;
      const promoted = applyLidlCampaign(row, result.campaign, result.product, offerRegion, runStart);
      if (!promoted) continue;
      Object.assign(row, promoted);
      promotedIds.add(row.id);
      matchedProducts++;
      applied++;
    }
    if (applied) matched++;
    else if (!result.verified.length) unmatched.push(`${result.product.fullTitle ?? result.product.title} (${result.candidates} candidatos)`);
  }
  console.log(`[lidl] campañas web: ${entries.length} productos · ${regionalEntries.length} regionales · ${matched} anuncios enlazados a ${matchedProducts} productos · ${unmatched.length} sin enlace`);
  if (unmatched.length) {
    const shown = unmatched.slice(0, 20);
    const suffix = unmatched.length > shown.length ? ` · … y ${unmatched.length - shown.length} más` : '';
    console.warn(`[lidl] campañas web sin producto verificable: ${shown.join(' · ')}${suffix}`);
  }
  return { source: entries.length, regional: regionalEntries.length, matched };
}

async function upsert(table, rows) {
  for (const batch of chunks(sortedLidlRows(rows), 250)) {
    await lidlRequest(`${URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    }, { label: `upsert ${table}`, json: false });
  }
}

async function currentPublishedCount() {
  const response = await fetch(`${URL}/rest/v1/lidl_store_products?select=product_id&store_id=eq.${encodeURIComponent(STORE_ID)}&published=eq.true`, {
    method: 'HEAD',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!response.ok) throw new Error(`recuento previo lidl_store_products/${STORE_ID}: HTTP ${response.status} ${await response.text()}`);
  const total = Number(response.headers.get('content-range')?.split('/').at(-1));
  if (!Number.isFinite(total)) throw new Error('recuento previo lidl_products sin Content-Range válido');
  return total;
}

async function assertStoreExists() {
  const response = await fetch(`${URL}/rest/v1/lidl_stores?select=id,offer_region&id=eq.${encodeURIComponent(STORE_ID)}&published=eq.true&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  if (!response.ok) throw new Error(`consulta lidl_stores/${STORE_ID}: HTTP ${response.status} ${await response.text()}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Error(`la tienda ${STORE_ID} no existe o no está publicada; sincroniza primero el directorio Lidl`);
  }
  return rows[0];
}

async function markStoreRowsStale(table, storeColumn) {
  const response = await fetch(
    `${URL}/rest/v1/${table}?${storeColumn}=eq.${encodeURIComponent(STORE_ID)}&synced_at=lt.${encodeURIComponent(runStart)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ published: false }),
    },
  );
  if (!response.ok) throw new Error(`obsoletos ${table}/${STORE_ID}: HTTP ${response.status} ${await response.text()}`);
}

async function main() {
  console.log(`[lidl] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} tienda=${STORE_ID}`);
  const store = DRY_RUN ? { id: STORE_ID, offer_region: ENV_OFFER_REGION } : await assertStoreExists();
  if (!DRY_RUN && !store.offer_region) throw new Error(`la tienda ${STORE_ID} no tiene offer_region`);
  const { roots, categories, leaves: allLeaves } = await discoverCategories();
  const leaves = allLeaves.slice(0, MAX_LEAVES);
  console.log(`[lidl] ${roots.length} raíces · ${allLeaves.length} hojas${leaves.length !== allLeaves.length ? ` · prueba limitada a ${leaves.length}` : ''}`);

  // A store may have a category tree while its entire product feed is empty.
  // Check three independent food branches before downloading/retrying 40 leaves.
  const probeLeaves = leaves.filter((leaf) => ['90', '10', '30'].includes(leaf.id));
  const probeResults = new Map();
  for (const leaf of probeLeaves) probeResults.set(leaf.id, await fetchLeaf(leaf));
  if (probeLeaves.length === 3 && [...probeResults.values()].every((rows) => rows.length === 0)) {
    throw new Error(`LIDL_CATALOG_EMPTY ${STORE_ID}: pan, fruta y carne vacíos tras reintentos; no se publica`);
  }

  const products = new Map();
  const leafCounts = new Map();
  const queue = [...leaves];
  let completed = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const leaf = queue.shift();
      if (!leaf) break;
      const pageProducts = probeResults.get(leaf.id) ?? await fetchLeaf(leaf);
      leafCounts.set(leaf.id, pageProducts.length);
      for (const product of pageProducts) {
        const row = normalizeLidlProduct(product, leaf);
        if (!row.id || !row.display_name) throw new Error(`${leaf.id}: producto sin id o nombre`);
        row.source_store_id = STORE_ID;
        row.synced_at = runStart;
        products.set(row.id, mergeProduct(products.get(row.id), row));
      }
      completed++;
      console.log(`[lidl] ${completed}/${leaves.length} hojas · ${products.size} productos únicos`);
      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
    }
  }));

  const rows = [...products.values()];
  const campaignStats = await mergeWeeklyCampaigns(rows, store.offer_region);
  const offerStats = await mergeCurrentOffers(rows);
  const promoted = rows.filter((row) => row.promo_name != null).length;
  const withCampaignEvidence = rows.filter((row) => row.raw?.campaign != null).length;
  console.log(`[lidl] promociones finales: ${promoted} productos · ${withCampaignEvidence} con evidencia de campaña web · feed=${offerStats.matched} · web=${campaignStats.matched}`);
  for (const row of rows) for (const categoryId of row.category_ids) {
    const category = categories.get(categoryId);
    if (category) category.product_count++;
  }
  const categoryRows = [...categories.values()].filter((category) =>
    category.parent_id == null || leaves.some((leaf) => leaf.id === category.id));
  const priced = rows.filter((row) => row.unit_price != null).length;
  const imaged = rows.filter((row) => row.thumbnail).length;
  const withPricePerUnit = rows.filter((row) => row.price_per_unit != null).length;
  const available = rows.filter((row) => row.available).length;
  const food = rows.filter((row) => row.product_line === 'Food').length;
  const fruitVegetables = rows.filter((row) => row.product_line === 'FruitsAndVegetables').length;
  const butifarra = rows.find((row) => /butifarra fresca de cerdo/i.test(row.display_name));
  console.log(`[lidl] ${rows.length} productos · ${categoryRows.length} categorías · ${priced} con precio · ${withPricePerUnit} con €/unidad · ${imaged} con imagen · ${available} disponibles`);
  console.log(`[lidl] productLine: Food=${food} · FruitsAndVegetables=${fruitVegetables} · otros=${rows.length - food - fruitVegetables}`);
  if (butifarra) console.log(`[lidl] comprobación: ${butifarra.display_name} · ${butifarra.price_format} · id=${butifarra.id}`);

  if (DRY_RUN) {
    for (const row of rows.slice(0, 6)) {
      console.log(`  ${row.id} · ${row.display_name} · ${row.price_format ?? 'sin precio'} · ${row.category_name}`);
    }
    return;
  }

  if (allLeaves.length < MIN_LEAVES) throw new Error(`solo ${allLeaves.length} hojas (< ${MIN_LEAVES}); árbol de categorías posiblemente incompleto`);
  const nonEmptyLeaves = [...leafCounts.values()].filter((count) => count > 0).length;
  if (nonEmptyLeaves < MIN_NONEMPTY_LEAVES) {
    const emptyLeaves = leaves.filter((leaf) => !leafCounts.get(leaf.id)).map((leaf) => `${leaf.id} (${leaf.name})`).join(', ');
    throw new Error(`solo ${nonEmptyLeaves} hojas con productos (< ${MIN_NONEMPTY_LEAVES}); vacías: ${emptyLeaves}`);
  }
  if (rows.length < MIN_PRODUCTS) throw new Error(`solo ${rows.length} productos (< ${MIN_PRODUCTS}); catálogo posiblemente parcial`);
  if (priced / rows.length < 0.95) throw new Error(`cobertura de precio insuficiente: ${priced}/${rows.length}`);
  if (imaged / rows.length < 0.90) throw new Error(`cobertura de imagen insuficiente: ${imaged}/${rows.length}`);
  if (offerStats.live > 0 && offerStats.matched < MIN_MATCHED_OFFERS) {
    throw new Error(`ninguna oferta Lidl enlazada (< ${MIN_MATCHED_OFFERS}); contrato o correspondencia posiblemente cambiados`);
  }
  const previousCount = await currentPublishedCount();
  if (previousCount && rows.length / previousCount < MIN_COVERAGE_RATIO) {
    throw new Error(`cobertura frente al catálogo anterior insuficiente: ${rows.length}/${previousCount} (< ${MIN_COVERAGE_RATIO})`);
  }

  const sharedCategories = categoryRows.map(({ product_count: _count, ...category }) => category);
  await upsert('lidl_categories', sharedCategories);
  await upsert('lidl_product_master', rows.map(lidlProductMasterRow));
  await upsert('lidl_store_products', rows.map((row) => lidlStoreProductRow(row, STORE_ID)));
  await upsert('lidl_store_categories', categoryRows.map((category) => lidlStoreCategoryRow(category, STORE_ID)));
  await markStoreRowsStale('lidl_store_products', 'store_id');
  await markStoreRowsStale('lidl_store_categories', 'store_id');

  // Compatibilidad temporal con las builds publicadas, que solo conocen el
  // catálogo de referencia. Nunca se escriben aquí datos de otra tienda.
  if (STORE_ID === 'ES3572') {
    await upsert('lidl_categories', categoryRows);
    await upsert('lidl_products', rows);
    await markStale({ url: URL, key: KEY, table: 'lidl_products', runStart });
    await markStale({ url: URL, key: KEY, table: 'lidl_categories', runStart });
  }
  await recordCatalogSync({ url: URL, key: KEY, store: 'lidl' });
  console.log('[lidl] OK');
}

main().catch((error) => {
  console.error('[lidl] ERROR', error);
  if (process.send) {
    process.send({ type: 'lidl-error', message: String(error.message).slice(0, 1800) }, () => process.exit(1));
  } else process.exit(1);
});
