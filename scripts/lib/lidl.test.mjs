import assert from 'node:assert/strict';
import test from 'node:test';
import { lidlCategoryId, normalizeLidlProduct, parseLidlPrice } from './lidl.mjs';

test('normaliza el precio por kg y el envase de la butifarra', () => {
  assert.deepEqual(parseLidlPrice({
    price: 3.69,
    annotations: ['1kg = 5.27', '700g'],
  }), {
    unitPrice: 3.69,
    packaging: '700 g',
    pricePerUnit: 5.27,
    pricePerUnitUnit: 'kg',
  });
});

test('deriva precio por unidad cuando Lidl solo publica el número de piezas', () => {
  assert.deepEqual(parseLidlPrice({ price: 2.35, annotations: ['6pieces'] }), {
    unitPrice: 2.35,
    packaging: '6 ud',
    pricePerUnit: 0.3917,
    pricePerUnitUnit: 'ud',
  });
});

test('convierte referencias de 100 ml a euros por litro', () => {
  assert.equal(parseLidlPrice({ price: 2.15, annotations: ['100ml = 0.43', '500ml'] }).pricePerUnit, 4.3);
});

test('conserva el id interno y nunca lo presenta como EAN', () => {
  const row = normalizeLidlProduct({
    id: '8807709681515_ES',
    title: 'Butifarra fresca de cerdo',
    brand: 'Realvalle',
    imageUrl: 'https://example.test/butifarra.png',
    price: { price: 3.69, symbol: '€', annotations: ['1kg = 5.27', '700g'] },
    stockAvailability: { stockIndicator: 'Available' },
    productLine: 'Food',
    listingType: 'Assortment',
    productValidForClickAndCollect: true,
  }, { id: '30', rootId: '30', name: 'Carne' });

  assert.equal(row.id, '8807709681515_ES');
  assert.equal(row.retailer_product_id, '8807709681515_ES');
  assert.equal(row.ean, null);
  assert.equal(row.display_name, 'Butifarra fresca de cerdo');
  assert.equal(row.price_per_unit, 5.27);
  assert.equal(row.available, true);
});

test('namespaces subcategory ids that Lidl reuses below different roots', () => {
  assert.equal(lidlCategoryId('40', '01'), '40:01');
  assert.equal(lidlCategoryId(null, '30'), '30');
});
