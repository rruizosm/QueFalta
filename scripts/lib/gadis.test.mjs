import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeGadisPricePerUnit } from './gadis.mjs';

const product = (price, suffix, weight = 'U') => ({
  price_kilo_litre: price,
  price_kilo_litre_suffix: suffix == null ? null : [{ language: 'ES', value: suffix }],
  weight,
});

test('Gadis normaliza kilo, litro y unidad', () => {
  assert.deepEqual(normalizeGadisPricePerUnit(product(1.4, 'el kilo')), { value: 1.4, unit: 'kg' });
  assert.deepEqual(normalizeGadisPricePerUnit(product(3.75, 'el litro')), { value: 3.75, unit: 'l' });
  assert.deepEqual(normalizeGadisPricePerUnit(product(1.8, 'la unidad')), { value: 1.8, unit: 'ud' });
});

test('Gadis convierte bases de 100 ml, 100 g y docena', () => {
  assert.deepEqual(normalizeGadisPricePerUnit(product(0.39, 'los 100 ml')), { value: 3.9, unit: 'l' });
  assert.deepEqual(normalizeGadisPricePerUnit(product(1.2, 'los 100 gr.')), { value: 12, unit: 'kg' });
  assert.deepEqual(normalizeGadisPricePerUnit(product(2.88, 'la docena')), { value: 0.24, unit: 'ud' });
});

test('Gadis reconoce los frescos sin sufijo y conserva el resto por unidad', () => {
  assert.deepEqual(normalizeGadisPricePerUnit(product(2.25, null, 'P')), { value: 2.25, unit: 'kg' });
  assert.deepEqual(normalizeGadisPricePerUnit(product(4.49, null, 'U')), { value: 4.49, unit: 'ud' });
  assert.deepEqual(normalizeGadisPricePerUnit(product(0.6, null, 'N')), { value: 0.6, unit: 'ud' });
});

test('Gadis no presenta metro o dosis como si fueran unidades', () => {
  assert.equal(normalizeGadisPricePerUnit(product(0.22, 'el metro')), null);
  assert.equal(normalizeGadisPricePerUnit(product(0.14, 'la dosis')), null);
});
