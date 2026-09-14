import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const listScreen = read('src/screens/ListScreen.tsx');
const listsApi = read('src/api/lists.ts');
const purchasesApi = read('src/api/purchases.ts');
const translations = read('src/i18n/translations.ts');
const recipeActions = read('src/components/RecipeEngagementActions.tsx');
const migration = read('supabase/migrations/20260911173959_defer_unavailable_products.sql');

test('la decisión se toma por producto y no existe el modo global de cabecera', () => {
  assert.doesNotMatch(listScreen, /keepUnpurchased|confirmKeepUnpurchased|savePending/);
  assert.doesNotMatch(translations, /finishWithSaved|savePendingTitle|stopSavingPendingTitle/);
  assert.match(listScreen, /t\('list\.notePlaceholder'\)/);
  assert.match(listScreen, /t\('list\.notInStore'\)/);
  assert.match(listScreen, /styles\.footerDivider/);
});

test('el aplazado usa el marcador de recetas y sustituye por completo las notas', () => {
  assert.match(recipeActions, /name=\{recipe\.isSaved \? 'bookmark' : 'bookmark-outline'\}/);
  assert.match(listScreen, /item\.deferredToNextPurchase \? \(/);
  assert.match(listScreen, /<Ionicons name="bookmark" size=\{12\}/);
  assert.match(listScreen, /t\('list\.includedNextPurchase'\)/);
  assert.match(translations, /includedNextPurchase: 'Producto incluido en la próxima compra'/);
  assert.match(translations, /notePlaceholder: 'Notas'/);
});

test('recogido y aplazado cuentan como gestionados, pero solo se compra lo recogido', () => {
  assert.match(listScreen, /doneItems: merged\.filter\(\(i\) => i\.inCart \|\| i\.deferredToNextPurchase\)\.length/);
  assert.match(listScreen, /purchasedItems: merged\.filter\(\(i\) => i\.inCart\)\.length/);
  assert.match(listScreen, /doneItems === merged\.length && purchasedItems > 0/);
  assert.match(purchasesApi, /finish_list_purchase', \{ p_list_id: listId \}/);
  assert.doesNotMatch(purchasesApi, /p_keep_unpurchased/);
});

test('la API persiste el estado y fuerza su exclusión mutua con en cesta', () => {
  assert.match(listsApi, /deferred_to_next_purchase/);
  assert.match(listsApi, /isMissingDeferredColumn/);
  assert.match(listsApi, /select\(LEGACY_LIST_ITEMS_SELECT\)/);
  assert.match(listsApi, /supabase\.rpc\('set_list_items_deferred'/);
  assert.match(migration, /check \(not \(in_cart and deferred_to_next_purchase\)\)/);
  assert.match(migration, /set in_cart = p_in_cart,[\s\S]+deferred_to_next_purchase = false/);
  assert.match(migration, /set deferred_to_next_purchase = p_deferred,[\s\S]+in_cart = false/);
});

test('finalizar archiva lo recogido y devuelve lo aplazado como pendiente', () => {
  assert.match(migration, /create or replace function public\.finish_list_purchase\(p_list_id uuid\)/);
  assert.match(migration, /where li\.list_id = p_list_id[\s\S]+and li\.in_cart[\s\S]+group by/);
  assert.match(migration, /delete from public\.list_items[\s\S]+and in_cart/);
  assert.match(migration, /set deferred_to_next_purchase = false,[\s\S]+in_cart = false,[\s\S]+assigned_to = null/);
  assert.match(migration, /All list items must be collected or deferred/);
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /grant execute on function public\.set_list_items_deferred\(uuid\[\], boolean\) to authenticated/);
});
