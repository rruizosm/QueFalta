import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync(
  new URL('../../src/screens/PriceAlertsScreen.tsx', import.meta.url),
  'utf8',
);
const editor = readFileSync(
  new URL('../../src/components/PriceAlertEditorModal.tsx', import.meta.url),
  'utf8',
);
const productAlertButton = readFileSync(
  new URL('../../src/components/ProductAlertButton.tsx', import.meta.url),
  'utf8',
);
const notificationsSheet = readFileSync(
  new URL('../../src/components/NotificationsSheet.tsx', import.meta.url),
  'utf8',
);
const processor = readFileSync(
  new URL('../../supabase/functions/process-price-alerts/index.ts', import.meta.url),
  'utf8',
);
const priceAlertsApi = readFileSync(
  new URL('../../src/api/priceAlerts.ts', import.meta.url),
  'utf8',
);
const generalProcessorMigration = readFileSync(
  new URL('../../supabase/migrations/20260828164258_generalize_price_alert_processor.sql', import.meta.url),
  'utf8',
);
const newArrivalKeywordMigration = readFileSync(
  new URL('../../supabase/migrations/20261012191308_filter_new_arrival_alerts_by_keywords.sql', import.meta.url),
  'utf8',
);

test('la cabecera de alertas cabe completa y el switch activo usa el accent sólido', () => {
  assert.match(screen, /titleFontSize=\{17\}/);
  assert.match(screen, /trackColor=\{\{ false: colors\.border, true: colors\.accent \}\}/);
  assert.match(screen, /thumbColor=\{colors\.white\}/);
  assert.match(screen, /accessibilityState=\{\{ checked: active \}\}/);
});

test('los tres tipos de aviso comparten el diseño del interruptor de alerta activa', () => {
  assert.equal(
    editor.match(/trackColor=\{\{ false: colors\.border, true: colors\.accent \}\}/g)?.length,
    3,
  );
  assert.equal(editor.match(/thumbColor=\{colors\.white\}/g)?.length, 3);
  assert.equal(editor.match(/ios_backgroundColor=\{colors\.border\}/g)?.length, 3);
  assert.match(editor, /accessibilityState=\{\{ checked: priceDrop \}\}/);
  assert.match(editor, /accessibilityState=\{\{ checked: newOffer \}\}/);
  assert.match(editor, /accessibilityState=\{\{ checked: newArrival \}\}/);
});

test('«Avísame» usa una superficie opaca sobre la imagen del producto', () => {
  assert.equal(
    productAlertButton.match(/backgroundColor: colors\.white/g)?.length,
    2,
  );
  assert.match(productAlertButton, /borderColor: colors\.accent/);
  assert.doesNotMatch(productAlertButton, /backgroundColor: colors\.accentLight/);
  assert.doesNotMatch(productAlertButton, /backgroundColor: 'rgba\(/);
});

test('el editor mantiene el campo de nombre visible al abrir el teclado', () => {
  assert.match(editor, /<KeyboardAvoidingView behavior="padding" style=\{styles\.root\}>/);
  assert.match(editor, /keyboardShouldPersistTaps="handled"/);
  assert.match(editor, /keyboardDismissMode="on-drag"/);
});

test('las novedades admiten un filtro opcional por palabras de extremo a extremo', () => {
  assert.match(editor, /\{kind === 'keyword' \? \(/);
  assert.doesNotMatch(editor, /setQuery\(''\);/);
  assert.match(editor, /validNewArrivalQuery = normalizedQuery\.length === 0 \|\| normalizedQuery\.length >= 2/);
  assert.match(editor, /query,/);
  assert.match(screen, /rule\.kind === 'keyword' \|\| rule\.kind === 'new_arrival'/);
  assert.match(priceAlertsApi, /input\.kind === 'keyword' \|\| input\.kind === 'new_arrival'/);
  assert.match(newArrivalKeywordMigration, /kind = 'new_arrival'[\s\S]+query is null or char_length\(btrim\(query\)\) >= 2/);
  assert.match(newArrivalKeywordMigration, /keyword_tokens_match\(r\.query_norm, e\.display_name_norm\)/);
  assert.match(newArrivalKeywordMigration, /having count\(\*\) > 400/);
});

test('la notificación personalizada conserva el emoji de la regla y limpia nombres de prueba', () => {
  assert.match(processor, /\.select\('label, emoji'\)/);
  assert.match(processor, /replace\(\/\^TEST\\s\+\\d\+\\s\*\u00b7\\s\*\/iu, ''\)/);
  assert.match(processor, /rule: label, emoji/);
  assert.match(processor, /pushTitle\(emoji, label\)/);
  assert.match(notificationsSheet, /n\.data\.emoji/);
  assert.match(notificationsSheet, /<Text style=\{styles\.rowEmoji\}>\{alertEmoji\}<\/Text>/);
});

test('el procesador general no queda acotado a una cuenta y protege los llenados masivos', () => {
  assert.match(processor, /\.rpc\('claim_price_alert_deliveries'/);
  assert.doesNotMatch(processor, /EVALUATION_USER_ID|claim_price_alert_deliveries_for_user/);
  assert.match(generalProcessorMigration, /join public\.catalog_sync_status sync/);
  assert.match(generalProcessorMigration, /having count\(\*\) > 400/);
  assert.match(generalProcessorMigration, /process-price-alerts-every-15-minutes/);
});
