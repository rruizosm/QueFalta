import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const migration = read('../../supabase/migrations/20260930203842_extend_comparator_to_eljamon.sql');
const materializer = read('../sync-comparator-embedding-catalog.mjs');
const worker = read('../../supabase/functions/catalog-embed/index.ts');
const workflow = read('../../.github/workflows/sync-eljamon.yml');
const component = read('../../src/components/SimilarProductsSection.tsx');

test('El Jamón materializa solo productos publicables con precio canónico', () => {
  assert.match(migration, /create or replace view public\.eljamon_comparator_products/i);
  assert.match(migration, /from public\.eljamon_products/i);
  assert.match(migration, /product\.published[\s\S]+product\.available[\s\S]+product\.unit_price > 0/i);
  assert.match(migration, /product\.price_per_unit > 0[\s\S]+\('kg','l','ud'\)/i);
  assert.doesNotMatch(migration, /eljamon_profile_location/i);
});

test('El Jamón entra en el esquema, el worker y el materializador', () => {
  assert.match(migration, /catalog_product_embeddings_store_check[\s\S]+?'eljamon'/i);
  assert.match(migration, /catalog_product_match_cache_status_target_store_check[\s\S]+?'eljamon'/i);
  assert.match(materializer, /Materializa los 21 catálogos/);
  assert.match(materializer, /\['eljamon',\s*'eljamon_comparator_products'/);
  assert.match(worker, /'bm', 'eljamon'/);
});

test('la resolución pública usa el precio vigente común de El Jamón', () => {
  assert.match(migration, /catalog_public_product_pre_eljamon_v1/i);
  assert.match(migration, /select[\s\S]+?'eljamon'[\s\S]+product\.unit_price[\s\S]+product\.price_per_unit/i);
  assert.match(migration, /p_store = 'eljamon'/i);
  assert.match(migration, /product\.published[\s\S]+product\.available/i);
});

test('la RPC v7 incorpora El Jamón como origen y destino', () => {
  assert.match(migration, /create or replace function comparator_internal\.catalog_cheaper_products_v7/i);
  assert.match(migration, /from comparator_internal\.catalog_cheaper_products_v6/i);
  assert.match(migration, /refresh_catalog_match_cache_pair_v3\([\s\S]+?'eljamon'/i);
  assert.match(migration, /match\.target_store = 'eljamon'/i);
  assert.match(migration, /p_source_store = 'eljamon'/i);
  assert.match(migration, /from comparator_internal\.catalog_cheaper_products_v7/i);
});

test('el sync mantiene El Jamón materializado y el cliente muestra el botón', () => {
  const sourceSync = workflow.indexOf('run: node scripts/sync-eljamon.mjs');
  const materialize = workflow.indexOf('run: node scripts/sync-comparator-embedding-catalog.mjs');
  assert.ok(sourceSync >= 0 && materialize > sourceSync);
  assert.match(workflow, /STORES:\s*eljamon/);
  assert.doesNotMatch(component, /store !== 'eljamon'/);
  assert.doesNotMatch(component, /excludeStore === 'eljamon'/);
});
