import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

function load(file, deps = {}) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in deps, name);
    return deps[name];
  }, module, module.exports);
  return module.exports;
}
const { refreshPantryItemImages: merge } = load('../../src/lib/pantryImages.ts');
const oldUrl = 'https://example.com/old.webp';
const newUrl = 'https://example.com/new.png';
const item = (instanceId, store) => ({ instanceId, product: { id: '34128', name: 'Albahaca',
  illustrationUrl: oldUrl, ...(store ? { store } : {}) }, x: 0.25, y: 0.29, size: 0.2,
  shelfIndex: 0, quantity: 3, notes: 'Guardar', kitchenLocation: 'Cocina', expiryDate: '2027-01-01' });

test('updates existing copies by retailer, preserving all stock details and legacy Mercadona identity', () => {
  const items = [item('first'), item('copy', 'mercadona'), item('other', 'bonarea')];
  const next = merge(items, items, new Map([['mercadona:34128', newUrl]]));
  assert.equal(next[0].product.illustrationUrl, newUrl);
  assert.equal(next[1].product.illustrationUrl, newUrl);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(next[i], { ...items[i], product: { ...items[i].product, illustrationUrl: newUrl } });
  }
  assert.equal(next[2], items[2]);
  assert.equal(items[0].product.illustrationUrl, oldUrl);
});

test('late responses preserve concurrent edits, deletions, new copies and newer images', () => {
  const requested = [item('edited'), item('deleted'), item('newer')];
  const live = [{ ...requested[0], x: 0.6, quantity: 9, notes: 'Nueva nota' },
    item('added'), { ...requested[2], product: { ...requested[2].product, illustrationUrl: 'https://example.com/newer.png' } }];
  const next = merge(live, requested, new Map([['mercadona:34128', newUrl]]));
  assert.deepEqual(next.map(i => i.instanceId), ['edited', 'added', 'newer']);
  assert.equal(next[0].x, 0.6);
  assert.equal(next[0].quantity, 9);
  assert.equal(next[0].notes, 'Nueva nota');
  assert.equal(next[0].product.illustrationUrl, newUrl);
  assert.equal(next[1], live[1]);
  assert.equal(next[2], live[2]);
});

test('unchanged or missing catalogue images keep the saved objects and avoid writes', () => {
  const items = [item('saved')];
  assert.equal(merge(items, items, new Map()), items);
  assert.equal(merge(items, items, new Map([['mercadona:34128', oldUrl]])), items);
});

test('Carrefour refresh keeps retailer identity and skips excluded categories', async () => {
  const client = api({ carrefour_products: [
    { id: '520664611', illustration_url: newUrl, category_name: 'Alimentación' },
    { id: 'bad', illustration_url: newUrl, category_ids: ['cat20037'] },
  ] });
  const urls = await client.fetch([{ ...item('c', 'carrefour').product, id: '520664611' },
    { ...item('b', 'carrefour').product, id: 'bad' }]);
  assert.deepEqual([...urls], [['carrefour:520664611', newUrl]]);
  assert.equal(client.calls[0].table, 'carrefour_products');
});

function api(rows, error = null) {
  const calls = [];
  const { fetchPantryImageUrls } = load('../../src/api/pantry.ts', {
    '../lib/supabase': { supabase: { from(table) {
      const call = { table }; calls.push(call);
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        in(column, ids) { call.column = column; call.ids = ids; return builder; },
        returns() { return builder; },
        abortSignal(signal) { call.signal = signal; return builder; },
        then(resolve) { return Promise.resolve({ data: rows[table] ?? [], error }).then(resolve); },
      };
      return builder;
    } } },
    '../lib/pantryLayout': load('../../src/lib/pantryLayout.ts'),
    '../constants/regions': { REGION_ALL: 'ES', REGION_MERCADONA_NAME: {} },
  });
  return { fetch: fetchPantryImageUrls, calls };
}

test('refresh queries exact ids in batches without filtering discontinued stock, ignoring invalid URLs', async () => {
  const client = api({ mercadona_products: [
    { id: '34128', illustration_url: newUrl }, { id: 'invalid', illustration_url: 'http://example.com/no.png' },
    { id: 'removed', illustration_url: null },
  ], bonarea_products: [{ id: '34128', illustration_url: 'https://example.com/bonarea.png' }] });
  const products = Array.from({ length: 205 }, (_, i) => ({ ...item('one').product, id: String(i) }));
  products.push(item('one').product, item('duplicate').product, item('another', 'bonarea').product);
  const signal = new AbortController().signal;
  const urls = await client.fetch(products, signal);
  assert.equal(urls.get('mercadona:34128'), newUrl);
  assert.equal(urls.get('bonarea:34128'), 'https://example.com/bonarea.png');
  assert.equal(urls.size, 2);
  assert.deepEqual(client.calls.filter(c => c.table === 'mercadona_products').map(c => c.ids.length), [100, 100, 6]);
  assert.ok(client.calls.every(c => c.signal === signal && c.column === 'id' && c.columns === (c.table === 'mercadona_products' ? 'id, illustration_url, size_instructions:raw->price_instructions' : 'id, illustration_url')));
});

test('empty stock does not query; network failures reject without replacing saved images', async () => {
  const client = api({});
  assert.equal((await client.fetch([])).size, 0);
  assert.equal(client.calls.length, 0);
  const failure = new Error('offline');
  await assert.rejects(api({}, failure).fetch([item('one').product]), error => error === failure);
});

test('a changed image invalidates only its measured bounds so spacing can be measured again', () => {
  const saved = { ...item('measured'), visibleBounds: { left: .3, top: .1, right: .7, bottom: .95 }, boundsImageUrl: oldUrl };
  const next = merge([saved], [saved], new Map([['mercadona:34128', newUrl]]));
  assert.equal(next[0].visibleBounds, undefined);
  assert.equal(next[0].boundsImageUrl, undefined);
  assert.equal(next[0].product.illustrationUrl, newUrl);
  assert.equal(next[0].quantity, saved.quantity);
  assert.equal(next[0].notes, saved.notes);
  assert.equal(merge([saved], [saved], new Map([['mercadona:34128', oldUrl]]))[0], saved);
});


test('correcting saved container labels preserves geometry, stock and later edits', () => {
  const original = { ...item('meat'), product: { ...item('meat').product, metaLabel: 'Bandeja' },
    visibleBounds: { left: .2, top: .1, right: .8, bottom: .9 }, boundsImageUrl: oldUrl };
  const live = { ...original, quantity: 4, notes: 'Para mañana' };
  const contents = new Map([['mercadona:34128', '500 g']]);
  const result = merge([live], [original], new Map([['mercadona:34128', oldUrl]]), contents);
  assert.deepEqual(result[0], { ...live, product: { ...live.product, metaLabel: '500 g' } });
  assert.equal(result[0].visibleBounds, original.visibleBounds);
  assert.equal(merge(result, result, new Map(), contents), result);
  const edited = { ...live, product: { ...live.product, metaLabel: '750 g' } };
  assert.equal(merge([edited], [original], new Map(), contents)[0], edited);
  assert.equal(merge([], [original], new Map(), contents).length, 0);
});
