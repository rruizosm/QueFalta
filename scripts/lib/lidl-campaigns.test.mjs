import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LIDL_CAMPAIGN_DEFINITIONS,
  applyLidlCampaign,
  discoverLidlCampaignUrls,
  fetchLidlCampaignCatalog,
  isLidlCampaignCandidate,
  lidlCampaignMatchesDetail,
  lidlCampaignPriceForRegion,
  parseLidlCampaignPage,
} from './lidl-campaigns.mjs';

const definition = LIDL_CAMPAIGN_DEFINITIONS.find(({ key }) => key === 'weekly');
const encodeAttribute = (value) => JSON.stringify(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;');
const page = (product) => `<div data-grid-data="${encodeAttribute(product)}"></div>`;

const weeklyProduct = {
  productId: 11030104,
  nat: '0080227',
  ians: ['80227'],
  title: 'Manzana roja dulce 1 kg bolsa',
  fullTitle: 'Manzana roja dulce 1 kg bolsa',
  canonicalUrl: '/p/manzana-roja-dulce-1-kg-bolsa/p11030104',
  regions: [24, 26],
  regionsV2: {
    24: { status: 'ONLINE', regionName: 'Lleida', regionPriceId: '2' },
    26: { status: 'ONLINE', regionName: 'Barcelona', regionPriceId: '1' },
  },
  regionsPrices: {
    1: {
      currentLidlPlusPrice: {
        price: {
          price: 1.25,
          oldPrice: 2.25,
          startDate: '2026-08-30T22:00:00Z',
          endDateExclusive: '2026-09-06T22:00:00Z',
          discount: { deletedPrice: 2.25, percentageDiscount: 44 },
        },
        lidlPlusText: 'Con Lidl Plus',
        highlightText: '-44%',
      },
    },
    2: {
      currentPrice: {
        price: 1.35,
        oldPrice: 2.25,
        startDate: '2026-08-30T22:00:00Z',
        endDateExclusive: '2026-09-06T22:00:00Z',
      },
    },
  },
};

test('descubre las cinco campañas desde la portada sin fijar sus ids CMS', () => {
  const html = LIDL_CAMPAIGN_DEFINITIONS
    .map((campaign, index) => `<a href="/c/${campaign.slug}/a${1000 + index}">x</a>`)
    .join('');
  const urls = discoverLidlCampaignUrls(html);
  assert.equal(urls.length, 5);
  assert.equal(urls[0].url, 'https://www.lidl.es/c/xxl/a1000');
  assert.equal(urls.at(-1).key, 'price_drops');
});

test('extrae y deduplica el JSON estructurado de data-grid-data', () => {
  const parsed = parseLidlCampaignPage(page(weeklyProduct) + page(weeklyProduct), {
    ...definition,
    url: 'https://www.lidl.es/c/ofertas-semanales/a1',
  });
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].nat, '0080227');
  assert.equal(parsed.products[0].regionsV2[26].regionName, 'Barcelona');
});

test('selecciona precio y Lidl Plus de la región exacta de la tienda', () => {
  const barcelona = lidlCampaignPriceForRegion(weeklyProduct, '26', '2026-09-04T12:00:00Z');
  const lleida = lidlCampaignPriceForRegion(weeklyProduct, '24', '2026-09-04T12:00:00Z');
  assert.equal(barcelona.price, 1.25);
  assert.equal(barcelona.plus, true);
  assert.equal(lleida.price, 1.35);
  assert.equal(lleida.plus, false);
  assert.equal(lidlCampaignPriceForRegion(weeklyProduct, '38', '2026-09-04T12:00:00Z'), null);
});

test('el nombre solo preselecciona y productCodes confirma la correspondencia', () => {
  const catalogProduct = {
    title: 'Manzana roja dulce 1 kg bolsa',
    imageUrl: 'https://example.test/no-code.png',
  };
  assert.equal(isLidlCampaignCandidate(catalogProduct, weeklyProduct), true);
  assert.equal(lidlCampaignMatchesDetail({ productCodes: [{ code: '0080227' }] }, weeklyProduct), true);
  assert.equal(lidlCampaignMatchesDetail({ productCodes: [{ code: '0080228' }] }, weeklyProduct), false);
});

test('aplica precio regional, precio anterior, vigencia y Lidl Plus sin duplicar la etiqueta', () => {
  const campaign = { ...definition, url: 'https://www.lidl.es/c/ofertas-semanales/a1' };
  const row = applyLidlCampaign({ id: 'p1', unit_price: 2.25, raw: {} }, campaign, weeklyProduct, '26', '2026-09-04T12:00:00Z');
  assert.equal(row.promo_name, 'Ofertas semanales · Lidl Plus');
  assert.equal(row.promo_text, '-44%');
  assert.equal(row.promo_price, 1.25);
  assert.equal(row.promo_base_price, 2.25);
  assert.equal(row.promo_start, '2026-08-31');
  assert.equal(row.promo_end, '2026-09-06');
  assert.equal(row.is_lidl_plus_offer, true);
  assert.equal(row.raw.campaign.offerRegion, '26');
});

test('conserva Precios imbatibles como campaña sin inventar precio anterior', () => {
  const product = {
    ...weeklyProduct,
    regionsPrices: { 1: { currentPrice: { price: 2.69, startDate: '2026-08-31', endDateExclusive: '2026-09-07' } } },
  };
  const campaign = {
    ...LIDL_CAMPAIGN_DEFINITIONS.find(({ key }) => key === 'unbeatable'),
    url: 'https://www.lidl.es/c/precios-imbatibles/a1',
  };
  const row = applyLidlCampaign({ unit_price: 2.69, raw: {} }, campaign, product, '26', '2026-09-04');
  assert.equal(row.promo_name, 'Precios imbatibles');
  assert.equal(row.promo_price, 2.69);
  assert.equal(row.promo_base_price, null);
});

test('descarga una vez la portada y cada una de las cinco campañas', async () => {
  const calls = [];
  const home = LIDL_CAMPAIGN_DEFINITIONS
    .map((campaign, index) => `<a href="/c/${campaign.slug}/a${1000 + index}">x</a>`)
    .join('');
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url) === 'https://www.lidl.es/') return new Response(home);
    return new Response(page(weeklyProduct));
  };
  const catalog = await fetchLidlCampaignCatalog({ fetchImpl, fetchedAt: '2026-09-05T00:00:00Z' });
  assert.equal(calls.length, 6);
  assert.equal(new Set(calls).size, 6);
  assert.equal(catalog.campaigns.length, 5);
});
