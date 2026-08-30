import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyBmOffer,
  bmCatalogOffset,
  compareBmProductSamples,
  flattenBmCategories,
  flattenBmShippingAreas,
  normalizeBmProduct,
  parseBmPostalCodes,
  selectPreferredBmLocation,
  summarizeBmProducts,
  validateBmCatalogPage,
} from './bm.mjs';

const location = { requestedPostalCode: '28008', zoneId: '14946', shippingZoneId: '14946' };

function productFixture(overrides = {}) {
  const {
    productData: productDataOverrides = {},
    priceData: priceDataOverrides = {},
    ...rootOverrides
  } = overrides;
  return {
    id: 7,
    code: '87978',
    ean: '8422414016408',
    productData: {
      name: 'Bizcocho de chocolate 400 g',
      brand: { name: 'BM' },
      imageURL: 'https://cdn.example/A87978.jpg',
      novelty: false,
      availability: '1',
      temporaryOutOfStock: false,
      ...productDataOverrides,
    },
    priceData: {
      prices: [{ id: 'PRICE', value: { centAmount: 2.25, centUnitAmount: 5.63 } }],
      unitPriceUnitType: 'KILO',
      priceUnitType: 'u.',
      minimumUnit: 1,
      intervalUnit: 1,
      ...priceDataOverrides,
    },
    categories: [{ id: 101, name: 'Bizcochos', type: 0 }],
    offers: [],
    ...rootOverrides,
  };
}

test('parseBmPostalCodes valida y elimina duplicados', () => {
  assert.deepEqual(parseBmPostalCodes('28008, 20009,28008'), ['28008', '20009']);
  assert.throws(() => parseBmPostalCodes('2800X'), /invalidos/);
});

test('calcula el offset real que usa el catalogo BM', () => {
  assert.equal(bmCatalogOffset(1, 20), 0);
  assert.equal(bmCatalogOffset(3, 20), 40);
  assert.throws(() => bmCatalogOffset(0, 20), /entero positivo/);
});

test('selecciona entrega habilitada antes que recogida', () => {
  const payload = [{ groupName: 'Madrid', shippingAreas: [
    { shippingZoneId: '14946T', deliveryTypeId: 'T', enabled: true, zone: { id: 14946, name: 'BM Princesa' } },
    { shippingZoneId: '14946', deliveryTypeId: 'D', enabled: true, zone: { id: 14946, name: 'BM Princesa' } },
  ] }];
  const areas = flattenBmShippingAreas(payload, '28008');
  assert.equal(selectPreferredBmLocation(areas).shippingZoneId, '14946');
});

test('aplana el arbol de categorias conservando profundidad y padres', () => {
  const rows = flattenBmCategories([{ id: 1, name: 'Frescos', level: 1, subcategories: [
    { id: 2, name: 'Carne', level: 2, subcategories: [{ id: 3, name: 'Ternera', level: 3, subcategories: [] }] },
  ] }]);
  assert.deepEqual(rows.map(({ id, parentId, pathIds }) => ({ id, parentId, pathIds })), [
    { id: '1', parentId: null, pathIds: ['1'] },
    { id: '2', parentId: '1', pathIds: ['1', '2'] },
    { id: '3', parentId: '2', pathIds: ['1', '2', '3'] },
  ]);
});

test('normaliza descuento directo sin perder el precio base', () => {
  const raw = productFixture({
    productData: { novelty: true },
    priceData: { prices: [
      { id: 'PRICE', value: { centAmount: 2.25, centUnitAmount: 5.63 } },
      { id: 'OFFER_PRICE', value: { centAmount: 1.99, centUnitAmount: 4.98 } },
    ] },
    offers: [{ id: 9, promotionId: 10, minDescription: 'OFERTA', promotionType: 1, amount: 1.99 }],
  });
  const product = normalizeBmProduct(raw, location);
  assert.equal(product.globalGtin, '8422414016408');
  assert.equal(product.basePrice, 2.25);
  assert.equal(product.offerPrice, 1.99);
  assert.equal(product.effectivePrice, 1.99);
  assert.equal(product.offer.type, 'discount');
  assert.equal(product.novelty, true);
});

test('clasifica segunda unidad, multibuy y Cuenta BM', () => {
  assert.equal(classifyBmOffer({ minDescription: '2ª al 50%' }), 'second_unit');
  assert.equal(classifyBmOffer({ minDescription: '2X1' }), 'multibuy');
  assert.equal(classifyBmOffer({ shortDescription: 'Ahorras en tu Cuenta BM' }), 'club');
});

test('no trata un EAN interno como GTIN global', () => {
  const product = normalizeBmProduct(productFixture({ ean: '20245047' }), location);
  assert.equal(product.ean, '20245047');
  assert.equal(product.globalGtin, null);
});

test('resume promociones y compara diferencias de zona', () => {
  const reference = normalizeBmProduct(productFixture(), location);
  const offered = normalizeBmProduct(productFixture({
    priceData: { prices: [
      { id: 'PRICE', value: { centAmount: 2.25, centUnitAmount: 5.63 } },
      { id: 'OFFER_PRICE', value: { centAmount: 1.99, centUnitAmount: 4.98 } },
    ] },
    offers: [{ minDescription: 'OFERTA', promotionType: 1 }],
  }), { ...location, requestedPostalCode: '20009' });
  assert.deepEqual(summarizeBmProducts([reference, offered]).promotionTypes, { discount: 1 });
  const comparison = compareBmProductSamples([reference], [offered]);
  assert.equal(comparison.commonProducts, 1);
  assert.equal(comparison.priceDifferences, 1);
  assert.equal(comparison.offerDifferences, 1);
});

test('valida el contrato minimo de una pagina de catalogo', () => {
  assert.equal(validateBmCatalogPage({ products: [], totalCount: 0 }).totalCount, 0);
  assert.throws(() => validateBmCatalogPage({ totalCount: 1 }), /products/);
});
