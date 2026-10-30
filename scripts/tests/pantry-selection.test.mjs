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
const cartonGeometry = { visibleBounds: { left: .225, top: 0, right: .775, bottom: 1 }, boundsImageUrl: milk.illustrationUrl };
const measuredDefault = (index, shelfCount = 3) => layout.compactPantryRow(
  Array.from({ length: index % 5 + 1 }, () => ({ x: 0, y: 0, size: .28, visibleBounds: cartonGeometry.visibleBounds })),
  Math.floor(index / 5) % shelfCount, shelfCount).at(-1);
const item = { instanceId: 'milk-1', product: milk, ...cartonGeometry, ...measuredDefault(0) };

function harness(initialItems = [item], options = {}) {
  const state = [];
  let cursor = 0;
  let memoCursor = 0;
  let refCursor = 0;
  const refs = [];
  const memos = [];
  const stock = {
    pantry: { items: initialItems, shelfCount: options.shelfCount ?? 3, writes: 0 },
    fridge: { items: options.fridgeItems ?? [], shelfCount: options.shelfCount ?? 3, writes: 0 },
  };
  const actions = Object.fromEntries(Object.entries(stock).map(([section, store]) => [section, {
    removeShelf: (index) => {
      const next = layout.removePantryShelf(store, index);
      if (next === store) return;
      Object.assign(store, next);
      store.writes++;
    },
    setShelfLabel: (index, label) => {
      store.shelfLabels = layout.updatePantryShelfLabel(store, index, label).shelfLabels;
      store.writes++;
    },
    setImageBounds: (url, bounds) => {
      const next = layout.updatePantryImageBounds(store.items, url, bounds);
      if (next === store.items) return;
      store.items = layout.normalizePantryItems(next, store.shelfCount);
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
  const { PantryScreenContent, default: PantryScreen } = load('../../src/screens/PantryScreen.tsx', {
    'react/jsx-runtime': { jsx, jsxs },
    react: {
      memo: (fn) => fn, useContext: () => null, useCallback: (fn) => fn,
      useEffect: fn => { options.effects?.push(fn); },
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
    'react-native': { Alert: { alert: (...args) => options.alerts?.push(args) }, ActivityIndicator: 'ActivityIndicator', Keyboard: { dismiss() {} }, Platform: { OS: 'ios' },
      Pressable: 'Pressable', ScrollView: 'ScrollView', FlatList: 'FlatList', Text: 'Text', View: 'View',
      StyleSheet: { create: (styles) => styles }, useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) },
    'react-native-gesture-handler': { Gesture: { Native: () => native }, GestureDetector: 'GestureDetector' },
    '../components/bottom-tabs-pager/PagerGestureContext': { PagerGestureContext: {} },
    '../components/PantryProductPicker': props => jsx('PantryProductPicker', { ...props,
      onConfirm: (products, choices, bounds = new Map(products.map(product => [product.illustrationUrl, cartonGeometry.visibleBounds]))) => props.onConfirm(products, choices, bounds),
      onAddPurchase: (products, bounds = new Map(products.map(({ product }) => [product.illustrationUrl, cartonGeometry.visibleBounds]))) => props.onAddPurchase(products, bounds),
    }),
    '../components/PantryPendingPopover': props => jsx('PendingPopover', { ...props, accessibilityElementsHidden: !props.open }),
    '../components/PantryShelf': 'PantryShelf',
    '../components/PantryImageBoundsProbe': 'PantryImageBoundsProbe',
    '../lib/prefetchProductImages': { prefetchPantryImages: uris => {
      options.prefetches?.push(uris);
      return () => { options.cancelledPrefetches?.push(uris); };
    } },
    '../components/PantryProductFocus': 'PantryProductFocus',
    '../components/PantryNoteButton': 'PantryNoteButton',
    '../components/PantryExpiryAlarm': 'PantryExpiryAlarm',
    '../hooks/usePantryToday': { usePantryToday: () => '2026-10-27' },
    '../components/StoreProductModal': 'StoreProductModal',
    '../components/PantryWoodBackground': 'PantryWoodBackground',
    '../components/PantryFridge': 'PantryFridge',
    '../components/PaywallModal': 'PaywallModal',
    '../constants/limits': { FREE_PANTRY_SHELF_LIMIT: 2, limitsApply: premium => !premium },
    '../components/SlidingSegments': 'SlidingSegments',
    '../components/ProductImage': 'ProductImage',
    '../constants/colors': { colors: { white: '#fff', paper: '#fbf6ee' } },
    '../constants/typography': { fonts: {} },
    '../context/LanguageContext': { useTranslation: () => ({ t: (key) => key }) },
    '../api/catalog': { fetchLidlProduct: async (id, storeId) => {
      productRequests.push({ id, storeId });
      if (options.fetchError) throw new Error('offline');
      return { id, displayName: 'Leche Lidl', thumbnail: 'https://example.com/lidl.jpg', unitPrice: 1.5, categoryName: 'Lácteos' };
    }, fetchCarrefourProduct: async (id, region) => {
      productRequests.push({ id, region });
      if (options.fetchError) throw new Error('offline');
      return { id, displayName: 'Caldo Carrefour', thumbnail: 'https://example.com/carrefour.jpg', unitPrice: 1.95, categoryName: 'Sopas' };
    }, fetchProductMirror: async () => ({ wh: 'bcn1', categoryName: 'Lácteos' }) },
    '../api/mercadona': { fetchProduct: async (id, wh) => {
      productRequests.push({ id, wh });
      if (options.fetchError) throw new Error('offline');
      return { id, display_name: milk.name, thumbnail: 'https://example.com/photo.jpg',
        price_instructions: { unit_price: '1.25' }, categories: [{ name: 'Leche y huevos' }] };
    } },
    '../context/ProfileContext': { useProfile: () => ({ isPremium: options.isPremium ?? true, profile: { lidlStoreId: 'ES3572', region: 'CT' } }) },
    '../context/CartContext': { useCart: () => ({ hydrated: options.hydrated !== false, activeCart: options.noCart ? null : { groupId: options.groupId ?? 'home', groupName: 'Casa' },
      addToActiveCart: async (items) => {
        if (options.cartError) throw new Error('cart failure');
        cartWrites.push(...items);
      } }) },
    '../context/AuthContext': { useAuth: () => ({ session: { user: { id: options.userId ?? 'test-user' } } }) },
    '../context/ThemeContext': { useThemedStyles: (factory) => factory(), useTheme: () => ({ scheme: 'light' }) },
    '../hooks/useTabBarBottomPadding': { useTabBarBottomPadding: (designPadding) => designPadding + 84 },
    '../hooks/usePantryInventory': { usePantryInventory: (_userId, section = 'pantry') => ({ ...stock[section],
      ready: !options.unready?.includes(section), loadError: options.loadErrors?.includes(section),
      saveError: options.saveErrors?.includes(section), ...actions[section] }) },
    '../lib/pantryLayout': layout,
    '../lib/pantryExpiryNotifications': { syncPantryExpiryNotifications: async () => {} },
  });
  return { owner: () => PantryScreen(), render: () => { cursor = 0; memoCursor = 0; refCursor = 0; return PantryScreenContent({ userId: 'test-user' }); },
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
  const second = { ...item, instanceId: 'milk-2', ...measuredDefault(1) };
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
  assert.ok(selectorFor(fridge, 'cupboard'));
  assert.equal(selectorFor(fridge, 'cupboard').props.segments[0].accessibilityLabel, 'pantry.fridgeView');
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
  assert.equal(add.props.children.props.style[0].width, 34.32);
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
  assert.equal(byType(h.render(), 'PantryFridge').props.showAddSlots, false);
  assert.ok(byId(h.render(), 'fridge-add-product'));
  assert.ok(byId(h.render(), 'fridge-edit'));
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
    byType(h.render(), 'PantryProductPicker').props.onConfirm([milk]);
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
  const opened = h.render();
  const detail = byType(opened, 'StoreProductModal');
  assert.equal(byType(byType(opened, 'PantryProductFocus').props.children, 'StoreProductModal'), detail,
    'catalog details must be presented from inside the active focus modal on iOS');
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
  picker.props.onConfirm([milk]);
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
      instanceId: `milk-${i}`, product: milk, ...cartonGeometry, ...measuredDefault(i),
    }));
    const h = harness(existing);
    const initial = h.render();
    byId(initial, 'pantry-add-product').props.onPress();
    byType(h.render(), 'PantryProductPicker').props.onConfirm([milk]);
    assert.equal(h.saved().length, count + 1);
    assert.deepEqual(h.saved().slice(0, count), existing);
    assert.equal(h.saved()[count].shelfIndex, count / 5);
    assert.equal(byId(h.render(), 'pantry-no-space'), undefined);
  }
});

test('the food button uses a free shelf and reports when all shelves are full', () => {
  const h = harness();
  byId(h.render(), 'pantry-add-product').props.onPress();
  byType(h.render(), 'PantryProductPicker').props.onConfirm([milk]);
  assert.equal(h.saved()[1].shelfIndex, 0);
  const allFull = Array.from({ length: 15 }, (_, i) => ({
    instanceId: `full-${i}`, product: milk, ...cartonGeometry, ...measuredDefault(i),
  }));
  const full = harness(allFull);
  byId(full.render(), 'pantry-add-product').props.onPress();
  byType(full.render(), 'PantryProductPicker').props.onConfirm([milk]);
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

test('a purchase saves what fits and keeps overflow behind an image-only button on the left', () => {
  const existing = Array.from({ length: 14 }, (_, i) => ({ instanceId: `full-${i}`, product: milk, ...cartonGeometry, ...measuredDefault(i) }));
  const h = harness(existing);
  assert.equal(byId(h.render(), 'pantry-pending-products'), undefined);
  byId(h.render(), 'pantry-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  assert.equal(picker.props.onAddPurchase([{ product: milk, quantity: 2 }, { product: milk, quantity: 4 }]), true);
  assert.deepEqual(h.saved().slice(0, 14), existing);
  assert.equal(h.saved().length, 16);
  assert.equal(h.writes(), 1);
  assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  const scene = layout.arrangePantryItems(h.saved());
  assert.equal(scene.placed.length, 15);
  assert.equal(scene.unplaced.length, 1);
  assert.equal(scene.unplaced[0].quantity, 4);
  const saved = layout.decodePantryLayout(layout.encodePantryLayout({ items: h.saved(), shelfCount: 3 }));
  assert.equal(layout.arrangePantryItems(saved.items).unplaced[0].quantity, 4);
  let tree = h.render();
  assert.equal(byId(tree, 'pantry-unplaced'), undefined);
  byId(tree, 'pantry-pending-products').props.onPress();
  tree = h.render();
  assert.equal(byId(tree, 'pantry-pending-products').props.accessibilityState.expanded, true);
  const panel = byId(tree, 'pantry-unplaced');
  assert.equal(nodes(panel).filter(node => node.type === 'ProductImage').length, 1);
  assert.equal(nodes(panel).filter(node => node.type === 'Text').length, 2);
  assert.equal(nodes(panel).some(node => node.type === 'Text' && node.props.children === milk.name), false);
  assert.equal(byId(tree, `pantry-pending-${scene.unplaced[0].instanceId}`).props.onPress, undefined);
  byId(tree, 'pantry-close-pending').props.onPress();
  byId(h.render(), 'pantry-add-shelf').props.onPress();
  assert.equal(layout.arrangePantryItems(h.saved(), h.shelfCount()).unplaced.length, 0);
  assert.equal(byId(h.render(), 'pantry-pending-products'), undefined);
});

test('full purchases retain all copies, quantities and section isolation, and recover after a deletion', () => {
  for (const section of ['pantry', 'fridge']) {
    const full = Array.from({ length: 15 }, (_, i) => ({ ...item, instanceId: `full-${i}`, ...measuredDefault(i) }));
    const h = harness(section === 'pantry' ? full : [], { fridgeItems: section === 'fridge' ? full : [] });
    if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange('fridge');
    byId(h.render(), `${section}-add-product`).props.onPress();
    assert.equal(byType(h.render(), 'PantryProductPicker').props.onAddPurchase([{ product: milk, quantity: 7 }]), true);
    assert.equal(h.saved(section).length, 16);
    assert.equal(layout.arrangePantryItems(h.saved(section)).unplaced[0].quantity, 7);
    assert.equal(h.writes(section), 1);
    const otherSection = section === 'pantry' ? 'fridge' : 'pantry';
    assert.deepEqual(h.saved(otherSection), []);
    selectorFor(h.render(), otherSection).props.onChange(otherSection);
    assert.equal(byId(h.render(), `${otherSection}-pending-products`), undefined);
    selectorFor(h.render(), section).props.onChange(section);
    byId(h.render(), `${section}-delete-products`).props.onPress();
    byType(h.render(), section === 'pantry' ? 'PantryShelf' : 'PantryFridge').props.onRemove(full[0].instanceId);
    assert.equal(h.saved(section).length, 15);
    assert.equal(byId(h.render(), `${section}-pending-products`), undefined);
    assert.ok(h.saved(section).some(entry => entry.quantity === 7));
  }
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
  const other = { ...item, ...measuredDefault(1), instanceId: 'milk-2' };
  const h = harness([item, other]);
  byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.deepEqual(h.saved(), [{ ...other, ...measuredDefault(0) }]);
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

test('pantry list matches shelf stock and keeps overflow outside the list', () => {
  const items = Array.from({ length: 100 }, (_, i) => ({ ...item, instanceId: `copy-${i}`,
    ...measuredDefault(i) }));
  const h = harness(items);
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  const tree = h.render();
  const list = byType(tree, 'FlatList');
  const scene = layout.arrangePantryItems(items);
  assert.equal(list.props.data.length, scene.placed.length);
  assert.deepEqual(list.props.data.map(list.props.keyExtractor), scene.placed.map(entry => entry.instanceId));
  assert.equal(new Set(list.props.data.map(list.props.keyExtractor)).size, scene.placed.length);
  assert.ok(scene.unplaced.length > 0);
  assert.ok(scene.unplaced.every(entry => !list.props.data.some(row => row.instanceId === entry.instanceId)));
  assert.equal(nodes(tree).filter((node) => node.props.testID?.startsWith('pantry-list-item-')).length, 10);
  const lastPlacedId = scene.placed.at(-1).instanceId;
  assert.equal(list.props.data.at(-1).instanceId, lastPlacedId);
  assert.equal(h.writes(), 0);
  const last = nodes(list.props.renderItem({ item: list.props.data.at(-1) }));
  assert.match(last[0].props.accessibilityLabel, /pantry.oneUnit/);
  last[0].props.onPress();
  assert.equal(byType(h.render(), 'PantryProductFocus').props.product, milk);
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.equal(h.saved().length, 99);
  assert.equal(h.saved().some((entry) => entry.instanceId === lastPlacedId), false);
});

test('fridge add, move, extra shelves and consume stay independent from the cupboard', () => {
  const h = harness([item]);
  const originalPantry = structuredClone(h.saved());
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.deepEqual(byType(h.render(), 'PantryFridge').props.items, []);
  for (let i = 0; i < 2; i++) {
    byId(h.render(), 'fridge-add-product').props.onPress();
    const picker = byType(h.render(), 'PantryProductPicker');
    assert.equal(picker.props.section, 'fridge');
    picker.props.onConfirm([milk]);
  }
  const [first, second] = h.saved('fridge');
  assert.notEqual(first.instanceId, second.instanceId);
  assert.equal(first.shelfIndex, 0);
  byType(h.render(), 'PantryFridge').props.onPlace(first.instanceId, layout.pantrySlotPlacement(4, 2));
  assert.equal(h.saved('fridge')[0].shelfIndex, 2);
  assert.deepEqual(h.saved('fridge')[1], layout.normalizePantryItems([second])[0]);
  byType(h.render(), 'PantryFridge').props.onAddShelf();
  assert.equal(h.shelfCount('fridge'), 4);
  assert.equal(h.shelfCount(), 3);
  byId(h.render(), 'fridge-add-product').props.onPress();
  byType(h.render(), 'PantryProductPicker').props.onConfirm([milk]);
  assert.equal(h.saved('fridge').at(-1).shelfIndex, 0);
  byType(h.render(), 'PantryFridge').props.onPlace(h.saved('fridge').at(-1).instanceId, layout.pantrySlotPlacement(2, 3, 4));
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
  const neighbour = { ...item, instanceId: 'milk-2', ...measuredDefault(1) };
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
  const neighbour = { ...item, instanceId: 'milk-2', ...measuredDefault(5) };
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

test('Carrefour details and restocking keep store identity, region, current price and category', async () => {
  const carrefour = { ...item, product: { ...milk, store: 'carrefour', id: '520664611' } };
  const h = harness([carrefour]);
  byType(h.render(), 'PantryShelf').props.onSelect(carrefour.instanceId);
  const focus = byType(h.render(), 'PantryProductFocus');
  focus.props.onShowDetails();
  assert.deepEqual(byType(h.render(), 'StoreProductModal').props.target, { store: 'carrefour', id: '520664611' });
  await focus.props.onAddToCart();
  assert.deepEqual(h.productRequests, [{ id: '520664611', region: 'CT' }]);
  assert.equal(h.cartWrites[0].storeKey, 'carrefour');
  assert.equal(h.cartWrites[0].storeProductId, '520664611');
  assert.equal(h.cartWrites[0].categoryName, 'Sopas');
  assert.equal(h.cartWrites[0].unitPrice, 1.95);
  assert.equal(h.cartWrites[0].mercadonaProductId, undefined);
});


test('fridge lists and view choices remain independent even when inventories share an instance ID', () => {
  const cold = { ...item, product: { ...milk, name: 'Leche fría' }, quantity: 3, expiryDate: '2026-11-02' };
  const h = harness([item], { fridgeItems: [cold] });
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  let tree = h.render();
  assert.equal(byId(tree, 'pantry-list'), undefined);
  assert.deepEqual(byId(tree, 'fridge-list').props.data, [cold]);
  assert.equal(byId(tree, 'pantry-list-item-milk-1'), undefined);
  byId(tree, 'fridge-list-item-milk-1').props.onPress();
  const focus = byType(h.render(), 'PantryProductFocus');
  assert.equal(focus.props.section, 'fridge');
  focus.props.onEdit({ quantity: 4, notes: 'Solo nevera' });
  focus.props.onClose();
  assert.equal(h.saved('fridge')[0].quantity, 4);
  assert.deepEqual(h.saved(), [item]);
  selectorFor(h.render(), 'fridge').props.onChange('pantry');
  assert.equal(selectorFor(h.render(), 'cupboard').props.value, 'cupboard');
  assert.deepEqual(byType(h.render(), 'PantryShelf').props.items, [item]);
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.equal(selectorFor(h.render(), 'cupboard').props.value, 'list');
  assert.equal(byId(h.render(), 'fridge-list').props.data[0].notes, 'Solo nevera');
  byId(h.render(), 'fridge-list-item-milk-1').props.onPress();
  byType(h.render(), 'PantryProductFocus').props.onFinish();
  assert.deepEqual(h.saved('fridge'), []);
  assert.deepEqual(h.saved(), [item]);
  assert.equal(h.writes(), 0);
});

test('fridge label editing locks all product actions and saves labels only to the fridge', () => {
  const h = harness([item], { fridgeItems: [item] });
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  const stale = byType(h.render(), 'PantryFridge');
  const staleAdd = byId(h.render(), 'fridge-add-product');
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  byId(h.render(), 'fridge-edit').props.onPress();
  const editor = byType(h.render(), 'PantryFridge');
  assert.equal(editor.props.editingLabels, true);
  assert.equal(byId(h.render(), 'fridge-add-product').props.disabled, true);
  const label = { name: 'Lácteos', emoji: '🥛' };
  editor.props.onChangeShelfLabel(0, label);
  assert.deepEqual(byType(h.render(), 'PantryFridge').props.shelfLabels, { 0: label });
  stale.props.onSelect(item.instanceId);
  stale.props.onPlace(item.instanceId, layout.pantrySlotPlacement(3, 2));
  stale.props.onAddShelf();
  staleAdd.props.onPress();
  assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
  assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  assert.equal(h.shelfCount('fridge'), 3);
  assert.deepEqual(h.saved('fridge'), [item]);
  assert.equal(h.writes('fridge'), 1);
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  assert.equal(byId(h.render(), 'fridge-list-item-milk-1').props.disabled, true);
  byId(h.render(), 'fridge-list-item-milk-1').props.onPress();
  assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
  selectorFor(h.render(), 'fridge').props.onChange('pantry');
  byId(h.render(), 'pantry-edit').props.onPress();
  editor.props.onChangeShelfLabel(1, label);
  assert.equal(h.writes('fridge'), 1, 'late fridge label events cannot write while editing the pantry');
  assert.equal(h.writes(), 0);
  assert.deepEqual(h.saved(), [item]);
});

test('fridge purchase imports retain quantities and save overflow without affecting the pantry', () => {
  const full = Array.from({ length: 14 }, (_, index) => ({ ...item,
    instanceId: `cold-${index}`, ...measuredDefault(index) }));
  const h = harness([item], { fridgeItems: full });
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  byId(h.render(), 'fridge-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  assert.equal(picker.props.onAddPurchase([{ product: milk, quantity: 2 }, { product: milk, quantity: 5 }]), true);
  assert.deepEqual(h.saved('fridge').slice(0, 14), full);
  const scene = layout.arrangePantryItems(h.saved('fridge'));
  assert.equal(scene.placed.length, 15);
  assert.equal(scene.unplaced.length, 1);
  assert.equal(scene.unplaced[0].quantity, 5);
  assert.equal(h.writes('fridge'), 1);
  assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  assert.deepEqual(h.saved(), [item]);
  assert.equal(h.writes(), 0);
});

test('delete mode removes only the tapped instance and saves the correct inventory in cupboard and list', () => {
  const second = { ...item, instanceId: 'milk-2', ...measuredDefault(1) };
  const cold = { ...item, instanceId: 'cold-milk' };
  const h = harness([item, second], { fridgeItems: [cold] });
  byId(h.render(), 'pantry-delete-products').props.onPress();
  const shelf = byType(h.render(), 'PantryShelf');
  assert.equal(typeof shelf.props.onRemove, 'function');
  shelf.props.onRemove(second.instanceId);
  assert.deepEqual(h.saved(), [item]);
  assert.deepEqual(h.saved('fridge'), [cold]);
  assert.equal(h.writes(), 1);
  assert.equal(h.writes('fridge'), 0);
  assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  byId(h.render(), 'pantry-delete-item-milk-1').props.onPress({ stopPropagation() {} });
  assert.deepEqual(h.saved(), []);
  assert.equal(h.writes(), 2);
  assert.equal(byId(h.render(), 'pantry-delete-item-milk-1'), undefined);
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  assert.equal(byId(h.render(), 'fridge-delete-products').props.accessibilityState.selected, false);
  byId(h.render(), 'fridge-delete-products').props.onPress();
  byType(h.render(), 'PantryFridge').props.onRemove(cold.instanceId);
  assert.deepEqual(h.saved('fridge'), []);
  assert.equal(h.writes('fridge'), 1);
  assert.deepEqual(h.saved(), []);
});

test('image measurements reflow the active stock without enabling delete mode and remain section-bound', () => {
  const second = { ...item, instanceId: 'milk-2', ...measuredDefault(1) };
  const h = harness([item, second], { fridgeItems: [item] });
  const decoder = byType(h.render(), 'PantryImageBoundsProbe');
  assert.deepEqual(decoder.props.urls, [milk.illustrationUrl]);
  assert.equal(byId(h.render(), 'pantry-delete-products').props.accessibilityState.selected, false);
  decoder.props.onBounds(milk.illustrationUrl, { left: .02, top: .05, right: .98, bottom: .95 });
  const [first, next] = h.saved();
  assert.ok(next.x - lExtent(next).left >= first.x + lExtent(first).right + layout.PANTRY_PRODUCT_GAP - 1e-9);
  assert.equal(h.saved('fridge')[0], item);
  assert.equal(h.writes(), 1);
  assert.equal(h.writes('fridge'), 0);
  assert.equal(h.saved().every(i => i.size === item.size && i.boundsImageUrl === milk.illustrationUrl), true);
  assert.equal(byType(h.render(), 'PantryImageBoundsProbe').props.urls, decoder.props.urls,
    'metadata changes must not reload the image decoder');
  function lExtent(entry) { return layout.pantryHorizontalExtents(entry); }
});

test('inserting between packed products saves all displaced neighbours and keeps stock details', () => {
  const stock = Array.from({ length: 3 }, (_, i) => ({ ...item, instanceId: `copy-${i}`, ...measuredDefault(i),
    quantity: i + 2, notes: `Nota ${i}`, expiryDate: '2027-01-01' }));
  const h = harness(stock);
  const move = byType(h.render(), 'PantryShelf').props.onPlace;
  move('copy-2', { ...stock[2], x: 0 }, 'copy-0');
  const visual = [...h.saved()].sort((a, b) => a.x - b.x);
  assert.deepEqual(visual.map(i => i.instanceId), ['copy-2', 'copy-0', 'copy-1']);
  assert.equal(h.writes(), 1);
  assert.deepEqual(h.saved().map(i => [i.instanceId, i.quantity, i.notes, i.expiryDate]), stock.map(i => [i.instanceId, i.quantity, i.notes, i.expiryDate]));
  for (let i = 1; i < visual.length; i++) {
    const gap = visual[i].x - layout.pantryHorizontalExtents(visual[i]).left
      - (visual[i - 1].x + layout.pantryHorizontalExtents(visual[i - 1]).right);
    assert.ok(Math.abs(gap - layout.PANTRY_PRODUCT_GAP) < 1e-9);
  }
  const decoder = byType(h.render(), 'PantryImageBoundsProbe');
  decoder.props.onBounds(milk.illustrationUrl, { left: .1, top: .02, right: .9, bottom: .98 });
  // Reuse the callback from before the measurement: commit must use live bounds.
  move('copy-2', { ...stock[2], x: 1 }, null);
  assert.deepEqual([...h.saved()].sort((a, b) => a.x - b.x).map(i => i.instanceId), ['copy-0', 'copy-1', 'copy-2']);
  assert.equal(h.saved().every(i => i.visibleBounds.left === .1 && i.quantity >= 2), true);
});


test('catalog confirmation adds several retailers atomically and preserves existing stock', () => {
  for (const section of ['pantry', 'fridge']) {
    const h = harness();
    if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange('fridge');
    byId(h.render(), `${section}-add-product`).props.onPress();
    const picker = byType(h.render(), 'PantryProductPicker');
    const other = { ...milk, store: 'lidl', illustrationUrl: 'https://example.com/lidl.webp' };
    const before = [...h.saved(section)];
    assert.equal(picker.props.onConfirm([milk, other]), true);
    assert.equal(h.saved(section).length, before.length + 2);
    assert.deepEqual(h.saved(section).slice(0, before.length), before);
    assert.deepEqual(h.saved(section).slice(-2).map(entry => entry.product), [milk, other]);
    assert.equal(byType(h.render(), 'PantryProductPicker'), undefined);
  }
});

test('catalog confirmation rejects the entire selection when only part fits and allows retry', () => {
  const existing = Array.from({ length: 14 }, (_, i) => ({
    instanceId: `full-${i}`, product: milk, ...cartonGeometry, ...measuredDefault(i),
  }));
  const h = harness(existing);
  byId(h.render(), 'pantry-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  assert.equal(picker.props.onConfirm([milk, milk]), false);
  assert.deepEqual(h.saved(), existing);
  assert.ok(byType(h.render(), 'PantryProductPicker'));
  assert.equal(picker.props.onConfirm([milk]), true);
  assert.equal(h.saved().length, 15);
});


function labelShelves(h, section, labels) {
  if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange('fridge');
  byId(h.render(), `${section}-edit`).props.onPress();
  const shelf = byType(h.render(), section === 'fridge' ? 'PantryFridge' : 'PantryShelf');
  for (const [index, label] of Object.entries(labels)) shelf.props.onChangeShelfLabel(Number(index), label);
  byId(h.render(), `${section}-edit`).props.onPress();
}

test('catalog shelf choices use only the active section and keep optional products automatic', () => {
  for (const section of ['pantry', 'fridge']) {
    const h = harness();
    const labels = { 2: { name: 'Conservas', emoji: '🥫' } };
    labelShelves(h, section, labels);
    byId(h.render(), `${section}-add-product`).props.onPress();
    const picker = byType(h.render(), 'PantryProductPicker');
    assert.deepEqual(picker.props.shelfLabels, labels);
    const other = { ...milk, store: 'lidl' };
    const beforeWrites = h.writes(section);
    assert.equal(picker.props.onConfirm([milk, other], new Map([['lidl:10699', 2]])), true);
    const added = h.saved(section).slice(-2);
    assert.equal(added[0].shelfIndex, 0);
    assert.equal(added[1].shelfIndex, 2);
    assert.equal(h.writes(section), beforeWrites + 1);
    assert.equal(h.writes(section === 'pantry' ? 'fridge' : 'pantry'), 0);
  }
});

test('full chosen group rejects the whole selection and an automatic retry can use other groups', () => {
  const existing = Array.from({ length: 5 }, (_, i) => ({ ...item, instanceId: `full-${i}`, ...measuredDefault(i) }));
  const h = harness(existing);
  labelShelves(h, 'pantry', { 0: { name: 'Desayuno', emoji: null }, 1: { name: 'Conservas', emoji: null } });
  byId(h.render(), 'pantry-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  const beforeWrites = h.writes();
  assert.equal(picker.props.onConfirm([milk], new Map([['mercadona:10699', 0]])), false);
  assert.deepEqual(h.saved(), existing);
  assert.equal(h.writes(), beforeWrites);
  assert.ok(byType(h.render(), 'PantryProductPicker'));
  assert.equal(picker.props.onConfirm([milk], new Map()), true);
  assert.equal(h.saved().at(-1).shelfIndex, 1);
});

test('explicit shelf reservations take priority over automatic placement without changing selection order', () => {
  const existing = Array.from({ length: 15 }, (_, i) => ({ ...item, instanceId: `full-${i}`, ...measuredDefault(i) }))
    .filter((_, i) => i !== 4 && i !== 9);
  const h = harness(existing);
  labelShelves(h, 'pantry', { 0: { name: 'Desayuno', emoji: null } });
  byId(h.render(), 'pantry-add-product').props.onPress();
  const picker = byType(h.render(), 'PantryProductPicker');
  const other = { ...milk, store: 'lidl' };
  assert.equal(picker.props.onConfirm([other, milk], new Map([['mercadona:10699', 0]])), true);
  assert.deepEqual(h.saved().slice(-2).map(entry => [entry.product.store, entry.shelfIndex]), [['lidl', 1], [undefined, 0]]);
});

test('shelves without signs, invalid indices and shelves from the other section cannot be assigned', () => {
  for (const index of [0, -1, 3, 1.5]) {
    const h = harness();
    labelShelves(h, 'fridge', { 0: { name: 'Lácteos', emoji: null } });
    selectorFor(h.render(), 'pantry').props.onChange('pantry');
    byId(h.render(), 'pantry-add-product').props.onPress();
    const picker = byType(h.render(), 'PantryProductPicker');
    assert.equal(picker.props.onConfirm([milk], new Map([['mercadona:10699', index]])), false);
    assert.deepEqual(h.saved(), [item]);
    assert.equal(h.writes(), 0);
  }
});

test('product shelf selection inherits the preceding sign and moves only its instance in both inventories', () => {
  for (const section of ['pantry', 'fridge']) {
    const original = { ...item, ...measuredDefault(5), quantity: 4, notes: 'Abierto', expiryDate: '2027-01-01', kitchenLocation: 'Cocina' };
    const h = harness([original], { fridgeItems: [original] });
    const labels = { 0: { name: 'Desayunos', emoji: '🥣' }, 2: { name: 'Conservas', emoji: '🥫' } };
    labelShelves(h, section, labels);
    const surfaceType = section === 'pantry' ? 'PantryShelf' : 'PantryFridge';
    byType(h.render(), surfaceType).props.onSelect(original.instanceId);
    let focus = byType(h.render(), 'PantryProductFocus');
    assert.equal(focus.props.selectedShelfGroup, 0, 'unsigned shelf 1 belongs to sign 0');
    assert.deepEqual(focus.props.shelfLabels, labels);
    const before = h.writes(section);
    assert.equal(focus.props.onChooseShelf(0), true);
    assert.equal(h.writes(section), before, 'choosing the current group preserves physical placement');
    assert.equal(focus.props.onChooseShelf(1), false, 'unsigned continuation is not a separate group');
    assert.equal(focus.props.onChooseShelf(2), true);
    const saved = h.saved(section)[0];
    assert.equal(saved.shelfIndex, 2);
    for (const key of ['quantity', 'notes', 'expiryDate', 'kitchenLocation', 'product', 'visibleBounds', 'boundsImageUrl']) {
      assert.deepEqual(saved[key], original[key], key);
    }
    focus = byType(h.render(), 'PantryProductFocus');
    assert.equal(focus.props.selectedShelfGroup, 2);
    assert.deepEqual(h.saved(section === 'pantry' ? 'fridge' : 'pantry'), [original]);
    focus.props.onClose();
    byType(h.render(), surfaceType).props.onSelect(original.instanceId);
    assert.equal(byType(h.render(), 'PantryProductFocus').props.selectedShelfGroup, 2);
  }
});

test('product shelf selection uses unsigned continuation but never crosses the next sign when full', () => {
  for (const section of ['pantry', 'fridge']) {
    const fullFirst = Array.from({ length: 5 }, (_, index) => ({ ...item, instanceId: `full-${index}`, ...measuredDefault(index) }));
    const moving = { ...item, instanceId: 'moving', ...measuredDefault(10) };
    const h = harness([...fullFirst, moving], { fridgeItems: [...fullFirst, moving] });
    labelShelves(h, section, { 0: { name: 'Desayunos', emoji: null }, 2: { name: 'Conservas', emoji: null } });
    const surfaceType = section === 'pantry' ? 'PantryShelf' : 'PantryFridge';
    byType(h.render(), surfaceType).props.onSelect(moving.instanceId);
    assert.equal(byType(h.render(), 'PantryProductFocus').props.onChooseShelf(0), true);
    assert.equal(h.saved(section).find(entry => entry.instanceId === 'moving').shelfIndex, 1);
    const blocked = harness([...fullFirst, moving], { fridgeItems: [...fullFirst, moving] });
    labelShelves(blocked, section, { 0: { name: 'Desayunos', emoji: null }, 1: { name: 'Otro', emoji: null } });
    byType(blocked.render(), surfaceType).props.onSelect(moving.instanceId);
    const snapshot = structuredClone(blocked.saved(section));
    const writes = blocked.writes(section);
    assert.equal(byType(blocked.render(), 'PantryProductFocus').props.onChooseShelf(0), false);
    assert.deepEqual(blocked.saved(section), snapshot);
    assert.equal(blocked.writes(section), writes);
  }
});

test('catalog selection fills unsigned continuation shelves of the selected sign', () => {
  const full = Array.from({ length: 5 }, (_, index) => ({ ...item, instanceId: `full-${index}`, ...measuredDefault(index) }));
  const h = harness(full);
  labelShelves(h, 'pantry', { 0: { name: 'Desayuno', emoji: null }, 2: { name: 'Conservas', emoji: null } });
  byId(h.render(), 'pantry-add-product').props.onPress();
  assert.equal(byType(h.render(), 'PantryProductPicker').props.onConfirm([milk], new Map([['mercadona:10699', 0]])), true);
  assert.equal(h.saved().at(-1).shelfIndex, 1);
});

test('note buttons in both inventory lists are read-only and disappear in deletion mode', () => {
  const annotated = { ...item, notes: 'Abierto\nConsumir pronto' };
  const h = harness([annotated], { fridgeItems: [annotated] });
  for (const section of ['pantry', 'fridge']) {
    selectorFor(h.render(), section).props.onChange(section);
    selectorFor(h.render(), 'cupboard').props.onChange('list');
    const note = byType(h.render(), 'PantryNoteButton');
    assert.equal(note.props.notes, annotated.notes);
    assert.equal(note.props.testID, `${section}-note-item-${annotated.instanceId}`);
    assert.equal(note.props.enabled, true);
    assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
    assert.equal(h.writes(section), 0);
    byId(h.render(), `${section}-delete-products`).props.onPress();
    assert.equal(byType(h.render(), 'PantryNoteButton'), undefined);
    assert.ok(byId(h.render(), `${section}-delete-item-${annotated.instanceId}`));
    byId(h.render(), `${section}-delete-products`).props.onPress();
    assert.ok(byType(h.render(), 'PantryNoteButton'));
    assert.deepEqual(h.saved(section), [annotated]);
    assert.equal(h.writes(section), 0);
  }
});

test('idle preparation mounts the fridge before selection and cancels speculative image work on cleanup', () => {
  const previousIdle = globalThis.requestIdleCallback;
  const previousCancel = globalThis.cancelIdleCallback;
  const tasks = new Map();
  let nextTask = 0;
  globalThis.requestIdleCallback = fn => { tasks.set(++nextTask, fn); return nextTask; };
  globalThis.cancelIdleCallback = id => tasks.delete(id);
  try {
    const effects = [], prefetches = [], cancelledPrefetches = [];
    const cold = { ...item, instanceId: 'cold', product: { ...milk, illustrationUrl: 'https://example.com/cold.webp' } };
    const h = harness([item], { fridgeItems: [cold], effects, prefetches, cancelledPrefetches });
    assert.equal(nodes(h.render(), true).some(node => node.props?.testID === 'pantry-fridge'), false);
    const cleanups = effects.splice(0).map(fn => fn());
    assert.deepEqual(prefetches, [[milk.illustrationUrl], [cold.product.illustrationUrl]]);
    assert.equal(tasks.size, 1);
    for (const fn of tasks.values()) fn();
    assert.ok(nodes(h.render(), true).some(node => node.props?.testID === 'pantry-fridge'));
    assert.equal(byId(h.render(), 'pantry-fridge'), undefined, 'prepared fridge stays hidden and unfocused');
    assert.equal(h.writes(), 0);
    assert.equal(h.writes('fridge'), 0);
    for (const cleanup of cleanups) cleanup?.();
    assert.equal(tasks.size, 0);
    assert.deepEqual(cancelledPrefetches, prefetches);
  } finally {
    globalThis.requestIdleCallback = previousIdle;
    globalThis.cancelIdleCallback = previousCancel;
  }
});

test('expiry warnings replace list notes in both inventories and opening preserves expiry and notes', () => {
  for (const section of ['pantry', 'fridge']) {
    const annotated = { ...item, notes: 'Conservar', expiryDate: '2026-10-30' };
    const h = harness([annotated], { fridgeItems: [annotated] });
    selectorFor(h.render(), section).props.onChange(section);
    selectorFor(h.render(), 'cupboard').props.onChange('list');
    assert.ok(byId(h.render(), `${section}-expiry-alarm-${annotated.instanceId}`));
    assert.equal(byType(h.render(), 'PantryNoteButton'), undefined);
    byId(h.render(), `${section}-list-item-${annotated.instanceId}`).props.onPress();
    const focus = byType(h.render(), 'PantryProductFocus');
    assert.equal(focus.props.today, '2026-10-27');
    assert.equal(focus.props.expiryDate, annotated.expiryDate);
    assert.equal(focus.props.notes, annotated.notes);
    focus.props.onEdit({ expiryDate: null });
    byType(h.render(), 'PantryProductFocus').props.onClose();
    assert.equal(byId(h.render(), `${section}-expiry-alarm-${annotated.instanceId}`), undefined);
    assert.ok(byType(h.render(), 'PantryNoteButton'));
  }
});


test('the inventory owner remounts for each account/group and waits for cart hydration', () => {
  const options = { groupId: 'home', userId: 'alice' };
  const h = harness([], options);
  const first = h.owner();
  assert.equal(first.props.groupId, 'home');
  options.groupId = 'office';
  assert.notEqual(h.owner().key, first.key);
  const office = h.owner();
  options.userId = 'bob';
  assert.notEqual(h.owner().key, office.key);
  options.hydrated = false;
  assert.equal(h.owner(), null);
  options.hydrated = true; options.noCart = true;
  assert.equal(h.owner().props.groupId, null);
});

test('manual positions survive live commit, image geometry and reload in both inventories', () => {
  for (const section of ['pantry', 'fridge']) {
    const initial = [{ ...item, instanceId: 'one' }, { ...item, instanceId: 'two', ...measuredDefault(1) }];
    const h = harness(initial, { fridgeItems: initial });
    if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange('fridge');
    const shelf = byType(h.render(), section === 'pantry' ? 'PantryShelf' : 'PantryFridge');
    shelf.props.onPlace('two', { ...initial[1], x: .8, manualPosition: true }, null);
    assert.equal(h.saved(section).find(entry => entry.instanceId === 'two').x, .8);
    const decoder = nodes(h.render(), true).filter(node => node.type === 'PantryImageBoundsProbe');
    decoder[section === 'pantry' ? 0 : 1]?.props.onBounds(milk.illustrationUrl, cartonGeometry.visibleBounds);
    assert.equal(h.saved(section).find(entry => entry.instanceId === 'two').x, .8);
    const restored = layout.decodePantryLayout(layout.encodePantryLayout({ items: h.saved(section), shelfCount: 3 }));
    assert.equal(restored.items.find(entry => entry.instanceId === 'two').x, .8);
  }
});

test('nine measured new photos fill shelves by visible width on their first saved layout', () => {
  for (const section of ['pantry', 'fridge']) {
    const h = harness([]);
    if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange('fridge');
    byId(h.render(), `${section}-add-product`).props.onPress();
    const products = Array.from({ length: 9 }, (_, index) => ({ ...milk, id: `new-${index}`, illustrationUrl: `https://example.com/${index}.png` }));
    const bounds = new Map(products.map(product => [product.illustrationUrl, { left: .35, right: .65, top: 0, bottom: 1 }]));
    assert.equal(byType(h.render(), 'PantryProductPicker').props.onConfirm(products, undefined, bounds), true);
    const saved = h.saved(section);
    assert.equal(saved.length, 9);
    assert.ok(saved.every(item => item.shelfIndex === 0));
    assert.ok(saved.every(item => item.visibleBounds && item.boundsImageUrl === item.product.illustrationUrl));
    assert.equal(h.writes(section), 1);
    assert.deepEqual(saved.map(item => item.product.id), products.map(product => product.id));
    assert.ok(Math.abs(saved[0].x - layout.pantryHorizontalExtents(saved[0]).left - layout.PANTRY_SHELF_INSET) < 1e-9);
  }
});

test('unmeasured new photos cannot commit provisional boxes in catalog or purchases', () => {
  for (const purchase of [false, true]) {
    const h = harness([]);
    byId(h.render(), 'pantry-add-product').props.onPress();
    const picker = byType(h.render(), 'PantryProductPicker');
    const product = { ...milk, illustrationUrl: 'https://example.com/unmeasured.png' };
    const result = purchase ? picker.props.onAddPurchase([{ product, quantity: 4 }], new Map())
      : picker.props.onConfirm([product], undefined, new Map());
    assert.equal(result, false);
    assert.equal(h.writes(), 0);
    assert.deepEqual(h.saved(), []);
  }
});

test('purchase batches also allocate using measured widths in their first write', () => {
  const h = harness([]);
  byId(h.render(), 'pantry-add-product').props.onPress();
  const products = Array.from({ length: 9 }, (_, index) => ({ product: { ...milk, id: `purchase-${index}`, illustrationUrl: `https://example.com/purchase-${index}.png` }, quantity: index + 1 }));
  const bounds = new Map(products.map(({ product }) => [product.illustrationUrl, { left: .35, right: .65, top: 0, bottom: 1 }]));
  assert.equal(byType(h.render(), 'PantryProductPicker').props.onAddPurchase(products, bounds), true);
  assert.ok(h.saved().every(item => item.shelfIndex === 0));
  assert.deepEqual(h.saved().map(item => item.quantity), products.map(item => item.quantity));
  assert.equal(h.writes(), 1);
});

test('an overflowing purchase product does not block a smaller product that fits afterward', () => {
  const full = Array.from({ length: 15 }, (_, i) => ({ ...item, instanceId: `full-${i}`, ...measuredDefault(i) }));
  const h = harness(full);
  const wide = { ...milk, id: 'wide', illustrationUrl: 'https://example.com/wide.png' };
  byId(h.render(), 'pantry-add-product').props.onPress();
  const bounds = new Map([[wide.illustrationUrl, { left: 0, top: 0, right: 1, bottom: 1 }],
    [milk.illustrationUrl, { left: .45, top: 0, right: .55, bottom: 1 }]]);
  assert.equal(byType(h.render(), 'PantryProductPicker').props.onAddPurchase([
    { product: wide, quantity: 2 }, { product: milk, quantity: 5 },
  ], bounds), true);
  const scene = layout.arrangePantryItems(h.saved());
  assert.equal(scene.placed.length, 16);
  assert.equal(scene.placed.at(-1).quantity, 5);
  assert.equal(scene.unplaced.length, 1);
  assert.equal(scene.unplaced[0].product.id, 'wide');
});


test('occupied shelf removal requires explicit confirmation in pantry and fridge, including pending stock', () => {
  for (const section of ['pantry', 'fridge']) {
    for (const pendingPlacement of [false, true]) {
      const alerts = [];
      const entry = { ...item, ...(pendingPlacement ? { pendingPlacement: true } : {}) };
      const h = harness([entry], { fridgeItems: [entry], alerts });
      if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange('fridge');
      byId(h.render(), `${section}-edit`).props.onPress();
      const shelf = () => byType(h.render(), section === 'pantry' ? 'PantryShelf' : 'PantryFridge');
      shelf().props.onRemoveShelf(0);
      assert.equal(alerts.length, 1);
      assert.equal(alerts[0][0], 'pantry.removeShelfTitle');
      assert.equal(alerts[0][1], 'pantry.removeShelfMessage');
      assert.equal(h.writes(section), 0);
      assert.equal(h.saved(section).length, 1);
      const cancel = alerts[0][2].find(button => button.style === 'cancel');
      assert.equal(cancel.text, 'common.cancel');
      cancel.onPress?.();
      assert.equal(h.writes(section), 0);
      shelf().props.onRemoveShelf(0);
      const confirm = alerts[1][2].find(button => button.style === 'destructive');
      assert.equal(confirm.text, 'common.delete');
      confirm.onPress();
      assert.equal(h.writes(section), 1);
      assert.deepEqual(h.saved(section), []);
      assert.equal(h.shelfCount(section), 2);
      const other = section === 'pantry' ? 'fridge' : 'pantry';
      assert.equal(h.writes(other), 0);
      assert.equal(h.saved(other).length, 1);
    }
  }
});

test('empty shelf removal stays immediate and a dismissed editor cannot confirm an old alert', () => {
  const alerts = [];
  const h = harness([item], { alerts });
  byId(h.render(), 'pantry-edit').props.onPress();
  byType(h.render(), 'PantryShelf').props.onRemoveShelf(1);
  assert.equal(alerts.length, 0);
  assert.equal(h.shelfCount(), 2);
  byType(h.render(), 'PantryShelf').props.onRemoveShelf(0);
  assert.equal(alerts.length, 1);
  byId(h.render(), 'pantry-edit').props.onPress();
  alerts[0][2].find(button => button.style === 'destructive').onPress();
  assert.equal(h.writes(), 1);
  assert.equal(h.saved().length, 1);
});

test('delete all appears left of delete mode and requires confirmation in each inventory', () => {
  for (const section of ['pantry', 'fridge']) {
    const alerts = [];
    const stock = Array.from({ length: 16 }, (_, i) => ({ ...item, instanceId: `stock-${i}`, ...measuredDefault(i) }));
    const h = harness(stock, { fridgeItems: stock, alerts });
    if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange(section);
    assert.equal(byId(h.render(), `${section}-delete-all`), undefined);
    byId(h.render(), `${section}-delete-products`).props.onPress();
    const tree = h.render();
    const toolbar = byId(tree, `${section}-floating-actions`);
    const buttons = nodes(toolbar).filter(node => node.type === 'Pressable');
    assert.equal(buttons[0].props.testID, `${section}-delete-all`);
    assert.equal(buttons[1].props.testID, `${section}-delete-products`);
    buttons[0].props.onPress();
    assert.equal(h.writes(section), 0);
    assert.deepEqual(h.saved(section), stock);
    assert.equal(alerts[0][0], 'pantry.deleteAllTitle');
    assert.equal(alerts[0][1], section === 'fridge' ? 'pantry.deleteAllFridgeMessage' : 'pantry.deleteAllMessage');
    alerts[0][2].find(button => button.style === 'cancel').onPress?.();
    assert.deepEqual(h.saved(section), stock);
    byId(h.render(), `${section}-delete-all`).props.onPress();
    alerts[1][2].find(button => button.style === 'destructive').onPress();
    assert.deepEqual(h.saved(section), []);
    assert.equal(h.writes(section), 1);
    assert.equal(h.shelfCount(section), 3);
    assert.deepEqual(h.saved(section === 'pantry' ? 'fridge' : 'pantry'), stock);
    assert.equal(byId(h.render(), `${section}-delete-all`), undefined);
    assert.equal(byId(h.render(), `${section}-pending-products`), undefined);
  }
});

test('delete all is disabled for empty stock and hides when leaving delete mode', () => {
  const alerts = [];
  const h = harness([], { alerts });
  byId(h.render(), 'pantry-delete-products').props.onPress();
  const button = byId(h.render(), 'pantry-delete-all');
  assert.equal(button.props.disabled, true);
  button.props.onPress();
  assert.equal(alerts.length, 0);
  byId(h.render(), 'pantry-delete-products').props.onPress();
  assert.equal(byId(h.render(), 'pantry-delete-all'), undefined);
});

test('a stale delete-all confirmation cannot clear stock after leaving the mode or switching section', () => {
  for (const action of ['toggle', 'section', 'edit', 'add']) {
    const alerts = [];
    const h = harness([item], { fridgeItems: [item], alerts });
    byId(h.render(), 'pantry-delete-products').props.onPress();
    byId(h.render(), 'pantry-delete-all').props.onPress();
    if (action === 'toggle') byId(h.render(), 'pantry-delete-products').props.onPress();
    if (action === 'section') selectorFor(h.render(), 'fridge').props.onChange('fridge');
    if (action === 'edit') byId(h.render(), 'pantry-edit').props.onPress();
    if (action === 'add') byId(h.render(), 'pantry-add-product').props.onPress();
    h.render();
    alerts[0][2].find(button => button.style === 'destructive').onPress();
    assert.deepEqual(h.saved(), [item]);
    assert.deepEqual(h.saved('fridge'), [item]);
    assert.equal(h.writes(), 0);
  }
});


test('free pantry and fridge open Plus on a third shelf, including insertion, without changing stock', () => {
  const h = harness([], { isPremium: false, shelfCount: 2 });
  byId(h.render(), 'pantry-add-shelf').props.onPress();
  assert.equal(h.shelfCount(), 2);
  assert.equal(byType(h.render(), 'PaywallModal').props.visible, true);
  byType(h.render(), 'PaywallModal').props.onClose();
  assert.equal(byType(h.render(), 'PaywallModal').props.visible, false);
  byId(h.render(), 'pantry-edit').props.onPress();
  byType(h.render(), 'PantryShelf').props.onInsertShelfBelow(0);
  assert.equal(h.shelfCount(), 2);
  assert.equal(byType(h.render(), 'PaywallModal').props.visible, true);
  byType(h.render(), 'PaywallModal').props.onClose();
  selectorFor(h.render(), 'fridge').props.onChange('fridge');
  byType(h.render(), 'PantryFridge').props.onAddShelf();
  assert.equal(h.shelfCount('fridge'), 2);
  assert.equal(byType(h.render(), 'PaywallModal').props.visible, true);
  byType(h.render(), 'PaywallModal').props.onClose();
  byId(h.render(), 'fridge-edit').props.onPress();
  byType(h.render(), 'PantryFridge').props.onInsertShelfBelow(0);
  assert.equal(h.shelfCount('fridge'), 2);
  assert.equal(byType(h.render(), 'PaywallModal').props.visible, true);
  assert.equal(h.writes(), 0);
  assert.equal(h.writes('fridge'), 0);
});

test('selected pantry products can choose fridge signs and return without losing their fields', () => {
  const original = { ...item, quantity: 4, notes: 'Abierto', expiryDate: '2027-01-01', kitchenLocation: 'Cocina' };
  const h = harness([original]);
  const pantryLabels = { 0: { name: 'Desayunos', emoji: '🥣' } };
  const fridgeLabels = { 0: { name: 'Lácteos', emoji: '🥛' }, 2: { name: 'Verduras', emoji: '🥬' } };
  labelShelves(h, 'pantry', pantryLabels);
  labelShelves(h, 'fridge', fridgeLabels);
  selectorFor(h.render(), 'pantry').props.onChange('pantry');
  byType(h.render(), 'PantryShelf').props.onSelect(original.instanceId);
  const focus = byType(h.render(), 'PantryProductFocus');
  assert.deepEqual(focus.props.otherShelfLabels, fridgeLabels);
  assert.equal(focus.props.onChooseOtherShelf(1), false, 'unsigned continuations are not separate options');
  assert.equal(focus.props.onChooseOtherShelf(2), true);
  assert.deepEqual(h.saved(), []);
  assert.equal(h.saved('fridge').length, 1);
  assert.equal(h.saved('fridge')[0].shelfIndex, 2);
  for (const key of ['instanceId', 'product', 'quantity', 'notes', 'expiryDate', 'kitchenLocation', 'visibleBounds', 'boundsImageUrl']) {
    assert.deepEqual(h.saved('fridge')[0][key], original[key], key);
  }
  const moved = byType(h.render(), 'PantryProductFocus');
  assert.equal(moved.props.section, 'fridge');
  assert.equal(moved.props.selectedShelfGroup, 2);
  assert.deepEqual(moved.props.otherShelfLabels, pantryLabels);
  assert.equal(focus.props.onChooseOtherShelf(2), false, 'repeated old callback cannot duplicate the instance');
  assert.equal(moved.props.onChooseOtherShelf(0), true);
  assert.deepEqual(h.saved('fridge'), []);
  assert.equal(h.saved()[0].instanceId, original.instanceId);
});

test('full, unsigned or unavailable fridge shelves leave selected pantry stock intact', () => {
  const full = Array.from({ length: 5 }, (_, index) => ({ ...item, instanceId: `fridge-${index}`, ...measuredDefault(index) }));
  for (const options of [{}, { unready: ['fridge'] }, { loadErrors: ['fridge'] }]) {
    const h = harness([item], { fridgeItems: full, ...options });
    labelShelves(h, 'fridge', { 0: { name: 'Lácteos', emoji: null }, 1: { name: 'Verduras', emoji: null } });
    selectorFor(h.render(), 'pantry').props.onChange('pantry');
    byType(h.render(), 'PantryShelf').props.onSelect(item.instanceId);
    const before = structuredClone(h.saved('fridge'));
    const writes = [h.writes(), h.writes('fridge')];
    for (const index of [-1, 0, 2, 3, 1.5]) assert.equal(byType(h.render(), 'PantryProductFocus').props.onChooseOtherShelf(index), false);
    assert.deepEqual(h.saved(), [item]);
    assert.deepEqual(h.saved('fridge'), before);
    assert.deepEqual([h.writes(), h.writes('fridge')], writes);
  }
});


test('pantry list adds pending products only when they recover onto shelves', () => {
  const full = Array.from({ length: 15 }, (_, i) => ({ ...item, instanceId: `full-${i}`, ...measuredDefault(i) }));
  const h = harness(full);
  byId(h.render(), 'pantry-add-product').props.onPress();
  byType(h.render(), 'PantryProductPicker').props.onAddPurchase([{ product: milk, quantity: 7 }]);
  const pending = layout.arrangePantryItems(h.saved()).unplaced[0];
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  assert.equal(byId(h.render(), 'pantry-list').props.data.length, 15);
  assert.equal(byId(h.render(), `pantry-list-item-${pending.instanceId}`), undefined);
  assert.equal(h.saved().some(entry => entry.instanceId === pending.instanceId), true);
  selectorFor(h.render(), 'list').props.onChange('cupboard');
  byId(h.render(), 'pantry-add-shelf').props.onPress();
  const shelfIds = byType(h.render(), 'PantryShelf').props.items.map(entry => entry.instanceId);
  selectorFor(h.render(), 'cupboard').props.onChange('list');
  const rows = byId(h.render(), 'pantry-list').props.data;
  assert.deepEqual(rows.map(entry => entry.instanceId), shelfIds);
  assert.equal(rows.length, 16);
  assert.equal(rows.find(entry => entry.instanceId === pending.instanceId).quantity, 7);
});

test('pending photos are informational in normal and delete modes in both sections', () => {
  for (const section of ['pantry', 'fridge']) {
    const full = Array.from({ length: 15 }, (_, i) => ({ ...item, instanceId: `full-${i}`, ...measuredDefault(i) }));
    const h = harness(section === 'pantry' ? full : [], { fridgeItems: section === 'fridge' ? full : [] });
    if (section === 'fridge') selectorFor(h.render(), 'fridge').props.onChange('fridge');
    byId(h.render(), `${section}-add-product`).props.onPress();
    byType(h.render(), 'PantryProductPicker').props.onAddPurchase([{ product: milk, quantity: 7 }]);
    const pending = layout.arrangePantryItems(h.saved(section)).unplaced[0];
    byId(h.render(), `${section}-pending-products`).props.onPress();
    const before = structuredClone(h.saved(section));
    const writes = h.writes(section);
    for (const deleting of [false, true]) {
      if (deleting) byId(h.render(), `${section}-delete-products`).props.onPress();
      const card = byId(h.render(), `${section}-pending-${pending.instanceId}`);
      assert.equal(card.type, 'View');
      assert.equal(card.props.pointerEvents, 'none');
      assert.equal(card.props.onPress, undefined);
      assert.equal(card.props.accessibilityRole, 'image');
      assert.equal(card.props.accessibilityLabel, pending.product.name);
      assert.equal(byType(h.render(), 'PantryProductFocus'), undefined);
      assert.deepEqual(h.saved(section), before);
      assert.equal(h.writes(section), writes);
    }
    byId(h.render(), `${section}-close-pending`).props.onPress();
    assert.equal(byId(h.render(), `${section}-unplaced`), undefined);
  }
});
