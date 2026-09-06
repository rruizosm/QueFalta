import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  canSubmitUsername,
  normalizeOnboardingStep,
  onboardingRouteForStep,
} from '../../src/lib/onboardingProgress.ts';

const usernameScreen = await readFile(
  new URL('../../src/screens/onboarding/UsernameScreen.tsx', import.meta.url),
  'utf8',
);
const storesScreen = await readFile(
  new URL('../../src/screens/onboarding/StoresScreen.tsx', import.meta.url),
  'utf8',
);
const regionGate = await readFile(
  new URL('../../src/screens/onboarding/RegionGateScreen.tsx', import.meta.url),
  'utf8',
);
const navigation = await readFile(
  new URL('../../src/navigation/index.tsx', import.meta.url),
  'utf8',
);
const translations = await readFile(
  new URL('../../src/i18n/translations.ts', import.meta.url),
  'utf8',
);
const regionSettings = await readFile(
  new URL('../../src/screens/RegionSettingsScreen.tsx', import.meta.url),
  'utf8',
);
const storeConstants = await readFile(
  new URL('../../src/constants/stores.ts', import.meta.url),
  'utf8',
);
const catalogStorePickers = await Promise.all([
  'CatalogStoresScreen.tsx',
  'CatalogScreen.tsx',
  'OffersScreen.tsx',
  'PriceChangesScreen.tsx',
  'NewArrivalsScreen.tsx',
].map((file) => readFile(new URL(`../../src/screens/${file}`, import.meta.url), 'utf8')));

test('onboarding resumes at the persisted safe route', () => {
  assert.equal(onboardingRouteForStep(0), 'Username');
  assert.equal(onboardingRouteForStep(1), 'Stores');
  assert.equal(onboardingRouteForStep(2), 'Avatar');
  assert.equal(onboardingRouteForStep(3), 'Friends');
  assert.equal(onboardingRouteForStep(4), 'Group');
  assert.equal(onboardingRouteForStep(5), 'Group');
});

test('invalid onboarding progress is clamped safely', () => {
  assert.equal(normalizeOnboardingStep(undefined), 0);
  assert.equal(normalizeOnboardingStep(Number.NaN), 0);
  assert.equal(normalizeOnboardingStep(-4), 0);
  assert.equal(normalizeOnboardingStep(99), 5);
});

test('username submit requires matching validation and a valid postal code', () => {
  assert.equal(canSubmitUsername('ok', 'ana', 'ana', true), true);
  assert.equal(canSubmitUsername('ok', 'ana', 'ana2', true), false);
  assert.equal(canSubmitUsername('checking', 'ana', 'ana', true), false);
  assert.equal(canSubmitUsername('ok', 'ana', 'ana', false), false);
});

test('the first onboarding step removes the no-postal-code escape', () => {
  assert.match(usernameScreen, /!!regionSelection\.postalCode/);
  assert.match(usernameScreen, /allowAll=\{false\}/);
  assert.match(usernameScreen, /showLidlStorePicker=\{false\}/);
  assert.match(usernameScreen, /!regionSelection\.postalCode\) return/);
});

test('Lidl appears next to Mercadona in onboarding and the main store pickers', () => {
  assert.match(storesScreen, /store\.key === 'mercadona'.*\[store, lidlStore\]/);
  assert.match(storesScreen, /ONBOARDING_STORES\.filter/);
  assert.match(storeConstants, /storesWithLidlSecond/);
  assert.match(storeConstants, /store\.key === 'mercadona' \? \[store, lidl\]/);
  for (const storePicker of catalogStorePickers) {
    assert.match(storePicker, /storesWithLidlSecond/);
  }
});

test('1.3.1 blocks onboarded accounts until they save a valid postal code', () => {
  assert.match(navigation, /needsPostalCode = !!profile\?\.onboardedAt && !profile\.postalCode/);
  assert.match(navigation, /needsPostalCode \? <RegionGateScreen \/>/);
  assert.match(navigation, /!needsPostalCode \? <WhatsNewPrompt \/>/);
  assert.match(regionGate, /<Modal[\s\S]*onRequestClose=\{\(\) => \{\}\}/);
  assert.match(regionGate, /!!selection\.region && !!selection\.postalCode/);
  assert.match(regionGate, /allowAll=\{false\}/);
  assert.match(regionGate, /showLidlStorePicker=\{false\}/);
  assert.match(regionGate, /postalCode: selection\.postalCode/);
});

test('the mandatory postal-code modal explains local prices and comparisons in both languages', () => {
  assert.match(translations, /regionGateTitle: 'Los mejores precios de tu zona'/);
  assert.match(translations, /regionGatePrices: 'Te mostramos precios adaptados a tu zona\.'/);
  assert.match(translations, /regionGateCompare: 'Compara productos y supermercados/);
  assert.match(translations, /regionGateTitle: 'Els millors preus de la teva zona'/);
  assert.match(translations, /regionGateCompare: 'Compara productes i supermercats/);
});

test('region settings no longer offers the all-Spain block', () => {
  assert.match(regionSettings, /<RegionPicker[\s\S]*allowAll=\{false\}/);
  assert.doesNotMatch(translations, /hint: '[^']*Elige «Toda España»/);
  assert.doesNotMatch(translations, /hint: '[^']*Tria «Tota Espanya»/);
});
