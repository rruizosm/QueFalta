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

function harness(initialItems = [item]) {
  const state = [];
  let cursor = 0;
  let items = initialItems;
  let shelfCount = 3;
  let writes = 0;
  const native = { requireExternalGestureToFail() { return native; } };
  const { PantryScreenContent } = load('../../src/screens/PantryScreen.tsx', {
    'react/jsx-runtime': { jsx, jsxs },
    react: {
      useContext: () => null, useMemo: (fn) => fn(), useCallback: (fn) => fn,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (value) => { state[index] = typeof value === 'function' ? value(state[index]) : value; }];
      },
    },
    '@react-navigation/native': { useNavigation: () => ({ navigate() {} }) },
    '@expo/vector-icons/Ionicons': 'Icon',
    'react-native': { ActivityIndicator: 'ActivityIndicator', Keyboard: { dismiss() {} },
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      StyleSheet: { create: (styles) => styles }, useWindowDimensions: () => ({ fontScale: 1 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 59, bottom: 34 }) },
    'react-native-gesture-handler': { Gesture: { Native: () => native }, GestureDetector: 'GestureDetector' },
    '../components/bottom-tabs-pager/PagerGestureContext': { PagerGestureContext: {} },
    '../components/PantryProductPicker': 'PantryProductPicker',
    '../components/PantryShelf': 'PantryShelf',
    '../components/PantryWoodBackground': 'PantryWoodBackground',
    '../constants/colors': { colors: { white: '#fff', paper: '#fbf6ee' } },
    '../constants/typography': { fonts: {} },
    '../context/LanguageContext': { useTranslation: () => ({ t: (key) => key }) },
    '../context/AuthContext': { useAuth: () => ({ session: null }) },
    '../context/ThemeContext': { useThemedStyles: (factory) => factory() },
    '../hooks/useTabBarBottomPadding': { useTabBarBottomPadding: () => 100 },
    '../hooks/usePantryLayout': { usePantryLayout: () => ({ items, shelfCount, ready: true,
      addShelf: () => { shelfCount++; items = layout.normalizePantryItems(items, shelfCount); writes++; },
      update: (fn) => { items = layout.normalizePantryItems(fn(items), shelfCount); writes++; } }) },
    '../lib/pantryLayout': layout,
  });
  return { render: () => { cursor = 0; return PantryScreenContent({ userId: 'test-user' }); },
    saved: () => items, writes: () => writes };
}

function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  return [element, ...nodes(element.props?.children)];
}
const byId = (tree, id) => nodes(tree).find((node) => node.props.testID === id);
const byType = (tree, type) => nodes(tree).find((node) => node.type === type);

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

test('selecting and finishing keep the scroll layout unchanged and the toolbar outside the scene', () => {
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
  const tools = byId(selected, 'pantry-selection-tools');
  assert.equal(tools.props.style[0].position, 'absolute');
  assert.equal(h.writes(), 0);
  assert.deepEqual(h.saved(), [item]);
  byId(selected, 'pantry-finish').props.onPress();
  const finished = h.render();
  assert.equal(byId(finished, 'pantry-selection-tools'), undefined);
  assert.deepEqual(byType(finished, 'ScrollView').props.contentContainerStyle, before.props.contentContainerStyle);
});

test('adding and deleting one selected product preserve the other product and scene clearance', () => {
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
  byId(added, 'pantry-remove').props.onPress();
  assert.deepEqual(h.saved(), [item]);
  const removed = h.render();
  assert.equal(byId(removed, 'pantry-selection-tools'), undefined);
  assert.deepEqual(byType(removed, 'ScrollView').props.contentContainerStyle, padding);
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
