import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const favoritesContext = read('src/context/FavoritesContext.tsx');
const startupCache = read('src/lib/startupCache.ts');
const homeScreen = read('src/screens/HomeScreen.tsx');
const catalogScreen = read('src/screens/CatalogScreen.tsx');

test('favoritos conserva un snapshot aislado por usuario y revalida la red', () => {
  assert.match(startupCache, /favorites: \(userId: string\) => key\(userId, 'favorites'\)/);
  assert.match(startupCache, /startupKeys\.favorites\(userId\)/);
  assert.match(favoritesContext, /readStartupCache<FavoritesSnapshot>/);
  assert.match(favoritesContext, /writeStartupCache\(startupKeys\.favorites\(userId\)/);
  assert.match(favoritesContext, /attempt < 2/);
  assert.match(homeScreen, /Promise\.allSettled\(\[load\(\), refreshFavorites\(\)\]\)/);
});

test('Todos precarga lotes cortos por supermercado', () => {
  const allBrowseBlock = catalogScreen.match(/const pager = createMultiStorePager\(\{[\s\S]+?allBrowsePager\.current = pager;/)?.[0] ?? '';
  assert.match(allBrowseBlock, /pageSize: 12/);
});
