import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260824165601_high_priority_cart_integrity.sql');
const listsApi = read('src/api/lists.ts');
const listScreen = read('src/screens/ListScreen.tsx');
const productList = read('src/components/StoreProductList.tsx');
const pager = read('src/lib/multiStorePager.ts');
const androidPlugin = read('plugins/withAndroidReleaseHardening.js');
const appConfig = read('app.json');

test('la compra y los cambios masivos se resuelven con RPC atómicas e invoker', () => {
  for (const name of ['set_list_items_in_cart', 'assign_list_items', 'finish_list_purchase']) {
    assert.match(migration, new RegExp(`function public\\.${name}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]+to authenticated`));
  }
  assert.match(migration, /security invoker/gi);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /insert into public\.purchase_items[\s\S]+delete from public\.list_items/);
  assert.match(listScreen, /finishPurchase\(activeCart\.listId\)/);
  assert.doesNotMatch(listScreen, /recordPurchase/);
  assert.match(listsApi, /supabase\.rpc\('set_list_items_in_cart'/);
  assert.match(listsApi, /supabase\.rpc\('assign_list_items'/);
});

test('la identidad de productos incluye siempre el supermercado', () => {
  assert.match(migration, /add column if not exists store_key text/);
  assert.match(migration, /alter column store_key set not null/);
  assert.match(listsApi, /store_key: it\.storeKey/);
  assert.match(listsApi, /`\$\{it\.storeKey\}:\$\{productId\}`/);
  assert.match(productList, /`\$\{product\.store\}:\$\{product\.id\}`/);
});

test('Todos conserva resultados parciales y el release Android queda endurecido', () => {
  assert.match(pager, /Promise\.allSettled/);
  assert.match(pager, /state\.done = true/);
  assert.match(androidPlugin, /android\.enableMinifyInReleaseBuilds/);
  assert.match(androidPlugin, /android\.enableShrinkResourcesInReleaseBuilds/);
  assert.match(androidPlugin, /never fall back to the debug key/);
  for (const permission of [
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
    'android.permission.SYSTEM_ALERT_WINDOW',
  ]) assert.match(appConfig, new RegExp(permission.replaceAll('.', '\\.')));
});
