import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLidlStoreDirectory,
  buildLidlExactPostalCandidates,
  lidlCatalogStoreId,
  normalizeLidlStore,
} from './lidl-stores.mjs';

const syncedAt = '2026-09-04T13:00:00.000Z';

const rawStore = (objectNumber = 'ES03572', overrides = {}) => ({
  objectNumber,
  storeName: 'Sant Joan d’Alacant-Benimagrell',
  address: {
    streetName: 'Avenida de Miguel Hernández',
    streetNumber: '36',
    city: 'Sant Joan d’Alacant',
    zip: '03550',
    state: 'Cdad. Valenciana',
    longitude: -0.43352,
    latitude: 38.39341,
  },
  status: { name: 'open', from: null, to: null },
  marketingData: {
    offerRegion: 38,
    offerRegionName: 'Alicante',
    zone: 'PEN',
    zoneName: 'Peninsula',
    infoIcons: [{ id: 4, name: 'parking' }],
  },
  ...overrides,
});

test('convierte el objectNumber del directorio al id de Product Catalog', () => {
  assert.equal(lidlCatalogStoreId('ES03572'), 'ES3572');
  assert.equal(lidlCatalogStoreId('ES00215'), 'ES0215');
  assert.equal(lidlCatalogStoreId('ES3572'), null);
});

test('normaliza tienda, zona y estado sin conservar el SEO pesado', () => {
  const row = normalizeLidlStore(rawStore(), syncedAt);
  assert.equal(row.id, 'ES3572');
  assert.equal(row.postal_code, '03550');
  assert.equal(row.offer_region, '38');
  assert.equal(row.zone, 'PEN');
  assert.equal(row.selectable, true);
  assert.equal(row.synced_at, syncedAt);
  assert.deepEqual(row.raw.infoIcons, [{ id: 4, name: 'parking' }]);
  assert.equal('seo' in row.raw, false);
});

test('una tienda cerrada queda en el directorio pero fuera del selector', () => {
  const row = normalizeLidlStore(rawStore('ES05061', {
    status: { name: 'temp_closed', from: null, to: '2026-09-10T00:00:00Z' },
  }), syncedAt);
  assert.equal(row.id, 'ES5061');
  assert.equal(row.published, true);
  assert.equal(row.selectable, false);
});

test('los CP con varias tiendas conservan todos los candidatos y un solo default', () => {
  const stores = [
    normalizeLidlStore(rawStore('ES02139'), syncedAt),
    normalizeLidlStore(rawStore('ES02103'), syncedAt),
    normalizeLidlStore(rawStore('ES02122'), syncedAt),
  ];
  const rows = buildLidlExactPostalCandidates(stores, syncedAt);
  assert.deepEqual(rows.map((row) => [row.store_id, row.rank, row.is_default]), [
    ['ES2103', 1, true],
    ['ES2122', 2, false],
    ['ES2139', 3, false],
  ]);
});

test('el guardarrail rechaza directorios parciales', () => {
  const stores = Array.from({ length: 700 }, (_, index) => ({
    id: `ES${String(index).padStart(4, '0')}`,
    selectable: index < 680,
  }));
  assert.doesNotThrow(() => assertLidlStoreDirectory(stores));
  assert.throws(() => assertLidlStoreDirectory(stores.slice(0, 699)), /solo 699 tiendas/);
  assert.throws(() => assertLidlStoreDirectory(
    stores.map((store, index) => ({ ...store, selectable: index < 679 })),
  ), /solo 679 tiendas Lidl abiertas/);
});
