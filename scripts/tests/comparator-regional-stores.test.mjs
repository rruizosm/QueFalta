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

test('el cliente conserva el contrato transaccional v6', () => {
  assert.match(catalogApi, /supabase\.rpc\('catalog_cheaper_products_v6'/);
  assert.doesNotMatch(catalogApi, /catalog_cheaper_products_v7/);
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
