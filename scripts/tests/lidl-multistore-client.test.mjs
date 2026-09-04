import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = async (relative) => readFile(new URL(`../../${relative}`, import.meta.url), 'utf8');
const [catalog, profile, storeApi, storePicker, regionPicker, catalogScreen, offers, arrivals, changes] = await Promise.all([
  source('src/api/catalog.ts'),
  source('src/api/profile.ts'),
  source('src/api/lidlStores.ts'),
  source('src/components/LidlStorePicker.tsx'),
  source('src/components/RegionPicker.tsx'),
  source('src/screens/CatalogScreen.tsx'),
  source('src/screens/OffersScreen.tsx'),
  source('src/screens/NewArrivalsScreen.tsx'),
  source('src/screens/PriceChangesScreen.tsx'),
]);

test('perfil y selector conservan una confirmación de tienda distinta del CP', () => {
  assert.match(profile, /lidlStoreId: string \| null/);
  assert.match(profile, /lidl_store_id/);
  assert.match(regionPicker, /<LidlStorePicker/);
  assert.match(regionPicker, /onChange\(\{[\s\S]*lidlStoreId: storeId/);
  assert.match(regionPicker, /postalCode: digits, lidlStoreId: null/);
});

test('el CP sigue funcionando durante el despliegue escalonado del esquema Lidl', () => {
  assert.match(profile, /isMissingLidlStoreColumn/);
  assert.match(profile, /LEGACY_PROFILE_COLUMNS/);
  assert.match(profile, /delete updates\.lidl_store_id/);
  assert.match(storeApi, /LidlStoreDirectoryUnavailableError/);
  assert.match(storeApi, /PGRST202/);
  assert.match(storePicker, /lidlStoreUnavailable/);
});

test('catálogo Lidl lee la vista y RPC filtradas por store_id', () => {
  assert.match(catalog, /rpc\('search_lidl_store_products'/);
  assert.match(catalog, /from\('lidl_product_stores'\)[\s\S]*eq\('store_id', storeId\)/);
  assert.match(catalog, /from\('lidl_store_category_catalog'\)[\s\S]*eq\('store_id', storeId\)/);
  assert.match(catalogScreen, /browseLidlProducts\([\s\S]*lidlStoreId\)/);
  assert.match(catalogScreen, /catalog\.lidlStoreRequired/);
});

test('feeds Lidl no se habilitan sin tienda y propagan la selección', () => {
  for (const screen of [offers, arrivals, changes]) {
    assert.match(screen, /s\.key !== 'lidl' \|\| lidlStoreId != null/);
  }
  assert.match(offers, /fetchStoreOffers\([\s\S]*lidlStoreId/);
  assert.match(arrivals, /fetchWeeklyNewProducts\([\s\S]*lidlStoreId/);
  assert.match(changes, /fetchPriceChanges\([\s\S]*lidlStoreId/);
});
