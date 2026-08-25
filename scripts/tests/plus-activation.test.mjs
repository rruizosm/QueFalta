import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { activePlusExpirationFromRevenueCat } from '../../supabase/functions/_shared/revenuecat-subscription.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('RevenueCat confirmation accepts only a future Plus entitlement', () => {
  const now = Date.parse('2026-08-24T10:00:00.000Z');
  const active = activePlusExpirationFromRevenueCat({
    subscriber: {
      entitlements: {
        plus: {
          expires_date: '2026-09-24T10:00:00.000Z',
          grace_period_expires_date: '2026-09-27T10:00:00.000Z',
        },
      },
    },
  }, now);
  assert.equal(active, '2026-09-27T10:00:00.000Z');

  assert.equal(activePlusExpirationFromRevenueCat({
    subscriber: {
      entitlements: { plus: { expires_date: '2026-08-23T10:00:00.000Z' } },
    },
  }, now), null);
  assert.equal(activePlusExpirationFromRevenueCat({ subscriber: { entitlements: {} } }, now), null);
});

test('server confirmation derives the account from the JWT and never trusts client premium data', () => {
  const edgeFunction = read('supabase/functions/sync-plus-subscription/index.ts');
  const config = read('supabase/config.toml');

  assert.match(edgeFunction, /userClient\.auth\.getUser\(\)/);
  assert.match(edgeFunction, /encodeURIComponent\(user\.id\)/);
  assert.match(edgeFunction, /REVENUECAT_REST_API_KEY/);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /\.eq\('id', user\.id\)/);
  assert.doesNotMatch(edgeFunction, /req\.json\(\)/);
  assert.match(config, /\[functions\.sync-plus-subscription\][\s\S]*verify_jwt = true/);
});

test('an early stale profile refresh cannot undo a validated purchase', () => {
  const optimistic = read('src/lib/optimisticPremium.ts');
  const profileContext = read('src/context/ProfileContext.tsx');
  const purchases = read('src/lib/purchases.ts');
  const paywall = read('src/components/PaywallModal.tsx');

  assert.match(optimistic, /OPTIMISTIC_PREMIUM_CONFIRMATION_MS = 60_000/);
  assert.match(optimistic, /premiumUntil: pending\.expirationDate/);
  assert.match(profileContext, /reconcileOptimisticPremium\(next, optimisticPremium\.current\)/);
  assert.match(profileContext, /applyPremiumEntitlement/);
  assert.match(purchases, /functions\.invoke\('sync-plus-subscription'/);
  assert.match(paywall, /applyPremiumEntitlement\(expirationDate\)/);
  assert.match(paywall, /confirmPlusSubscription\(\)[\s\S]*\.then\(\(\) => refresh\(\)\)/);
});

test('the Plus paywall anchors the plans below its six advertised benefits', () => {
  const paywall = read('src/components/PaywallModal.tsx');
  const translations = read('src/i18n/translations.ts');

  assert.doesNotMatch(paywall, /key: 'filters'/);
  assert.doesNotMatch(translations, /filtersTitle: 'Filtros avanzados'/);
  assert.doesNotMatch(translations, /filtersTitle: 'Filtres avançats'/);
  assert.match(paywall, /<View style=\{styles\.bottomSection\}>[\s\S]*paywall\.choosePlan/);
  assert.match(paywall, /scrollContent: \{ flexGrow: 1/);
  assert.match(paywall, /bottomSection: \{ marginTop: 'auto'/);
});
