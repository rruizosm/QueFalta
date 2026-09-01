import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const prompt = read('src/components/WhatsNewPrompt.tsx');
const navigation = read('src/navigation/index.tsx');
const translations = read('src/i18n/translations.ts');

test('el popup 1.3 solo se dirige a cuentas anteriores y recuerda el cierre por usuario', () => {
  assert.match(prompt, /Date\.parse\(profile\.createdAt\)/);
  assert.match(prompt, /createdAt < VERSION_1_3_RELEASED_AT/);
  assert.match(prompt, /WHATS_NEW_VERSION = '1\.3\.0'/);
  assert.match(prompt, /`\$\{WHATS_NEW_STORAGE_PREFIX\}\$\{WHATS_NEW_VERSION\}:\$\{userId\}`/);
  assert.match(prompt, /AsyncStorage\.getItem\(seenKey\)/);
  assert.match(prompt, /AsyncStorage\.setItem\(seenKey, String\(Date\.now\(\)\)\)/);
});

test('el popup es compacto y se puede cerrar por todos los caminos esperados', () => {
  assert.match(prompt, /<Modal[\s\S]*transparent[\s\S]*onRequestClose=\{dismiss\}/);
  assert.match(prompt, /testID="whats-new-backdrop"/);
  assert.match(prompt, /accessibilityLabel=\{t\('common\.close'\)\}/);
  assert.match(prompt, /maxHeight: Math\.max\(320, Math\.min\(height - 48, 720\)\)/);
  assert.match(prompt, /onPress=\{dismiss\}[\s\S]*t\('whatsNew\.cta'\)/);
  assert.match(navigation, /<WhatsNewPrompt \/>/);
});

test('la bienvenida comunica solo las cuatro novedades listas en castellano y catalán', () => {
  assert.match(translations, /storesTitle: '18 supermercados, ahora juntos'/);
  assert.match(translations, /storesTitle: '18 supermercats, ara junts'/);
  assert.match(translations, /searchTitle: 'Encuentra lo que buscas'/);
  assert.match(translations, /searchTitle: 'Troba el que busques'/);
  assert.match(translations, /radarTitle: 'Nuevo Radar de ahorro'/);
  assert.match(translations, /radarTitle: "Nou Radar d'estalvi"/);
  assert.match(translations, /groupsTitle: 'Carritos y grupos más completos'/);
  assert.match(translations, /groupsTitle: 'Cistelles i grups més complets'/);
  assert.doesNotMatch(prompt, /priceAlert|alertsTitle|alertas personalizadas/i);
});
