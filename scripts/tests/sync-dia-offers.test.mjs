import test from 'node:test';
import assert from 'node:assert/strict';

process.env.DRY_RUN = '1';
const { diaOfferColumns } = await import('../sync-dia.mjs');

test('normaliza un descuento directo CLUB Dia', () => {
  assert.deepEqual(diaOfferColumns({
    headband_promotion: 'exclusive_offer',
    prices: {
      price: 4.12,
      strikethrough_price: 5.49,
      discount_percentage: 25,
      is_promo_price: true,
      is_club_price: true,
    },
  }), {
    promo_name: 'CLUB Dia · 25%',
    promo_text: null,
    promo_base_price: 5.49,
  });
});

test('normaliza 2ª unidad y conserva las condiciones completas', () => {
  assert.deepEqual(diaOfferColumns({
    headband_promotion: 'exclusive_online',
    prices: { price: 0.79, strikethrough_price: 0.79 },
    promotions: [{
      description: '2ª UD AL 50% DTO. RADLER',
      exclusive_online: true,
      only_club_dia: true,
    }],
  }), {
    promo_name: '2ª unidad al 50%',
    promo_text: '2ª UD AL 50% DTO. RADLER',
    promo_base_price: null,
  });
});

test('normaliza 3x2 y ofertas de precio por varias unidades', () => {
  assert.equal(diaOfferColumns({
    prices: { price: 4.99, strikethrough_price: 4.99 },
    promotions: [{ description: '3X2 HELADOS MAGNUM, FRIGO Y CALIPPO' }],
  })?.promo_name, '3x2');

  assert.equal(diaOfferColumns({
    prices: { price: 1.99, strikethrough_price: 1.99 },
    promotions: [{ description: '2 UD POR 3 EUROS EN SELECCIÓN FUZE TEA' }],
  })?.promo_name, '2 uds. por 3 €');
});

test('no marca como oferta un precio ordinario', () => {
  assert.equal(diaOfferColumns({
    prices: {
      price: 1.4,
      strikethrough_price: 1.4,
      discount_percentage: 0,
      is_promo_price: false,
      is_club_price: false,
    },
  }), null);
});
