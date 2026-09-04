#!/usr/bin/env node
// Sincroniza el catálogo público de Lidl Plus España para una tienda de
// referencia. No inicia sesión ni usa Scan&Go: los códigos de la API pública
// son identificadores internos y `ean` queda NULL hasta disponer de una fuente
// de barcode autorizada.
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE
//      LIDL_STORE_ID=ES3572, LIDL_COUNTRY=ES, LIDL_LANGUAGE=es
//      CONCURRENCY=4, PAGE_SIZE=100, MIN_PRODUCTS=2200, MIN_LEAVES=35
//      MIN_NONEMPTY_LEAVES=40, EMPTY_LEAF_RETRIES=3
//      MIN_COVERAGE_RATIO=0.85 (respecto al catálogo publicado anterior)
//      DRY_RUN=1, MAX_LEAVES=N (solo permitido con DRY_RUN)
import { markStale } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';
import { lidlCategoryId, normalizeLidlProduct } from './lib/lidl.mjs';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const COUNTRY = String(process.env.LIDL_COUNTRY || 'ES').toUpperCase();
const STORE_ID = String(process.env.LIDL_STORE_ID || 'ES3572').toUpperCase();
const LANGUAGE = String(process.env.LIDL_LANGUAGE || 'es').toLowerCase();
const CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.CONCURRENCY || 4)));
const PAGE_SIZE = Math.min(500, Math.max(20, Number(process.env.PAGE_SIZE || 100)));
const MIN_PRODUCTS = Math.max(1, Number(process.env.MIN_PRODUCTS || 2200));
const MIN_LEAVES = Math.max(1, Number(process.env.MIN_LEAVES || 35));
const MIN_NONEMPTY_LEAVES = Math.max(1, Number(process.env.MIN_NONEMPTY_LEAVES || 40));
const EMPTY_LEAF_RETRIES = Math.max(0, Number(process.env.EMPTY_LEAF_RETRIES || 3));
const MIN_COVERAGE_RATIO = Math.min(1, Math.max(0.5, Number(process.env.MIN_COVERAGE_RATIO || 0.85)));
const MAX_LEAVES = process.env.MAX_LEAVES ? Math.max(1, Number(process.env.MAX_LEAVES)) : Infinity;
const REQUEST_DELAY_MS = Math.max(0, Number(process.env.REQUEST_DELAY_MS || 50));
const runStart = new Date().toISOString();
const BASE = `https://product-catalog.lidlplus.com/api/app/v1/${COUNTRY}/store/${STORE_ID}`;
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
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    if (attempt) await sleep(750 * 2 ** (attempt - 1));
    try {
      const response = await fetch(`${BASE}${path}`, {
        headers,
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return await response.json();
      lastError = new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`${path}: respuesta vacía`);
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

async function upsert(table, rows) {
  for (const batch of chunks(rows, 250)) {
    const response = await fetch(`${URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) throw new Error(`upsert ${table}: HTTP ${response.status} ${await response.text()}`);
  }
}

async function currentPublishedCount() {
  const response = await fetch(`${URL}/rest/v1/lidl_products?select=id&published=eq.true`, {
    method: 'HEAD',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!response.ok) throw new Error(`recuento previo lidl_products: HTTP ${response.status} ${await response.text()}`);
  const total = Number(response.headers.get('content-range')?.split('/').at(-1));
  if (!Number.isFinite(total)) throw new Error('recuento previo lidl_products sin Content-Range válido');
  return total;
}

async function main() {
  console.log(`[lidl] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} tienda=${STORE_ID}`);
  const { roots, categories, leaves: allLeaves } = await discoverCategories();
  const leaves = allLeaves.slice(0, MAX_LEAVES);
  console.log(`[lidl] ${roots.length} raíces · ${allLeaves.length} hojas${leaves.length !== allLeaves.length ? ` · prueba limitada a ${leaves.length}` : ''}`);

  const products = new Map();
  const leafCounts = new Map();
  const queue = [...leaves];
  let completed = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const leaf = queue.shift();
      if (!leaf) break;
      const pageProducts = await fetchLeaf(leaf);
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
  const previousCount = await currentPublishedCount();
  if (previousCount && rows.length / previousCount < MIN_COVERAGE_RATIO) {
    throw new Error(`cobertura frente al catálogo anterior insuficiente: ${rows.length}/${previousCount} (< ${MIN_COVERAGE_RATIO})`);
  }

  await upsert('lidl_categories', categoryRows);
  await upsert('lidl_products', rows);
  await markStale({ url: URL, key: KEY, table: 'lidl_products', runStart });
  await markStale({ url: URL, key: KEY, table: 'lidl_categories', runStart });
  await recordCatalogSync({ url: URL, key: KEY, store: 'lidl' });
  console.log('[lidl] OK');
}

main().catch((error) => {
  console.error('[lidl] ERROR', error);
  process.exit(1);
});
