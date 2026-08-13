#!/usr/bin/env node
// Materializa los 15 catálogos en catalog_product_embeddings.
// Solo los cambios de content_hash disparan un nuevo trabajo pgmq.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validGlobalGtin } from './lib/gtin.mjs';
import { deriveCatalogUnitQuantity } from './lib/catalog-embedding-unit.mjs';

const ROOT = new URL('../', import.meta.url);
const PAGE_SIZE = Math.min(1000, Math.max(100, Number(process.env.PAGE_SIZE || 1000)));
const UPSERT_SIZE = Math.min(1000, Math.max(50, Number(process.env.UPSERT_SIZE || 500)));
const REST_MAX_RETRIES = Math.min(8, Math.max(0, Number(process.env.REST_MAX_RETRIES || 5)));
const REST_RETRY_BASE_MS = Math.min(10000, Math.max(250, Number(process.env.REST_RETRY_BASE_MS || 1000)));
const DRY_RUN = process.env.DRY_RUN === '1';
const ALLOW_EMPTY = process.env.ALLOW_EMPTY === '1';
const NORMALIZATION_ONLY = process.env.NORMALIZATION_ONLY === '1';
const CONTENT_VERSION = 'catalog_embedding_content_v1';

const STORES = [
  ['mercadona', 'mercadona_products', ['id', 'display_name', 'display_name_ca', 'packaging', 'ean', 'category_name', 'price_per_unit_unit', 'raw']],
  ['esclat', 'bonpreu_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['carrefour', 'carrefour_products', ['id', 'display_name', 'ean', 'category_name', 'price_per_unit_unit']],
  ['bonarea', 'bonarea_products', ['id', 'display_name', 'display_name_ca', 'ean', 'category_name', 'price_per_unit_unit']],
  ['consum', 'consum_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['dia', 'dia_products', ['id', 'display_name', 'brand', 'ean', 'category_name', 'price_per_unit_unit']],
  ['sorli', 'sorli_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['eroski', 'eroski_products', ['id', 'display_name', 'brand', 'ean', 'category_name', 'price_per_unit_unit']],
  ['caprabo', 'caprabo_products', ['id', 'display_name', 'brand', 'ean', 'category_name', 'price_per_unit_unit']],
  ['condis', 'condis_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['ametller', 'ametller_products', ['id', 'display_name', 'display_name_ca', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['aldi', 'aldi_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['hiperdino', 'hiperdino_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['alcampo', 'alcampo_products', ['id', 'display_name', 'brand', 'packaging', 'ean', 'category_name', 'price_per_unit_unit']],
  ['plusfresc', 'plusfresc_products', ['id', 'display_name', 'display_name_ca', 'brand', 'category_name', 'price_per_unit_unit']],
];

const ATTRIBUTE_RULES = [
  ['sin_lactosa', /\bsin lactosa\b/], ['vegetal', /\b(vegetal|avena|soja|almendra)\b/],
  ['bio', /\b(bio|ecologic[oa])\b/], ['infantil', /\b(infantil|bebe)\b/],
  ['sin_gluten', /\bsin gluten\b/], ['sin_azucar', /\bsin azucar\b/],
  ['proteina', /\b(proteina|proteico)\b/], ['desnatada', /\bdesnatad[oa]\b/],
  ['semidesnatada', /\bsemidesnatad[oa]\b/], ['entera', /\benter[oa]\b/],
  ['preparado', /\b(al horno|hornead[oa]|asad[oa]|cocid[oa]|frit[oa]|rebozad[oa]|empanad[oa]|a la romana)\b/],
];

function loadEnvLocal() {
  try {
    const values = {};
    for (const line of readFileSync(new URL('.env.local', ROOT), 'utf8').split(/\r?\n/)) {
      const text = line.trim();
      if (!text || text.startsWith('#')) continue;
      const separator = text.indexOf('=');
      if (separator < 1) continue;
      values[text.slice(0, separator).trim()] = text.slice(separator + 1).trim().replace(/^"(.*)"$/, '$1');
    }
    return values;
  } catch { return {}; }
}

const env = loadEnvLocal();
const SUPABASE_URL = (process.env.SUPABASE_URL || env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
const SERVICE_ROLE = (process.env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE');

const requestedStores = new Set((process.env.STORES || '').split(',').map((value) => value.trim()).filter(Boolean));
const selectedStores = requestedStores.size ? STORES.filter(([store]) => requestedStores.has(store)) : STORES;
if (!selectedStores.length) throw new Error('STORES no contiene ninguna tienda válida');
for (const store of requestedStores) if (!STORES.some(([known]) => known === store)) throw new Error(`Tienda desconocida: ${store}`);

const normalize = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (value) => String(value ?? '').trim() || null;
function attributes(text) {
  const normalized = normalize(text);
  return Object.fromEntries(ATTRIBUTE_RULES.map(([key, rule]) => [key, rule.test(normalized)]));
}

function makeEmbeddingRow(store, source, seenAt) {
  const name = clean(source.display_name) || clean(source.display_name_ca);
  if (!name || source.id == null) return null;
  const nameCa = clean(source.display_name_ca);
  const brand = clean(source.brand);
  const category = clean(source.category_name);
  const packaging = clean(source.packaging);
  const { unit, quantity } = deriveCatalogUnitQuantity({
    pricePerUnitUnit: source.price_per_unit_unit,
    name,
    packaging,
    rawPriceInstructions: source.raw?.price_instructions,
  });
  const productAttributes = attributes(`${name} ${nameCa || ''} ${category || ''}`);
  const activeAttributes = Object.entries(productAttributes).filter(([, value]) => value).map(([key]) => key);
  const content = [
    `nombre: ${name}`,
    nameCa && normalize(nameCa) !== normalize(name) ? `nombre catalán: ${nameCa}` : null,
    brand ? `marca: ${brand}` : null,
    category ? `categoría: ${category}` : null,
    packaging ? `formato: ${packaging}` : null,
    unit ? `unidad: ${unit}` : null,
    activeAttributes.length ? `atributos: ${activeAttributes.join(', ')}` : 'atributos: estándar o no indicados',
  ].filter(Boolean).join('; ');
  const rawGtin = String(source.ean ?? '').replace(/\D/g, '');
  return {
    store,
    product_id: String(source.id),
    display_name: name,
    brand,
    category,
    canonical_unit: unit,
    quantity_base: quantity,
    global_gtin: validGlobalGtin(rawGtin) ? rawGtin : null,
    attributes: productAttributes,
    content,
    content_hash: createHash('sha256').update(content).digest('hex'),
    content_version: CONTENT_VERSION,
    published: true,
    source_seen_at: seenAt,
    updated_at: seenAt,
  };
}

async function rest(path, options = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(new URL(path, SUPABASE_URL), {
      ...options,
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
    if (response.ok) return response;

    const responseText = (await response.text()).slice(0, 500);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= REST_MAX_RETRIES) {
      throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${responseText}`);
    }

    const retryAfter = Number(response.headers.get('retry-after'));
    const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(30000, REST_RETRY_BASE_MS * (2 ** attempt));
    console.warn(JSON.stringify({
      event: 'rest_retry',
      method: options.method || 'GET',
      status: response.status,
      attempt: attempt + 1,
      wait_ms: backoffMs,
    }));
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }
}

async function fetchPublished(table, fields) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
    url.searchParams.set('select', fields.join(','));
    url.searchParams.set('published', 'eq.true');
    url.searchParams.set('order', 'id.asc');
    const response = await rest(`${url.pathname}${url.search}`, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchExistingNormalization(store) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL('/rest/v1/catalog_product_embeddings', SUPABASE_URL);
    url.searchParams.set('select', 'product_id,canonical_unit,quantity_base');
    url.searchParams.set('store', `eq.${store}`);
    url.searchParams.set('order', 'product_id.asc');
    const response = await rest(`${url.pathname}${url.search}`, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const page = await response.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return new Map(rows.map((row) => [String(row.product_id), row]));
}

function sameQuantity(left, right) {
  if (left == null || right == null) return left == null && right == null;
  return Number(left) === Number(right);
}

async function upsertRows(rows) {
  for (let offset = 0; offset < rows.length; offset += UPSERT_SIZE) {
    await rest('/rest/v1/catalog_product_embeddings?on_conflict=store,product_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows.slice(offset, offset + UPSERT_SIZE)),
    });
  }
}

async function markMissingUnpublished(store, seenAt) {
  const url = new URL('/rest/v1/catalog_product_embeddings', SUPABASE_URL);
  url.searchParams.set('store', `eq.${store}`);
  url.searchParams.set('published', 'eq.true');
  url.searchParams.set('source_seen_at', `lt.${seenAt}`);
  await rest(`${url.pathname}${url.search}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ published: false, updated_at: seenAt }),
  });
}

const summary = [];
for (const [store, table, fields] of selectedStores) {
  const seenAt = new Date().toISOString();
  const sourceRows = await fetchPublished(table, fields);
  if (!sourceRows.length && !ALLOW_EMPTY) throw new Error(`${store}: catálogo publicado vacío; se rechaza marcar productos antiguos`);
  const rows = sourceRows.map((row) => makeEmbeddingRow(store, row, seenAt)).filter(Boolean);
  if (rows.length !== sourceRows.length) throw new Error(`${store}: ${sourceRows.length - rows.length} filas carecen de id/nombre`);
  const existing = NORMALIZATION_ONLY ? await fetchExistingNormalization(store) : null;
  const rowsToUpsert = existing
    ? rows.filter((row) => {
        const current = existing.get(row.product_id);
        return !current
          || current.canonical_unit !== row.canonical_unit
          || !sameQuantity(current.quantity_base, row.quantity_base);
      })
    : rows;
  if (!DRY_RUN) {
    await upsertRows(rowsToUpsert);
    if (!NORMALIZATION_ONLY) await markMissingUnpublished(store, seenAt);
  }
  const item = {
    store,
    source_products: sourceRows.length,
    materialized_products: rows.length,
    with_unit: rows.filter((row) => row.canonical_unit).length,
    normalization_changes: NORMALIZATION_ONLY ? rowsToUpsert.length : null,
    with_global_gtin: rows.filter((row) => row.global_gtin).length,
    dry_run: DRY_RUN,
  };
  summary.push(item);
  console.log(JSON.stringify(item));
}

console.log(JSON.stringify({ complete: true, stores: summary.length, products: summary.reduce((sum, item) => sum + item.materialized_products, 0), dry_run: DRY_RUN }, null, 2));
