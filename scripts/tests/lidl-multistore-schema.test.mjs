import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20260904134138_lidl_multistore_catalog.sql', import.meta.url);
const sql = await readFile(migrationUrl, 'utf8');
const indexSql = await readFile(
  new URL('../../supabase/migrations/20260904134454_lidl_multistore_fk_indexes.sql', import.meta.url),
  'utf8',
);
const sync = await readFile(new URL('../sync-lidl.mjs', import.meta.url), 'utf8');

test('Lidl separa masterdata y variante local con clave compuesta', () => {
  assert.match(sql, /create table public\.lidl_product_master\s*\(/i);
  assert.match(sql, /create table public\.lidl_store_products\s*\([\s\S]*primary key \(store_id, product_id\)/i);
  assert.match(sql, /create table public\.lidl_store_categories\s*\([\s\S]*primary key \(store_id, category_id\)/i);
  assert.doesNotMatch(
    sql.match(/create table public\.lidl_product_master\s*\(([\s\S]*?)\n\);/i)?.[1] ?? '',
    /unit_price|stock_indicator|promo_price/i,
  );
});

test('las lecturas Lidl requieren store_id y las vistas respetan RLS', () => {
  assert.match(sql, /create view public\.lidl_product_stores\s*\nwith \(security_invoker = true\)/i);
  assert.match(sql, /create view public\.lidl_store_category_catalog\s*\nwith \(security_invoker = true\)/i);
  assert.match(sql, /create or replace function public\.search_lidl_store_products\([\s\S]*p_store_id text/i);
  assert.match(sql, /where p\.store_id = p_store_id and p\.published/i);
  assert.match(sql, /alter table public\.lidl_store_products enable row level security/i);
  assert.match(sql, /grant select on table[\s\S]*public\.lidl_product_stores[\s\S]*to anon, authenticated/i);
});

test('el perfil guarda la tienda confirmada y el CP resuelve candidatos', () => {
  assert.match(sql, /create table public\.lidl_postal_stores\s*\(/i);
  assert.match(sql, /create or replace function public\.find_lidl_stores\(/i);
  assert.match(sql, /add column if not exists lidl_store_id text references public\.lidl_stores\(id\)/i);
});

test('la tabla legacy queda intacta para builds ya publicadas', () => {
  assert.doesNotMatch(sql, /drop table\s+(?:if exists\s+)?public\.lidl_products/i);
  assert.doesNotMatch(sql, /alter table public\.lidl_products\s+drop/i);
  assert.match(sql, /where p\.source_store_id = 'ES3572'/i);
});

test('el sincronizador limita obsoletos a la tienda y aísla el contrato legacy', () => {
  assert.match(sync, /markStoreRowsStale\('lidl_store_products', 'store_id'\)/);
  assert.match(sync, /markStoreRowsStale\('lidl_store_categories', 'store_id'\)/);
  assert.match(sync, /if \(STORE_ID === 'ES3572'\) \{[\s\S]*upsert\('lidl_products', rows\)/);
  assert.match(sync, /upsert\('lidl_product_master'/);
  assert.match(sync, /upsert\('lidl_store_products'/);
});

test('todas las claves foráneas Lidl tienen índice de cobertura', () => {
  assert.match(indexSql, /lidl_postal_stores \(store_id\)/i);
  assert.match(indexSql, /lidl_store_categories \(category_id\)/i);
  assert.match(indexSql, /lidl_store_products \(product_id\)/i);
  assert.match(indexSql, /profiles \(lidl_store_id\)/i);
});
