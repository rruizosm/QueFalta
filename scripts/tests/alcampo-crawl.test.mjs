import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractAlcampoPromotionDetails, mergeAlcampoPromotionDetails } from '../lib/retailer-offers.mjs';
import {
  CHECKPOINT_VERSION, enrichProductPromotion, discoverCampaigns, restoreCheckpoint,
  saveCheckpoint, withRetries, runPending, parseListing, parseApiListing, completeListing,
  resolveFoodCategory,
  describeTraversal, reconcileTraversal,
} from '../lib/alcampo-crawl.mjs';

const product = (id, price = '5', original = null) => ({ productId: id, name: `Producto ${id}`,
  categoryPath: ['Frescos', 'Frutas'], price: { current: { amount: price },
    ...(original ? { original: { amount: original } } : {}),
    unit: { label: 'fop.price.per.kg', current: { amount: price } } },
  offers: [{ retailerPromotionId: 'promo-a', description: '2ª unidad -50%' }],
});
const row = (entity) => ({ id: entity.productId, raw: entity, promo_details: [] });
const stateHtml = (data, entities, kind = 'catalog', extras = {}) => `<script data-test="initial-state-script">window.__INITIAL_STATE__=${JSON.stringify({
  data: { products: { [kind === 'offer' ? 'offers' : 'catalogue']: { data, isFetching: false, fetchError: false }, productEntities: entities } },
  session: { metadata: { regionId: 'region-test' } }, ...extras,
})};</script>`;

const traversalInput = () => ({
  catalogTasks: ['a', 'b'].map((id) => ({ key: `catalog:${id}`, leaf: { n1: 'root', n2: 'child' }, url: `https://example.test/categories/${id}` })),
  promotionTasks: [{ key: 'promotion:all', url: 'https://example.test/promotions' }],
  catName: new Map([['root', 'Frescos'], ['child', 'Frutas']]),
  catParent: new Map([['child', 'root']]),
});

test('firma del recorrido ignora orden, duplicados y cambios de slug', () => {
  const input = traversalInput();
  const before = describeTraversal(input);
  input.catalogTasks.reverse();
  input.catalogTasks[0].url = 'https://example.test/categories/otro-slug';
  input.catalogTasks.push(input.catalogTasks[0]);
  input.catName = new Map([...input.catName].reverse());
  assert.deepEqual(describeTraversal(input), before);
});

test('mismo recorrido semántico mantiene páginas verificadas y productos vistos', () => {
  const traversal = describeTraversal(traversalInput());
  const checkpoint = { version: CHECKPOINT_VERSION, traversalId: traversal.id, traversalManifest: traversal.manifest,
    completed: ['catalog:a'], seenProductIds: ['a'], products: [row(product('a'))] };
  const restored = restoreCheckpoint(checkpoint);
  assert.equal(reconcileTraversal(checkpoint, restored, traversal, 'different-old-hash').revalidate, false);
  assert.ok(restored.completed.has('catalog:a'));
  assert.ok(restored.seenProductIds.has('a'));
});

test('V3 con firma antigua distinta conserva datos y revalida en lugar de abortar', () => {
  const checkpoint = { version: CHECKPOINT_VERSION, traversalId: 'old', completed: ['catalog:a'], seenProductIds: ['a'], products: [row(product('a'))] };
  const restored = restoreCheckpoint(checkpoint);
  const result = reconcileTraversal(checkpoint, restored, describeTraversal(traversalInput()), 'changed');
  assert.equal(result.revalidate, true);
  assert.equal(result.discardedPages, 1);
  assert.equal(restored.products.size, 1);
  assert.equal(restored.campaigns.size, 1);
  assert.equal(restored.completed.size, 0);
  assert.equal(restored.seenProductIds.size, 0);
  // El fichero original/objeto leído no se modifica al reconciliar los sets.
  assert.deepEqual(checkpoint.completed, ['catalog:a']);
  assert.deepEqual(checkpoint.seenProductIds, ['a']);
});

test('V3 con firma antigua coincidente migra sin repetir páginas', () => {
  const checkpoint = { version: CHECKPOINT_VERSION, traversalId: 'same', completed: ['catalog:a'], seenProductIds: ['a'] };
  const restored = restoreCheckpoint(checkpoint);
  assert.equal(reconcileTraversal(checkpoint, restored, describeTraversal(traversalInput()), 'same').revalidate, false);
  assert.equal(restored.completed.size, 1);
});

test('cambiar límites o reclasificar páginas revalida y no publica vistos de otro alcance', () => {
  for (const change of [
    (input) => input.catalogTasks.pop(),
    (input) => { input.catalogTasks[0].leaf.n2 = 'another'; },
    (input) => input.promotionTasks.push({ key: 'promotion:new' }),
  ]) {
    const input = traversalInput();
    const before = describeTraversal(input);
    const checkpoint = { version: CHECKPOINT_VERSION, traversalId: before.id, traversalManifest: before.manifest,
      completed: ['catalog:a', 'catalog:b'], seenProductIds: ['a'], products: [row(product('a'))] };
    change(input);
    const after = describeTraversal(input);
    assert.notEqual(before.id, after.id);
    const restored = restoreCheckpoint(checkpoint);
    assert.equal(reconcileTraversal(checkpoint, restored, after).revalidate, true);
    assert.equal(restored.products.size, 1);
    assert.equal(restored.seenProductIds.size, 0);
    assert.equal(restored.completed.size, 0);
  }
});

test('V1 reconstruye campañas y obliga a verificar páginas saltadas o parciales', () => {
  const a = row(product('a'));
  const b = row({ ...product('b'), offers: [{ retailerPromotionId: 'promo-b', description: 'Solo Online' }] });
  const restored = restoreCheckpoint({ nextIndex: 1449, products: [a, b] });
  assert.deepEqual([...restored.campaigns.keys()], ['promo-a', 'promo-b']);
  assert.equal(restored.products.size, 2);
  assert.equal(restored.completed.size, 0);
  assert.equal(restored.seenProductIds.size, 0);
});

test('V2 recupera el tachado enriquecido y descarta marcas online contaminadas', () => {
  const a = { ...row(product('a')), promo_price: 4, promo_base_price: 5,
    promo_details: [{ retailer_promotion_id: 'promo-a', description: '2ª unidad -50%', online_only: true }] };
  const restored = restoreCheckpoint({ version: 2, products: [a], offerNextIndex: 10,
    campaigns: [{ id: 'promo-a', onlineOnly: true }] });
  assert.equal(a.promo_price, 4);
  assert.equal(a.promo_base_price, 5);
  assert.equal(a.raw.price.current.amount, '4');
  assert.equal(a.promo_online_only, false);
  assert.equal(restored.campaigns.get('promo-a').onlineOnly, false);
  assert.equal(restored.completed.size, 0);
});

test('enriquecer, serializar y reanudar conserva rebaja y precio unitario', () => {
  const a = row(product('a'));
  enrichProductPromotion(a, product('a', '4', '5'));
  assert.equal(a.promo_price, 4);
  assert.equal(a.promo_base_price, 5);
  assert.equal(a.unit_price, 4);
  assert.equal(a.price_per_unit, 4);
  const restored = restoreCheckpoint(JSON.parse(JSON.stringify({ version: CHECKPOINT_VERSION, products: [a],
    completed: ['offer:promo-a'], seenProductIds: ['a'] })));
  assert.equal(restored.products.get('a').promo_price, 4);
  assert.equal(restored.products.get('a').promo_base_price, 5);
  assert.ok(restored.completed.has('offer:promo-a'));
  assert.ok(restored.seenProductIds.has('a'));
});

test('otra landing sin tachado no borra la rebaja al mismo precio; un precio nuevo sí', () => {
  const a = row(product('a', '4', '5'));
  enrichProductPromotion(a, product('a', '4'));
  assert.equal(a.promo_base_price, 5);
  enrichProductPromotion(a, { productId: 'a', name: 'Producto a', price: { amount: '6' } });
  assert.equal(a.unit_price, 6);
  assert.equal(a.promo_price, null);
  assert.equal(a.price_per_unit, null);
});

test('decoración API guarda el precio final y €/kg promocional', () => {
  const a = row(product('a'));
  enrichProductPromotion(a, { productId: 'a', price: { amount: '5' }, promoPrice: { amount: '4' },
    unitPrice: { price: { amount: '10' }, unit: 'fop.price.per.kg' },
    promoUnitPrice: { price: { amount: '8' }, unit: 'fop.price.per.kg' } });
  assert.equal(a.unit_price, 4);
  assert.equal(a.price_per_unit, 8);
  assert.equal(a.promo_base_price, 5);
});

test('exclusividad online se aplica solo al ID acreditado, sin contaminar campañas vecinas', () => {
  const entity = { offers: [
    { retailerPromotionId: 'a', description: 'Campaña A' },
    { retailerPromotionId: 'b', description: 'Campaña B' },
  ] };
  const source = { sourceOnlineOnly: true, sourcePromotionId: 'a', sourcePath: '/offers/x/a' };
  const details = extractAlcampoPromotionDetails(entity, source);
  assert.deepEqual(details.map((p) => p.online_only), [true, false]);
  const campaigns = new Map();
  discoverCampaigns(campaigns, entity, source);
  assert.equal(campaigns.get('a').onlineOnly, true);
  assert.equal(campaigns.get('b').onlineOnly, false);
  assert.ok(extractAlcampoPromotionDetails(entity, { sourceOnlineOnly: true }).every((p) => !p.online_only));
});

test('cola dinámica procesa campañas descubiertas después sin repetir las completadas', async () => {
  const campaigns = new Map(), completed = new Set(), visited = [];
  discoverCampaigns(campaigns, { offers: [{ retailerPromotionId: 'z', description: 'Z' }] });
  const tasks = () => [...campaigns.values()].map((c) => ({ key: c.id }));
  await runPending(tasks, completed, async (task) => {
    visited.push(task.key);
    if (task.key === 'z') discoverCampaigns(campaigns, { offers: [{ retailerPromotionId: 'a', description: 'A' }] });
  }, async () => {});
  assert.deepEqual(visited, ['z', 'a']);
  await runPending(tasks, completed, () => assert.fail('no debe repetir'), async () => {});
});

test('cabecera parcial de campaña no borra metadatos presentes en el producto', () => {
  const [result] = mergeAlcampoPromotionDetails(
    [{ retailer_promotion_id: 'a', description: '3x2', required_product_quantity: 3, type: 'MULTIBUY', promo_end: '2026-10-08' }],
    [{ retailer_promotion_id: 'a', description: '3x2', required_product_quantity: null, type: null, promo_end: null }],
  );
  assert.equal(result.required_product_quantity, 3);
  assert.equal(result.type, 'MULTIBUY');
  assert.equal(result.promo_end, '2026-10-08');
});

test('timeout agotado mantiene página pendiente y no ejecuta publicación', async () => {
  const completed = new Set(); let calls = 0, saves = 0, published = false;
  await assert.rejects(async () => {
    await runPending(() => [{ key: 'a' }], completed,
      () => withRetries(async () => { calls++; throw new Error('Timeout'); }),
      async () => { saves++; });
    published = true;
  }, /Timeout/);
  assert.equal(calls, 3);
  assert.equal(saves, 0);
  assert.equal(completed.size, 0);
  assert.equal(published, false);
  await runPending(() => [{ key: 'a' }], completed, async () => {}, async () => { saves++; });
  assert.ok(completed.has('a'));
  assert.equal(saves, 1);
});

test('un fallo transitorio se recupera sin repetir una página ya confirmada', async () => {
  let calls = 0;
  const result = await withRetries(async () => { if (++calls < 3) throw new Error('503'); return 'ok'; });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
});

test('SSR cuenta referencias del listado, excluyendo recomendaciones ajenas', async () => {
  const initial = parseListing(stateHtml({ productGroups: [{ products: ['a'] }] }, { a: product('a'), other: product('other') }), 'catalog');
  const entities = await completeListing(initial, { kind: 'catalog', requestJson: () => assert.fail() });
  assert.deepEqual(Object.keys(entities), ['a']);
});

test('SSR de 300 IDs y 50 entidades decora los 250 restantes', async () => {
  const ids = Array.from({ length: 300 }, (_, i) => `p${i}`);
  const entities = Object.fromEntries(ids.slice(0, 50).map((id) => [id, product(id)]));
  const initial = parseListing(stateHtml({ productGroups: [{ products: ids }] }, entities), 'promotion');
  const calls = [];
  const all = await completeListing(initial, { kind: 'promotion', requestJson: async (url, method, body) => {
    calls.push({ url, method, size: body.length });
    return { products: body.map((id) => product(id)) };
  } });
  assert.equal(Object.keys(all).length, 300);
  assert.equal(calls.length, 5);
  assert.ok(calls.every((c) => c.method === 'PUT' && c.size === 50 && c.url.endsWith('/v6/products')));
});

test('paginación real PPWS/PQL combina decoratedProducts y otherProductIds hasta agotar cursor', async () => {
  const first = { ids: ['a'], entities: { a: product('a') }, nextPageToken: 'cursor&+', regionId: 'r' };
  const calls = [];
  const all = await completeListing(first, { kind: 'promotion', categoryId: 'OC1', requestJson: async (url, method) => {
    calls.push(url);
    if (method === 'PUT') return { products: [product('c')] };
    assert.equal(new URL(url, 'https://test').searchParams.get('pageToken'), 'cursor&+');
    assert.equal(new URL(url, 'https://test').searchParams.get('regionId'), 'r');
    return { metadata: {}, productGroups: [{ decoratedProducts: [product('b')], otherProductIds: ['c'] }] };
  } });
  assert.deepEqual(Object.keys(all), ['a', 'b', 'c']);
  assert.ok(calls[0].startsWith('/api/product-listing-pages/v1/pages/promotions?'));
});

test('una decoración incompleta o bloqueada no permite confirmar la página', async () => {
  const initial = { ids: ['a', 'b'], entities: { a: product('a') } };
  await assert.rejects(completeListing(initial, { kind: 'catalog', requestJson: async () => ({ products: [] }) }), /incompleta/);
  await assert.rejects(completeListing(initial, { kind: 'catalog', requestJson: async () => { throw new Error('HTTP 403'); } }), /403/);
});

test('cursor repetido, límite o contrato desconocido bloquean la cobertura', async () => {
  const initial = { ids: ['a'], entities: { a: product('a') }, nextPageToken: 'same' };
  await assert.rejects(completeListing(initial, { kind: 'catalog', requestJson: async () => ({
    metadata: { nextPageToken: 'same' }, productGroups: [{ decoratedProducts: [product('b')], otherProductIds: [] }],
  }) }), /sin avance/);
  await assert.rejects(completeListing(initial, { kind: 'offer', requestJson: async () => {} }), /no soportado/);
  assert.throws(() => parseApiListing({ productGroups: [], metadata: null }), /metadata/);
  assert.throws(() => parseListing('<html>Error</html>', 'catalog'), /estado inicial/);
  assert.throws(() => parseListing(stateHtml({ retailerPromotionId: 'wrong', promotionGroups: [] }, {}, 'offer'), 'offer', 'expected'), /otra campaña/);
});

test('landing verifica todos sus grupos y exige decorar miembros sin datos', async () => {
  const html = stateHtml({ retailerPromotionId: 'p', promotionGroups: [{ products: ['a', 'b'] }, { products: ['b', 'c'] }] },
    { a: product('a') }, 'offer');
  const initial = parseListing(html, 'offer', 'p');
  const all = await completeListing(initial, { kind: 'offer', requestJson: async (_, __, ids) => ({ products: ids.map((id) => product(id)) }) });
  assert.deepEqual(Object.keys(all), ['a', 'b', 'c']);
});

test('producto alimentario descubierto en promoción se clasifica sin requerir catálogo previo', () => {
  const names = new Map([['root', 'Frescos'], ['child', 'Frutas']]);
  const parents = new Map([['child', 'root']]);
  const roots = new Set(['Frescos']);
  assert.deepEqual(resolveFoodCategory(product('new'), names, parents, roots), { n1: 'root', n2: 'child' });
  assert.equal(resolveFoodCategory({ categoryPath: ['Droguería'] }, names, parents, roots), null);
  assert.throws(() => resolveFoodCategory({}, names, parents, roots), /sin categoría/);
});

test('checkpoint se reemplaza completo y puede reanudarse por ID', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alcampo-test-'));
  try {
    const path = join(dir, 'checkpoint.json');
    await saveCheckpoint(path, { version: CHECKPOINT_VERSION, products: [row(product('a'))], completed: [] });
    await saveCheckpoint(path, { version: CHECKPOINT_VERSION, products: [row(product('a'))], completed: ['offer:promo-a'] });
    const restored = restoreCheckpoint(JSON.parse(await readFile(path, 'utf8')));
    assert.ok(restored.completed.has('offer:promo-a'));
    assert.ok(restored.campaigns.has('promo-a'));
  } finally {
    for (const name of ['checkpoint.json', 'checkpoint.json.tmp']) {
      await unlink(join(dir, name)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    }
    await rmdir(dir);
  }
});
