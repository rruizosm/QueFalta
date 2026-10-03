import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20260930200241_extend_comparator_to_bm.sql');
const manifestTimeoutMigration = read('../../supabase/migrations/20260930200823_raise_embedding_manifest_registration_timeout.sql');
const completionTimeoutMigration = read('../../supabase/migrations/20260930201137_raise_embedding_run_completion_timeout.sql');
const materializer = read('../sync-comparator-embedding-catalog.mjs');
const worker = read('../../supabase/functions/catalog-embed/index.ts');
const workflow = read('../../.github/workflows/sync-bm.yml');
const component = read('../../src/components/SimilarProductsSection.tsx');

test('BM tiene una identidad semántica nacional y precio zonal por perfil', () => {
  assert.match(migration, /create or replace view public\.bm_comparator_products/i);
  assert.match(migration, /create or replace function comparator_internal\.bm_profile_location_id_v1/i);
  assert.match(migration, /join public\.bm_postal_locations/i);
  assert.match(migration, /select 'bm'[\s\S]+from public\.bm_products[\s\S]+catalog_location_prices/i);
  assert.match(migration, /location_price\.location_id = comparator_internal\.bm_profile_location_id_v1\(\)/i);
  assert.match(migration, /location_price\.unit_price[\s\S]+location_price\.price_per_unit/i);
});

test('BM entra en el esquema, el worker y el materializador', () => {
  assert.match(migration, /catalog_product_embeddings_store_check[\s\S]+?'bm'/i);
  assert.match(migration, /catalog_product_match_cache_status_target_store_check[\s\S]+?'bm'/i);
  assert.match(materializer, /Materializa los 21 catálogos/);
  assert.match(materializer, /\['bm',\s*'bm_comparator_products'/);
  assert.match(worker, /'lidl', 'bm'/);
});

test('la RPC v7 incorpora BM como origen y destino', () => {
  assert.match(migration, /create or replace function comparator_internal\.catalog_cheaper_products_v6/i);
  assert.match(migration, /refresh_catalog_match_cache_pair_v3\([\s\S]+?'bm'/i);
  assert.match(migration, /match\.target_store = 'bm'/i);
  assert.match(migration, /p_source_store = 'bm'/i);
  assert.match(migration, /from comparator_internal\.catalog_cheaper_products_v6/i);
});

test('el sync mantiene BM materializado y el cliente muestra el botón', () => {
  const sourceSync = workflow.indexOf('run: node scripts/sync-bm.mjs');
  const materialize = workflow.indexOf('run: node scripts/sync-comparator-embedding-catalog.mjs');
  assert.ok(sourceSync >= 0 && materialize > sourceSync);
  assert.match(workflow, /STORES:\s*bm/);
  assert.doesNotMatch(component, /store !== 'bm'/);
  assert.doesNotMatch(component, /excludeStore === 'bm'/);
});

test('el cierre del backfill grande dispone de margen para revalidar su manifiesto', () => {
  assert.match(
    manifestTimeoutMigration,
    /catalog_register_embedding_run_jobs\(uuid, jsonb, integer, boolean\)[\s\S]+statement_timeout = '60s'/i,
  );
  assert.match(
    completionTimeoutMigration,
    /catalog_complete_embedding_run\(uuid, boolean, text\)[\s\S]+statement_timeout = '60s'/i,
  );
});
