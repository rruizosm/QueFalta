import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL(
  '../../supabase/migrations/20260823101900_catalog_search_engine_v1.sql',
  import.meta.url,
), 'utf8');
const plannerMigration = readFileSync(new URL(
  '../../supabase/migrations/20260823103646_catalog_search_language_index_planner.sql',
  import.meta.url,
), 'utf8');
const sortMigration = readFileSync(new URL(
  '../../supabase/migrations/20260823104120_catalog_search_server_sort_orders.sql',
  import.meta.url,
), 'utf8');
const feedMigration = readFileSync(new URL(
  '../../supabase/migrations/20260823110039_catalog_feed_search_engine.sql',
  import.meta.url,
), 'utf8');
const catalogApi = readFileSync(new URL('../../src/api/catalog.ts', import.meta.url), 'utf8');
const catalogSearch = readFileSync(new URL('../../src/lib/catalogSearch.ts', import.meta.url), 'utf8');
const productNoteSheet = readFileSync(new URL('../../src/components/ProductNoteSheet.tsx', import.meta.url), 'utf8');
const catalogScreen = readFileSync(new URL('../../src/screens/CatalogScreen.tsx', import.meta.url), 'utf8');
const newArrivalsScreen = readFileSync(new URL('../../src/screens/NewArrivalsScreen.tsx', import.meta.url), 'utf8');
const offersScreen = readFileSync(new URL('../../src/screens/OffersScreen.tsx', import.meta.url), 'utf8');

const stores = [
  'mercadona', 'bonpreu', 'carrefour', 'bonarea', 'consum', 'dia', 'sorli',
  'eroski', 'caprabo', 'condis', 'ametller', 'aldi', 'gadis', 'froiz',
  'ahorramas', 'hiperdino', 'alcampo', 'plusfresc',
];

test('la migración crea una RPC homogénea para los 18 catálogos', () => {
  for (const store of stores) {
    assert.match(migration, new RegExp(`\\('search_${store}_products',\\s+'${store}_products'`));
    assert.match(catalogApi, new RegExp(`'search_${store}_products'`));
  }
  assert.match(migration, /security invoker/i);
  assert.match(migration, /p_offset integer default 0/);
  assert.match(migration, /grant execute[\s\S]+to anon, authenticated, service_role/i);
});

test('el ranking combina texto completo, prefijos y tolerancia trigram', () => {
  assert.match(migration, /to_tsvector\('simple'::regconfig/);
  assert.match(migration, /quote_literal\(word\) \|\| ':\*'/);
  assert.match(migration, /operator\(public\.<%%\)/);
  assert.match(migration, /word_similarity\(p_query_norm, p_name_norm\)/);
  assert.match(migration, /where published;/);
  assert.match(plannerMigration, /p\.display_name_norm as search_name/);
  assert.match(plannerMigration, /p\.display_name_ca_norm as search_name/);
  assert.match(plannerMigration, /lower\(coalesce\(p_lang, 'es'\)\) = 'ca'/);
});

test('el cliente envía idioma, ubicación, orden y página al RPC', () => {
  for (const parameter of ['p_query', 'p_lang', 'p_region', 'p_center', 'p_order', 'p_limit', 'p_offset']) {
    assert.match(catalogApi, new RegExp(`${parameter}:`));
  }
  assert.match(catalogSearch, /offset = 0/);
  assert.match(catalogSearch, /order: CatalogSearchOrder = 'relevance'/);
  assert.match(catalogSearch, /searchProducts\(query, region, limit, signal, offset, order, searchLanguage\)/);
});

test('Producto asociado busca en castellano y catalán pero muestra el idioma activo', () => {
  assert.match(catalogApi, /p_lang:\s*options\.language \?\? getLanguage\(\)/);
  assert.match(catalogSearch, /BILINGUAL_CATALOG_STORES/);
  assert.match(catalogSearch, /language:\s*'ca'/);
  assert.match(catalogSearch, /language:\s*'es'/);
  assert.match(catalogSearch, /productsByKey\.set\(`\$\{product\.store\}:\$\{product\.id\}`/);
  assert.match(catalogSearch, /searchBothLanguages\s*\? products/);
  assert.match(productNoteSheet, /searchCatalogStores\([\s\S]+?40,\s*true,/);
});

test('el servidor ordena antes de paginar por relevancia, precio o precio unitario', () => {
  assert.match(sortMigration, /p_order text default 'relevance'/);
  assert.match(sortMigration, /then p\.unit_price end asc nulls last/);
  assert.match(sortMigration, /then p\.price_per_unit end desc nulls last/);
  assert.match(sortMigration, /catalog_search_rank\(/);
  assert.match(sortMigration, /offset greatest\(coalesce\(p_offset, 0\), 0\)/);
});

test('el catálogo ofrece relevancia y carga páginas adicionales', () => {
  assert.match(catalogScreen, /useState<ProductSearchOrder>\('relevance'\)/);
  assert.match(catalogScreen, /relevanceScore/);
  assert.match(catalogScreen, /loadMoreStoreSearch/);
  assert.match(catalogScreen, /allSearchExhausted/);
  assert.match(catalogScreen, /createMultiStorePager<UIProduct, CatalogStore, number>/);
  assert.match(catalogScreen, /pageSize: 12/);
  assert.match(catalogScreen, /searchFroizProducts/);
  assert.match(catalogScreen, /sortRelevance/);
});

test('Novedades y Ofertas reutilizan el motor antes de paginar', () => {
  for (const store of stores) {
    assert.match(feedMigration, new RegExp(`\\('search_${store}_feed_products',\\s+'${store}_products'`));
    assert.match(catalogApi, new RegExp(`'search_${store}_feed_products'`));
  }
  assert.match(feedMigration, /security invoker/i);
  assert.match(feedMigration, /lower\(coalesce\(p_feed, ''\)\) = 'new'/);
  assert.match(feedMigration, /lower\(coalesce\(p_feed, ''\)\) = 'offer'/);
  assert.match(feedMigration, /catalog_search_rank\(/);
  assert.match(feedMigration, /p_categories text\[\] default null/);
  assert.match(feedMigration, /p_offset integer default 0/);
  assert.match(catalogApi, /catalogFeedSearchPage\(store, 'new'/);
  assert.match(catalogApi, /catalogFeedSearchPage\([\s\S]+?'offer'/);
  assert.match(newArrivalsScreen, /debouncedQuery/);
  assert.match(newArrivalsScreen, /searchCache/);
  assert.match(newArrivalsScreen, /sortByRelevance/);
  assert.match(offersScreen, /relevanceScore/);
});
