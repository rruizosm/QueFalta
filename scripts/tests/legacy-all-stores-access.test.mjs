import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const catalog = read('src/screens/CatalogScreen.tsx');
const dropdown = read('src/components/StoreDropdown.tsx');
const paywall = read('src/components/PaywallModal.tsx');
const migration = read('supabase/migrations/20260829124046_grant_all_registered_users_all_stores_access.sql');

test('Todos is no longer gated by Plus in any of the four combined listings', () => {
  assert.doesNotMatch(catalog, /canUseAllStores|allLocked/);
  assert.doesNotMatch(dropdown, /canUseAllStores|allLocked|PaywallModal/);
  assert.doesNotMatch(paywall, /key: 'stores'/);
});

test('deployed 1.3 clients grant current and future registered accounts', () => {
  assert.match(migration, /alter column legacy_all_stores_access set default true/);
  assert.match(migration, /where legacy_all_stores_access = false/);
});
