import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeAlcampoOffer,
  normalizeAmetllerOffer,
  normalizeCondisOffer,
  parseTapestryOfferBlock,
} from '../lib/retailer-offers.mjs';
import { parseTapestryPricePerUnit, parseTiles } from '../lib/eroski-tapestry.mjs';

test('Condis separa la rebaja directa de una variación ordinaria', () => {
  assert.deepEqual(normalizeCondisOffer({
    on_sale: true,
    price: { current: 3.89, regular: 4.99, discounted: 3.89 },
  }), {
    promo_name: 'Precio rebajado',
    promo_text: null,
    promo_price: 3.89,
    promo_base_price: 4.99,
    promo_start: null,
    promo_end: null,
  });

  assert.equal(normalizeCondisOffer({
    price: { current: 3.89, regular: 3.89 },
  }), null);
});

test('Condis conserva promociones complejas sin inventar precio anterior', () => {
  assert.deepEqual(normalizeCondisOffer({
    on_promotion: true,
    promotion_text: 'Segunda unidad 50%',
    price: { current: 2.7, regular: 2.7 },
  }), {
    promo_name: 'Segunda unidad 50%',
    promo_text: 'Segunda unidad 50%',
    promo_price: null,
    promo_base_price: null,
    promo_start: null,
    promo_end: null,
  });
});

test('Ametller normaliza lotes y precios CLUB desde productPromotions', () => {
  assert.deepEqual(normalizeAmetllerOffer({
    price: 3.99,
    c_isSale: true,
    productPromotions: [{
      calloutMsg: '<p style="color:white">PRECIO CLUB</p>',
      promotionalPrice: 2.99,
    }],
  }), {
    promo_name: 'PRECIO CLUB',
    promo_text: null,
    promo_price: 2.99,
    promo_base_price: 3.99,
    promo_start: null,
    promo_end: null,
  });

  assert.equal(normalizeAmetllerOffer({
    price: 3.49,
    productPromotions: [{ calloutMsg: '<p>2x6€</p>' }],
  })?.promo_name, '2x6€');
});

test('Alcampo conserva texto, precio final y vigencia explícitos', () => {
  assert.deepEqual(normalizeAlcampoOffer({
    price: { amount: '3.19' },
    promoPrice: { amount: '2.34' },
    promotions: [{
      type: 'OFFER',
      description: 'Especial BBQ (20/07/2026 - 26/07/2026)',
      limitReached: false,
    }],
  }), {
    promo_name: 'Especial BBQ',
    promo_text: 'Especial BBQ (20/07/2026 - 26/07/2026)',
    promo_price: 2.34,
    promo_base_price: 3.19,
    promo_start: '2026-07-20',
    promo_end: '2026-07-26',
  });

  assert.equal(normalizeAlcampoOffer({
    price: { amount: '3.19' },
    promotions: [],
  }), null);
});

test('Eroski y Caprabo extraen descuento directo y segunda unidad del tile', () => {
  const direct = `
    <div class="product-offer product-offer-yellow"><span>-32</span><span>%</span></div>
    <div class="price-offer">
      <span class="price-before">5,95 € <span>Antes</span></span>
      <span class="price-now">3,99 €</span>
    </div>`;
  assert.deepEqual(parseTapestryOfferBlock(direct, 3.99), {
    promo_name: '-32%',
    promo_text: null,
    promo_price: 3.99,
    promo_base_price: 5.95,
    promo_start: null,
    promo_end: null,
  });

  const multibuy = `
    <div class="product-offer product-offer-yellow">
      <span>2ª unidad</span><span>-50</span><span>%</span>
    </div>
    <div class="price-offer"><span class="price-before"></span></div>`;
  assert.equal(parseTapestryOfferBlock(multibuy, 8.1)?.promo_name, '2ª unidad -50%');
});

test('parseTiles asocia cada promoción con su producto y rechaza tiles ordinarios', () => {
  const metrics = (id, price) => JSON.stringify({
    event: 'select_item',
    ecommerce: { items: [{ item_id: id, item_name: `Producto ${id}`, price }] },
  });
  const html = `
    <div class="col border-0 product-item-lineal item-type-1">
      <div data-metrics='${metrics('a', 3.99)}'></div>
      <div class="product-offer"><span>-32</span><span>%</span></div>
      <div class="price-offer"><span class="price-before">5,95 €</span></div>
    </div>
    <div class="col border-0 product-item-lineal item-type-1">
      <div data-metrics='${metrics('b', 2.5)}'></div>
      <div class="price-offer"><span class="price-before"></span></div>
    </div>`;
  const rows = parseTiles(html);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].promo_name, '-32%');
  assert.equal(rows[0].promo_base_price, 5.95);
  assert.equal(rows[1].promo_name, undefined);
});

test('Eroski y Caprabo normalizan el precio unitario visible del tile', () => {
  assert.deepEqual(parseTapestryPricePerUnit(`
    <div class="product-col-50 quantity-price-container">
      <p class="quantity-text">1 KILO A  18,40&nbsp;€</p>
    </div>`), { value: 18.4, unit: 'kg' });
  assert.deepEqual(parseTapestryPricePerUnit(
    '<div class="quantity-price-container"><p class="quantity-price">1 LITRO A 1,19 €</p></div>',
  ), { value: 1.19, unit: 'l' });
  assert.deepEqual(parseTapestryPricePerUnit(
    '<p class="quantity-text">1 UNIDAD A 0,63&nbsp;€</p>',
  ), { value: 0.63, unit: 'ud' });
  assert.equal(parseTapestryPricePerUnit('<p>1 KILO A 18,40 €</p>'), null);
});

test('parseTiles conserva el precio unitario junto al data-metrics', () => {
  const metrics = JSON.stringify({
    event: 'select_item',
    ecommerce: { items: [{ item_id: 'ppu', item_name: 'Producto con peso', price: 4.6 }] },
  });
  const [row] = parseTiles(`
    <div class="col border-0 product-item-lineal item-type-1">
      <div data-metrics='${metrics}'></div>
      <p class="quantity-text">1 KILO A 18,40&nbsp;€</p>
    </div>`);
  assert.equal(row.price_per_unit, 18.4);
  assert.equal(row.price_per_unit_unit, 'kg');
});
