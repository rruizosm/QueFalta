import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const dropdown = read('src/components/StoreDropdown.tsx');
const catalog = read('src/screens/CatalogScreen.tsx');
const allStoresModal = read('src/components/AllStoresInfoModal.tsx');
const infoButton = read('src/components/StoreInfoButton.tsx');
const lidlStorePicker = read('src/components/LidlStorePicker.tsx');
const translations = read('src/i18n/translations.ts');

test('the Lidl information button is limited to Canary users with Lidl selected', () => {
  assert.match(
    dropdown,
    /const isCanaryUser = profile\?\.region === 'ES-CN'[\s\S]*regionFromPostalCode\(profile\?\.postalCode \?\? ''\) === 'ES-CN'/,
  );
  assert.match(dropdown, /const showLidlCanaryNotice = value === 'lidl' && isCanaryUser/);
  assert.match(dropdown, /\{showLidlCanaryNotice && \(glassAvailable/);
  assert.match(dropdown, /const showLidlInfo = item\.key === 'lidl' && isCanaryUser/);
  assert.match(catalog, /const showLidlInfo = item\.key === 'lidl' && isCanaryUser/);
  assert.match(catalog, /showCanaryNotice=\{isCanaryUser\}/);
  assert.match(lidlStorePicker, /\{showCanaryNotice \? \(/);
  assert.match(dropdown, /Alert\.alert\([\s\S]*storePicker\.lidlCanaryNoticeTitle[\s\S]*storePicker\.lidlCanaryNoticeBody/);
  assert.match(catalog, /Alert\.alert\([\s\S]*storePicker\.lidlCanaryNoticeTitle[\s\S]*storePicker\.lidlCanaryNoticeBody/);
  for (const source of [dropdown, catalog, lidlStorePicker]) {
    assert.ok(source.includes('variant="lidlCanary"'), 'the Android notice uses the shared in-app popup');
  }
  assert.match(allStoresModal, /lidlCanary \? 'storePicker\.lidlCanaryNoticeBody' : 'storePicker\.allStoresNoticeBody'/);
});

test('the Canary notice explains that Madrid prices are only a reference in both languages', () => {
  assert.match(translations, /catálogo principal de Madrid/);
  assert.match(translations, /Úsalo como guía, no como precios definitivos/);
  assert.match(translations, /catàleg principal de Madrid/);
  assert.match(translations, /Fes-lo servir com a guia, no com a preus definitius/);
});

test('the combined-store information button appears only while the Plus option is locked', () => {
  assert.match(
    dropdown,
    /\{allLocked \? \([\s\S]*allCardInfoButton[\s\S]*storePicker\.allStoresInfoLabel/,
  );
  assert.match(
    catalog,
    /\{allStoresLocked \? \([\s\S]*storeAllInfoButton[\s\S]*storePicker\.allStoresInfoLabel/,
  );
  for (const source of [dropdown, catalog]) {
    assert.match(
      source,
      /<AllStoresInfoModal[\s\S]*contained[\s\S]*visible=\{allStoresInfoVisible\}[\s\S]*setAllStoresInfoVisible\(false\)/,
    );
    assert.match(source, /left: 8, bottom: 4/);
    assert.ok(source.includes('<StoreInfoButton'), 'both cards use the same information control');
  }
  assert.match(infoButton, /width: 44, height: 44/);
  assert.match(infoButton, /width: 34, height: 34/);
  assert.match(infoButton, /fallbackColor=\{colors\.accentLight\}/);
});

test('the combined-store popup includes a real list example for the three requested stores', () => {
  assert.match(allStoresModal, /store: 'mercadona'[\s\S]*Leche semidesnatada Hacendado/);
  assert.match(allStoresModal, /store: 'carrefour'[\s\S]*Leche semidesnatada Carrefour/);
  assert.match(allStoresModal, /store: 'lidl'[\s\S]*name: 'Leche semidesnatada'/);
  assert.match(allStoresModal, /prod-mercadona\.imgix\.net/);
  assert.match(allStoresModal, /static\.carrefour\.es/);
  assert.match(allStoresModal, /static-product-catalog\.lidlplus\.com/);
  assert.equal(allStoresModal.match(/price: '0,84 €'/g)?.length, 3);
  assert.match(allStoresModal, /<ProductImage uri=\{product\.imageUrl\}/);
  assert.match(allStoresModal, /storeLogoBadge:[\s\S]*position: 'absolute'[\s\S]*top: 0[\s\S]*left: 0/);
  assert.match(allStoresModal, /if \(contained\) return visible \? content : null/);
});

test('the combined-store notice describes its real benefits in both languages', () => {
  assert.match(translations, /buscar productos en todos a la vez/);
  assert.match(translations, /ofertas, novedades y cambios de precio/);
  assert.match(translations, /Cada resultado muestra el supermercado al que pertenece/);
  assert.match(translations, /cercar productes a tots alhora/);
  assert.match(translations, /ofertes, novetats i canvis de preu/);
  assert.match(translations, /Cada resultat mostra el supermercat al qual pertany/);
  assert.match(translations, /logo de la esquina superior izquierda/);
  assert.match(translations, /logotip de la cantonada superior esquerra/);
  assert.match(translations, /El catálogo y los precios se actualizan y pueden cambiar/);
  assert.match(translations, /El catàleg i els preus s’actualitzen i poden canviar/);
});
