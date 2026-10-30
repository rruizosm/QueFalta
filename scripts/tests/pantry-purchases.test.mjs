import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

function load(file, dependencies) {
  const module = { exports: {} };
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  new Function('require', 'module', 'exports', outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const layout = load('../../src/lib/pantryLayout.ts', {});
const item = (storeKey, id, extra = {}) => ({ storeKey, productName: `Producto ${id}`, quantity: 2,
  unitPrice: 123.45, [storeKey === 'mercadona' ? 'mercadonaProductId' : 'storeProductId']: id, ...extra });
const illustration = (id, url = 'https://example.com/art.webp') => ({ id, illustration_url: url });

function api(tables, error = null) {
  const calls = [];
  const { resolvePantryPurchaseProducts } = load('../../src/api/pantry.ts', {
    '../lib/supabase': { supabase: { from(table) {
      const call = { table }; calls.push(call);
      const builder = {
        select(columns) { call.columns = columns; return builder; },
        in(column, ids) { call.column = column; call.ids = ids; return builder; },
        returns() { return builder; },
        abortSignal(signal) { call.signal = signal; return builder; },
        then(resolve) { return Promise.resolve({ data: (tables[table] ?? []).filter(row => call.ids.includes(row.id)), error }).then(resolve); },
      };
      return builder;
    } } },
    '../lib/pantryLayout': layout,
    '../constants/regions': { REGION_ALL: 'ES', REGION_MERCADONA_NAME: {} },
  });
  return { resolve: resolvePantryPurchaseProducts, calls };
}

test('purchase products use retailer/id, preserve archived names/order/copies and require valid illustrations', async () => {
  const client = api({ mercadona_products: [illustration('same'), illustration('empty', ''),
    illustration('invalid', 'http://example.com/art.webp'), illustration('null', null)],
  lidl_product_master: [illustration('same', 'https://example.com/lidl.webp'), illustration('123_ES')] });
  const items = [item('lidl', 'same'), item('mercadona', 'same', { productName: 'Nombre archivado' }),
    item('mercadona', 'empty'), item('carrefour', 'same'), item('mercadona', 'missing'),
    item('mercadona', 'invalid'), item('mercadona', 'null'), item('lidl', '123_ES'), item('mercadona', 'same')];
  const signal = new AbortController().signal;
  const result = await client.resolve(items, signal);
  assert.equal(result.length, items.length);
  assert.equal(result[0].store, 'lidl');
  assert.equal(result[0].illustrationUrl, 'https://example.com/lidl.webp');
  assert.equal(result[1].name, 'Nombre archivado');
  assert.equal(result[1].store, 'mercadona');
  assert.deepEqual(result.slice(2, 7), [null, null, null, null, null]);
  assert.equal(result[7].id, '123_ES');
  assert.equal(result[8].id, 'same');
  assert.equal(result[8].unitPrice, undefined);
  assert.equal(client.calls.length, 3);
  assert.ok(client.calls.every(call => call.column === 'id' && call.columns.startsWith('id, illustration_url, thumbnail') && call.signal === signal));
  assert.equal(client.calls.find(call => call.table === 'mercadona_products').ids.filter(id => id === 'same').length, 1);
});

test('Carrefour purchases resolve archived numeric and fprod identities and reject excluded categories', async () => {
  const client = api({ carrefour_products: [
    { ...illustration('520664611'), thumbnail: 'https://example.com/original.jpg', category_name: 'Alimentación' },
    { ...illustration('fprod123'), category_name: 'Lácteos' },
    { ...illustration('paper'), category_name: 'Papelería' },
    { ...illustration('bazar'), category_name: 'Otra', category_ids: ['cat20037'] },
    { ...illustration('shoes'), category_id: 'cat20038' },
  ] });
  const result = await client.resolve(['520664611', 'fprod123', 'paper', 'bazar', 'shoes'].map(id => item('carrefour', id)));
  assert.equal(result[0].store, 'carrefour');
  assert.equal(result[0].originalImageUrl, 'https://example.com/original.jpg');
  assert.equal(result[1].id, 'fprod123');
  assert.deepEqual(result.slice(2), [null, null, null]);
  assert.equal(client.calls[0].table, 'carrefour_products');
});

test('unsupported retailers, custom items and empty purchases do not query unrelated catalogues', async () => {
  const client = api({});
  assert.deepEqual(await client.resolve([item('aldi', '1'), item('mercadona', null), item('lidl', null)]), [null, null, null]);
  assert.deepEqual(await client.resolve([]), []);
  assert.equal(client.calls.length, 0);
});

test('purchases preserve package contents separately from stock quantity through persistence', async () => {
  const client = api({ mercadona_products: [{ ...illustration('123'), packaging: 'Bandeja', size_instructions: { unit_size: 0.5, size_format: 'kg' } }],
    lidl_product_master: [{ ...illustration('456_ES'), packaging: '1 L' }] });
  const products = await client.resolve([item('mercadona', '123'), item('lidl', '456_ES')]);
  assert.deepEqual(products.map(product => product.metaLabel), ['500 g', '1 L']);
  const saved = layout.decodePantryLayout(layout.encodePantryLayout({ shelfCount: 4,
    items: products.map((product, index) => ({ instanceId: `package-${index}`, product, quantity: 2,
      ...layout.defaultPantryPlacement(index) })) }));
  assert.deepEqual(saved.items.map(entry => [entry.product.metaLabel, entry.quantity]), [['500 g', 2], ['1 L', 2]]);
  assert.ok(client.calls.find(call => call.table === 'mercadona_products').columns.includes('size_instructions:raw->price_instructions'));
  assert.ok(client.calls.find(call => call.table === 'lidl_product_master').columns.includes('packaging'));
});

test('large purchases batch exact ids and allow a legacy Mercadona store_product_id', async () => {
  const items = Array.from({ length: 205 }, (_, i) => item('mercadona', String(i)));
  items.push(item('mercadona', null, { storeProductId: 'legacy' }));
  const client = api({ mercadona_products: [...items.slice(0, 205).map(it => illustration(it.mercadonaProductId)), illustration('legacy')] });
  const result = await client.resolve(items);
  assert.equal(result.length, 206);
  assert.ok(result.every(Boolean));
  assert.deepEqual(client.calls.map(call => call.ids.length), [100, 100, 6]);
  assert.equal(result.at(-1).id, 'legacy');
});

test('catalogue failure rejects instead of mislabelling a purchase as unavailable', async () => {
  const failure = new Error('offline');
  await assert.rejects(api({}, failure).resolve([item('mercadona', '1')]), error => error === failure);
});

function harness(fetchItems, resolveProducts, { addResult = true, measureReady = true } = {}) {
  let cursor = 0, effectCursor = 0, refCursor = 0;
  const state = [], effects = [], refs = [], selected = [];
  const translations = { 'pantry.productUnavailable': 'Producto no disponible para añadir a la despensa',
    'pantry.addNamedProduct': 'Añadir {{name}} a la despensa' };
  const Component = load('../../src/components/PantryPurchaseProducts.tsx', {
    'react/jsx-runtime': { jsx, jsxs },
    react: {
      useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
      useEffect(create, deps) {
        const index = effectCursor++, previous = effects[index];
        if (!previous || deps.some((dep, i) => dep !== previous.deps[i])) {
          previous?.cleanup?.();
          effects[index] = { deps, create };
        }
      },
    },
    'react-native': { ActivityIndicator: 'Spinner', Image: 'Image', Pressable: 'Pressable', Text: 'Text', View: 'View',
      StyleSheet: { create: styles => styles } },
    '@expo/vector-icons/Ionicons': 'Icon',
    './PantryImageBoundsProbe': 'PantryImageBoundsProbe',
    '../hooks/usePantryAddMeasurements': { usePantryAddMeasurements: products => ({ ready: measureReady, bounds: new Map(products.map(p => [p.illustrationUrl, { left: .225, top: 0, right: .775, bottom: 1 }])), urls: [], onBounds() {} }) },
    '../api/purchases': { fetchPurchaseItems: fetchItems },
    '../api/pantry': { resolvePantryPurchaseProducts: resolveProducts },
    '../constants/colors': { colors: {} },
    '../constants/typography': { fonts: {} },
    '../context/ThemeContext': { useThemedStyles: factory => factory() },
    '../context/LanguageContext': { useTranslation: () => ({ t: (key, params) =>
      (translations[key] ?? key).replace('{{name}}', params?.name ?? '') }) },
  }).default;
  return {
    selected,
    render(purchaseId = 'A', section = 'pantry') {
      cursor = 0; effectCursor = 0; refCursor = 0;
      const tree = Component({ purchaseId, section, onAddPurchase: products => { selected.push(products); return addResult; } });
      for (const effect of effects) if (effect.create) { effect.cleanup = effect.create(); effect.create = null; }
      return tree;
    },
    unmount() { for (const effect of effects) effect.cleanup?.(); },
  };
}

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  const children = typeof tree.props?.children === 'function' ? tree.props.children({ pressed: false }) : tree.props?.children;
  return [tree, ...[].concat(children ?? []).flat(Infinity).flatMap(nodes)];
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test('a single footer button adds the available purchase with quantities; rows have no actions or prices', async () => {
  const product = { id: '1', store: 'mercadona', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' };
  const h = harness(async () => [item('mercadona', '1'), item('carrefour', '2')], async () => [product, null]);
  assert.equal(h.render().type, 'Spinner');
  await settle();
  const all = nodes(h.render());
  const available = all.find(node => node.props.testID === 'pantry-purchase-product-0');
  const unavailable = all.find(node => node.props.testID === 'pantry-purchase-product-1');
  assert.equal(available.type, 'View');
  assert.equal(unavailable.type, 'View');
  assert.equal(available.props.onPress, undefined);
  assert.equal(unavailable.props.onPress, undefined);
  const buttons = all.filter(node => node.type === 'Pressable');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.testID, 'pantry-add-purchase');
  assert.equal(buttons[0].props.disabled, false);
  buttons[0].props.onPress();
  buttons[0].props.onPress();
  assert.deepEqual(h.selected, [[{ product, quantity: 2 }]]);
  const text = all.filter(node => node.type === 'Text').flatMap(node => node.props.children).join(' ');
  assert.ok(text.includes('Producto no disponible para añadir a la despensa'));
  assert.ok(!text.includes('123.45') && !text.includes('€'));
  assert.equal(all.filter(node => node.type === 'Indicator').length, 0);
  h.unmount();
});

test('a purchase with no available products keeps the single add button disabled', async () => {
  const h = harness(async () => [item('carrefour', '1')], async () => [null]);
  h.render(); await settle();
  const button = nodes(h.render()).find(node => node.props.testID === 'pantry-add-purchase');
  assert.equal(button.props.disabled, true);
  button.props.onPress();
  assert.equal(h.selected.length, 0);
  h.unmount();
});

test('insufficient pantry space keeps the purchase open and allows retrying the whole batch', async () => {
  const product = { id: '1', store: 'mercadona', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' };
  const h = harness(async () => [item('mercadona', '1')], async () => [product], { addResult: false });
  h.render(); await settle();
  nodes(h.render()).find(node => node.props.testID === 'pantry-add-purchase').props.onPress();
  let all = nodes(h.render());
  assert.ok(all.some(node => node.props.children === 'pantry.noSpace'));
  all.find(node => node.props.testID === 'pantry-add-purchase').props.onPress();
  assert.equal(h.selected.length, 2);
  h.unmount();
});

test('a failed illustration request shows a retry and can recover', async () => {
  let attempts = 0;
  const h = harness(async () => [item('mercadona', '1')], async () => {
    if (++attempts === 1) throw new Error('offline');
    return [null];
  });
  h.render(); await settle();
  let all = nodes(h.render());
  assert.ok(all.some(node => node.props.children === 'history.detailError'));
  assert.ok(!all.some(node => node.props.children === 'Producto no disponible para añadir a la despensa'));
  all.find(node => node.type === 'Pressable').props.onPress();
  h.render(); await settle();
  all = nodes(h.render());
  assert.ok(all.some(node => node.props.children === 'Producto no disponible para añadir a la despensa'));
  assert.equal(attempts, 2);
  h.unmount();
});

test('switching purchases aborts old requests and ignores late responses', async () => {
  const pending = {}, signals = {};
  const h = harness((id, signal) => { signals[id] = signal; return new Promise(resolve => { pending[id] = resolve; }); }, async items => items.map(() => null));
  h.render('A'); h.render('B');
  assert.equal(signals.A.aborted, true);
  pending.B([item('lidl', 'B')]); await settle();
  pending.A([item('mercadona', 'A')]); await settle();
  const all = nodes(h.render('B'));
  assert.ok(all.some(node => node.props.children === 'Producto B'));
  assert.ok(!all.some(node => node.props.children === 'Producto A'));
  h.unmount();
  assert.equal(signals.B.aborted, true);
});


test('fridge purchase footer and unavailable rows describe the fridge destination', async () => {
  const product = { id: '1', store: 'mercadona', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' };
  const h = harness(async () => [item('mercadona', '1'), item('carrefour', '2')], async () => [product, null]);
  h.render('A', 'fridge'); await settle();
  const all = nodes(h.render('A', 'fridge'));
  const add = all.find(node => node.props.testID === 'pantry-add-purchase');
  assert.equal(add.props.accessibilityLabel, 'pantry.addFridgePurchase');
  assert.ok(all.some(node => node.props.children === 'pantry.fridgeProductUnavailable'));
  add.props.onPress();
  assert.deepEqual(h.selected, [[{ product, quantity: 2 }]]);
  h.unmount();
});

test('purchase confirmation cannot save a batch before photos have been measured', async () => {
  const product = { id: '1', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' };
  const h = harness(async () => [item('mercadona', '1')], async () => [product], { measureReady: false });
  h.render(); await settle();
  const button = nodes(h.render()).find(node => node.props.testID === 'pantry-add-purchase');
  assert.equal(button.props.disabled, true);
  button.props.onPress();
  assert.deepEqual(h.selected, []);
  h.unmount();
});
