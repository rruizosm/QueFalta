import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const storage = read('src/lib/catalogFavoriteStore.ts');
const context = read('src/context/CatalogStoreContext.tsx');
const dropdown = read('src/components/StoreDropdown.tsx');
const catalog = read('src/screens/CatalogScreen.tsx');
const favorites = read('src/screens/FavoritesScreen.tsx');
const infoButton = read('src/components/StoreInfoButton.tsx');
const favoriteButton = read('src/components/StoreFavoriteButton.tsx');
const translations = read('src/i18n/translations.ts');

test('the favorite supermarket is validated and persisted per account', () => {
  assert.match(storage, /`\$\{FAVORITE_STORE_KEY\}:\$\{userId\}`/);
  assert.match(storage, /CATALOG_STORE_KEYS\.includes/);
  assert.match(storage, /AsyncStorage\.setItem\(key, store\)/);
  assert.match(storage, /AsyncStorage\.removeItem\(key\)/);
  assert.match(context, /readCatalogFavoriteStore\(userId\)/);
  assert.match(context, /writeCatalogFavoriteStore\(userId, nextFavorite\)/);
});

test('an accessible favorite becomes the shared default without bypassing access rules', () => {
  assert.match(context, /setStore\(favoriteStore\)/);
  assert.match(context, /catalogStoreRequiresPlus\(favoriteStore, isPremium\)/);
  assert.match(context, /storeInRegion\(favoriteStore, region, postalCode\)/);
  assert.match(context, /enabledStores\.includes\(favoriteStore\)/);
  assert.match(context, /favoriteStore === 'lidl' && !lidlStoreId/);
  assert.match(favorites, /favStoreKeys\.includes\(favoriteStore\)/);
  assert.match(catalog, /setPickerStore\(sharedStore\.favoriteStore\)/);
});

test('favorite actions are bottom-right and only the active one remains visible', () => {
  for (const source of [dropdown, catalog]) {
    assert.match(source, /<StoreFavoriteButton/);
    assert.match(source, /favorite \? 'storePicker\.removeFavorite' : 'storePicker\.markFavorite'/);
    assert.match(source, /position: 'absolute', right: 4, bottom: 4/);
    assert.match(source, /!visibleFavoriteStore \|\| favorite \?/);
  }
  assert.match(dropdown, /stores\.some\(\(item\) => item\.key === favoriteStore\)/);
  assert.match(catalog, /visibleStores\.some\(\(item\) => item\.key === sharedStore\.favoriteStore\)/);
  assert.match(dropdown, /if \(locked && !favorite\)[\s\S]*setPaywallVisible\(true\)/);
  assert.match(catalog, /if \(locked && !favorite\)[\s\S]*setPaywallVisible\(true\)/);
});

test('favorite and information actions share the same visual component', () => {
  assert.match(infoButton, /StoreCardActionButton/);
  assert.match(favoriteButton, /StoreCardActionButton/);
  assert.match(favoriteButton, /active \? 'star' : 'star-outline'/);
});

test('favorite actions have Spanish and Catalan accessible labels', () => {
  assert.match(translations, /Marcar \{\{store\}\} como supermercado favorito/);
  assert.match(translations, /Quitar \{\{store\}\} como supermercado favorito/);
  assert.match(translations, /Marca \{\{store\}\} com a supermercat preferit/);
  assert.match(translations, /Treu \{\{store\}\} com a supermercat preferit/);
});
