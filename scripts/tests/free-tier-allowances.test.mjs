import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  FREE_COMPARATOR_SEARCH_LIMIT,
  FREE_PRICE_ALERT_LIMIT,
} from '../../src/constants/limits.ts';
import {
  freePriceAlertRule,
  isFreePriceAlertLimitError,
} from '../../src/lib/freeTierAllowances.ts';

const rule = (overrides = {}) => ({
  id: 'rule-a',
  userId: 'user-a',
  kind: 'keyword',
  emoji: '🛒',
  label: 'Aceite',
  query: 'aceite',
  exactStore: null,
  exactProductId: null,
  stores: ['mercadona'],
  locationIds: {},
  notifyPriceDrop: true,
  notifyNewOffer: false,
  minDropPct: 5,
  active: true,
  createdAt: '2026-08-20T10:00:00.000Z',
  updatedAt: '2026-08-20T10:00:00.000Z',
  ...overrides,
});

test('the free tier exposes one alert and three comparator searches', () => {
  assert.equal(FREE_PRICE_ALERT_LIMIT, 1);
  assert.equal(FREE_COMPARATOR_SEARCH_LIMIT, 3);
});

test('an active alert keeps the free slot ahead of a newer paused rule', () => {
  const selected = freePriceAlertRule([
    rule({ id: 'paused', active: false, updatedAt: '2026-08-23T10:00:00.000Z' }),
    rule({ id: 'active', updatedAt: '2026-08-21T10:00:00.000Z' }),
  ]);
  assert.equal(selected?.id, 'active');
});

test('the most recently updated active alert keeps the free slot', () => {
  const selected = freePriceAlertRule([
    rule({ id: 'older', updatedAt: '2026-08-21T10:00:00.000Z' }),
    rule({ id: 'newer', updatedAt: '2026-08-22T10:00:00.000Z' }),
  ]);
  assert.equal(selected?.id, 'newer');
  assert.equal(freePriceAlertRule([]), null);
});

test('the alert quota error is recognized from Supabase responses', () => {
  assert.equal(isFreePriceAlertLimitError({ message: 'free_price_alert_limit_reached' }), true);
  assert.equal(isFreePriceAlertLimitError({ message: 'another_database_error' }), false);
});

test('the migration enforces persistent and atomic server-side allowances', () => {
  const sql = readFileSync(new URL(
    '../../supabase/migrations/20260823063529_free_tier_alert_and_comparator_allowances.sql',
    import.meta.url,
  ), 'utf8');
  const launchIndependentSql = readFileSync(new URL(
    '../../supabase/migrations/20260823065448_enforce_free_allowances_before_paywall_launch.sql',
    import.meta.url,
  ), 'utf8');
  assert.match(sql, /create table if not exists private\.free_tier_usage/i);
  assert.match(sql, /comparator_searches_used between 0 and 3/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /free_price_alert_limit_reached/i);
  assert.match(sql, /catalog_cheaper_products_v6/i);
  assert.doesNotMatch(launchIndependentSql, /paywall_enabled\s*\(/i);
  assert.match(launchIndependentSql, /enforce_free_price_alert_allowance/i);
  assert.match(launchIndependentSql, /enforce_free_price_alert_delivery/i);
});
