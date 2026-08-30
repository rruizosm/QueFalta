import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260830171924_bm_multizone_catalog.sql',
  import.meta.url,
);
const sql = readFileSync(migrationUrl, 'utf8');

test('BM expone solo Categoria -> Subcategoria como jerarquia navegable', () => {
  assert.match(sql, /create table public\.bm_categories/i);
  assert.match(sql, /level\s+smallint generated always as/i);
  assert.match(sql, /create constraint trigger bm_categories_two_levels/i);
  assert.match(sql, /only accepts Category -> Subcategory/i);
  assert.match(sql, /category_ids\s+text\[\] generated always as/i);
  assert.match(sql, /else array\[root_category_id, category_id\]/i);
  assert.match(sql, /Nunca contiene niveles N3-N6 de BM/i);
});

test('BM separa producto comun, resolucion postal y variante por ubicacion', () => {
  for (const relation of [
    'bm_products',
    'bm_locations',
    'bm_postal_locations',
    'bm_product_locations',
  ]) {
    assert.match(sql, new RegExp(`(?:table|view) public\\.${relation}`, 'i'));
  }
  assert.match(sql, /with \(security_invoker = true\)/i);
  assert.match(sql, /check \(store in \('consum', 'plusfresc', 'bm'\)\)/i);
  for (const field of [
    'base_unit_price',
    'promo_type',
    'promo_price',
    'promotion_id',
    'is_new',
    'first_seen_at',
  ]) {
    assert.match(sql, new RegExp(`add column ${field}\\b`, 'i'));
  }
});

test('las lecturas BM tienen busqueda zonal, RLS y grants explicitos', () => {
  assert.match(sql, /create or replace function public\.search_bm_products\([\s\S]*p_location_id text/i);
  assert.match(sql, /create or replace function public\.search_bm_feed_products\([\s\S]*p_location_id text/i);
  assert.equal((sql.match(/security invoker/gi) ?? []).length >= 3, true);
  assert.match(sql, /alter table public\.bm_products enable row level security/i);
  assert.match(sql, /alter table public\.bm_postal_locations enable row level security/i);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger[\s\S]*catalog_location_prices/mi);
  assert.match(sql, /grant select on table[\s\S]*public\.bm_product_locations[\s\S]*to anon, authenticated/mi);
});

test('el feed evita convertir la primera carga completa en novedades', () => {
  assert.match(sql, /recent_count > 400/i);
  assert.match(sql, /recent_count::numeric \/ nullif\(published_count, 0\) >= 0\.75/i);
  assert.match(sql, /product\.is_new[\s\S]*not feed_stats\.initial_fill/i);
});
