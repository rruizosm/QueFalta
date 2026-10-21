import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createClient } from '@supabase/supabase-js';

const compile = (path) => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const catalogCode = compile('../../src/api/catalog.ts');
const adaptersCode = compile('../../src/lib/productAdapters.ts');
const offerTypesCode = compile('../../src/lib/offerTypes.ts');

// Usa el constructor PostgREST real: comprueba los filtros/proyecciones enviados
// al servidor además de ejecutar las funciones de producción y su adaptador real.
function setup(pages, language = 'es') {
  const requests = [];
  const supabase = createClient('https://bonarea-test.supabase.co', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: new URL(input), body: init?.body ? JSON.parse(init.body) : null });
      const response = pages.shift();
      assert.ok(response, 'unexpected extra request');
      return new Response(JSON.stringify(response), { headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const load = (code, require = () => ({})) => {
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require, Date, Set, Map, console });
    return module.exports;
  };
  const adapters = load(adaptersCode);
  const offerTypes = load(offerTypesCode);
  const catalog = load(catalogCode, (path) => {
    if (path === '../lib/supabase') return { supabase };
    if (path === '../lib/productAdapters') return adapters;
    if (path === '../lib/offerTypes') return offerTypes;
    if (path === '../i18n') return { getLanguage: () => language };
    if (path === '../lib/catalogRequestCache') return {
      catalogRequestKey: () => '', cacheCatalogRequest: (_key, fetch) => fetch(),
    };
    if (path === '../constants/regions') return { REGION_ALL: 'all', REGION_MERCADONA_NAME: {} };
    return {};
  });
  return { catalog, offerTypes, requests };
}

const product = (id, price, extras = {}) => ({
  id, display_name: `Producto ${id}`, display_name_ca: `Producte ${id}`,
  display_name_norm: `producto ${id}`, display_name_ca_norm: `producte ${id}`,
  unit_price: price, price_format: `${price} €`, category_name: 'Pan',
  price_per_unit: 4, price_per_unit_unit: 'kg',
  offer_characteristics: [{ descripcio: 'BONAREA' }, { descripcio: 'BAIXADA_PREU' }],
  ...extras,
});

test('BonÀrea entra en Ofertas con su propia consulta y la insignia oficial', async () => {
  const { catalog, offerTypes, requests } = setup([[product('13*8269', 0.8)]]);
  assert.ok(catalog.OFFER_STORES.includes('bonarea'));
  assert.deepEqual(Array.from(offerTypes.offerTypesForStore('bonarea')), ['discount']);
  const page = await catalog.fetchStoreOffers('bonarea', null, null, null, 50, { sort: 'asc' });
  const params = requests[0].url.searchParams;
  assert.equal(requests[0].url.pathname, '/rest/v1/bonarea_products');
  assert.equal(params.get('published'), 'eq.true');
  assert.equal(params.get('raw'), 'cs.{"caracteristiques":[{"descripcio":"BAIXADA_PREU"}]}');
  assert.match(params.get('select'), /offer_characteristics:raw->caracteristiques/);
  assert.ok(!params.get('select').split(',').includes('raw'));
  assert.equal(page.items[0].product.store, 'bonarea');
  assert.equal(page.items[0].product.unitPrice, 0.8);
  assert.equal(page.items[0].product.categoryName, 'Pan');
  assert.equal(page.items[0].promoName, 'Bajada precio');
  assert.equal(page.items[0].prevPrice, null);
  assert.equal(page.items[0].promoEnd, null);
  assert.deepEqual(Array.from(offerTypes.offerTypesOf(page.items[0])), ['discount']);
});

test('la paginación conserva precio, desempate y filtros en el servidor', async () => {
  const { catalog, requests } = setup([[product('a', 1), product('b', 1)], [product('c', 2)]]);
  const filters = { sort: 'asc', categories: ['Pan'], priceMin: 0.5, priceMax: 3 };
  const first = await catalog.fetchBonareaOffers(null, 2, filters);
  const second = await catalog.fetchBonareaOffers(first.nextCursor, 2, filters);
  assert.deepEqual(Array.from([...first.items, ...second.items], (offer) => offer.product.id), ['a', 'b', 'c']);
  assert.equal(second.nextCursor, null);
  const params = requests[1].url.searchParams;
  assert.equal(params.get('order'), 'unit_price.asc.nullslast,id.asc');
  assert.equal(params.get('category_name'), 'in.(Pan)');
  assert.ok(params.getAll('unit_price').includes('gt.0.5'));
  assert.ok(params.getAll('unit_price').includes('lte.3'));
  assert.equal(params.get('or'), '(unit_price.gt.1,and(unit_price.eq.1,id.gt."b"))');
});

test('solo la marca explícita certifica la rebaja; ES/CA y facetas coinciden', async () => {
  const { catalog, requests } = setup([[
    product('a', 1),
    product('b', 1, { offer_characteristics: [{ descripcio: 'NOU_PRODUCTE' }], prev_unit_price: 2 }),
    product('c', 1, { offer_characteristics: null, discount: 50 }),
  ]], 'ca');
  const page = await catalog.fetchStoreOffers('bonarea', null, null, null, 50, { offerTypes: ['discount'] });
  assert.deepEqual(Array.from(page.items, (offer) => offer.product.id), ['a']);
  assert.equal(page.items[0].product.name, 'Producte a');
  assert.equal(page.items[0].promoName, 'Baixada preu');
  assert.match(requests[0].url.searchParams.get('order'), /^display_name_ca_norm.asc/);
});

test('buscar ofertas usa el RPC de BonÀrea, con filtros previos a la paginación', async () => {
  const { catalog, requests } = setup([[product('a', 1)]], 'ca');
  const page = await catalog.fetchStoreOffers('bonarea', null, null, null, 50, {
    search: 'pa', sort: 'desc', categories: ['Pan'], priceMax: 2, offerTypes: ['discount'],
  });
  assert.equal(requests[0].url.pathname, '/rest/v1/rpc/search_bonarea_feed_products');
  assert.equal(requests[0].body.p_feed, 'offer');
  assert.equal(requests[0].body.p_lang, 'ca');
  assert.equal(requests[0].body.p_order, 'priceDesc');
  assert.deepEqual(requests[0].body.p_categories, ['Pan']);
  assert.equal(requests[0].body.p_price_max, 2);
  assert.match(requests[0].url.searchParams.get('select'), /offer_characteristics:raw->caracteristiques/);
  assert.equal(page.items[0].promoName, 'Baixada preu');
});

test('las categorías consultan exclusivamente las rebajas explícitas de BonÀrea', async () => {
  const { catalog, requests } = setup([[{ id: 'a', category_name: 'Pan' }, { id: 'b', category_name: 'Pan' }]]);
  assert.deepEqual(Array.from(await catalog.fetchOfferCategories('bonarea', null, null)), ['Pan']);
  assert.equal(requests[0].url.pathname, '/rest/v1/bonarea_products');
  assert.match(requests[0].url.searchParams.get('raw'), /BAIXADA_PREU/);
});
