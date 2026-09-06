import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { allStoresRequiresPlus } from '../../src/constants/limits.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const catalog = read('src/screens/CatalogScreen.tsx');
const dropdown = read('src/components/StoreDropdown.tsx');
const paywall = read('src/components/PaywallModal.tsx');
const migration = read('supabase/migrations/20260829124046_grant_all_registered_users_all_stores_access.sql');
const restoration = read('supabase/migrations/20260905120134_restore_pre_1_3_all_stores_access.sql');
const removal = read('supabase/migrations/20260905120906_remove_legacy_all_stores_access.sql');

test('Todos is available only to Plus accounts', () => {
  const limits = read('src/constants/limits.ts');
  assert.match(limits, /allStoresRequiresPlus/);
  assert.equal(allStoresRequiresPlus(false), true);
  assert.equal(allStoresRequiresPlus(true), false);
  assert.doesNotMatch(limits, /hasLegacyAllStoresAccess/);
  assert.doesNotMatch(catalog, /legacyAllStoresAccess/);
  assert.doesNotMatch(dropdown, /legacyAllStoresAccess/);
  assert.match(catalog, /allStoresLocked[\s\S]*setPaywallVisible\(true\)/);
  assert.match(dropdown, /allLocked[\s\S]*setPaywallVisible\(true\)/);
  assert.match(dropdown, /allLocked[\s\S]*name="lock-closed"/);
  assert.match(paywall, /key: 'lidl'/);
});

test('the combined store option uses the explicit personal-store label', () => {
  const translations = read('src/i18n/translations.ts');
  assert.match(dropdown, /t\('storePicker\.allStores'\)/);
  assert.match(catalog, /t\('storePicker\.allStores'\)/);
  assert.match(translations, /allStores: 'Todos tus supermercados'/);
  assert.match(translations, /allStores: 'Tots els teus supermercats'/);
});

test('Lidl and the combined view are visible but gated by Plus outside onboarding', () => {
  const limits = read('src/constants/limits.ts');
  const onboardingStores = read('src/screens/onboarding/StoresScreen.tsx');
  const newArrivals = read('src/screens/NewArrivalsScreen.tsx');
  const offers = read('src/screens/OffersScreen.tsx');
  const priceChanges = read('src/screens/PriceChangesScreen.tsx');

  assert.match(limits, /PLUS_CATALOG_STORES = \['lidl'\]/);
  assert.match(dropdown, /item\.key === 'lidl' && lidlLocked/);
  assert.match(dropdown, /setPaywallVisible\(true\)/);
  assert.match(dropdown, /name="lock-closed"/);
  assert.match(catalog, /accessibleStores[\s\S]*catalogStoreRequiresPlus/);
  assert.match(catalog, /stores: accessibleStores/);
  assert.match(catalog, /item\.key === 'lidl' && lidlLocked[\s\S]*setPaywallVisible\(true\)/);

  for (const source of [newArrivals, offers, priceChanges]) {
    assert.match(source, /const storeOptions = useMemo/);
    assert.match(source, /stores = useMemo\([\s\S]*catalogStoreRequiresPlus/);
    assert.match(source, /<StoreDropdown stores=\{storeOptions\}/);
  }

  assert.doesNotMatch(onboardingStores, /catalogStoreRequiresPlus|PaywallModal|lidlLocked/);
  assert.match(onboardingStores, /onPress=\{\(\) => toggle\(store\.key\)\}/);
});

test('the historical migration for already deployed clients remains immutable', () => {
  assert.match(migration, /alter column legacy_all_stores_access set default true/);
  assert.match(migration, /where legacy_all_stores_access = false/);
  assert.match(restoration, /alter column legacy_all_stores_access set default false/);
  assert.match(restoration, /created_at < timestamptz '2026-08-29T12:38:05Z'/);
  assert.match(restoration, /is distinct from/);
  assert.match(removal, /alter column legacy_all_stores_access set default false/);
  assert.match(removal, /set legacy_all_stores_access = false/);
  assert.match(removal, /where legacy_all_stores_access = true/);
});
