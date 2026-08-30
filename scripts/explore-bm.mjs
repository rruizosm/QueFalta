#!/usr/bin/env node
// Explorador de solo lectura del catalogo publico de BM. No carga .env.local,
// no usa credenciales y no contiene ningun camino de escritura a Supabase.

import {
  BM_API_BASE_URL,
  BM_BASE_URL,
  bmCatalogOffset,
  bmLocationHeaders,
  compareBmProductSamples,
  flattenBmCategories,
  flattenBmShippingAreas,
  normalizeBmProduct,
  parseBmPostalCodes,
  selectPreferredBmLocation,
  summarizeBmProducts,
  validateBmCatalogPage,
} from './lib/bm.mjs';

const POSTAL_CODES = parseBmPostalCodes(process.env.POSTAL_CODES);
const PAGE_SIZE = boundedInteger(process.env.PAGE_SIZE, 20, 1, 20);
const SAMPLE_PAGES = boundedInteger(process.env.SAMPLE_PAGES, 2, 1, 10);
const DETAIL_SAMPLES = boundedInteger(process.env.DETAIL_SAMPLES, 3, 0, 5);
const PREVIEW_PRODUCTS = boundedInteger(process.env.PREVIEW_PRODUCTS, 3, 0, 20);
const REQUEST_DELAY_MS = boundedInteger(process.env.REQUEST_DELAY_MS, 120, 0, 5000);
const REQUEST_TIMEOUT_MS = boundedInteger(process.env.REQUEST_TIMEOUT_MS, 25000, 1000, 120000);
const MAX_RETRIES = boundedInteger(process.env.MAX_RETRIES, 3, 1, 8);
const USER_AGENT = 'QueFalta BM catalog explorer/1.0 (+https://quefalta.es)';

function boundedInteger(value, fallback, min, max) {
  const parsed = value == null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Valor entero fuera de rango (${min}-${max}): ${value}`);
  }
  return parsed;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, extraHeaders = {}) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (REQUEST_DELAY_MS) await sleep(REQUEST_DELAY_MS);
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...extraHeaders },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.ok) return response.json();
      const responseText = (await response.text()).slice(0, 400);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_RETRIES) {
        throw new Error(`${response.status} ${url}: ${responseText}`);
      }
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 750 * attempt);
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await sleep(750 * attempt);
    }
  }
  throw new Error(`No se pudo consultar ${url}`);
}

function configValue(config, path, fallback) {
  let value = config;
  for (const key of path) value = value?.[key];
  return value ?? fallback;
}

async function resolveLocation(postalCode) {
  const url = new URL(`${BM_API_BASE_URL}/shipping/area`);
  url.searchParams.set('shippingMethod', 'D,X,T,L');
  url.searchParams.set('showDisableStore', 'false');
  url.searchParams.set('zipCode', postalCode);
  const payload = await fetchJson(url);
  const areas = flattenBmShippingAreas(payload, postalCode);
  return { areas, selected: selectPreferredBmLocation(areas) };
}

async function fetchCatalogSample(location) {
  const headers = bmLocationHeaders(location);
  const products = new Map();
  let totalCount = null;
  let hasMore = false;
  for (let page = 1; page <= SAMPLE_PAGES; page++) {
    const url = new URL(`${BM_API_BASE_URL}/catalog/product`);
    url.searchParams.set('blockSize', String(PAGE_SIZE));
    url.searchParams.set('offset', String(bmCatalogOffset(page, PAGE_SIZE)));
    url.searchParams.set('orderById', '3');
    const payload = validateBmCatalogPage(await fetchJson(url, headers));
    totalCount = Number(payload.totalCount);
    hasMore = payload.hasMore === true;
    for (const rawProduct of payload.products) {
      const product = normalizeBmProduct(rawProduct, location);
      products.set(product.id, product);
    }
    if (!hasMore || payload.products.length < PAGE_SIZE) break;
  }
  return { totalCount, hasMore, products: [...products.values()] };
}

async function fetchOfferCount(location, offerCategoryId) {
  const url = new URL(`${BM_API_BASE_URL}/catalog/product`);
  url.searchParams.set('blockSize', '1');
  url.searchParams.set('offset', '0');
  url.searchParams.set('categories', String(offerCategoryId));
  const payload = validateBmCatalogPage(await fetchJson(url, bmLocationHeaders(location)));
  return Number(payload.totalCount);
}

async function fetchCategorySummary(location) {
  const payload = await fetchJson(`${BM_API_BASE_URL}/shopping/category/menu`, bmLocationHeaders(location));
  const categories = flattenBmCategories(payload);
  return {
    categoryNodes: categories.length,
    rootCategories: categories.filter((category) => category.parentId == null).length,
    maxDepth: categories.reduce((maximum, category) => Math.max(maximum, category.pathIds.length), 0),
  };
}

function detailSignals(product) {
  const attributes = [
    ...(product?.productData?.attributes ?? []),
    ...(product?.productData?.attributeGroups ?? []).flatMap((group) => group?.attributes ?? []),
  ];
  const codes = new Set(attributes.map((attribute) => String(attribute?.code ?? '')));
  return {
    code: String(product?.code ?? ''),
    attributeCount: codes.size,
    hasNutritionalSignal: codes.has('nutritional.info.date'),
    hasAllergenFlags: [...codes].some((code) => code.startsWith('filter.id.') && code.endsWith('Free')),
    containsAllergensOrIntolerances: product?.productData?.containAllergensIntolernacies === true,
  };
}

async function fetchDetailCoverage(location, products) {
  const details = [];
  for (const product of products.slice(0, DETAIL_SAMPLES)) {
    const url = `${BM_API_BASE_URL}/catalog/product/code/${encodeURIComponent(product.id)}`;
    details.push(detailSignals(await fetchJson(url, bmLocationHeaders(location))));
  }
  return details;
}

async function explorePostalCode(postalCode, offerCategoryId) {
  console.error(`[bm-poc] resolviendo CP ${postalCode}`);
  const { areas, selected } = await resolveLocation(postalCode);
  if (!selected) {
    return { postalCode, supported: false, reason: 'BM no devolvio una zona habilitada', availableAreas: areas };
  }

  console.error(`[bm-poc] CP ${postalCode} -> ${selected.storeName} (${selected.zoneId}/${selected.shippingZoneId})`);
  const [catalog, offers, categories] = await Promise.all([
    fetchCatalogSample(selected),
    fetchOfferCount(selected, offerCategoryId),
    fetchCategorySummary(selected),
  ]);
  const details = await fetchDetailCoverage(selected, catalog.products);
  return {
    postalCode,
    supported: true,
    location: selected,
    alternativeAreas: areas.filter((area) => area.shippingZoneId !== selected.shippingZoneId),
    catalog: {
      totalProducts: catalog.totalCount,
      totalOffers: offers,
      ...categories,
      sample: summarizeBmProducts(catalog.products),
      detailSignals: details,
      preview: catalog.products.slice(0, PREVIEW_PRODUCTS),
    },
    _products: catalog.products,
  };
}

async function main() {
  const startedAt = new Date();
  console.error(`[bm-poc] inicio ${startedAt.toISOString()} (solo lectura)`);
  const config = await fetchJson(`${BM_BASE_URL}/config.json`);
  const offerCategoryId = configValue(config, ['params', 'general', 'offerCategoryId'], 99999);
  const reports = [];
  const errors = [];

  for (const postalCode of POSTAL_CODES) {
    try {
      reports.push(await explorePostalCode(postalCode, offerCategoryId));
    } catch (error) {
      errors.push({ postalCode, message: error instanceof Error ? error.message : String(error) });
      reports.push({ postalCode, supported: false, reason: 'Error consultando la fuente' });
    }
  }

  const supported = reports.filter((report) => report.supported);
  const reference = supported[0] ?? null;
  const comparisons = reference ? supported.slice(1).map((candidate) => ({
    referencePostalCode: reference.postalCode,
    candidatePostalCode: candidate.postalCode,
    totalProductDifference: candidate.catalog.totalProducts - reference.catalog.totalProducts,
    totalOfferDifference: candidate.catalog.totalOffers - reference.catalog.totalOffers,
    ...compareBmProductSamples(reference._products, candidate._products),
  })) : [];

  const finishedAt = new Date();
  const publicReports = reports.map(({ _products, ...report }) => report);
  const report = {
    schemaVersion: 1,
    mode: 'read-only',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    source: {
      baseUrl: BM_BASE_URL,
      apiVersion: 'V1.0',
      offerCategoryId,
      requestedPostalCodes: POSTAL_CODES,
      pageSize: PAGE_SIZE,
      samplePages: SAMPLE_PAGES,
      detailSamples: DETAIL_SAMPLES,
    },
    summary: {
      requestedPostalCodes: POSTAL_CODES.length,
      supportedPostalCodes: supported.length,
      unsupportedPostalCodes: reports.length - supported.length,
      errors: errors.length,
      distinctZones: new Set(supported.map((item) => item.location.zoneId)).size,
      minProducts: supported.length ? Math.min(...supported.map((item) => item.catalog.totalProducts)) : null,
      maxProducts: supported.length ? Math.max(...supported.map((item) => item.catalog.totalProducts)) : null,
      minOffers: supported.length ? Math.min(...supported.map((item) => item.catalog.totalOffers)) : null,
      maxOffers: supported.length ? Math.max(...supported.map((item) => item.catalog.totalOffers)) : null,
    },
    locations: publicReports,
    comparisons,
    errors,
  };

  console.log(JSON.stringify(report, null, 2));
  if (!supported.length || errors.length === POSTAL_CODES.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[bm-poc] ERROR', error);
  process.exit(1);
});
