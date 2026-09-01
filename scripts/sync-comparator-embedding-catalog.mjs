#!/usr/bin/env node
// Materializa los 18 catálogos en catalog_product_embeddings.
// Solo los cambios del input semántico efectivo disparan un nuevo trabajo pgmq.

import { readFileSync } from 'node:fs';
import { validGlobalGtin } from './lib/gtin.mjs';
import { deriveCatalogUnitQuantity } from './lib/catalog-embedding-unit.mjs';
import {
  buildCatalogEmbeddingIdentity,
  buildCatalogEmbeddingProjectionV1,
  EMBEDDING_CONTENT_VERSION,
  EMBEDDING_MODEL,
} from './lib/catalog-embedding-identity.mjs';
import {
  embeddingJobIdentityKey,
  planEmbeddingReconciliation,
  postgrestInFilter,
} from './lib/catalog-embedding-reconcile.mjs';

const ROOT = new URL('../', import.meta.url);
const PAGE_SIZE = Math.min(1000, Math.max(100, Number(process.env.PAGE_SIZE || 1000)));
// Margen defensivo bajo el statement_timeout de 8 s de la Data API. El filtro
// incremental hace que normalmente solo haya unos pocos lotes por tienda.
const UPSERT_SIZE = 25;
const UNPUBLISH_SIZE = 100;
const REST_MAX_RETRIES = Math.min(8, Math.max(0, Number(process.env.REST_MAX_RETRIES || 5)));
const REST_RETRY_BASE_MS = Math.min(10000, Math.max(250, Number(process.env.REST_RETRY_BASE_MS || 1000)));
const DRY_RUN = process.env.DRY_RUN === '1';
const ALLOW_EMPTY = process.env.ALLOW_EMPTY === '1';
const NORMALIZATION_ONLY = process.env.NORMALIZATION_ONLY === '1';
const ANOMALY_OVERRIDE = process.env.EMBEDDING_ANOMALY_OVERRIDE === '1';

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
  ['gadis', 'gadis_products', ['id', 'display_name', 'brand', 'packaging', 'category_name', 'price_per_unit_unit']],
  ['froiz', 'froiz_products', ['id', 'display_name', 'brand', 'category_name', 'price_per_unit_unit']],
  ['ahorramas', 'ahorramas_products', ['id', 'display_name', 'brand', 'packaging', 'category_name', 'price_per_unit_unit']],
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

const clean = (value) => String(value ?? '').trim() || null;
const compareProductIds = (left, right) => {
  const a = String(left?.product_id ?? left ?? '');
  const b = String(right?.product_id ?? right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
};

function makeEmbeddingCandidate(store, source, seenAt) {
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
  const rawGtin = String(source.ean ?? '').replace(/\D/g, '');
  const globalGtin = validGlobalGtin(rawGtin) ? rawGtin : null;
  const { embeddingInput, identity } = buildCatalogEmbeddingProjectionV1({
    name,
    nameCa,
    brand,
    category,
    packaging,
    canonicalUnit: unit,
    quantityBase: quantity,
    globalGtin,
    published: true,
  });
  return {
    identity: { ...identity, model: EMBEDDING_MODEL },
    record: {
      store,
      product_id: String(source.id),
      display_name: name,
      brand,
      category,
      category_family: identity.categoryFamily,
      canonical_unit: unit,
      quantity_base: quantity,
      global_gtin: globalGtin,
      attributes: embeddingInput.attributes,
      content: embeddingInput.content,
      content_hash: embeddingInput.embeddingInputHash,
      embedding_input_hash: embeddingInput.embeddingInputHash,
      semantic_identity_hash: identity.semanticIdentityHash,
      match_metadata_hash: identity.matchMetadataHash,
      content_version: EMBEDDING_CONTENT_VERSION,
      published: true,
      source_seen_at: seenAt,
      updated_at: seenAt,
    },
  };
}

function withLegacyPhaseOneIdentity(row) {
  const identity = buildCatalogEmbeddingIdentity({
    name: row.display_name,
    brand: row.brand,
    canonicalUnit: row.canonical_unit,
    quantityBase: row.quantity_base,
    globalGtin: row.global_gtin,
    matchAttributes: row.attributes,
    published: row.published,
  });
  return {
    ...row,
    phase_one_semantic_identity_hash: identity.semanticIdentityHash,
    phase_one_match_metadata_hash: identity.matchMetadataHash,
    phase_one_category_family: identity.categoryFamily,
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

async function fetchExisting(store) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL('/rest/v1/catalog_product_embeddings', SUPABASE_URL);
    url.searchParams.set(
      'select',
      'product_id,display_name,brand,category,category_family,canonical_unit,quantity_base,global_gtin,attributes,content,content_hash,embedding_input_hash,embedded_content_hash,semantic_identity_hash,match_metadata_hash,content_version,published,embedded_at,model',
    );
    url.searchParams.set('store', `eq.${store}`);
    url.searchParams.set('order', 'product_id.asc');
    const response = await rest(`${url.pathname}${url.search}`, {
      headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}` },
    });
    const page = await response.json();
    rows.push(...page.map(withLegacyPhaseOneIdentity));
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function fetchEmbeddingJobSuppressions(store) {
  const response = await rest('/rest/v1/rpc/catalog_active_embedding_job_identities', {
    method: 'POST',
    body: JSON.stringify({ p_store: store }),
  });
  const result = await response.json();
  if (!result || !Array.isArray(result.jobs)
    || !Number.isInteger(result.activeJobs)
    || !Number.isInteger(result.terminalFailures)) {
    throw new Error('catalog_active_embedding_job_identities devolvió una respuesta inválida');
  }
  const { jobs } = result;
  return {
    keys: new Set(jobs.map((job) => embeddingJobIdentityKey(
      store,
      job.product_id,
      job.embedding_input_hash,
      job.model,
    ))),
    activeJobs: result.activeJobs,
    terminalFailures: result.terminalFailures,
  };
}

async function ensureEmbeddingJobs(jobs) {
  if (!jobs.length) return 0;
  let enqueuedJobs = 0;
  for (let offset = 0; offset < jobs.length; offset += 500) {
    const response = await rest('/rest/v1/rpc/catalog_ensure_embedding_jobs', {
      method: 'POST',
      body: JSON.stringify({ p_jobs: jobs.slice(offset, offset + 500) }),
    });
    const result = await response.json();
    if (!result || !Number.isInteger(result.enqueuedJobs)) {
      throw new Error('catalog_ensure_embedding_jobs devolvió una respuesta inválida');
    }
    enqueuedJobs += result.enqueuedJobs;
  }
  return enqueuedJobs;
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

async function markProductsUnpublished(store, productIds, seenAt) {
  for (let offset = 0; offset < productIds.length; offset += UNPUBLISH_SIZE) {
    const url = new URL('/rest/v1/catalog_product_embeddings', SUPABASE_URL);
    url.searchParams.set('store', `eq.${store}`);
    url.searchParams.set('published', 'eq.true');
    url.searchParams.set(
      'product_id',
      postgrestInFilter(productIds.slice(offset, offset + UNPUBLISH_SIZE)),
    );
    await rest(`${url.pathname}${url.search}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      // El hash incluye publicación. Al despublicar se borra para que la fila
      // use el fallback gradual y nunca conserve una identidad metadata falsa.
      body: JSON.stringify({
        published: false,
        match_metadata_hash: null,
        updated_at: seenAt,
      }),
    });
  }
}

async function dispatchEmbeddingJobs() {
  const response = await rest('/rest/v1/rpc/catalog_dispatch_embedding_jobs', {
    method: 'POST',
    body: JSON.stringify({ p_max_requests: 3 }),
  });
  const requestIds = await response.json();
  if (!Array.isArray(requestIds)) throw new Error('catalog_dispatch_embedding_jobs devolvió una respuesta inválida');
  console.log(JSON.stringify({
    event: 'embedding_dispatch',
    request_count: requestIds.length,
  }));
  return requestIds;
}

async function beginEmbeddingRun(store, sourceCount, existingCount, plan) {
  const response = await rest('/rest/v1/rpc/catalog_begin_embedding_run', {
    method: 'POST',
    body: JSON.stringify({
      p_store: store,
      p_source_products: sourceCount,
      p_existing_products: existingCount,
      p_new_products: plan.newRows,
      p_semantic_changed_products: plan.semanticChangedRows,
      p_metadata_only_products: plan.metadataOnlyRows,
      p_republished_products: plan.republishedRows,
      p_repair_products: plan.repairProducts,
      p_unpublished_products: plan.productIdsToUnpublish.length,
      p_unchanged_products: plan.unchangedRows,
      p_expected_embedding_jobs: plan.expectedEmbeddingJobs,
      p_allow_anomaly: ANOMALY_OVERRIDE,
    }),
  });
  const run = await response.json();
  if (!run?.runId || typeof run.dispatchAllowed !== 'boolean') {
    throw new Error('catalog_begin_embedding_run devolvió una respuesta inválida');
  }
  return run;
}

async function completeEmbeddingRun(runId, success, error = null) {
  await rest('/rest/v1/rpc/catalog_complete_embedding_run', {
    method: 'POST',
    body: JSON.stringify({
      p_run_id: runId,
      p_success: success,
      p_error_message: error ? String(error).slice(0, 1000) : null,
    }),
  });
}

async function recordEmbeddingDispatch(runId, requestCount) {
  await rest('/rest/v1/rpc/catalog_record_embedding_dispatch', {
    method: 'POST',
    body: JSON.stringify({
      p_run_id: runId,
      p_request_count: requestCount,
    }),
  });
}

const summary = [];
const completedRuns = [];
for (const [store, table, fields] of selectedStores) {
  const seenAt = new Date().toISOString();
  const sourceRows = await fetchPublished(table, fields);
  if (!sourceRows.length && !ALLOW_EMPTY) throw new Error(`${store}: catálogo publicado vacío; se rechaza marcar productos antiguos`);
  const candidates = sourceRows.map((row) => makeEmbeddingCandidate(store, row, seenAt)).filter(Boolean);
  const rows = candidates.map((candidate) => candidate.record);
  if (candidates.length !== sourceRows.length) throw new Error(`${store}: ${sourceRows.length - candidates.length} filas carecen de id/nombre`);
  const existing = await fetchExisting(store);
  const embeddingJobSuppressions = await fetchEmbeddingJobSuppressions(store);
  const plan = planEmbeddingReconciliation(candidates, existing, {
    normalizationOnly: NORMALIZATION_ONLY,
    suppressedEmbeddingJobKeys: embeddingJobSuppressions.keys,
    targetModel: EMBEDDING_MODEL,
  });
  const {
    rowsToUpsert: plannedRowsToUpsert,
    productIdsToUnpublish: plannedProductIdsToUnpublish,
    unchangedRows,
    skippedRows,
    newRows,
    semanticChangedRows,
    metadataOnlyRows,
    republishedRows,
    repairProducts,
    repairJobs,
    expectedEmbeddingJobs,
  } = plan;
  // Mantiene el mismo orden global de locks que las RPC de la cola. Es
  // importante cuando un sync y un finalize del worker coinciden.
  const rowsToUpsert = [...plannedRowsToUpsert].sort(compareProductIds);
  const productIdsToUnpublish = [...plannedProductIdsToUnpublish].sort(compareProductIds);
  let run = null;
  let repairJobsEnqueued = 0;
  if (!DRY_RUN) {
    run = await beginEmbeddingRun(store, sourceRows.length, existing.length, plan);
    if (run.anomalyBlocked) {
      // El guardarraíl bloquea toda la materialización, no solo el dispatch.
      // Así una regresión no invalida vectores ni infla la cola estando pausada.
      await completeEmbeddingRun(run.runId, true);
      completedRuns.push(run);
      console.warn(JSON.stringify({
        event: 'embedding_materialization_blocked',
        store,
        run_id: run.runId,
        expected_embedding_jobs: expectedEmbeddingJobs,
      }));
    } else {
      try {
        await upsertRows(rowsToUpsert);
        await markProductsUnpublished(store, productIdsToUnpublish, seenAt);
        repairJobsEnqueued = await ensureEmbeddingJobs(repairJobs);
        await completeEmbeddingRun(run.runId, true);
        completedRuns.push(run);
      } catch (error) {
        try {
          await completeEmbeddingRun(run.runId, false, error);
        } catch (auditError) {
          console.error(JSON.stringify({
            event: 'embedding_run_audit_failed',
            store,
            run_id: run.runId,
            error: String(auditError),
          }));
        }
        throw error;
      }
    }
  }
  const materializationBlocked = run?.anomalyBlocked ?? false;
  const item = {
    store,
    source_products: sourceRows.length,
    materialized_products: rows.length,
    upserted_products: materializationBlocked ? 0 : rowsToUpsert.length,
    planned_upserted_products: rowsToUpsert.length,
    unchanged_products: unchangedRows,
    skipped_products: skippedRows,
    new_products: newRows,
    semantic_changed_products: semanticChangedRows,
    metadata_only_products: metadataOnlyRows,
    republished_products: republishedRows,
    repair_products: repairProducts,
    repair_jobs_enqueued: repairJobsEnqueued,
    active_embedding_jobs: embeddingJobSuppressions.activeJobs,
    terminal_embedding_failures: embeddingJobSuppressions.terminalFailures,
    unpublished_products: materializationBlocked ? 0 : productIdsToUnpublish.length,
    planned_unpublished_products: productIdsToUnpublish.length,
    expected_embedding_jobs: expectedEmbeddingJobs,
    with_unit: rows.filter((row) => row.canonical_unit).length,
    normalization_changes: NORMALIZATION_ONLY ? rowsToUpsert.length : null,
    with_global_gtin: rows.filter((row) => row.global_gtin).length,
    run_id: run?.runId ?? null,
    pipeline_mode: run?.pipelineMode ?? null,
    anomaly_blocked: run?.anomalyBlocked ?? false,
    materialization_blocked: materializationBlocked,
    anomaly_override: ANOMALY_OVERRIDE,
    dry_run: DRY_RUN,
  };
  summary.push(item);
  console.log(JSON.stringify(item));
  if (materializationBlocked) break;
}

if (!DRY_RUN) {
  const dispatchableRuns = completedRuns.filter((run) => run.dispatchAllowed);
  if (dispatchableRuns.length) {
    const requestIds = await dispatchEmbeddingJobs();
    // El impulso es global para toda la cola, no uno por supermercado. Se
    // atribuye una sola vez al último run que habilitó este despacho.
    await recordEmbeddingDispatch(dispatchableRuns.at(-1).runId, requestIds.length);
  } else {
    console.log(JSON.stringify({
      event: 'embedding_dispatch_skipped',
      reason: completedRuns.some((run) => run.anomalyBlocked)
        ? 'anomaly_blocked'
        : 'pipeline_paused',
    }));
  }
}

console.log(JSON.stringify({ complete: true, stores: summary.length, products: summary.reduce((sum, item) => sum + item.materialized_products, 0), dry_run: DRY_RUN }, null, 2));
