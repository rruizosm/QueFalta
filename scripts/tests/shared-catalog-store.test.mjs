import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const app = read('App.tsx');
const context = read('src/context/CatalogStoreContext.tsx');
const catalog = read('src/screens/CatalogScreen.tsx');
const newArrivals = read('src/screens/NewArrivalsScreen.tsx');
const offers = read('src/screens/OffersScreen.tsx');
const priceChanges = read('src/screens/PriceChangesScreen.tsx');

test('catalog, new arrivals, offers and price changes share one store selection', () => {
  assert.match(app, /<CatalogStoreProvider>/);
  assert.match(context, /const \[store, setStore\] = useState<StoreSelection>\('mercadona'\)/);
  for (const screen of [catalog, newArrivals, offers, priceChanges]) {
    assert.match(screen, /useCatalogStore\(\)/);
  }
  for (const screen of [newArrivals, offers, priceChanges]) {
    assert.doesNotMatch(screen, /useState<StoreSelection>/);
  }
});

test('the embedded recipe picker keeps an isolated store selection', () => {
  assert.match(catalog, /const \[pickerStore, setPickerStore\] = useState<StoreKey>\('mercadona'\)/);
  assert.match(catalog, /isProductPicker \? pickerStore : sharedStore\.store/);
  assert.match(catalog, /isProductPicker \? setPickerStore : sharedStore\.setStore/);
});

test('offers exposes the common selector without querying unsupported offer feeds', () => {
  assert.doesNotMatch(offers, /CATALOG_STORES\.filter\(\(s\) => OFFER_STORES\.includes/);
  assert.match(offers, /const offerStores = useMemo/);
  assert.match(offers, /if \(!OFFER_STORES\.includes\(store\)\) \{[\s\S]*setLoading\(false\)/);
  assert.match(offers, /stores=\{storeOptions\} value=\{store\} onChange=\{setStore\}/);
});
