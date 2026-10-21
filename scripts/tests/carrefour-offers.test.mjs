import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { carrefourOffers, extractCarrefourProducts, offerDate, money } from '../lib/carrefour-offers.mjs';

process.env.DRY_RUN = '1';
const { normalize, zonePriceObj, processCategory } = await import('../sync-carrefour.mjs');
const today = '2026-09-26';
const promo = (name, extra = {}) => ({ name, badge_type: 'promotions', start_date: '24/09/2026', end_date: '12/10/2026', ...extra });
const product = (promotions = [], extra = {}) => ({ product_id: 'sample', sku_id: 'sku', name: 'Producto', price: '3,09 €', badge_map: { promotions }, ...extra });

for (const name of ['Air Fryer', 'Innovación', '✨ ¡NOVEDAD!', 'Precio Imbatible', 'SuperChollos']) {
  test(`does not manufacture a promotion from ${name}`, () => {
    const p = product([], { badge: { name }, badge_map: { campaign: [{ name, badge_type: 'campaign' }] } });
    const result = carrefourOffers(p, today);
    assert.equal(result.promo_name, null);
    assert.deepEqual(result.promotions, []);
    assert.equal(carrefourOffers({ ...p, badge_map: undefined }, today).promo_name, null);
  });
}

test('Dodot: preserves shipping and 3x2 but selects the economic promotion regardless of order', () => {
  const offers = [promo('Envío Gratis', { pdp_text: 'Pedido mínimo de 50€. Exclusivo online.' }), promo('3x2', { pdp_text: 'Descuento sobre el de menor precio.' })];
  const result = carrefourOffers(product(offers), today);
  assert.equal(result.promo_name, '3x2');
  assert.equal(result.promo_text, 'Descuento sobre el de menor precio.');
  assert.equal(result.promotions.length, 2);
  assert.deepEqual(result, carrefourOffers(product(offers.toReversed()), today));
});

test('shipping alone is retained as a benefit but not published as a product discount', () => {
  const result = carrefourOffers(product([promo('Envío Gratis')]), today);
  assert.equal(result.promo_name, null);
  assert.equal(result.promotions[0].kind, 'shipping');
});

test('expired first promotion does not hide an active second promotion', () => {
  const result = carrefourOffers(product([promo('3x2', { end_date: '23/09/2026', start_date: '10/09/2026' }), promo('2ª unidad -50%')]), today);
  assert.equal(result.promo_name, '2ª unidad -50%');
  assert.equal(result.promotions.length, 2);
});

test('future and expired offers stay in metadata but not in active columns', () => {
  for (const dates of [{ start_date: '27/09/2026' }, { start_date: '10/09/2026', end_date: '23/09/2026' }]) {
    const result = carrefourOffers(product([promo('3x2', dates)], { badge: { name: '3x2' } }), today);
    assert.equal(result.promo_name, null);
    assert.equal(result.promo_end, null);
    assert.equal(result.promotions.length, 1);
  }
  assert.equal(carrefourOffers(product([promo('3x2')]), '2026-10-12').promo_name, '3x2');
  assert.equal(carrefourOffers(product([promo('3x2')]), '2026-09-24').promo_name, '3x2');
});

test('rejects invalid and reversed dates; reads validity from description for legacy badges', () => {
  assert.equal(offerDate('31/02/2026'), null);
  assert.equal(carrefourOffers(product([promo('3x2', { end_date: '31/02/2026' })]), today).promo_name, null);
  assert.equal(carrefourOffers(product([promo('3x2', { start_date: '13/10/2026' })]), today).promo_name, null);
  const result = carrefourOffers({ badge: { name: '3x2', description: 'Válido del 24/09/2026 al 12/10/2026.' } }, today);
  assert.equal(result.promo_start, '2026-09-24');
  assert.equal(result.promo_end, '2026-10-12');
});

test('deduplicates and distinguishes cashback from an immediate multibuy', () => {
  const offer = promo('2x1 Acumula');
  const result = carrefourOffers(product([offer, offer, promo('12x11')]), today);
  assert.equal(result.promotions.length, 2);
  assert.equal(result.promo_name, '12x11');
  assert.equal(result.promotions.find((p) => p.name === '2x1 Acumula').kind, 'club');
});

test('only retains a genuine price reduction; numeric inputs do not lose decimals', () => {
  assert.equal(money(3.09), 3.09);
  assert.equal(money('1.234,56 €'), 1234.56);
  assert.equal(money(''), null);
  for (const previous of ['3,09 €', '2,99 €', 'invalid']) {
    assert.equal(carrefourOffers(product([], { strikethrough_price: previous }), today).strikethrough_price, null);
  }
  assert.equal(carrefourOffers(product([], { strikethrough_price: '3,99 €' }), today).strikethrough_price, 3.99);
});

test('extracts large products, braces and escaped quotes inside JSON strings, ignoring containers', () => {
  const p = product([promo('3x2', { pdp_text: 'Condiciones { y } con "comillas" y \\ ' + 'x'.repeat(4500) })]);
  const other = product([], { product_id: 'second' });
  const html = `<script>window.__INITIAL_STATE__=${JSON.stringify({ list: [p, other] })};</script>`;
  assert.deepEqual(extractCarrefourProducts(html), [p, other]);
});

test('duplicate representations retain the richer promotional object', () => {
  const plain = product();
  const rich = product([promo('3x2')]);
  assert.deepEqual(extractCarrefourProducts(JSON.stringify({ items: [plain, rich] })), [rich]);
});

test('HTML styles and unrelated JavaScript do not corrupt subsequent JSON state', () => {
  const p = product([promo('3x2')]);
  const html = `<style>.x:before { content: '"'; }</style><script>function irrelevant() { return '"'; }</script><script>window.state=${JSON.stringify({ items: [p] })};</script>`;
  assert.deepEqual(extractCarrefourProducts(html), [p]);
});

test('normalization clears previous false badges explicitly and preserves original raw', () => {
  const p = product([], { badge: { name: 'Air Fryer' }, badge_map: { campaign: [{ name: 'Air Fryer' }] } });
  const row = normalize(p);
  for (const field of ['promo_name', 'promo_text', 'promo_start', 'promo_end', 'strikethrough_price']) assert.equal(row[field], null);
  assert.deepEqual(row.raw.badge_map, p.badge_map);
  assert.equal(row.raw.quefalta_offers.version, 1);
  assert.equal(p.quefalta_offers, undefined);
});

test('regional payload distinguishes no offer from a same-price promotion', () => {
  const a = zonePriceObj(product([promo('3x2', { start_date: null, end_date: null })]));
  const b = zonePriceObj(product([]));
  assert.equal(a.p, b.p);
  assert.equal(a.offers.promo_name, '3x2');
  assert.deepEqual(b.offers.promotions, []);
  assert.equal(b.offers.promo_name, null);
});

const page = (total, items, offset = 0) => JSON.stringify({ pagination: { offset, page_size: 24, total_results: total }, items });
const crawl = (fetchPage) => processCategory({ id: 'cat1', url: '/category' }, 'cookie', { werks: 'zone' }, new Map(), new Map(), new Map(), new Map(), fetchPage);

test('incomplete and unknown category coverage fail before publishing', async () => {
  await assert.rejects(crawl(async () => page(10, [])), /página vacía/);
  await assert.rejects(crawl(async () => JSON.stringify({ items: [product()] })), /cobertura desconocida/);
});

test('a repeated page is an error, while a genuinely empty category is valid', async () => {
  const items = Array.from({ length: 24 }, (_, id) => product([], { product_id: String(id + 1) }));
  await assert.rejects(crawl(async (url) => page(48, items, Number(new URL(url, 'https://example.com').searchParams.get('offset')))), /página repetida/);
  await crawl(async () => page(0, []));
});

test('34 listing positions with 33 unique IDs complete both pages', async () => {
  const items = Array.from({ length: 33 }, (_, id) => product([], { product_id: String(id + 1) }));
  const offsets = [];
  await crawl(async (url) => {
    const offset = Number(new URL(url, 'https://example.com').searchParams.get('offset'));
    offsets.push(offset);
    return page(34, offset === 0 ? items.slice(0, 24) : [items[0], ...items.slice(24)], offset);
  });
  assert.deepEqual(offsets, [0, 24]);
});

test('last page can contain only an already-seen product without being a repeated page', async () => {
  const items = Array.from({ length: 24 }, (_, id) => product([], { product_id: String(id + 1) }));
  await crawl(async (url) => {
    const offset = Number(new URL(url, 'https://example.com').searchParams.get('offset'));
    return page(25, offset === 0 ? items : [items[0]], offset);
  });
});

test('missing metadata is retried and formatted pagination JSON is understood', async () => {
  let calls = 0;
  await crawl(async () => ++calls === 1 ? JSON.stringify({ items: [product()] })
    : JSON.stringify(JSON.parse(page(1, [product()])), null, 2));
  assert.equal(calls, 2);
});

test('wrong offset is retried rather than silently dropping the next page', async () => {
  const items = Array.from({ length: 24 }, (_, id) => product([], { product_id: String(id + 1) }));
  let secondPageCalls = 0;
  await crawl(async (url) => {
    const offset = Number(new URL(url, 'https://example.com').searchParams.get('offset'));
    if (!offset || ++secondPageCalls === 1) return page(25, items);
    return page(25, [product([], { product_id: '25' })], offset);
  });
  assert.equal(secondPageCalls, 2);
});

test('a limited non-dry-run cannot reach the network or mutate the catalogue', () => {
  const run = spawnSync(process.execPath, ['scripts/sync-carrefour.mjs'], {
    cwd: new URL('../../', import.meta.url), encoding: 'utf8',
    env: { ...process.env, DRY_RUN: '0', MAX_CATEGORIES: '1', SUPABASE_URL: 'https://invalid.example', SUPABASE_SERVICE_ROLE: 'test' },
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /requieren DRY_RUN=1/);
});
