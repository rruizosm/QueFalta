#!/usr/bin/env node
// Sincroniza BM Supermercados -> Supabase con precio, oferta, disponibilidad y
// novedad por zona de entrega. La fuente es la API publica de la tienda online.
//
// Jerarquia: BM publica hasta seis niveles, pero QueFalta guarda y expone solo
// Categoria -> Subcategoria. Los niveles N3-N6 se usan para resolver esa pareja
// y permanecen unicamente dentro de raw.quefaltaNavigation.sourcePathIds.
//
// Seguridad de escritura:
//   1. Resuelve y descarga TODAS las zonas antes de tocar Supabase.
//   2. Aborta si falta una zona, una pagina o cae la cobertura observada.
//   3. Ejecuta markStale solo despues de completar todos los upserts.
//
// Env:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE
//   DRY_RUN=1                 no escribe
//   POSTAL_CODES=csv          por defecto, las siete zonas validadas en Fase 1
//   CONCURRENCY=6             paginas simultaneas dentro de una zona
//   REQUEST_DELAY_MS=80       separacion global entre inicios de peticion
//   MAX_PAGES=N               solo para DRY_RUN; una ejecucion parcial no escribe
//   MIN_LOCATIONS=7
//   MIN_PRODUCTS=6500
//   MIN_COVERAGE_RATIO=0.97

import {
  BM_API_BASE_URL,
  BM_SUPPORTED_POSTAL_CODES,
  bmCatalogOffset,
  bmLocationHeaders,
  flattenBmShippingAreas,
  normalizeBmProduct,
  parseBmPostalCodes,
  selectPreferredBmLocation,
  validateBmCatalogPage,
} from './lib/bm.mjs';
import {
  assertBmCatalogCoverage,
  bmAreaRows,
  bmLocationPriceRow,
  bmProductRow,
  buildBmTwoLevelNavigation,
  resolveBmProductNavigation,
} from './lib/bm-sync.mjs';
import { markStale as markStaleBatched } from './lib/stale.mjs';
import { recordCatalogSync } from './lib/sync-status.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const DRY_RUN = process.env.DRY_RUN === '1';
const POSTAL_CODES = parseBmPostalCodes(process.env.POSTAL_CODES ?? BM_SUPPORTED_POSTAL_CODES.join(','));
const CONCURRENCY = integerEnv('CONCURRENCY', 6, 1, 12);
const REQUEST_DELAY_MS = integerEnv('REQUEST_DELAY_MS', 80, 0, 5000);
const MAX_PAGES = process.env.MAX_PAGES == null
  ? Infinity
  : integerEnv('MAX_PAGES', 1, 1, 1000);
const MIN_LOCATIONS = integerEnv('MIN_LOCATIONS', 7, 1, 50);
const MIN_PRODUCTS = integerEnv('MIN_PRODUCTS', 6500, 1, 100000);
const MIN_COVERAGE_RATIO = numberEnv('MIN_COVERAGE_RATIO', 0.97, 0.5, 1);
const PAGE_SIZE = 20; // limite real de BM aunque se solicite un bloque mayor
const UPSERT_BATCH = 250;
const runStart = new Date().toISOString();
const USER_AGENT = 'QueFalta BM catalog sync/1.0 (+https://quefalta.es)';

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_ROLE)) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE (o usa DRY_RUN=1)');
}
if (!DRY_RUN && Number.isFinite(MAX_PAGES)) {
  throw new Error('MAX_PAGES solo se admite con DRY_RUN=1; un catalogo parcial nunca se escribe');
}

function integerEnv(name, fallback, min, max) {
  const value = process.env[name] == null ? fallback : Number(process.env[name]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}`);
  }
  return value;
}

function numberEnv(name, fallback, min, max) {
  const value = process.env[name] == null ? fallback : Number(process.env[name]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} debe estar entre ${min} y ${max}`);
  }
  return value;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const chunks = (rows, size) => Array.from(
  { length: Math.ceil(rows.length / size) },
  (_, index) => rows.slice(index * size, index * size + size),
);

let requestGate = Promise.resolve();
let nextRequestAt = 0;

async function waitForRequestSlot() {
  const previous = requestGate;
  let release;
  requestGate = new Promise((resolve) => { release = resolve; });
  await previous;
  const wait = Math.max(0, nextRequestAt - Date.now());
  if (wait) await sleep(wait);
  nextRequestAt = Date.now() + REQUEST_DELAY_MS;
  release();
}

function retryDelay(response, attempt) {
  const retryAfter = Number(response?.headers?.get('retry-after'));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : 700 * 2 ** attempt;
}

async function fetchJson(url, headers = {}, label = url, tries = 4) {
  let lastError;
  for (let attempt = 0; attempt < tries; attempt++) {
    await waitForRequestSlot();
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return response.json();
      const body = (await response.text()).slice(0, 400);
      lastError = new Error(`${label}: HTTP ${response.status} ${body}`);
      lastError.retryable = response.status === 429 || response.status >= 500;
      if (!lastError.retryable) throw lastError;
      if (attempt < tries - 1) await sleep(retryDelay(response, attempt));
    } catch (error) {
      lastError = error;
      if (error?.retryable === false) throw error;
      if (attempt < tries - 1) await sleep(700 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error(`${label}: respuesta no disponible`);
}

async function resolvePostalCode(postalCode) {
  const url = new URL(`${BM_API_BASE_URL}/shipping/area`);
  url.searchParams.set('shippingMethod', 'D,X,T,L');
  url.searchParams.set('showDisableStore', 'false');
  url.searchParams.set('zipCode', postalCode);
  const areas = flattenBmShippingAreas(
    await fetchJson(url, {}, `shipping/area ${postalCode}`),
    postalCode,
  );
  const selected = selectPreferredBmLocation(areas);
  if (!selected) throw new Error(`BM no devolvio una ubicacion habilitada para ${postalCode}`);
  return { postalCode, areas, selected };
}

async function fetchMenu(location) {
  return fetchJson(
    `${BM_API_BASE_URL}/shopping/category/menu`,
    bmLocationHeaders(location),
    `menu ${location.shippingZoneId}`,
  );
}

function catalogUrl(offset) {
  const url = new URL(`${BM_API_BASE_URL}/catalog/product`);
  url.searchParams.set('blockSize', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('orderById', '3');
  return url;
}

async function fetchCatalogPage(location, offset) {
  const payload = await fetchJson(
    catalogUrl(offset),
    bmLocationHeaders(location),
    `catalogo ${location.shippingZoneId} offset=${offset}`,
  );
  return validateBmCatalogPage(payload);
}

async function fetchLocationCatalog(location) {
  const first = await fetchCatalogPage(location, 0);
  const total = Number(first.totalCount);
  const announcedPages = Math.ceil(total / PAGE_SIZE);
  const pages = Math.min(announcedPages, MAX_PAGES);
  const products = new Map();
  const ingest = (rows) => {
    for (const rawProduct of rows ?? []) {
      if (rawProduct?.code == null || rawProduct?.type === 'recipe') continue;
      products.set(String(rawProduct.code), rawProduct);
    }
  };
  ingest(first.products);

  const offsets = Array.from(
    { length: Math.max(0, pages - 1) },
    (_, index) => bmCatalogOffset(index + 2, PAGE_SIZE),
  );
  let completed = 1;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const offset = offsets.shift();
      if (offset == null) break;
      const page = await fetchCatalogPage(location, offset);
      ingest(page.products);
      completed++;
      if (completed % 50 === 0 || completed === pages) {
        console.log(
          `[bm] ${location.shippingZoneId}: ${completed}/${pages} paginas · ${products.size}/${total}`,
        );
      }
    }
  }));

  return {
    products: [...products.values()],
    summary: {
      locationId: location.shippingZoneId,
      products: products.size,
      total,
      pages,
      announcedPages,
    },
  };
}

function mergeNavigation(targetCategories, targetNavigation, navigation) {
  for (const category of navigation.categories) {
    const current = targetCategories.get(category.id);
    if (current && current.parent_id !== category.parent_id) {
      throw new Error(
        `categoria BM ${category.id} cambio de padre (${current.parent_id} -> ${category.parent_id})`,
      );
    }
    targetCategories.set(category.id, category);
  }
  for (const [sourceId, mapped] of navigation.navigationBySourceId) {
    const current = targetNavigation.get(sourceId);
    if (current && (
      current.rootCategoryId !== mapped.rootCategoryId
      || current.categoryId !== mapped.categoryId
    )) {
      throw new Error(`ruta BM inconsistente para categoria fuente ${sourceId}`);
    }
    targetNavigation.set(sourceId, mapped);
  }
}

async function supabaseUpsert(table, rows) {
  for (const [index, batch] of chunks(rows, UPSERT_BATCH).entries()) {
    let lastError;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
          method: 'POST',
          headers: {
            apikey: SERVICE_ROLE,
            Authorization: `Bearer ${SERVICE_ROLE}`,
            'Content-Type': 'application/json',
            Prefer: 'resolution=merge-duplicates,return=minimal',
          },
          body: JSON.stringify(batch),
        });
        if (response.ok) { lastError = null; break; }
        lastError = new Error(`${table}: HTTP ${response.status} ${await response.text()}`);
        if (response.status !== 429 && response.status < 500) throw lastError;
      } catch (error) {
        lastError = error;
      }
      if (attempt < 3) await sleep(1000 * 2 ** attempt);
    }
    if (lastError) throw lastError;
    if ((index + 1) % 25 === 0 || index === chunks(rows, UPSERT_BATCH).length - 1) {
      console.log(`[bm] upsert ${table}: ${Math.min((index + 1) * UPSERT_BATCH, rows.length)}/${rows.length}`);
    }
  }
}

const markStale = (table, options = {}) => markStaleBatched({
  url: SUPABASE_URL,
  key: SERVICE_ROLE,
  table,
  runStart,
  ...options,
});

async function disableStalePostalMappings(postalCodes) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/bm_postal_locations`
      + `?synced_at=lt.${encodeURIComponent(runStart)}`
      + '&enabled=eq.true'
      + `&postal_code=in.(${postalCodes.join(',')})`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ enabled: false, synced_at: runStart }),
    },
  );
  if (!response.ok) {
    throw new Error(`bm_postal_locations stale: HTTP ${response.status} ${await response.text()}`);
  }
}

async function main() {
  console.log(
    `[bm] inicio ${runStart}${DRY_RUN ? ' (DRY RUN)' : ''} · CP=${POSTAL_CODES.join(',')} · conc=${CONCURRENCY}`,
  );

  const resolved = [];
  for (const postalCode of POSTAL_CODES) {
    const item = await resolvePostalCode(postalCode);
    resolved.push(item);
    console.log(
      `[bm] ${postalCode} -> ${item.selected.storeName} (${item.selected.zoneId}/${item.selected.shippingZoneId})`,
    );
  }

  const selectedByLocation = new Map(
    resolved.map((item) => [item.selected.shippingZoneId, item.selected]),
  );
  const categoryById = new Map();
  const navigationBySourceId = new Map();
  const productById = new Map();
  const locationPriceById = new Map();
  const locationById = new Map();
  const postalLocationById = new Map();
  const summaries = [];

  for (const item of resolved) {
    const areaRows = bmAreaRows(item.areas, item.selected, runStart);
    for (const row of areaRows.locations) locationById.set(row.id, row);
    for (const row of areaRows.postalLocations) {
      postalLocationById.set(`${row.postal_code}:${row.location_id}`, row);
    }
  }

  for (const location of selectedByLocation.values()) {
    const menu = await fetchMenu(location);
    const navigation = buildBmTwoLevelNavigation(menu, { syncedAt: runStart });
    mergeNavigation(categoryById, navigationBySourceId, navigation);

    const catalog = await fetchLocationCatalog(location);
    summaries.push(catalog.summary);
    console.log(
      `[bm] ${location.shippingZoneId}: ${catalog.summary.products}/${catalog.summary.total} productos · ${navigation.categories.length} categorias N1/N2`,
    );

    for (const rawProduct of catalog.products) {
      const normalized = normalizeBmProduct(rawProduct, location);
      const productNavigation = resolveBmProductNavigation(normalized, navigationBySourceId);
      const current = productById.get(normalized.id);
      if (!current) {
        productById.set(
          normalized.id,
          bmProductRow(rawProduct, normalized, productNavigation, runStart),
        );
      } else if (current.category_id == null && productNavigation) {
        current.root_category_id = productNavigation.rootCategoryId;
        current.category_id = productNavigation.categoryId;
        current.category_name = productNavigation.categoryName;
        current.raw.quefaltaNavigation = {
          rootCategoryId: productNavigation.rootCategoryId,
          categoryId: productNavigation.categoryId,
          sourcePathIds: productNavigation.sourcePathIds,
        };
      }
      const locationRow = bmLocationPriceRow(normalized, location.shippingZoneId, runStart);
      locationPriceById.set(locationRow.id, locationRow);
    }
  }

  const productRows = [...productById.values()];
  const categoryCounts = new Map();
  for (const product of productRows) {
    if (product.root_category_id) {
      categoryCounts.set(
        product.root_category_id,
        (categoryCounts.get(product.root_category_id) ?? 0) + 1,
      );
    }
    if (product.category_id) {
      categoryCounts.set(
        product.category_id,
        (categoryCounts.get(product.category_id) ?? 0) + 1,
      );
    }
  }
  const categoryRows = [...categoryById.values()]
    .map((category) => ({
      ...category,
      product_count: categoryCounts.get(category.id) ?? 0,
    }))
    .sort((left, right) => Number(left.parent_id != null) - Number(right.parent_id != null));
  const locationRows = [...locationById.values()];
  const postalLocationRows = [...postalLocationById.values()];
  const locationPriceRows = [...locationPriceById.values()];
  const offerRows = locationPriceRows.filter((row) => row.promo_type != null).length;
  const newRows = locationPriceRows.filter((row) => row.is_new).length;
  const uncategorized = productRows.filter((row) => row.category_id == null).length;

  console.log(
    `[bm] total: ${productRows.length} productos unicos · ${locationPriceRows.length} variantes · ${categoryRows.length} categorias N1/N2 · ${offerRows} ofertas · ${newRows} novedades · ${uncategorized} sin categoria`,
  );

  if (Number.isFinite(MAX_PAGES)) {
    console.warn('[bm] MAX_PAGES activo: muestra parcial, se omite el guardarrail de cobertura');
  } else {
    assertBmCatalogCoverage(summaries, {
      minLocations: MIN_LOCATIONS,
      minProducts: MIN_PRODUCTS,
      minCoverageRatio: MIN_COVERAGE_RATIO,
    });
  }

  if (DRY_RUN) {
    console.log('[bm] muestra de productos:');
    for (const row of productRows.slice(0, 6)) {
      console.log(
        `  ${row.id} ${row.display_name} · ${row.price_format ?? 'sin precio'} · ${row.root_category_id ?? '-'}>${row.category_id ?? '-'}`,
      );
    }
    return;
  }

  await supabaseUpsert('bm_categories', categoryRows);
  await supabaseUpsert('bm_products', productRows);
  await supabaseUpsert('bm_locations', locationRows);
  await supabaseUpsert('bm_postal_locations', postalLocationRows);
  await supabaseUpsert('catalog_location_prices', locationPriceRows);

  await markStale('bm_products');
  await markStale('bm_categories');
  await markStale('bm_locations');
  await markStale('catalog_location_prices', { filters: 'store=eq.bm' });
  await disableStalePostalMappings(POSTAL_CODES);
  await recordCatalogSync({ url: SUPABASE_URL, key: SERVICE_ROLE, store: 'bm' });
  console.log('[bm] OK');
}

main().catch((error) => {
  console.error(`[bm] ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
