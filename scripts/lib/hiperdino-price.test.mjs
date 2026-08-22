import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHiperdinoPriceData, parseHiperdinoPriceText } from './hiperdino-price.mjs';

test('normaliza las bases comparables publicadas por HiperDino', () => {
  const cases = [
    ['El Kilo sale a 15.96 euros', { value: 15.96, unit: 'kg' }],
    ['El litro sale a 8.20 euros', { value: 8.2, unit: 'l' }],
    ['El Kilo escurrido sale a 6.25 euros', { value: 6.25, unit: 'kg' }],
    ['Los 100 gramos salen a 0.78 euros', { value: 7.8, unit: 'kg' }],
    ['Los 100 gramos escurridos salen a 1.19 euros', { value: 11.9, unit: 'kg' }],
    ['Los 100 mililitros salen a 1.90 euros', { value: 19, unit: 'l' }],
    ['La unidad sale a 0.40 euros', { value: 0.4, unit: 'ud' }],
    ['La Docena sale a 4.36 euros', { value: 0.3633, unit: 'ud' }],
  ];

  for (const [raw, expected] of cases) {
    assert.deepEqual(parseHiperdinoPriceText(raw), expected, raw);
  }
});

test('admite coma decimal, mayúsculas y espacios del feed', () => {
  assert.deepEqual(
    parseHiperdinoPriceText('  EL   LITRO sale a 1,25 euros  '),
    { value: 1.25, unit: 'l' },
  );
});

test('no mezcla lavado, dosis o metro con la unidad canónica', () => {
  for (const raw of [
    'El lavado sale a 0.20 euros',
    'La dosis sale a 0.14 euros',
    'El metro sale a 1.50 euros',
    'El litro sale a 0.00 euros',
    'texto desconocido',
    '  ',
    null,
  ]) {
    assert.equal(parseHiperdinoPriceText(raw), null);
  }
});

test('usa los escalares SAP para el precio final y el tachado real', () => {
  assert.deepEqual(normalizeHiperdinoPriceData({
    sap_final_price: 14.45,
    sap_price: 16.35,
    sap_special_price: '14.4500',
    price_text: 'El Kilo sale a 28.90 euros',
  }), {
    unitPrice: 14.45,
    promoBasePrice: 16.35,
    pricePerUnit: 28.9,
    pricePerUnitUnit: 'kg',
  });

  assert.deepEqual(normalizeHiperdinoPriceData({
    sap_final_price: 3.99,
    sap_price: 3.99,
    price_text: '  ',
  }), {
    unitPrice: 3.99,
    promoBasePrice: null,
    pricePerUnit: null,
    pricePerUnitUnit: null,
  });
});
