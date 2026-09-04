import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyLidlOffer,
  isLidlOfferCandidate,
  isLiveLidlStoreOffer,
  lidlCategoryId,
  lidlOfferMatchesDetail,
  lidlProductMasterRow,
  lidlStoreCategoryRow,
  lidlStoreProductRow,
  normalizeLidlProduct,
  parseLidlPrice,
} from './lidl.mjs';

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

const bananaOffer = {
  id: 'offer-banana',
  title: 'Banana',
  redemptionChannel: 'Store',
  productIds: ['0080000'],
  offerType: 'StoreSpecialPriceDiscount',
  startValidityDate: '2026-08-31T00:00:00Z',
  endValidityDate: '2026-09-06T23:59:59Z',
  priceBox: {
    largePartNumeric: 0.99,
    smallPartNumeric: 1.49,
    discountMessage: '-33%',
  },
};

test('preselecciona por código de imagen pero exige productCodes del detalle', () => {
  const product = {
    title: 'Banana',
    imageUrl: 'https://static-product-catalog.lidlplus.com/images/123_80000_v1.png',
    price: { price: 1.49 },
  };
  assert.equal(isLidlOfferCandidate(product, bananaOffer), true);
  assert.equal(lidlOfferMatchesDetail({ productCodes: [{ code: '0080000' }] }, bananaOffer), true);
  assert.equal(lidlOfferMatchesDetail({ productCodes: [{ code: '0080001' }] }, bananaOffer), false);
});

test('descarta canales online y ofertas fuera de vigencia', () => {
  assert.equal(isLiveLidlStoreOffer(bananaOffer, '2026-09-04T12:00:00Z'), true);
  assert.equal(isLiveLidlStoreOffer({ ...bananaOffer, redemptionChannel: 'OnlineShop' }, '2026-09-04T12:00:00Z'), false);
  assert.equal(isLiveLidlStoreOffer(bananaOffer, '2026-09-07T00:00:00Z'), false);
});

test('normaliza precio, base, etiqueta y fechas de una oferta verificada', () => {
  const row = applyLidlOffer({ id: 'banana', raw: { title: 'Banana' } }, bananaOffer);
  assert.equal(row.promo_name, '-33%');
  assert.equal(row.promo_price, 0.99);
  assert.equal(row.promo_base_price, 1.49);
  assert.equal(row.promo_start, '2026-08-31');
  assert.equal(row.promo_end, '2026-09-06');
  assert.equal(row.raw.offer.id, 'offer-banana');
});

test('conserva promos de segunda unidad sin inventar precio directo', () => {
  const row = applyLidlOffer({}, {
    ...bananaOffer,
    priceBox: { largePartNumeric: null, smallPartNumeric: null, discountMessage: '-50% 2a ud' },
  });
  assert.equal(row.promo_name, '-50% 2a ud');
  assert.equal(row.promo_price, null);
  assert.equal(row.promo_base_price, null);
});

test('separa la ficha maestra de precio, stock y oferta locales', () => {
  const normalized = {
    ...normalizeLidlProduct({
      id: 'p1',
      title: 'Leche entera',
      price: { price: 1.05, annotations: ['1l'] },
      stockAvailability: { stockIndicator: 'Available' },
      productValidForClickAndCollect: true,
    }, { id: '10', rootId: '10', name: 'Lácteos' }),
    synced_at: '2026-09-04T12:00:00.000Z',
  };
  const promoted = applyLidlOffer(normalized, bananaOffer);
  const master = lidlProductMasterRow(promoted);
  const local = lidlStoreProductRow(promoted, 'ES3572');

  assert.equal(master.id, 'p1');
  assert.equal('unit_price' in master, false);
  assert.equal('stockAvailability' in master.raw, false);
  assert.equal('price' in master.raw, false);
  assert.equal('offer' in master.raw, false);
  assert.equal(local.store_id, 'ES3572');
  assert.equal(local.product_id, 'p1');
  assert.equal(local.unit_price, 1.05);
  assert.equal(local.available, true);
  assert.equal(local.raw.offer.id, 'offer-banana');
});

test('genera el conteo de categoría por tienda', () => {
  assert.deepEqual(lidlStoreCategoryRow({
    id: '10:2', product_count: 17, published: true, synced_at: 'now',
  }, 'ES2103'), {
    store_id: 'ES2103', category_id: '10:2', product_count: 17,
    published: true, synced_at: 'now',
  });
});
