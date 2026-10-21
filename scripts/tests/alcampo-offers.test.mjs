import test from 'node:test';
import assert from 'node:assert/strict';
import { AlcampoApi } from '../lib/alcampo-api.mjs';
import { assertAlcampoRegion, runAlcampoOffers } from '../lib/alcampo-offers.mjs';
import { describeTraversal, discoverCampaigns, enrichProductPromotion, reconcileTraversal, restoreCheckpoint, CHECKPOINT_VERSION } from '../lib/alcampo-crawl.mjs';

const json = data => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
const product = (id, promotions = []) => ({ productId: id, name: `Producto ${id}`,
  categoryPath: ['Frescos', 'Frutas'], price: { amount: '5' }, promotions });
const promotion = (id, description = id) => ({ retailerPromotionId: id, description, requiredProductQuantity: 2 });

test('API directories and dynamically discovered campaigns retain prices, conditions and scoped validity', async () => {
  const calls = [];
  const rows = new Map();
  const campaigns = new Map();
  const completed = new Set();
  const sources = [];
  let saves = 0;
  const api = new AlcampoApi({ delayMs: 0, fetchImpl: async url => {
    const parsed = new URL(url);
    calls.push(parsed);
    if (parsed.pathname.endsWith('/pages/promotions')) {
      assert.equal(parsed.searchParams.get('regionId'), 'region');
      assert.equal(parsed.searchParams.get('retailerCategoryId'), 'OC1');
      const second = parsed.searchParams.has('pageToken');
      return json({ productGroups: [{ decoratedProducts: [product(second ? 'b' : 'a', [promotion('x')])] }],
        metadata: second ? {} : { nextPageToken: 'second' } });
    }
    if (parsed.pathname.endsWith('/retailer-id/x')) return json({ retailerPromotionId: 'x', description: 'Solo Online',
      activePeriod: { activeFrom: '2026-10-14T22:00:00Z', activeTo: '2026-10-21T21:59:00Z' },
      promotionGroups: [{ products: [{ ...product('a', [promotion('x'), promotion('y')]),
        promoPrice: { amount: '4' }, promoUnitPrice: { price: { amount: '8' }, unit: 'fop.price.per.kg' } }] }] });
    if (parsed.pathname.endsWith('/retailer-id/y')) return json({ retailerPromotionId: 'y', description: '2ª unidad -50%',
      promotionGroups: [{ products: [product('c', [promotion('y')])] }] });
    assert.fail(url);
  } });
  await runAlcampoOffers({ api, regionId: 'region', promotionTasks: [{ key: 'api:promotion:OC1', categoryId: 'OC1' }],
    campaigns, completed, persist: async () => { saves++; },
    ingest: (entities, source) => {
      sources.push(source);
      for (const entity of Object.values(entities)) {
        discoverCampaigns(campaigns, entity, source);
        const row = rows.get(entity.productId) ?? { id: entity.productId, raw: entity, promo_details: [] };
        enrichProductPromotion(row, entity, source);
        rows.set(entity.productId, row);
      }
    },
  });
  assert.deepEqual([...rows.keys()], ['a', 'b', 'c']);
  assert.equal(saves, 3);
  assert.deepEqual([...completed], ['api:promotion:OC1', 'api:offer:x', 'api:offer:y']);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(call => call.pathname.startsWith('/api/')));
  assert.equal(sources[1].sourcePromotionId, 'x');
  assert.equal(rows.get('a').unit_price, 4);
  assert.equal(rows.get('a').price_per_unit, 8);
  assert.equal(rows.get('a').promo_base_price, 5);
  const details = rows.get('a').promo_details;
  assert.equal(details.find(detail => detail.retailer_promotion_id === 'x').promo_start, '2026-10-15');
  assert.equal(details.find(detail => detail.retailer_promotion_id === 'x').promo_end, '2026-10-21');
  assert.equal(details.find(detail => detail.retailer_promotion_id === 'x').online_only, true);
  assert.equal(details.find(detail => detail.retailer_promotion_id === 'x').required_product_quantity, 2);
  assert.equal(details.find(detail => detail.retailer_promotion_id === 'y').online_only, false);
  assert.equal(details.find(detail => detail.retailer_promotion_id === 'y').promo_end, null);
});

test('partial listings and access denials leave tasks pending without ingesting or saving', async () => {
  for (const denied of [false, true]) {
    const completed = new Set();
    const api = new AlcampoApi({ delayMs: 0, fetchImpl: async () => denied
      ? new Response('Denied', { status: 403, headers: { 'content-type': 'text/html' } })
      : json({ productGroups: [{ decoratedProducts: [product('a')] }], metadata: { nextPageToken: 'next' } }) });
    await assert.rejects(runAlcampoOffers({ api, regionId: 'region',
      promotionTasks: [{ key: 'api:promotion:all' }], campaigns: new Map(), completed, maxPages: 1,
      ingest: () => assert.fail('partial listing ingested'), persist: () => assert.fail('partial listing saved'),
    }), /403|incompleta/);
    assert.equal(completed.size, 0);
  }
});

test('a campaign failure can resume without repeating validated directories and campaigns', async () => {
  const campaigns = new Map([['x', { id: 'x' }], ['y', { id: 'y' }]]);
  const completed = new Set(['api:promotion:all', 'api:offer:x']);
  let failed = true;
  let saves = 0;
  const api = new AlcampoApi({ fetchImpl: async url => {
    assert.ok(url.endsWith('/retailer-id/y'));
    if (failed) return new Response('Denied', { status: 403 });
    return json({ retailerPromotionId: 'y', description: 'Y', promotionGroups: [{ products: [product('a')] }] });
  } });
  const input = { api, regionId: 'region', promotionTasks: [{ key: 'api:promotion:all' }], campaigns, completed,
    ingest: () => {}, persist: async () => { saves++; } };
  await assert.rejects(runAlcampoOffers(input), /403/);
  assert.equal(completed.has('api:offer:y'), false);
  assert.equal(saves, 0);
  failed = false;
  await runAlcampoOffers(input);
  assert.equal(completed.has('api:offer:y'), true);
  assert.equal(saves, 1);
});

test('old browser promotion checkpoints cannot skip the new API traversal', () => {
  const input = { catalogTasks: [{ key: 'catalog:a', leaf: { n1: 'root', n2: 'child' } }],
    promotionTasks: [{ key: 'promotion:all' }], catName: new Map(), catParent: new Map() };
  const before = describeTraversal(input);
  const checkpoint = { version: CHECKPOINT_VERSION, traversalId: before.id, traversalManifest: before.manifest,
    completed: ['catalog:a', 'promotion:all', 'offer:x'], seenProductIds: ['a'],
    products: [{ id: 'a', raw: product('a'), promo_details: [] }] };
  const restored = restoreCheckpoint(checkpoint);
  input.promotionTasks = [{ key: 'api:promotion:all' }];
  assert.equal(reconcileTraversal(checkpoint, restored, describeTraversal(input)).revalidate, true);
  assert.equal(restored.products.size, 1);
  assert.equal(restored.completed.size, 0);
  assert.equal(restored.seenProductIds.size, 0);
  assert.deepEqual(checkpoint.completed, ['catalog:a', 'promotion:all', 'offer:x']);
});

test('browser and API regions must agree, including resumed checkpoints', () => {
  assert.doesNotThrow(() => assertAlcampoRegion('same', 'same'));
  for (const region of [undefined, null, 'other']) assert.throws(() => assertAlcampoRegion('expected', region), /región.*incompatible/);
});
