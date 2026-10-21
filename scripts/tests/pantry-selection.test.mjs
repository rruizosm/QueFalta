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
  let refCursor = 0;
  const refs = [];
  const memos = [];
  const stock = {
    pantry: { items: initialItems, shelfCount: 3, writes: 0 },
    fridge: { items: options.fridgeItems ?? [], shelfCount: 3, writes: 0 },
  };
  const actions = Object.fromEntries(Object.entries(stock).map(([section, store]) => [section, {
    setShelfLabel: (index, label) => {
      store.shelfLabels = layout.updatePantryShelfLabel(store, index, label).shelfLabels;
      store.writes++;
    },
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
      memo: (fn) => fn, useContext: () => null, useCallback: (fn) => fn, useEffect: () => {},
      useRef: (initial) => { const index = refCursor++; return refs[index] ??= { current: initial }; },
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
    'expo-blur': { BlurTargetView: 'View' },
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
    '../api/catalog': { fetchLidlProduct: async (id, storeId) => {
      productRequests.push({ id, storeId });
      if (options.fetchError) throw new Error('offline');
      return { id, displayName: 'Leche Lidl', thumbnail: 'https://example.com/lidl.jpg', unitPrice: 1.5, categoryName: 'Lácteos' };
    }, fetchProductMirror: async () => ({ wh: 'bcn1', categoryName: 'Lácteos' }) },
    '../api/mercadona': { fetchProduct: async (id, wh) => {
      productRequests.push({ id, wh });
      if (options.fetchError) throw new Error('offline');
      return { id, display_name: milk.name, thumbnail: 'https://example.com/photo.jpg',
        price_instructions: { unit_price: '1.25' }, categories: [{ name: 'Leche y huevos' }] };
    } },
    '../context/ProfileContext': { useProfile: () => ({ profile: { lidlStoreId: 'ES3572' } }) },
    '../context/CartContext': { useCart: () => ({ activeCart: options.noCart ? null : { groupName: 'Casa' },
      addToActiveCart: async (items) => {
        if (options.cartError) throw new Error('cart failure');
        cartWrites.push(...items);
      } }) },
    '../context/AuthContext': { useAuth: () => ({ session: null }) },
    '../context/ThemeContext': { useThemedStyles: (factory) => factory(), useTheme: () => ({ scheme: 'light' }) },
    '../hooks/useTabBarBottomPadding': { useTabBarBottomPadding: (designPadding) => designPadding + 84 },
    '../hooks/usePantryLayout': { usePantryLayout: (_userId, section = 'pantry') => ({ ...stock[section],
      ready: !options.unready?.includes(section), loadError: options.loadErrors?.includes(section),
      saveError: options.saveErrors?.includes(section), ...actions[section] }) },
    '../lib/pantryLayout': layout,
    '../lib/pantryExpiryNotifications': { syncPantryExpiryNotifications: async () => {} },
  });
  return { render: () => { cursor = 0; memoCursor = 0; refCursor = 0; return PantryScreenContent({ userId: 'test-user' }); },
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

test('pantry shows food and edit buttons at the lower right in both views', () => {
  const h = harness();
  const cupboard = h.render();
  const add = byId(cupboard, 'pantry-add-product');
  const edit = byId(cupboard, 'pantry-edit');
  assert.equal(add.props.accessibilityLabel, 'pantry.addProduct');
  assert.equal(edit.props.accessibilityLabel, 'pantry.editPantry');
  assert.equal(edit.props.disabled, false);
  assert.equal(typeof edit.props.onPress, 'function');
  assert.equal(add.props.style({ pressed: false })[0].width, 44);
  assert.equal(edit.props.style({ pressed: false })[0].width, 44);
  assert.equal(add.props.children.props.style.width, 34.32);
  assert.equal(edit.props.children.props.style[0].width, 34.32);
  assert.equal(add.props.children.props.children.props.size, 16.5);
  assert.equal(edit.props.children.props.children.props.size, 15.4);
  const actionRow = byId(cupboard, 'pantry-floating-actions');
  assert.ok(Math.abs(actionRow.props.style[1].bottom + (44 - 34.32) / 2 - 84 - 10) < 1e-9);
  assert.equal(byType(cupboard, 'PantryShelf').props.showAddSlots, false);
  selectorFor(cupboard, 'cupboard').props.onChange('list');
  assert.ok(byId(h.render(), 'pantry-add-product'));
  byId(h.render(), 'pantry-add-product').props.onPress();
  assert.equal(byId(h.render(), 'pantry-add-product'), undefined);
  byType(h.render(), 'PantryProductPicker').props.onClose();
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.equal(byId(h.render(), 'pantry-edit'), undefined);
  assert.equal(byId(h.render(), 'pantry-add-product'), undefined);
  assert.equal(typeof byType(h.render(), 'PantryFridge').props.onAddAt, 'function');
});

test('pencil locks products, stale gesture callbacks and adding in cupboard and list until done', () => {
  const h = harness();
  const initial = h.render();
  const staleShelf = byType(initial, 'PantryShelf');
  const staleAdd = byId(initial, 'pantry-add-product');
  byId(initial, 'pantry-edit').props.onPress();
  const editing = h.render();
  assert.equal(byType(editing, 'PantryShelf').props.editingLabels, true);
  assert.equal(byId(editing, 'pantry-add-product').props.disabled, true);
  assert.equal(byId(editing, 'pantry-add-shelf').props.disabled, true);
  assert.equal(byId(editing, 'pantry-edit').props.accessibilityState.selected, true);
  staleShelf.props.onSelect(item.instanceId);
  staleShelf.props.onPlace(item.instanceId, layout.pantrySlotPlacement(3, 1));
  staleAdd.props.onPress();
  assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
  assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  const row = byId(h.render(), 'pantry-list-item-milk-1');
  assert.equal(row.props.disabled, true);
  row.props.onPress();
  assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
  assert.equal(h.writes(), 0);
  assert.deepEqual(h.saved(), [item]);
  byId(h.render(), 'pantry-edit').props.onPress();
  byId(h.render(), 'pantry-list-item-milk-1').props.onPress();
  assert.ok(byType(h.render(), 'PantryProductFocus'));
});

test('shelf labels stay independent from products and appear in list locations', () => {
  const h = harness();
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  byId(h.render(), 'pantry-edit').props.onPress();
  const shelf = byType(h.render(), 'PantryShelf');
  assert.ok(shelf, 'starting from list opens the cupboard editor');
  shelf.props.onChangeShelfLabel(0, { name: 'Desayunos', emoji: '🥣' });
  assert.deepEqual(h.saved(), [item]);
  assert.equal(h.writes(), 1);
  byId(h.render(), 'pantry-edit').props.onPress();
  assert.deepEqual(byType(h.render(), 'PantryShelf').props.shelfLabels, { 0: { name: 'Desayunos', emoji: '🥣' } });
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  const listLabel = byId(h.render(), 'pantry-list-item-milk-1').props.accessibilityLabel;
  assert.match(listLabel, /pantry.oneUnit/);
  assert.doesNotMatch(listLabel, /Desayunos/, 'shelf labels do not replace the independent kitchen location');
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.equal(h.writes('fridge'), 0);
  selectorFor(h.render(), 'fridge').props.onChange('pantry');
  assert.equal(byId(h.render(), 'pantry-add-product').props.disabled, false);
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
    assert.equal(shelf.props.showAddSlots, false);
    assert.equal(shelf.props.onAddAt, undefined);
    byId(h.render(), 'pantry-add-product').props.onPress();
    byType(h.render(), 'PantryProductPicker').props.onSelect(milk);
    assert.equal(h.saved().at(-1).shelfIndex, 0);
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

test('the focused product panel shows an accessible supermarket logo beside the name and an information control', () => {
  const source = readFileSync(new URL('../../src/components/PantryProductFocus.tsx', import.meta.url), 'utf8');
  assert.match(source, /styles\.nameRow[\s\S]*STORE_META\[product\.store \?\? 'mercadona'\]\.icon[\s\S]*accessibilityLabel=\{STORE_META\[product\.store \?\? 'mercadona'\]\.name\}/);
  assert.match(source, /styles\.nameRow[\s\S]*styles\.name[\s\S]*testID="pantry-focus-details"/);
  assert.match(source, /name="information-circle-outline"/);
});

test('adding a product preserves the existing scene and opens no selection toolbar', () => {
  const h = harness();
  const initial = h.render();
  const padding = byType(initial, 'ScrollView').props.contentContainerStyle;
  byId(initial, 'pantry-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  picker.props.onSelect(milk);
  const added = h.render();
  assert.equal(h.saved().length, 2);
  assert.equal(h.saved()[1].shelfIndex, 0);
  assert.deepEqual(h.saved()[0], item);
  assert.deepEqual(byType(added, 'ScrollView').props.contentContainerStyle, padding);
  assert.equal(byId(added, 'pantry-remove'), undefined);
  assert.equal(byId(added, 'pantry-finish'), undefined);
  assert.equal(byType(added, 'PantryProductFocus'), undefined);
});

test('the food button adds the sixth and eleventh products to the next shelf', () => {
  for (const count of [5, 10]) {
    const existing = Array.from({ length: count }, (_, i) => ({
      instanceId: `milk-${i}`, product: milk, ...layout.defaultPantryPlacement(i),
    }));
    const h = harness(existing);
    const initial = h.render();
    byId(initial, 'pantry-add-product').props.onPress();
    byType(h.render(), 'PantryProductPicker').props.onSelect(milk);
    assert.equal(h.saved().length, count + 1);
    assert.deepEqual(h.saved().slice(0, count), existing);
    assert.equal(h.saved()[count].shelfIndex, count / 5);
    assert.equal(byId(h.render(), 'pantry-no-space'), undefined);
  }
});

test('the food button uses a free shelf and reports when all shelves are full', () => {
  const h = harness();
  byId(h.render(), 'pantry-add-product').props.onPress();
  byType(h.render(), 'PantryProductPicker').props.onSelect(milk);
  assert.equal(h.saved()[1].shelfIndex, 0);
  const allFull = Array.from({ length: 15 }, (_, i) => ({
    instanceId: `full-${i}`, product: milk, ...layout.defaultPantryPlacement(i),
  }));
  const full = harness(allFull);
  byId(full.render(), 'pantry-add-product').props.onPress();
  byType(full.render(), 'PantryProductPicker').props.onSelect(milk);
  assert.deepEqual(full.saved(), allFull);
  assert.ok(byId(full.render(), 'pantry-no-space'));
});


test('adding a purchase preserves quantities and existing stock in one write', () => {
  const h = harness();
  byId(h.render(), 'pantry-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  const lidl = { id: '123_ES', store: 'lidl', name: 'Leche Lidl', illustrationUrl: 'https://example.com/lidl.webp' };
  assert.equal(picker.props.onAddPurchase([{ product: milk, quantity: 3 }, { product: lidl, quantity: 2 }]), true);
  assert.deepEqual(h.saved()[0], item);
  assert.deepEqual(h.saved().slice(1).map(it => [it.product, it.quantity]), [[milk, 3], [lidl, 2]]);
  assert.equal(new Set(h.saved().map(it => it.instanceId)).size, 3);
  assert.equal(h.writes(), 1);
  assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  assert.deepEqual(h.saved('fridge'), []);
});

test('a purchase that does not fit is not partially saved and can be retried', () => {
  const existing = Array.from({ length: 14 }, (_, i) => ({ instanceId: `full-${i}`, product: milk, ...layout.defaultPantryPlacement(i) }));
  const h = harness(existing);
  byId(h.render(), 'pantry-add-product').props.onPress();
  let picker = byType(h.render(), 'PantryProductPicker');
  assert.equal(picker.props.onAddPurchase([{ product: milk, quantity: 2 }, { product: milk, quantity: 4 }]), false);
  assert.deepEqual(h.saved(), existing);
  assert.equal(h.writes(), 0);
  picker = byType(h.render(), 'PantryProductPicker');
  assert.ok(picker);
  assert.equal(picker.props.onAddPurchase([{ product: milk, quantity: 2 }]), true);
  assert.equal(h.saved().length, 15);
  assert.equal(h.saved().at(-1).quantity, 2);
  assert.equal(h.writes(), 1);
});

test('empty purchases leave stock unchanged and allow closing the picker', () => {
  const h = harness();
  byId(h.render(), 'pantry-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  assert.equal(picker.props.onAddPurchase([]), false);
  picker.props.onClose();
  h.render();
  assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  assert.deepEqual(h.saved(), [item]);
  assert.equal(h.writes(), 0);
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
  assert.match(last[0].props.accessibilityLabel, /pantry.oneUnit/);
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
  byId(h.render(), 'pantry-add-product').props.onPress();
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

test('editing a selected copy preserves its neighbours, updates the list and survives reopening', () => {
  const neighbour = { ...item, instanceId: 'milk-2', ...layout.defaultPantryPlacement(1) };
  const h = harness([item, neighbour], { fridgeItems: [item] });
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  const focus = byType(h.render(), 'PantryProductFocus');
  assert.equal(focus.props.quantity, 1);
  assert.equal(focus.props.notes, '');
  focus.props.onEdit({ quantity: 4 });
  byType(h.render(), 'PantryProductFocus').props.onEdit({ notes: 'Reservar\npara el desayuno' });
  byType(h.render(), 'PantryProductFocus').props.onClose();
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  const reopened = byType(h.render(), 'PantryProductFocus');
  assert.equal(reopened.props.quantity, 4);
  assert.equal(reopened.props.notes, 'Reservar\npara el desayuno');
  assert.deepEqual(h.saved()[1], neighbour);
  assert.deepEqual(h.saved('fridge'), [item]);
  reopened.props.onClose();
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  assert.match(byId(h.render(), `pantry-list-item-${item.instanceId}`).props.accessibilityLabel, /pantry.units/);
  assert.equal(h.writes('fridge'), 0);
});

test('kitchen location edits affect only the selected copy and preserve shelf placement, notes and quantity', () => {
  const edited = { ...item, quantity: 3, notes: 'Abierto' };
  const neighbour = { ...item, instanceId: 'milk-2', ...layout.pantrySlotPlacement(0, 1) };
  const h = harness([edited, neighbour]);
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  const focus = byType(h.render(), 'PantryProductFocus');
  focus.props.onEdit({ kitchenLocation: 'Armario alto' });
  assert.equal(h.saved()[0].kitchenLocation, 'Armario alto');
  assert.equal(h.saved()[0].shelfIndex, edited.shelfIndex);
  assert.equal(h.saved()[0].quantity, 3);
  assert.equal(h.saved()[0].notes, 'Abierto');
  assert.deepEqual(h.saved()[1], neighbour);
  assert.equal(byType(h.render(), 'PantryProductFocus').props.kitchenLocation, 'Armario alto');
});

test('late detail edits remain bound to their inventory and clamp quantities and notes', () => {
  const h = harness([item], { fridgeItems: [item] });
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  const editPantry = byType(h.render(), 'PantryProductFocus').props.onEdit;
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  editPantry({ quantity: 10000, notes: 'x'.repeat(900) });
  assert.equal(h.saved()[0].quantity, 999);
  assert.equal(h.saved()[0].notes.length, layout.PANTRY_MAX_NOTES_LENGTH);
  byType(h.render(), 'PantryFridge').props.onSelect(item.instanceId);
  byType(h.render(), 'PantryProductFocus').props.onEdit({ quantity: 0, notes: 'Frío' });
  assert.equal(h.saved('fridge')[0].quantity, 1);
  assert.equal(h.saved('fridge')[0].notes, 'Frío');
  assert.equal(h.saved()[0].quantity, 999);
});


test('a Lidl pantry copy opens Lidl details and replenishes Lidl with its category', async () => {
  const lidl = { ...item, product: { ...milk, store: 'lidl', id: '8806215264107_ES' } };
  const h = harness([lidl]);
  byType(h.render(), 'PantryShelf').props.onSelect(lidl.instanceId);
  const focus = byType(h.render(), 'PantryProductFocus');
  focus.props.onShowDetails();
  assert.deepEqual(byType(h.render(), 'StoreProductModal').props.target, { store: 'lidl', id: lidl.product.id });
  await focus.props.onAddToCart();
  assert.deepEqual(h.productRequests, [{ id: lidl.product.id, storeId: 'ES3572' }]);
  assert.equal(h.cartWrites[0].storeKey, 'lidl');
  assert.equal(h.cartWrites[0].storeProductId, lidl.product.id);
  assert.equal(h.cartWrites[0].categoryName, 'Lácteos');
  assert.equal(h.cartWrites[0].mercadonaProductId, undefined);
  assert.deepEqual(h.saved(), [lidl]);
});
