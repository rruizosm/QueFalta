import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeBmProduct } from './bm.mjs';
import {
  assertBmCatalogCoverage,
  bmAreaRows,
  bmLocationPriceRow,
  bmProductRow,
  buildBmTwoLevelNavigation,
  canonicalBmPriceUnit,
  resolveBmProductNavigation,
} from './bm-sync.mjs';

const syncedAt = '2026-08-30T12:00:00.000Z';

const menu = [{
  id: 10,
  name: 'Frescos',
  subcategories: [{
    id: 20,
    name: 'Fruta',
    subcategories: [{
      id: 30,
      name: 'Manzanas',
      subcategories: [{ id: 40, name: 'Golden', subcategories: [] }],
    }],
  }],
}, {
  id: 99999,
  name: 'Ofertas',
  subcategories: [{ id: 99998, name: 'Todo en oferta', subcategories: [] }],
}];

function rawProduct(overrides = {}) {
  return {
    id: 77,
    code: '12345',
    ean: '8412345678907',
    productData: {
      name: 'Manzana golden',
      description: 'Manzana golden Bolsa 1 kg',
      brand: { name: 'BM' },
      imageURL: 'https://cdn.example/manzana.jpg',
      url: 'https://example.test/manzana/12345',
      novelty: true,
      availability: '1',
      temporaryOutOfStock: false,
      attributeGroups: [{ code: 'internal' }],
    },
    priceData: {
      prices: [
        { id: 'PRICE', value: { centAmount: 2.49, centUnitAmount: 2.49 } },
        { id: 'OFFER_PRICE', value: { centAmount: 1.99, centUnitAmount: 1.99 } },
      ],
      unitPriceUnitType: 'KILO',
      priceUnitType: 'u.',
      minimumUnit: 1,
      intervalUnit: 1,
    },
    categories: [{ id: 40, name: 'Golden', type: 0 }, { id: 99998, name: 'Oferta', type: 0 }],
    offers: [{
      id: 5,
      promotionId: 6,
      minDescription: 'OFERTA',
      shortDescription: 'Ahorra 0,50 €',
      promotionType: 1,
      from: '2026-08-28T00:00:00Z',
      to: '2026-09-05T23:59:59Z',
      amount: 1.99,
      discount: 0.5,
    }],
    ...overrides,
  };
}

test('colapsa N3-N6 en el N1/N2 y excluye la rama promocional', () => {
  const navigation = buildBmTwoLevelNavigation(menu, { syncedAt });
  assert.deepEqual(navigation.categories.map(({ id, parent_id }) => ({ id, parent_id })), [
    { id: '10', parent_id: null },
    { id: '20', parent_id: '10' },
  ]);
  assert.deepEqual(navigation.navigationBySourceId.get('40'), {
    rootCategoryId: '10',
    rootCategoryName: 'Frescos',
    categoryId: '20',
    categoryName: 'Fruta',
    sourcePathIds: ['10', '20', '30', '40'],
  });
  assert.equal(navigation.navigationBySourceId.has('99998'), false);
});

test('genera producto común y precio zonal sin publicar ramas profundas', () => {
  const raw = rawProduct();
  const normalized = normalizeBmProduct(raw, {
    requestedPostalCode: '20009',
    zoneId: '14942',
    shippingZoneId: '14942D',
  });
  const navigation = buildBmTwoLevelNavigation(menu, { syncedAt });
  const selected = resolveBmProductNavigation(normalized, navigation.navigationBySourceId);
  const product = bmProductRow(raw, normalized, selected, syncedAt);
  const location = bmLocationPriceRow(normalized, '14942D', syncedAt);

  assert.equal(product.root_category_id, '10');
  assert.equal(product.category_id, '20');
  assert.equal('category_ids' in product, false);
  assert.equal(product.packaging, 'Bolsa 1 kg');
  assert.deepEqual(product.raw.quefaltaNavigation.sourcePathIds, ['10', '20', '30', '40']);
  assert.equal(product.raw.productData.attributeGroups, undefined);
  assert.equal(location.id, 'bm:14942D:12345');
  assert.equal(product.price_per_unit_unit, 'kg');
  assert.equal(location.price_per_unit_unit, 'kg');
  assert.equal(location.unit_price, 1.99);
  assert.equal(location.base_unit_price, 2.49);
  assert.equal(location.promo_start, '2026-08-28');
  assert.equal(location.promo_end, '2026-09-05');
  assert.equal(location.is_new, true);
});

test('solo publica unidades comparables canónicas', () => {
  assert.equal(canonicalBmPriceUnit('1 Kg'), 'kg');
  assert.equal(canonicalBmPriceUnit('LITRO'), 'l');
  assert.equal(canonicalBmPriceUnit('unidad'), 'ud');
  assert.equal(canonicalBmPriceUnit('metro'), null);
});

test('normaliza áreas y marca una sola ubicación preferida por CP', () => {
  const areas = [{
    requestedPostalCode: '20009',
    groupId: 'region',
    groupName: 'Gipuzkoa',
    shippingZoneId: '14942D',
    deliveryTypeId: 'D',
    enabled: true,
    description: 'BM Pagola Online',
    zoneId: '14942',
    storeCode: '14942',
    storeName: 'BM Pagola Online',
    storePostalCode: '20009',
    city: 'Donostia',
    region: 'Gipuzkoa',
  }, {
    requestedPostalCode: '20009',
    shippingZoneId: '14942T',
    deliveryTypeId: 'T',
    enabled: true,
    zoneId: '14942',
    storeName: 'BM Pagola',
  }];
  const rows = bmAreaRows(areas, areas[0], syncedAt);
  assert.equal(rows.locations.length, 2);
  assert.deepEqual(rows.postalLocations.map((row) => [row.location_id, row.is_preferred]), [
    ['14942D', true],
    ['14942T', false],
  ]);
});

test('el guardarraíl rechaza zonas ausentes o catálogos parciales', () => {
  const valid = Array.from({ length: 7 }, (_, index) => ({
    locationId: `zone-${index}`,
    products: 7900,
    total: 8000,
  }));
  assert.doesNotThrow(() => assertBmCatalogCoverage(valid));
  assert.throws(() => assertBmCatalogCoverage(valid.slice(0, 6)), /ubicaciones BM/);
  assert.throws(() => assertBmCatalogCoverage([
    ...valid.slice(0, 6),
    { locationId: 'partial', products: 6400, total: 8000 },
  ]), /solo 6400 productos/);
  assert.throws(() => assertBmCatalogCoverage([
    ...valid.slice(0, 6),
    { locationId: 'missing-pages', products: 7000, total: 8000 },
  ]), /cobertura 87\.5%/);
});
