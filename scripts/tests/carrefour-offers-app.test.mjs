import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/carrefourOffers.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const module = { exports: {} };
vm.runInNewContext(output, { module, exports: module.exports });
const { resolveCarrefourOffers } = module.exports;
const day = '2026-09-26';
const promotion = (name, kind, start = '2026-09-26', end = '2026-09-26') =>
  ({ name, text: `${name} condiciones`, start, end, kind, link: 'https://www.carrefour.es/ofertas' });
const v1 = (promotions, extras = {}) => ({ version: 1, observed_at: '2026-09-01T08:00:00Z', promotions, ...extras });

test('3x2 is primary before shipping, and all live conditions remain available', () => {
  const resolved = resolveCarrefourOffers({
    unit_price: 3,
    promo_name: 'Envío gratis',
    quefalta_offers: v1([promotion('Envío gratis', 'shipping'), promotion('3x2', 'multibuy')]),
  }, 'Cataluña', day);
  assert.equal(resolved.primary.name, '3x2');
  assert.deepEqual(Array.from(resolved.promotions, (p) => p.kind), ['multibuy', 'shipping']);
  assert.equal(resolved.promotions[1].text, 'Envío gratis condiciones');
  assert.equal(resolved.strikethroughPrice, null);
});

test('validity includes both boundaries and ignores observed_at', () => {
  const row = { unit_price: 2, quefalta_offers: v1([
    promotion('Anterior', 'multibuy', '2026-09-20', '2026-09-25'),
    promotion('Hoy', 'second_unit'),
    promotion('Mañana', 'club', '2026-09-27', '2026-10-01'),
  ]) };
  assert.deepEqual(Array.from(resolveCarrefourOffers(row, null, day).promotions, (p) => p.name), ['Hoy']);
});

test('regional offer replaces Madrid even with unchanged price; empty array means none', () => {
  const row = {
    unit_price: 4, promo_name: '2x1',
    quefalta_offers: v1([promotion('2x1', 'multibuy')]),
    regional_prices: {
      Cataluña: { p: 4, offers: v1([promotion('3x2', 'multibuy')]) },
      Canarias: { p: 4, offers: v1([]) },
    },
  };
  assert.equal(resolveCarrefourOffers(row, 'Cataluña', day).primary.name, '3x2');
  assert.equal(resolveCarrefourOffers(row, 'Canarias', day).primary, null);
  assert.equal(resolveCarrefourOffers(row, 'Madrid', day).primary.name, '2x1');
});

test('old regional price override does not certify Madrid promotion; old base still works', () => {
  const row = {
    unit_price: 3, promo_name: '3x2', promo_end: '2026-09-26',
    regional_prices: { Cataluña: { p: 3, pf: '3,00 €', av: true } },
  };
  assert.equal(resolveCarrefourOffers(row, 'Cataluña', day).primary, null);
  assert.equal(resolveCarrefourOffers(row, 'Madrid', day).primary.name, '3x2');
  assert.equal(resolveCarrefourOffers({ ...row, promo_start: '2026-09-27' }, 'Madrid', day).primary, null);
});

test('editorial badges are not offers and immediate discount is distinct', () => {
  for (const badge of ['Air Fryer', 'Innovación', 'Novedad']) {
    assert.equal(resolveCarrefourOffers({ unit_price: 2, promo_name: badge }, null, day).primary, null);
    assert.equal(resolveCarrefourOffers({ unit_price: 2, quefalta_offers: v1([promotion(badge, 'discount')]) }, null, day).primary, null);
  }
  const discount = resolveCarrefourOffers({ unit_price: 2, promo_name: 'Precio rebajado', strikethrough_price: 3 }, null, day);
  assert.equal(discount.primary.kind, 'discount');
  assert.equal(discount.strikethroughPrice, 3);
});

test('the app query projects only the offer subtree and bypasses the base-only feed RPC', () => {
  const catalog = readFileSync(new URL('../../src/api/catalog.ts', import.meta.url), 'utf8');
  assert.match(catalog, /quefalta_offers:raw->quefalta_offers/);
  assert.match(catalog, /raw->quefalta_offers\.not\.is\.null/);
  assert.match(catalog, /if \(store === 'carrefour'\) return fetchCarrefourOffers\(cursor, region, limit, filters\)/);
  assert.match(catalog, /if \(!page\.nextCursor \|\| \(!needsGlobalOrder && items\.length >= limit\)\)/);
});

function catalogWithRows(rows, rpcResult = { data: null, error: { code: 'PGRST202' } }) {
  const calls = [];
  const rpcCalls = [];
  const supabase = { async rpc(name, params) {
    rpcCalls.push({ name, params });
    return rpcResult;
  }, from(table) {
    assert.equal(table, 'carrefour_products');
    const state = { limit: 100, cursor: null, filters: [] };
    const query = {
      select(columns) { calls.push(columns); return this; },
      eq() { return this; },
      order() { return this; },
      limit(value) { state.limit = value; return this; },
      or(value) {
        state.filters.push(value);
        const match = value.match(/id\.gt\."([^"]+)"/);
        if (match) state.cursor = match[1];
        return this;
      },
      in() { return this; },
      ilike() { return this; },
      then(resolve) {
        const data = rows.filter((row) => state.cursor == null || row.id > state.cursor)
          .slice(0, state.limit);
        resolve({ data, error: null });
      },
    };
    return query;
  } };
  const catalogSource = readFileSync(new URL('../../src/api/catalog.ts', import.meta.url), 'utf8');
  const catalogOutput = ts.transpileModule(catalogSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const catalogModule = { exports: {} };
  const offerTypeModule = { exports: {} };
  const offerTypeSource = readFileSync(new URL('../../src/lib/offerTypes.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(offerTypeSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: offerTypeModule, exports: offerTypeModule.exports });
  vm.runInNewContext(catalogOutput, {
    module: catalogModule, exports: catalogModule.exports,
    require(path) {
      if (path === '../lib/supabase') return { supabase };
      if (path === '../lib/carrefourOffers') return module.exports;
      if (path === '../lib/offerTypes') return offerTypeModule.exports;
      if (path === '../constants/regions') return {
        REGION_ALL: 'all', REGION_MERCADONA_NAME: { 'ES-CT': 'Cataluña' },
      };
      if (path === '../lib/productAdapters') return { carrefourToUI: (p) => ({
        id: p.id, unitPrice: p.unitPrice, pricePerUnit: null,
        categoryName: p.categoryName, name: p.displayName,
      }) };
      if (path === '../i18n') return { getLanguage: () => 'es' };
      return {};
    },
    Date, Set, Map, JSON, Number, String, console,
  });
  return { catalog: catalogModule.exports, calls, rpcCalls };
}

test('pagination scans past rejected rows without losing secondary offers', async () => {
  const rows = Array.from({ length: 450 }, (_, index) => ({
    id: String(index).padStart(4, '0'), display_name: `Producto ${index}`,
    display_name_norm: `producto ${index}`, unit_price: 2, category_name: 'Despensa',
    quefalta_offers: index % 5 === 0 ? v1([promotion('3x2', 'multibuy', null, null),
      promotion('Envío gratis', 'shipping', null, null)]) : null,
  }));
  const { catalog, calls } = catalogWithRows(rows);
  const first = await catalog.fetchCarrefourOffers(null, null, 50, { offerTypes: ['shipping'] });
  const second = await catalog.fetchCarrefourOffers(first.nextCursor, null, 50, { offerTypes: ['shipping'] });
  assert.equal(first.items.length, 80);
  assert.equal(second.items.length, 10);
  assert.equal(new Set([...first.items, ...second.items].map((item) => item.product.id)).size, 90);
  assert.equal(first.items[0].promoName, '3x2');
  assert.ok(calls.every((columns) => columns.includes('quefalta_offers:raw->quefalta_offers')));
  assert.ok(calls.every((columns) => !/(?:^|,\s*)raw(?:,|$)/.test(columns)));
});

test('regional prices determine offer order and price range after pagination', async () => {
  const rows = [1, 2, 3].map((index) => ({
    id: String(index).padStart(4, '0'), display_name: `P${index}`,
    display_name_norm: `p${index}`, unit_price: index, category_name: 'Despensa',
    quefalta_offers: v1([promotion('3x2', 'multibuy', null, null)]),
    regional_prices: index === 1 ? { Cataluña: { p: 9, offers: v1([promotion('3x2', 'multibuy', null, null)]) } } : null,
  }));
  const { catalog } = catalogWithRows(rows);
  const page = await catalog.fetchCarrefourOffers(null, 'ES-CT', 2, { sort: 'asc', priceMax: 9 });
  assert.deepEqual(Array.from(page.items, (item) => item.product.id), ['0002', '0003']);
  const next = await catalog.fetchCarrefourOffers(page.nextCursor, 'ES-CT', 2, { sort: 'asc', priceMax: 9 });
  assert.deepEqual(Array.from(next.items, (item) => item.product.id), ['0001']);
  const filtered = await catalog.fetchCarrefourOffers(null, 'ES-CT', 2, { sort: 'asc', priceMax: 3 });
  assert.deepEqual(Array.from(filtered.items, (item) => item.product.id), ['0002', '0003']);
});

test('a sorted regional page makes one RPC and downloads only its resolved rows', async () => {
  const nextCursor = { name: 9, id: 'second' };
  const { catalog, calls, rpcCalls } = catalogWithRows([], { error: null, data: {
    rows: [{ id: 'regional', display_name: 'Leche', unit_price: 9, category_name: 'Lácteos',
      quefalta_offers: v1([promotion('3x2', 'multibuy', null, null), promotion('Envío gratis', 'shipping', null, null)]) }],
    nextCursor,
  } });
  const filters = { sort: 'asc', search: 'LÉCHE y entera', categories: ['Lácteos'],
    offerTypes: ['shipping'], priceMin: 1, priceMax: 10 };
  const page = await catalog.fetchCarrefourOffers(null, 'ES-CT', 50, filters);
  assert.equal(page.items[0].product.unitPrice, 9);
  assert.equal(page.items[0].promoName, '3x2');
  assert.equal(page.items[0].promotionCount, 2);
  assert.deepEqual(page.nextCursor, nextCursor);
  assert.equal(calls.length, 0);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].name, 'carrefour_offer_page_v1');
  assert.equal(rpcCalls[0].params.p_community, 'Cataluña');
  assert.equal(rpcCalls[0].params.p_sort, 'price_asc');
  assert.deepEqual(Array.from(rpcCalls[0].params.p_tokens), ['leche', 'entera']);
  assert.equal(rpcCalls[0].params.p_price_min, 1);
  assert.equal(rpcCalls[0].params.p_price_max, 10);
  await catalog.fetchCarrefourOffers(nextCursor, 'ES-CT', 50, { pricePerUnitSort: 'desc' });
  assert.deepEqual(rpcCalls[1].params.p_cursor, nextCursor);
  assert.equal(rpcCalls[1].params.p_sort, 'unit_desc');
});

test('categories use one small RPC instead of downloading all offer products', async () => {
  const { catalog, calls, rpcCalls } = catalogWithRows([], { error: null,
    data: { categories: ['Lácteos', 'Aceites'] } });
  const categories = await catalog.fetchOfferCategories('carrefour', 'ES-CT', null);
  assert.deepEqual(Array.from(categories), ['Aceites', 'Lácteos']);
  assert.equal(calls.length, 0);
  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].params.p_categories_only, true);
});

test('real RPC failures propagate without triggering a full catalogue download', async () => {
  const failure = { code: '57014', message: 'timeout' };
  const { catalog, calls } = catalogWithRows([], { data: null, error: failure });
  await assert.rejects(catalog.fetchCarrefourOffers(null, null, 50), (error) => error === failure);
  assert.equal(calls.length, 0);
});
