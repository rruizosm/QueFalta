import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DRY_RUN = '1';
process.env.SUPABASE_URL = 'https://sync.invalid';
process.env.SUPABASE_SERVICE_ROLE = 'test-only';
delete process.env.MAX_CATEGORIES;
delete process.env.MAX_ZONES;
delete process.env.ONLY_CATEGORY;
const { fetchHtml, fetchProtectedProductIds, processCategory, main } = await import('../sync-carrefour.mjs');

const home = 'https://www.carrefour.es';
const category = { id: 'cat1', name: 'Sushi', parent_id: 'cat99', url: '/supermercado/frescos/sushi/cat1/c' };
const healthyCategory = { id: 'cat2', name: 'Alimentos', parent_id: 'cat99', url: '/supermercado/alimentos/cat2/c' };
const zone = { werks: 'madrid', name: 'Madrid', cp: '28232', ccaas: new Set(['Comunidad de Madrid']) };
const product = (id) => ({ product_id: id, sku_id: `sku-${id}`, name: `Producto ${id}`, price: '3,09 €', badge_map: { promotions: [] } });
const page = (total, items, offset = 0) => JSON.stringify({ pagination: { offset, page_size: 24, total_results: total }, items });
const curlResponse = (html, url, status = 200) => ({ stdout: `${html}\n__HTTP__${status}|${url}` });
const tree = (cats) => ({
  n2s: cats,
  catRows: [{ id: 'cat99', name: 'Catálogo', published: true }, ...cats.map((cat) => ({ ...cat, published: true }))],
});

test('a redirect to the homepage is rejected even when it contains products and taxonomy', async () => {
  let requests = 0;
  await assert.rejects(fetchHtml(`${category.url}?offset=0`, { categoryId: category.id }, async (_cmd, args) => {
    requests++;
    assert.ok(args.includes('\n__HTTP__%{http_code}|%{url_effective}'));
    return curlResponse(JSON.stringify({ firstLevelCategories: {}, items: [product('homepage')] }), `${home}/supermercado`);
  }), /redirección fuera de categoría cat1/);
  assert.equal(requests, 1); // Los reintentos de categoría no se multiplican por cinco.
});

test('canonical offset-zero redirects are accepted within the same category', async () => {
  const html = page(1, [product('sushi')]);
  assert.equal(await fetchHtml(`${category.url}?offset=0`, { categoryId: category.id }, async () => curlResponse(html, home + category.url)), html);
});

test('another category or host cannot masquerade as the requested listing', async () => {
  for (const url of [home + healthyCategory.url, 'https://other.invalid' + category.url]) {
    await assert.rejects(fetchHtml(category.url, { categoryId: category.id, tries: 1 }, async () => curlResponse(page(1, [product('wrong')]), url)), /redirección fuera de categoría/);
  }
});

test('HTTP failures are rejected even if their HTML contains catalogue markers', async () => {
  await assert.rejects(fetchHtml(category.url, { categoryId: category.id, tries: 1 }, async () => curlResponse(page(1, [product('error')]), home + category.url, 503)), /HTTP 503/);
});

test('failure on a later page leaves every shared product/category/region map untouched', async () => {
  const maps = [new Map([['old', { id: 'old', unit_price: 2 }]]), new Map([['old', new Set(['cat9'])]]),
    new Map([['old', new Set(['other-zone'])]]), new Map([['old', new Map([['other-zone', { p: 2 }]])]])];
  const before = structuredClone(maps);
  const items = Array.from({ length: 24 }, (_, i) => product(`page-one-${i}`));
  await assert.rejects(processCategory(category, 'cookie', zone, ...maps, async (url, options) => {
    assert.equal(options.categoryId, category.id);
    return url.endsWith('offset=0') ? page(25, items) : JSON.stringify({ items: [product('homepage')] });
  }), /cobertura desconocida/);
  assert.deepEqual(maps, before);
});

test('protected IDs use array membership or the legacy primary category and paginate until empty', async () => {
  const cursors = [];
  const batches = [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }], []];
  const ids = await fetchProtectedProductIds(new Set(['cat1']), async (url, init) => {
    assert.equal(url.searchParams.get('or'), '(category_ids.ov.{cat1},category_id.in.(cat1))');
    assert.equal(url.searchParams.get('order'), 'id.asc');
    assert.equal(url.searchParams.get('select'), 'id');
    assert.equal(init.method, undefined);
    assert.equal(url.searchParams.has('published'), false);
    cursors.push(url.searchParams.get('id'));
    return Response.json(batches.shift());
  });
  assert.deepEqual([...ids], ['a', 'b', 'c']);
  assert.deepEqual(cursors, [null, 'gt.b', 'gt.c']); // También funciona con un cap remoto menor de 1000.
});

async function withRestMock(read, work) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : null });
    return method === 'GET' ? read(url) : new Response(null, { status: 201 });
  };
  try { await work(calls); } finally { globalThis.fetch = originalFetch; }
}

test('one failed regional category still publishes healthy products while protecting previous shared products', async () => {
  const galicia = { werks: 'galicia', name: 'Galicia', cp: '15001', ccaas: new Set(['Galicia']) };
  await withRestMock((url) => {
    assert.equal(url.searchParams.get('or'), '(category_ids.ov.{cat1},category_id.in.(cat1))');
    return Response.json(url.searchParams.has('id') ? [] : [{ id: 'shared-old' }, { id: 'previous-unseen' }]);
  }, async (calls) => {
    await main({
      dryRun: false, skipDetail: true,
      fetchZones: async () => [zone, galicia], fetchTree: async () => tree([category, healthyCategory]),
      fetchPage: async (_url, { categoryId, cookie }) => {
        if (categoryId === 'cat1') {
          if (cookie.includes('15001')) throw new Error('redirección fuera de categoría cat1: portada');
          return page(1, [product('new-from-failed-category')]);
        }
        return page(2, [product('fresh'), product('shared-old')]);
      },
    });
    const writes = calls.filter((c) => c.method === 'POST');
    assert.deepEqual(writes.find((c) => c.url.pathname.endsWith('/carrefour_products')).body.map((r) => r.id), ['fresh']);
    assert.deepEqual(writes.find((c) => c.url.pathname.endsWith('/carrefour_categories')).body.map((r) => r.id), ['cat99', 'cat2']);
    assert.ok(calls.every((c) => c.method !== 'PATCH' && c.method !== 'DELETE'));
    assert.ok(calls.every((c) => !c.url.searchParams.has('synced_at'))); // Sin limpieza global de ausentes.
    assert.ok(calls.every((c) => !c.url.pathname.endsWith('/catalog_sync_status'))); // Sin fingir un éxito completo.
    assert.equal(writes.find((c) => c.url.pathname.endsWith('/carrefour_products')).body[0].raw.quefalta_offers.version, 1);
  });
});

test('a complete sweep retains global stale cleanup and advances the last-success marker', async () => {
  await withRestMock((url) => {
    assert.equal(url.searchParams.get('published'), 'eq.true');
    assert.ok(url.searchParams.get('synced_at').startsWith('lt.'));
    return Response.json([]);
  }, async (calls) => {
    await main({ dryRun: false, skipDetail: true, fetchZones: async () => [zone], fetchTree: async () => tree([healthyCategory]), fetchPage: async () => page(1, [product('fresh')]) });
    assert.equal(calls.filter((c) => c.method === 'GET').length, 2);
    assert.equal(calls.find((c) => c.url.pathname.endsWith('/catalog_sync_status')).body.store, 'carrefour');
    assert.equal(calls.find((c) => c.method === 'POST' && c.url.pathname.endsWith('/carrefour_products')).body[0].id, 'fresh');
  });
});

test('an entirely failed sweep cannot write or advance status', async () => {
  await withRestMock(() => Response.json([]), async (calls) => {
    await assert.rejects(main({ dryRun: false, skipDetail: true, fetchZones: async () => [zone], fetchTree: async () => tree([category]), fetchPage: async () => { throw new Error('descarga fallida'); } }), /0 productos validados/);
    assert.ok(calls.every((c) => c.method === 'GET'));
  });
});

test('a failed preservation read cannot trigger destructive catalogue writes', async () => {
  await withRestMock(() => new Response('unavailable', { status: 503 }), async (calls) => {
    await assert.rejects(main({
      dryRun: false, skipDetail: true, fetchZones: async () => [zone], fetchTree: async () => tree([category, healthyCategory]),
      fetchPage: async (_url, { categoryId }) => { if (categoryId === 'cat1') throw new Error('categoría fallida'); return page(1, [product('fresh')]); },
    }), /read protected products 503/);
    assert.ok(calls.every((c) => c.method === 'GET'));
  });
});

test('a partial dry run never reads or writes Supabase', async () => {
  await withRestMock(() => { throw new Error('unexpected database read'); }, async (calls) => {
    await main({
      dryRun: true, skipDetail: true, fetchZones: async () => [zone], fetchTree: async () => tree([category, healthyCategory]),
      fetchPage: async (_url, { categoryId }) => { if (categoryId === 'cat1') throw new Error('categoría fallida'); return page(1, [product('fresh')]); },
    });
    assert.deepEqual(calls, []);
  });
});
