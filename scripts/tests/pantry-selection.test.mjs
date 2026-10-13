import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

function load(path, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}

const layout = load('../../src/lib/pantryLayout.ts');
const milk = { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' };
const item = { instanceId: 'milk-1', product: milk, ...layout.defaultPantryPlacement(0) };

function harness(initialItems = [item], options = {}) {
  const state = [];
  let cursor = 0;
  let memoCursor = 0;
  const memos = [];
  const stock = {
    pantry: { items: initialItems, shelfCount: 3, writes: 0 },
    fridge: { items: options.fridgeItems ?? [], shelfCount: 3, writes: 0 },
  };
  const actions = Object.fromEntries(Object.entries(stock).map(([section, store]) => [section, {
    addShelf: () => { store.shelfCount++; store.items = layout.normalizePantryItems(store.items, store.shelfCount); store.writes++; },
    update: (fn) => {
      const changed = fn(store.items);
      if (changed === store.items) return;
      store.items = layout.normalizePantryItems(changed, store.shelfCount);
      store.writes++;
    },
  }]));
  const cartWrites = [];
  const productRequests = [];
  const native = { requireExternalGestureToFail() { return native; } };
  const { PantryScreenContent } = load('../../src/screens/PantryScreen.tsx', {
    'react/jsx-runtime': { jsx, jsxs },
    react: {
      memo: (fn) => fn, useContext: () => null, useCallback: (fn) => fn,
      useMemo: (fn, deps) => {
        const index = memoCursor++;
        if (!memos[index] || deps.some((dep, i) => !Object.is(dep, memos[index].deps[i]))) {
          memos[index] = { deps, value: fn() };
        }
        return memos[index].value;
      },
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
    },
    '@react-navigation/native': { useNavigation: () => ({ navigate() {} }) },
    '@expo/vector-icons/Ionicons': 'Icon',
    'react-native': { ActivityIndicator: 'ActivityIndicator', Keyboard: { dismiss() {} }, Platform: { OS: 'ios' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', FlatList: 'FlatList', Text: 'Text', View: 'View',
      StyleSheet: { create: (styles) => styles }, useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) },
    'react-native-gesture-handler': { Gesture: { Native: () => native }, GestureDetector: 'GestureDetector' },
    '../components/bottom-tabs-pager/PagerGestureContext': { PagerGestureContext: {} },
    '../components/PantryProductPicker': 'PantryProductPicker',
    '../components/PantryShelf': 'PantryShelf',
    '../components/PantryProductFocus': 'PantryProductFocus',
    '../components/StoreProductModal': 'StoreProductModal',
    '../components/PantryWoodBackground': 'PantryWoodBackground',
    '../components/PantryFridge': 'PantryFridge',
    '../components/SlidingSegments': 'SlidingSegments',
    '../components/ProductImage': 'ProductImage',
    '../constants/colors': { colors: { white: '#fff', paper: '#fbf6ee' } },
    '../constants/typography': { fonts: {} },
    '../context/LanguageContext': { useTranslation: () => ({ t: (key) => key }) },
    '../api/catalog': { fetchProductMirror: async () => ({ wh: 'bcn1', categoryName: 'Lácteos' }) },
    '../api/mercadona': { fetchProduct: async (id, wh) => {
      productRequests.push({ id, wh });
      if (options.fetchError) throw new Error('offline');
      return { id, display_name: milk.name, thumbnail: 'https://example.com/photo.jpg',
        price_instructions: { unit_price: '1.25' }, categories: [{ name: 'Leche y huevos' }] };
    } },
    '../context/CartContext': { useCart: () => ({ activeCart: options.noCart ? null : { groupName: 'Casa' },
      addToActiveCart: async (items) => {
        if (options.cartError) throw new Error('cart failure');
        cartWrites.push(...items);
      } }) },
    '../context/AuthContext': { useAuth: () => ({ session: null }) },
    '../context/ThemeContext': { useThemedStyles: (factory) => factory(), useTheme: () => ({ scheme: 'light' }) },
    '../hooks/useTabBarBottomPadding': { useTabBarBottomPadding: () => 100 },
    '../hooks/usePantryLayout': { usePantryLayout: (_userId, section = 'pantry') => ({ ...stock[section],
      ready: !options.unready?.includes(section), loadError: options.loadErrors?.includes(section),
      saveError: options.saveErrors?.includes(section), ...actions[section] }) },
    '../lib/pantryLayout': layout,
  });
  return { render: () => { cursor = 0; memoCursor = 0; return PantryScreenContent({ userId: 'test-user' }); },
    saved: (section = 'pantry') => stock[section].items,
    writes: (section = 'pantry') => stock[section].writes,
    shelfCount: (section = 'pantry') => stock[section].shelfCount, cartWrites, productRequests };
}

function nodes(element, includeHidden = false) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap((child) => nodes(child, includeHidden));
  if (!includeHidden && element.props?.accessibilityElementsHidden) return [];
  if (typeof element.type === 'function') return nodes(element.type(element.props), includeHidden);
  const children = element.type === 'FlatList' ? [element.props.ListHeaderComponent,
    element.props.data.slice(0, element.props.initialNumToRender).map((item) => element.props.renderItem({ item })),
    element.props.ListFooterComponent, !element.props.data.length && element.props.ListEmptyComponent]
    : element.type === 'PantryFridge' ? element.props.footer : element.props?.children;
  return [element, ...nodes(children, includeHidden)];
}
const byId = (tree, id) => nodes(tree).find((node) => node.props.testID === id);
const byType = (tree, type) => nodes(tree).find((node) => node.type === type);
const selectorFor = (tree, key) => nodes(tree).find((node) => node.type === 'SlidingSegments'
  && node.props.segments.some((segment) => segment.key === key));

test('switching pantry views preserves stock and list actions target only the selected copy', () => {
  const second = { ...item, instanceId: 'milk-2', ...layout.defaultPantryPlacement(1) };
  const h = harness([item, second]);
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  const list = h.render();
  assert.equal(byType(list, 'PantryShelf'), undefined);
  assert.ok(byId(list, 'pantry-list-item-milk-1'));
  assert.ok(byId(list, 'pantry-list-item-milk-2'));
  assert.equal(h.writes(), 0);
  byId(list, 'pantry-list-item-milk-2').props.onPress();
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.deepEqual(h.saved(), [item]);
  selectorFor(h.render(), 'cupboard').props.onChange('cupboard');
  assert.deepEqual(byType(h.render(), 'PantryShelf').props.items, [item]);
  assert.equal(h.writes(), 1);
});

test('Despensa and Nevera have separate content without changing saved pantry products', () => {
  const h = harness([item]);
  const initial = h.render();
  assert.equal(byId(initial, 'pantry-view-title'), undefined);
  assert.ok(selectorFor(initial, 'cupboard'));
  assert.ok(nodes(byId(initial, 'pantry-header')).includes(selectorFor(initial, 'fridge')));
  assert.ok(nodes(byId(initial, 'pantry-header')).includes(selectorFor(initial, 'cupboard')));
  assert.ok(!nodes(byType(initial, 'ScrollView')).includes(selectorFor(initial, 'cupboard')));
  selectorFor(initial, 'fridge').props.onChange('fridge');
  const fridge = h.render();
  assert.ok(byId(fridge, 'pantry-fridge'));
  assert.equal(byType(fridge, 'PantryShelf'), undefined);
  assert.equal(selectorFor(fridge, 'cupboard'), undefined);
  assert.equal(h.writes(), 0);
  selectorFor(fridge, 'fridge').props.onChange('pantry');
  assert.deepEqual(byType(h.render(), 'PantryShelf').props.items, [item]);
  assert.equal(h.writes(), 0);
});

test('the button below the shelves adds successive usable shelves without moving existing items', () => {
  const h = harness();
  const initial = h.render();
  const order = nodes(byType(initial, 'ScrollView'));
  assert.ok(order.indexOf(byId(initial, 'pantry-add-shelf')) > order.indexOf(byType(initial, 'PantryShelf')));
  for (const shelfCount of [4, 5]) {
    byId(h.render(), 'pantry-add-shelf').props.onPress();
    const shelf = byType(h.render(), 'PantryShelf');
    assert.equal(shelf.props.shelfCount, shelfCount);
    assert.deepEqual(h.saved()[0], item);
    shelf.props.onAddAt(layout.pantrySlotPlacement(2, shelfCount - 1, shelfCount));
    byType(h.render(), 'PantryProductPicker').props.onSelect(milk);
    assert.equal(h.saved().at(-1).shelfIndex, shelfCount - 1);
  }
  assert.equal(h.saved().length, 3);
});

test('opening and closing focus keep shelf layout and saved positions unchanged', () => {
  const h = harness();
  const initial = h.render();
  const before = byType(initial, 'ScrollView');
  const shelf = byType(initial, 'PantryShelf');
  shelf.props.onSelect(item.instanceId);
  const selected = h.render();
  const after = byType(selected, 'ScrollView');
  assert.deepEqual(after.props.contentContainerStyle, before.props.contentContainerStyle);
  assert.deepEqual(nodes(after).map((node) => node.type), nodes(before).map((node) => node.type));
  assert.equal(byId(after, 'pantry-selection-tools'), undefined);
  assert.equal(byId(selected, 'pantry-selection-tools'), undefined);
  const focus = byType(selected, 'PantryProductFocus');
  assert.equal(focus.props.product, milk);
  assert.equal(byType(after, 'PantryProductFocus'), undefined);
  focus.props.onReady();
  assert.equal(byType(h.render(), 'PantryShelf').props.hiddenId, item.instanceId);
  assert.equal(h.writes(), 0);
  assert.deepEqual(h.saved(), [item]);
  focus.props.onClose();
  const finished = h.render();
  assert.equal(byType(finished, 'PantryProductFocus'), undefined);
  assert.equal(byType(finished, 'PantryShelf').props.hiddenId, null);
  assert.equal(h.writes(), 0);
  assert.deepEqual(byType(finished, 'ScrollView').props.contentContainerStyle, before.props.contentContainerStyle);
});

test('the pantry product information button opens its Mercadona detail without changing the pantry', () => {
  const h = harness();
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  const focus = byType(h.render(), 'PantryProductFocus');
  assert.equal(typeof focus.props.onShowDetails, 'function');
  focus.props.onShowDetails();
  const detail = byType(h.render(), 'StoreProductModal');
  assert.deepEqual(detail.props.target, { store: 'mercadona', id: milk.id });
  assert.deepEqual(h.saved(), [item]);
  assert.equal(h.writes(), 0);
  detail.props.onClose();
  assert.equal(byType(h.render(), 'StoreProductModal').props.target, null);
  assert.ok(byType(h.render(), 'PantryProductFocus'));
});

test('the focused product panel shows the supermarket above the name and an information control beside it', () => {
  const source = readFileSync(new URL('../../src/components/PantryProductFocus.tsx', import.meta.url), 'utf8');
  assert.match(source, /styles\.storeRow[\s\S]*STORE_META\.mercadona\.name[\s\S]*STORE_META\.mercadona\.icon/);
  assert.match(source, /styles\.nameRow[\s\S]*styles\.name[\s\S]*testID="pantry-focus-details"/);
  assert.match(source, /name="information-circle-outline"/);
});

test('adding a product preserves the existing scene and opens no selection toolbar', () => {
  const h = harness();
  const initial = h.render();
  const padding = byType(initial, 'ScrollView').props.contentContainerStyle;
  byType(initial, 'PantryShelf').props.onAddAt({ ...layout.pantrySlotPlacement(3, 1), x: 0.7 });
  const picker = byType(h.render(), 'PantryProductPicker');
  picker.props.onSelect(milk);
  const added = h.render();
  assert.equal(h.saved().length, 2);
  assert.equal(h.saved()[1].shelfIndex, 1);
  assert.deepEqual(h.saved()[0], item);
  assert.deepEqual(byType(added, 'ScrollView').props.contentContainerStyle, padding);
  assert.equal(byId(added, 'pantry-remove'), undefined);
  assert.equal(byId(added, 'pantry-finish'), undefined);
  assert.equal(byType(added, 'PantryProductFocus'), undefined);
});

test('shelf slots add the sixth and eleventh products to the extra shelves', () => {
  for (const count of [5, 10]) {
    const existing = Array.from({ length: count }, (_, i) => ({
      instanceId: `milk-${i}`, product: milk, ...layout.defaultPantryPlacement(i),
    }));
    const h = harness(existing);
    const initial = h.render();
    byType(initial, 'PantryShelf').props.onAddAt(layout.pantrySlotPlacement(0, count / 5));
    byType(h.render(), 'PantryProductPicker').props.onSelect(milk);
    assert.equal(h.saved().length, count + 1);
    assert.deepEqual(h.saved().slice(0, count), existing);
    assert.equal(h.saved()[count].shelfIndex, count / 5);
    assert.equal(byId(h.render(), 'pantry-no-space'), undefined);
  }
});

test('explicit bottom slot remains on the chosen shelf even while the top has room', () => {
  const h = harness();
  const target = layout.pantrySlotPlacement(4, 2);
  byType(h.render(), 'PantryShelf').props.onAddAt(target);
  byType(h.render(), 'PantryProductPicker').props.onSelect(milk);
  assert.deepEqual(h.saved()[1], { ...h.saved()[1], ...target });
  const allFull = Array.from({ length: 15 }, (_, i) => ({
    instanceId: `full-${i}`, product: milk, ...layout.defaultPantryPlacement(i),
  }));
  const full = harness(allFull);
  byType(full.render(), 'PantryShelf').props.onAddAt(target);
  byType(full.render(), 'PantryProductPicker').props.onSelect(milk);
  assert.deepEqual(full.saved(), allFull);
  assert.ok(byId(full.render(), 'pantry-no-space'));
});


test('finished removes only the selected instance, preserving other copies and placements', () => {
  const other = { ...item, ...layout.defaultPantryPlacement(1), instanceId: 'milk-2' };
  const h = harness([item, other]);
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.deepEqual(h.saved(), [other]);
  assert.equal(h.writes(), 1);
  assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
  assert.deepEqual(h.cartWrites, []);
});

test('adding from pantry uses the product warehouse and sends category, price and identifiers without consuming stock', async () => {
  const h = harness();
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  await byType(h.render(), 'PantryProductFocus').props.onAddToCart();
  assert.deepEqual(h.productRequests, [{ id: milk.id, wh: 'bcn1' }]);
  assert.deepEqual(h.cartWrites, [{ storeKey: 'mercadona', productName: 'Leche', quantity: 1, unit: 'ud',
    categoryName: 'Leche y huevos', unitPrice: 1.25, imageUrl: 'https://example.com/photo.jpg',
    mercadonaProductId: milk.id, storeProductId: milk.id }]);
  assert.deepEqual(h.saved(), [item]);
  assert.equal(h.writes(), 0);
});

test('missing cart and network or cart errors preserve pantry stock and report failure', async () => {
  for (const options of [{ noCart: true }, { fetchError: true }, { cartError: true }]) {
    const h = harness([item], options);
    byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
    await assert.rejects(byType(h.render(), 'PantryProductFocus').props.onAddToCart,
      new RegExp(options.noCart ? 'product.noCartMsg' : 'product.addErrorSingle'));
    assert.deepEqual(h.saved(), [item]);
    assert.equal(h.writes(), 0);
    assert.deepEqual(h.cartWrites, []);
    if (options.noCart) assert.deepEqual(h.productRequests, []);
  }
});


test('view changes retain the cupboard subtree and geometry while hiding its touches and accessibility', () => {
  const h = harness();
  const initial = h.render();
  const cupboard = byId(initial, 'pantry-cupboard');
  const shelf = byType(initial, 'PantryShelf');
  const scroll = byType(initial, 'ScrollView');
  assert.equal(byType(initial, 'FlatList'), undefined, 'list stays lazy until visited');
  selectorFor(initial, 'cupboard').props.onChange('list');
  const list = h.render();
  const hidden = nodes(list, true).find((node) => node.props.testID === 'pantry-cupboard');
  const retainedShelf = nodes(hidden, true).find((node) => node.type === 'PantryShelf');
  assert.equal(hidden.key, cupboard.key);
  assert.equal(hidden.props.pointerEvents, 'none');
  assert.equal(hidden.props.accessibilityElementsHidden, true);
  assert.equal(hidden.props.importantForAccessibility, 'no-hide-descendants');
  assert.equal(retainedShelf.key, shelf.key);
  assert.equal(retainedShelf.props.items, shelf.props.items);
  assert.equal(nodes(hidden, true).find((node) => node.type === 'ScrollView').key, scroll.key);
  selectorFor(list, 'cupboard').props.onChange('cupboard');
  const returned = h.render();
  assert.equal(byType(returned, 'PantryShelf').props.items, shelf.props.items);
  assert.equal(byId(returned, 'pantry-cupboard').props.pointerEvents, 'auto');
  assert.equal(h.writes(), 0);
});

test('list renders a bounded initial batch and preserves the saved order, copies and overflow', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ ...item, instanceId: `copy-${i}`,
    ...layout.defaultPantryPlacement(i) }));
  const h = harness(items);
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  const tree = h.render();
  const list = byType(tree, 'FlatList');
  assert.equal(list.props.data.length, 100);
  assert.equal(new Set(list.props.data.map(list.props.keyExtractor)).size, 100);
  assert.equal(nodes(tree).filter((node) => node.props.testID?.startsWith('pantry-list-item-')).length, 10);
  assert.equal(list.props.data.at(-1).instanceId, 'copy-99');
  assert.equal(h.writes(), 0);
  const last = nodes(list.props.renderItem({ item: list.props.data.at(-1) }));
  assert.match(last[0].props.accessibilityLabel, /pantry.pendingLocation/);
  last[0].props.onPress();
  assert.equal(byType(h.render(), 'PantryProductFocus').props.product, milk);
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.equal(h.saved().length, 99);
  assert.equal(h.saved().some((entry) => entry.instanceId === 'copy-99'), false);
});

test('fridge add, move, extra shelves and consume stay independent from the cupboard', () => {
  const h = harness([item]);
  const originalPantry = structuredClone(h.saved());
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.deepEqual(byType(h.render(), 'PantryFridge').props.items, []);
  for (const slot of [1, 3]) {
    byType(h.render(), 'PantryFridge').props.onAddAt(layout.pantrySlotPlacement(slot, 1));
    const picker = byType(h.render(), 'PantryProductPicker');
    assert.equal(picker.props.section, 'fridge');
    picker.props.onSelect(milk);
  }
  const [first, second] = h.saved('fridge');
  assert.notEqual(first.instanceId, second.instanceId);
  assert.equal(first.shelfIndex, 1);
  byType(h.render(), 'PantryFridge').props.onPlace(first.instanceId, layout.pantrySlotPlacement(4, 2));
  assert.equal(h.saved('fridge')[0].shelfIndex, 2);
  assert.deepEqual(h.saved('fridge')[1], second);
  byType(h.render(), 'PantryFridge').props.onAddShelf();
  assert.equal(h.shelfCount('fridge'), 4);
  assert.equal(h.shelfCount(), 3);
  byType(h.render(), 'PantryFridge').props.onAddAt(layout.pantrySlotPlacement(2, 3, 4));
  byType(h.render(), 'PantryProductPicker').props.onSelect(milk);
  assert.equal(h.saved('fridge').at(-1).shelfIndex, 3);
  byType(h.render(), 'PantryFridge').props.onSelect(first.instanceId);
  assert.equal(byType(h.render(), 'PantryProductFocus').props.section, 'fridge');
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.equal(h.saved('fridge').length, 2);
  assert.equal(h.saved('fridge').some((entry) => entry.instanceId === first.instanceId), false);
  const savedFridge = structuredClone(h.saved('fridge'));
  selectorFor(h.render(), 'fridge').props.onChange('pantry');
  assert.deepEqual(byType(h.render(), 'PantryShelf').props.items, originalPantry);
  assert.equal(h.writes(), 0);
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.deepEqual(byType(h.render(), 'PantryFridge').props.items, savedFridge);
  assert.equal(byType(h.render(), 'PantryFridge').props.shelfCount, 4);
});

test('late drag callbacks and identical instance IDs still target their original section', () => {
  const fridgeItem = { ...item, ...layout.pantrySlotPlacement(3, 1) };
  const h = harness([item], { fridgeItems: [fridgeItem] });
  const pantryMove = byType(h.render(), 'PantryShelf').props.onPlace;
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  pantryMove(item.instanceId, layout.pantrySlotPlacement(0, 2));
  assert.equal(h.saved()[0].shelfIndex, 2);
  assert.deepEqual(h.saved('fridge'), [fridgeItem]);
  byType(h.render(), 'PantryFridge').props.onSelect(item.instanceId);
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.deepEqual(h.saved('fridge'), []);
  assert.equal(h.saved().length, 1);
  assert.equal(h.saved()[0].shelfIndex, 2);
});

test('switching sections dismisses the picker and preserves both mounted inventories', () => {
  const fridgeItem = { ...item, instanceId: 'fridge-copy' };
  const h = harness([item], { fridgeItems: [fridgeItem] });
  byType(h.render(), 'PantryShelf').props.onAddAt(layout.pantrySlotPlacement(2));
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  const hiddenCupboard = nodes(h.render(), true).find((node) => node.props.testID === 'pantry-cupboard');
  assert.deepEqual(nodes(hiddenCupboard, true).find((node) => node.type === 'PantryShelf').props.items, [item]);
  const scene = byType(h.render(), 'PantryFridge');
  selectorFor(h.render(), 'fridge').props.onChange('pantry');
  const hiddenFridge = nodes(h.render(), true).find((node) => node.props.testID === 'pantry-fridge');
  assert.equal(hiddenFridge.props.pointerEvents, 'none');
  assert.equal(hiddenFridge.props.accessibilityElementsHidden, true);
  assert.equal(nodes(hiddenFridge, true).find((node) => node.type === 'PantryFridge').props.items, scene.props.items);
  assert.equal(h.writes(), 0);
  assert.equal(h.writes('fridge'), 0);
});

test('a fridge load failure disables only its editor and uses its own error message', () => {
  const h = harness([item], { unready: ['fridge'], loadErrors: ['fridge'] });
  assert.equal(byType(h.render(), 'PantryShelf').props.canAdd, true);
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.equal(byType(h.render(), 'PantryFridge').props.canAdd, false);
  assert.ok(nodes(h.render()).some((node) => Array.isArray(node.props.children)
    && node.props.children.includes('pantry.fridgeLoadError')));
  selectorFor(h.render(), 'fridge').props.onChange('pantry');
  assert.equal(byType(h.render(), 'PantryShelf').props.canAdd, true);
  assert.deepEqual(h.saved(), [item]);
});

test('adding from the fridge to the cart preserves both inventories and includes the category', async () => {
  const h = harness([item], { fridgeItems: [{ ...item, instanceId: 'cold-milk' }] });
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  byType(h.render(), 'PantryFridge').props.onSelect('cold-milk');
  await byType(h.render(), 'PantryProductFocus').props.onAddToCart();
  assert.equal(h.cartWrites[0].categoryName, 'Leche y huevos');
  assert.equal(h.saved().length, 1);
  assert.equal(h.saved('fridge').length, 1);
  assert.equal(h.writes(), 0);
  assert.equal(h.writes('fridge'), 0);
});
