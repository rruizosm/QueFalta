import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

const milk = { id: 'same', store: 'mercadona', name: 'Leche', illustrationUrl: 'https://example.com/milk.png', metaLabel: '1 L' };
const other = { ...milk, store: 'lidl' };
const carrefour = { ...milk, store: 'carrefour', id: '520664611', name: 'Caldo Carrefour' };
const nodes = (tree) => !tree || typeof tree !== 'object' ? [] : [tree, ...[tree.props?.children].flat(Infinity).flatMap(nodes)];
const find = (tree, type) => nodes(tree).find(node => node.type === type);

function harness(props = {}) {
  const states = [], effects = [], memos = [], refs = [];
  let cursor = 0, effectCursor = 0, memoCursor = 0, refCursor = 0;
  const confirmed = [];
  const assignments = [];
  let accepts = false;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useMemo(fn, deps) {
      const index = memoCursor++;
      if (!memos[index] || deps.some((value, i) => value !== memos[index].deps[i])) memos[index] = { deps, value: fn() };
      return memos[index].value;
    },
    useRef(value) { return refs[refCursor++] ??= { current: value }; },
    useEffect(fn, deps) {
      const index = effectCursor++;
      if (!effects[index] || deps.some((value, i) => value !== effects[index].deps[i])) {
        effects[index]?.cleanup?.();
        effects[index] = { deps, cleanup: fn() };
      }
    },
  };
  const deps = {
    'react/jsx-runtime': { jsx, jsxs }, react,
    'react-native': { Modal: 'Modal', View: 'View', Text: 'Text', Pressable: 'Pressable', FlatList: 'FlatList',
      KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' }, Keyboard: { dismiss() {} },
      StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 393, fontScale: 1 }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 34 }) },
    '../api/pantry': { PANTRY_STORES: ['mercadona', 'lidl', 'bonarea', 'carrefour'],
      isCarrefourPantryCategory: (id) => !['cat20037', 'cat260001', 'cat20038'].includes(id),
      searchPantryProducts: async (_q, _l, _o, _s, options) =>
        ({ products: [options.store === 'carrefour' ? carrefour : options.store === 'lidl' ? other : milk], hasMore: false }) },
    '../api/catalog': { fetchCarrefourCategoryTree: async () => [
      { id: 'food', name: 'Alimentación', children: [{ id: 'milk', name: 'Lácteos' }] },
      { id: 'home', name: 'Hogar', children: [{ id: 'cat20037', name: 'Bazar' }, { id: 'clean', name: 'Limpieza' }] },
      { id: 'other', name: 'Otros', children: [{ id: 'cat260001', name: 'Papelería' }, { id: 'cat20038', name: 'Calzado' }] },
    ] },
    '../constants/stores': { CATALOG_STORES: [], storesWithLidlSecond: value => value },
    '../constants/colors': { colors: {} }, '../constants/typography': { fonts: {} },
    '../context/LanguageContext': { useTranslation: () => ({ t: key => key, lang: 'es' }) },
    '../context/ProfileContext': { useProfile: () => ({ profile: { lidlStoreId: 'store' } }) },
    '../context/AuthContext': { useAuth: () => ({}) },
    '../context/ThemeContext': { useThemedStyles: () => ({}) },
    '../hooks/usePantryAddMeasurements': { usePantryAddMeasurements: products => ({ ready: props.measureReady !== false, bounds: new Map(products.map(p => [p.illustrationUrl, { left: .225, top: 0, right: .775, bottom: 1 }])), urls: [], onBounds() {} }) },
    '../hooks/useReducedMotion': { useReducedMotion: () => true },
    '../lib/sort': { sortByName: value => value },
    './GlassSurface': { default: 'GlassSurface', glassAvailable: false },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../../src/components/PantryProductPicker.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => deps[name] ?? name.split('/').at(-1), module, module.exports);
  return {
    render() { cursor = 0; effectCursor = 0; memoCursor = 0; refCursor = 0; return module.exports.default({ ...props, onConfirm: (products, shelves) => { confirmed.push(products); assignments.push(new Map(shelves)); return accepts; }, onClose() {} }); },
    confirmed, assignments, accept() { accepts = true; },
    dispose() { effects.forEach(effect => effect.cleanup?.()); },
  };
}

test('Carrefour stays disabled in the selector and cannot replace the active store', async () => {
  const h = harness();
  try {
    const dropdown = find(h.render(), 'StoreDropdown');
    assert.ok(!dropdown.props.availableStores.includes('carrefour'));
    dropdown.props.onChange('carrefour');
    h.render(); await new Promise(resolve => setTimeout(resolve, 15));
    const tree = h.render();
    assert.equal(find(tree, 'StoreProductList').props.products?.[0]?.store ?? find(tree, 'StoreProductList').props.items?.[0]?.store, 'mercadona');
  } finally { h.dispose(); }
});

test('picker keeps selections across search/store/view changes, toggles them and confirms only on demand', async () => {
  const h = harness();
  try {
    h.render(); await new Promise(resolve => setTimeout(resolve, 15));
    let tree = h.render();
    find(tree, 'StoreProductList').props.selection.onSelect(milk);
    tree = h.render();
    assert.deepEqual([...find(tree, 'StoreProductList').props.selection.selectedKeys], ['mercadona:same']);
    assert.equal(h.confirmed.length, 0);
    find(tree, 'CatalogSearchField').props.onChange('leche');
    find(tree, 'StoreDropdown').props.onChange('lidl');
    tree = h.render(); await new Promise(resolve => setTimeout(resolve, 280));
    tree = h.render();
    find(tree, 'StoreProductList').props.onViewModeChange('grid');
    find(tree, 'StoreProductList').props.selection.onSelect(other);
    tree = h.render();
    assert.equal(find(tree, 'StoreProductList').props.selection.selectedKeys.size, 2);
    const confirm = () => nodes(h.render()).find(node => node.props?.testID === 'pantry-confirm-products');
    confirm().props.onPress();
    assert.deepEqual(h.confirmed[0], [milk, other]);
    assert.equal(find(h.render(), 'StoreProductList').props.selection.selectedKeys.size, 2);
    assert.ok(nodes(h.render()).some(node => node.props?.accessibilityRole === 'alert'));
    find(h.render(), 'StoreProductList').props.selection.onSelect(other);
    h.accept(); confirm().props.onPress();
    assert.deepEqual(h.confirmed[1], [milk]);
  } finally { h.dispose(); }
});


test('location review retains shelf choices on back, passes them on confirm and clears deselected choices', async () => {
  const labels = { 0: { name: 'Desayuno', emoji: '🥣' }, 2: { name: 'Conservas', emoji: null } };
  const h = harness({ shelfLabels: labels });
  const byId = id => nodes(h.render()).find(node => node.props?.testID === id);
  try {
    h.render(); await new Promise(resolve => setTimeout(resolve, 15));
    find(h.render(), 'StoreProductList').props.selection.onSelect(milk);
    assert.ok(!nodes(h.render()).some(node => node.props?.children === 'product.selectedOne'));
    byId('pantry-locate-products').props.onPress();
    let review = find(h.render(), 'PantryPlacementReview');
    assert.deepEqual(review.props.products, [milk]);
    assert.deepEqual(review.props.shelfLabels, labels);
    assert.equal(review.props.shelfChoices.size, 0);
    review.props.onChooseShelf('mercadona:same', 2);
    review = find(h.render(), 'PantryPlacementReview');
    assert.equal(review.props.shelfChoices.get('mercadona:same'), 2);
    review.props.onBack();
    byId('pantry-locate-products').props.onPress();
    review = find(h.render(), 'PantryPlacementReview');
    assert.equal(review.props.shelfChoices.get('mercadona:same'), 2);
    byId('pantry-confirm-products').props.onPress();
    assert.equal(h.assignments[0].get('mercadona:same'), 2);
    review.props.onChooseShelf('mercadona:same', null);
    byId('pantry-confirm-products').props.onPress();
    assert.equal(h.assignments[1].size, 0);
    review.props.onChooseShelf('mercadona:same', 0);
    review.props.onBack();
    find(h.render(), 'StoreProductList').props.selection.onSelect(milk);
    find(h.render(), 'StoreProductList').props.selection.onSelect(milk);
    byId('pantry-confirm-products').props.onPress();
    assert.equal(h.assignments[2].size, 0);
  } finally { h.dispose(); }
});

function reviewHarness(labels) {
  let expanded = null;
  const choices = new Map();
  const deps = {
    'react/jsx-runtime': { jsx, jsxs }, react: { useState: () => [expanded, value => { expanded = value; }] },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', FlatList: 'FlatList', StyleSheet: { create: value => value } },
    '../constants/colors': { colors: {} }, '../constants/typography': { fonts: {} },
    '../context/LanguageContext': { useTranslation: () => ({ t: key => key }) },
    '../context/ThemeContext': { useThemedStyles: () => ({}) },
  };
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../../src/components/PantryPlacementReview.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => deps[name] ?? name.split('/').at(-1), module, module.exports);
  return {
    row() {
      const tree = module.exports.default({ products: [milk], shelfLabels: labels, shelfChoices: choices,
        onChooseShelf: (key, shelf) => shelf === null ? choices.delete(key) : choices.set(key, shelf), onBack() {}, onClose() {} });
      return find(tree, 'FlatList').props.renderItem({ item: milk });
    }, choices,
  };
}

test('each product offers only signed shelves and an optional empty choice, including when no signs exist', () => {
  for (const labels of [{}, { 0: { name: 'Desayuno', emoji: '🥣' }, 2: { name: 'Conservas', emoji: null } }]) {
    const h = reviewHarness(labels);
    const byId = id => nodes(h.row()).find(node => node.props?.testID === id);
    byId('pantry-choose-shelf-mercadona:same').props.onPress();
    let choices = nodes(h.row()).filter(node => node.props?.accessibilityRole === 'radio');
    assert.equal(choices.length, Object.keys(labels).length + 1);
    assert.ok(!byId('pantry-shelf-mercadona:same-1'));
    assert.equal(byId('pantry-shelf-none-mercadona:same').props.accessibilityState.checked, true);
    if (labels[2]) {
      byId('pantry-shelf-mercadona:same-2').props.onPress();
      assert.equal(h.choices.get('mercadona:same'), 2);
      assert.equal(byId('pantry-choose-shelf-mercadona:same').props.accessibilityState.expanded, false);
      byId('pantry-choose-shelf-mercadona:same').props.onPress();
      assert.equal(byId('pantry-shelf-mercadona:same-2').props.accessibilityState.checked, true);
      byId('pantry-shelf-none-mercadona:same').props.onPress();
      assert.equal(h.choices.size, 0);
    }
  }
});

test('confirmation stays disabled while selected photos are unmeasured', async () => {
  const h = harness({ measureReady: false });
  try {
    h.render(); await new Promise(resolve => setTimeout(resolve, 15));
    find(h.render(), 'StoreProductList').props.selection.onSelect(milk);
    const button = nodes(h.render()).find(node => node.props?.testID === 'pantry-confirm-products');
    assert.equal(button.props.disabled, true);
    button.props.onPress();
    assert.equal(h.confirmed.length, 0);
  } finally { h.dispose(); }
});
