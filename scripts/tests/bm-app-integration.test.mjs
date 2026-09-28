import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  bmAvailableForPostalCode,
  bmReferencePostalCode,
} from '../../src/constants/retailerZones.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const stores = read('src/constants/stores.ts');
const appZones = read('src/constants/retailerZones.ts');
const syncZones = read('scripts/lib/bm.mjs');
const regions = read('src/constants/regions.ts');
const onboarding = read('src/screens/onboarding/StoresScreen.tsx');
const storePreferences = read('src/screens/CatalogStoresScreen.tsx');
const catalogApi = read('src/api/catalog.ts');
const catalogScreen = read('src/screens/CatalogScreen.tsx');
const browse = read('src/api/catalogBrowse.ts');
const adapters = read('src/lib/productAdapters.ts');
const navigation = read('src/navigation/index.tsx');
const routes = read('src/types.ts');
const profile = read('src/api/profile.ts');
const comparator = read('src/components/SimilarProductsSection.tsx');

const supportedPostalCodes = ['20009', '48009', '01001', '39001', '31001', '26001', '28008'];

test('la disponibilidad BM usa exactamente los CP importados por el sincronizador', () => {
  for (const postalCode of supportedPostalCodes) {
    assert.match(appZones, new RegExp(`'${postalCode}'`));
    assert.match(syncZones, new RegExp(`'${postalCode}'`));
    assert.equal(bmAvailableForPostalCode(postalCode), true);
    assert.equal(bmReferencePostalCode(postalCode), postalCode);
  }
  assert.equal(bmAvailableForPostalCode('48990'), true);
  assert.equal(bmReferencePostalCode('48990'), '48009');
  assert.equal(bmAvailableForPostalCode('20008'), true);
  assert.equal(bmReferencePostalCode('20008'), '20009');
  assert.equal(bmAvailableForPostalCode('08001'), false);
  assert.equal(bmReferencePostalCode('08001'), null);
  assert.equal(bmAvailableForPostalCode(null), false);

  const appList = appZones.match(/BM_SUPPORTED_POSTAL_CODES = \[([\s\S]*?)\] as const/)?.[1];
  const syncList = syncZones.match(/BM_SUPPORTED_POSTAL_CODES = \[([\s\S]*?)\]/)?.[1];
  assert.ok(appList);
  assert.ok(syncList);
  const extract = (source) => [...source.matchAll(/'(\d{5})'/g)].map((match) => match[1]);
  assert.deepEqual(extract(appList), supportedPostalCodes);
  assert.deepEqual(extract(syncList), supportedPostalCodes);
});

test('todos los CP de cada provincia BM usan su catálogo de referencia', () => {
  const provincialExamples = new Map([
    ['01015', '01001'],
    ['20100', '20009'],
    ['26140', '26001'],
    ['28990', '28008'],
    ['31800', '31001'],
    ['39700', '39001'],
    ['48990', '48009'],
  ]);
  for (const [postalCode, referencePostalCode] of provincialExamples) {
    assert.equal(bmAvailableForPostalCode(postalCode), true);
    assert.equal(bmReferencePostalCode(postalCode), referencePostalCode);
  }
});

test('BM se ofrece en onboarding y preferencias para toda provincia soportada', () => {
  assert.match(stores, /\| 'bm'/);
  assert.match(stores, /key: 'bm',[\s\S]*?name: 'BM',[\s\S]*?assets\/stores\/bm\.png/);
  assert.equal(existsSync(new URL('../../assets/stores/bm.png', import.meta.url)), true);
  assert.match(regions, /store === 'bm' && !bmAvailableForPostalCode\(postalCode\)/);
  assert.match(onboarding, /storeInRegion\(store\.key, region, postalCode\)/);
  assert.match(storePreferences, /storeInRegion\(s\.key, region, postalCode\)/);
  assert.match(profile, /key !== 'lidl' && key !== 'bm'/);
});

test('el catálogo BM resuelve la ubicación provincial y cubre todas sus superficies', () => {
  assert.match(catalogApi, /bmReferencePostalCode\(postalCode\)/);
  assert.match(catalogApi, /from\('bm_postal_locations'\)[\s\S]*eq\('is_preferred', true\)/);
  assert.match(catalogApi, /rpc\('search_bm_products'/);
  assert.match(catalogApi, /rpc\('search_bm_feed_products'/);
  assert.match(catalogApi, /function browseBmProducts/);
  assert.match(catalogApi, /function fetchBmCategoryTree/);
  assert.match(catalogApi, /function fetchBmProductsByCategory/);
  assert.match(catalogApi, /function fetchBmProduct/);
  assert.match(browse, /case 'bm':[\s\S]*browseBmProducts/);
  assert.match(adapters, /function bmToUI/);
});

test('BM tiene navegación y UI propias sin entrar en la comparativa v7 todavía', () => {
  assert.match(catalogScreen, /store === 'bm' && tab === 'categorias'/);
  assert.match(catalogScreen, /store === 'bm' && tab === 'productos'/);
  assert.match(navigation, /name="BmProducts"/);
  assert.match(routes, /BmProducts: \{/);
  assert.match(comparator, /excludeStore === 'bm'/);
  assert.match(comparator, /store !== 'bm'/);
});
