import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { deriveCatalogUnitQuantity } from '../lib/catalog-embedding-unit.mjs';

const migration = readFileSync(new URL(
  '../../supabase/migrations/20260824140442_extend_comparator_to_gadis_froiz_ahorramas.sql',
  import.meta.url,
), 'utf8');
const unitMigration = readFileSync(new URL(
  '../../supabase/migrations/20260824141713_normalize_comparator_reference_units.sql',
  import.meta.url,
), 'utf8');
const cacheMigration = readFileSync(new URL(
  '../../supabase/migrations/20260824150548_extend_comparator_cache_status_stores.sql',
  import.meta.url,
), 'utf8');
const localizationMigration = readFileSync(new URL(
  '../../supabase/migrations/20260824213612_localize_comparator_results.sql',
  import.meta.url,
), 'utf8');
const materializer = readFileSync(new URL(
  '../sync-comparator-embedding-catalog.mjs',
  import.meta.url,
), 'utf8');
const catalogApi = readFileSync(new URL('../../src/api/catalog.ts', import.meta.url), 'utf8');
const embeddingWorker = readFileSync(new URL(
  '../../supabase/functions/catalog-embed/index.ts',
  import.meta.url,
), 'utf8');

const stores = [
  ['gadis', 'gadis_products'],
  ['froiz', 'froiz_products'],
  ['ahorramas', 'ahorramas_products'],
];

test('el snapshot semántico materializa Froiz, Gadis y Ahorramás', () => {
  assert.match(materializer, /Materializa los 18 catálogos/);
  for (const [store, table] of stores) {
    assert.match(materializer, new RegExp(`\\['${store}',\\s*'${table}'`));
    assert.match(migration, new RegExp(`'${store}'`));
    assert.match(embeddingWorker, new RegExp(`'${store}'`));
  }
});

test('la RPC resuelve detalle y admite las tres cadenas como origen o destino', () => {
  for (const [store, table] of stores) {
    assert.match(migration, new RegExp(`select '${store}'[\\s\\S]+?from public\\.${table}`));
    assert.match(cacheMigration, new RegExp(`'${store}'`));
  }
  assert.match(migration, /create or replace function comparator_internal\.catalog_cheaper_products_v3/i);
  assert.match(migration, /create or replace function comparator_internal\.catalog_cheaper_products_v5/i);
  assert.match(migration, /catalog_product_embeddings_store_check/i);
  assert.match(cacheMigration, /catalog_product_match_cache_status_target_store_check/i);
});

test('el cliente usa el contrato transaccional v7 y envía el idioma activo', () => {
  assert.match(catalogApi, /supabase\.rpc\('catalog_cheaper_products_v7'/);
  assert.match(catalogApi, /p_language:\s*getLanguage\(\)/);
  assert.match(localizationMigration, /from private\.claim_free_comparator_use\(\)/i);
});

test('el comparador devuelve nombres catalanes con fallback al nombre original', () => {
  assert.match(localizationMigration, /create or replace function comparator_internal\.catalog_localized_product_name_v1/i);
  assert.match(localizationMigration, /lower\(coalesce\(p_language, 'es'\)\) <> 'ca'/i);
  for (const table of [
    'mercadona_products',
    'bonpreu_products',
    'bonarea_products',
    'sorli_products',
    'condis_products',
    'ametller_products',
    'plusfresc_products',
  ]) {
    assert.match(localizationMigration, new RegExp(`from public\\.${table}`));
  }
  assert.match(localizationMigration, /coalesce\([\s\S]+catalog_localized_product_name_v1[\s\S]+result\.display_name/i);
  assert.match(localizationMigration, /create or replace function public\.catalog_cheaper_products_v7/i);
});

test('normaliza las unidades comerciales sin comparar dosis o metros como unidades', () => {
  assert.deepEqual(deriveCatalogUnitQuantity({
    pricePerUnitUnit: 'el litro', name: 'Leche entera 1 l', packaging: 'U · 1',
  }), { unit: 'l', quantity: 1 });
  assert.deepEqual(deriveCatalogUnitQuantity({
    pricePerUnitUnit: 'los 100 gr.', name: 'Chocolate 250 g', packaging: null,
  }), { unit: 'kg', quantity: 0.25 });
  assert.deepEqual(deriveCatalogUnitQuantity({
    pricePerUnitUnit: '100', name: 'Zumo naranja 500 ml', packaging: null,
  }), { unit: 'l', quantity: 0.5 });
  assert.deepEqual(deriveCatalogUnitQuantity({
    pricePerUnitUnit: 'litro', name: 'Leche semidesnatada 1,5 litros', packaging: null,
  }), { unit: 'l', quantity: 1.5 });
  assert.deepEqual(deriveCatalogUnitQuantity({
    pricePerUnitUnit: 'la dosis', name: 'Detergente 30 dosis', packaging: 'U · 1',
  }), { unit: null, quantity: null });
  assert.match(unitMigration, /p_reference_price \* 10/);
  assert.match(unitMigration, /p_reference_price \/ 12/);
});
