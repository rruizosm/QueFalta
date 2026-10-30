import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

function load(path, deps = {}, environment = {}) {
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', ...Object.keys(environment), source)(name => {
    assert.ok(name in deps, `Unexpected import ${name}`);
    return deps[name];
  }, module, module.exports, ...Object.values(environment));
  return module.exports;
}
const layout = load('lib/pantryLayout.ts');

test('expiry status uses three calendar days, including today, and rejects missing or invalid dates', () => {
  const status = layout.pantryExpiryStatus;
  for (const value of [undefined, null, '', '2026-02-30', 'bad']) assert.equal(status(value, '2026-10-27'), null);
  assert.equal(status('2026-10-26', '2026-10-27'), 'expired');
  assert.equal(status('2026-10-27', '2026-10-27'), 'soon');
  assert.equal(status('2026-10-30', '2026-10-27'), 'soon');
  assert.equal(status('2026-10-31', '2026-10-27'), null);
  assert.equal(status('2026-03-30', '2026-03-27'), 'soon'); // DST transition.
  assert.equal(status('2026-10-26', '2026-10-23'), 'soon'); // DST transition.
  assert.equal(status('2027-01-02', '2026-12-30'), 'soon');
  assert.equal(layout.pantryLocalDateKey(new Date(2026, 9, 27, 0, 1)), '2026-10-27');
});

function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function focusHarness(reduced = false, inCurrentList = false, extraProps = {}) {
  let cursor = 0;
  const slots = [], deps = [], pending = [], cleanups = [], repeats = [], cancelled = [];
  const colors = { red: '#C62828', ink: '#201A17', accentLight: '#F1E7DD' };
  const { default: Focus } = load('components/PantryProductFocus.tsx', {
    'react/jsx-runtime': { jsx, jsxs },
    './GlassSurface': 'GlassSurface',
    '../hooks/usePantryCartMembership': { usePantryCartMembership: () => inCurrentList },
    react: {
      useCallback: fn => fn,
      useRef: initial => { const i = cursor++; return slots[i] ??= { current: initial }; },
      useState: initial => {
        const i = cursor++;
        if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
        return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }];
      },
      useEffect: (fn, next) => {
        const i = cursor++;
        if (!deps[i] || next.some((v, j) => !Object.is(v, deps[i][j]))) {
          deps[i] = next; pending.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
        }
      },
    },
    'react-native': { ActivityIndicator: 'Spinner', Keyboard: { dismiss() {} }, KeyboardAvoidingView: 'KeyboardAvoidingView',
      Modal: 'Modal', Platform: { OS: 'ios' }, Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', TextInput: 'TextInput', View: 'View',
      StyleSheet: { create: v => v, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
      useWindowDimensions: () => ({ width: 390, height: 844 }) },
    'expo-image': { Image: 'Image' }, 'expo-blur': { BlurView: 'BlurView' }, 'expo-linear-gradient': { LinearGradient: 'Gradient' },
    '@expo/vector-icons/Ionicons': 'Icon',
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
    'react-native-reanimated': { __esModule: true, default: { View: 'Animated.View' },
      cancelAnimation: v => cancelled.push(v), Easing: { inOut: v => v, cubic: v => v, bezier: () => v => v }, ReduceMotion: { Never: 'never' },
      useAnimatedStyle: fn => fn(),
      useSharedValue: initial => {
        const i = cursor++;
        return slots[i] ??= { value: initial, set(value) { this.value = value; } };
      }, withTiming: (value, config) => ({ value, config }),
      withRepeat: (animation, count, reverse) => { const result = { animation, count, reverse }; repeats.push(result); return result; } },
    'react-native-worklets': { scheduleOnRN: fn => fn() },
    '../constants/typography': { fonts: {} }, '../constants/colors': { colors },
    '../constants/stores': { STORE_META: { mercadona: { name: 'Mercadona', icon: 'icon' } } },
    '../context/ThemeContext': { useThemedStyles: factory => factory() },
    '../context/LanguageContext': { useTranslation: () => ({ t: key => key }) },
    '../hooks/useReducedMotion': { useReducedMotion: () => reduced }, '../lib/pantryLayout': layout,
  });
  let expiry = '2026-10-30';
  const props = { product: { id: 'milk', name: 'Leche', illustrationUrl: 'photo' }, quantity: 2,
    notes: 'Conservar', kitchenLocation: '', kitchenLocationOptions: [], selectedShelfGroup: null, today: '2026-10-27',
    backgroundRef: { current: null }, onEdit(patch) { if ('expiryDate' in patch) expiry = patch.expiryDate; },
    onReady() {}, onClose() {}, onFinish() {} };
  function render() { cursor = 0; const result = Focus({ ...props, expiryDate: expiry, ...extraProps }); pending.splice(0).forEach(fn => fn()); return nodes(result); }
  return { render, repeats, cancelled, setExpiry: value => { expiry = value; },
    unmount() { cleanups.forEach(fn => fn?.()); } };
}

test('information presents catalog details inside the native focus modal and keeps the focus mounted', () => {
  let opens = 0;
  const details = jsx('CatalogDetails', { productId: 'milk' });
  const h = focusHarness(false, false, { children: details, onShowDetails: () => opens++ });
  const tree = h.render();
  const modal = tree.find(node => node.type === 'Modal');
  assert.ok(nodes(modal.props.children).includes(details));
  tree.find(node => node.props?.testID === 'pantry-focus-details').props.onPress();
  assert.equal(opens, 1);
  assert.ok(h.render().find(node => node.props?.testID === 'pantry-focus-panel'));
});

test('focus displays package contents beneath the product name when available', () => {
  const h = focusHarness(false, false, { product: { id: '123', name: 'Leche', metaLabel: '1 L', illustrationUrl: 'photo' } });
  assert.equal(h.render().find(node => node.props?.testID === 'pantry-focus-package').props.children, '1 L');
  assert.equal(focusHarness().render().find(node => node.props?.testID === 'pantry-focus-package'), undefined);
});

test('focus shows expiry warning, pulses its red border, and cancels when the date is cleared', () => {
  const h = focusHarness();
  let tree = h.render();
  const find = id => tree.find(node => node.props?.testID === id);
  assert.ok(find('pantry-focus-expiry-section').props.style.some(style => style?.borderColor === '#C62828'));
  assert.equal(find('pantry-focus-expiry-warning').props.children, 'pantry.expiringSoon');
  tree.find(node => node.type === 'Modal').props.onShow();
  tree.find(node => node.type === 'Image' && node.props.onLoad).props.onLoad();
  h.render(); h.render();
  assert.equal(h.repeats.length, 1);
  assert.equal(h.repeats[0].count, -1);
  assert.equal(h.repeats[0].reverse, true);
  assert.equal(h.repeats[0].animation.config.duration, 800);
  h.setExpiry('2026-10-26'); tree = h.render();
  assert.equal(find('pantry-focus-expiry-warning').props.children, 'pantry.expired');
  find('pantry-focus-clear-expiry').props.onPress(); tree = h.render();
  assert.equal(find('pantry-focus-expiry-warning'), undefined);
  assert.equal(find('pantry-focus-expiry-pulse'), undefined);
  assert.ok(h.cancelled.length > 0);
  h.unmount();
});

test('reduced motion keeps a steady expiry warning without any repeat animation', () => {
  const h = focusHarness(true);
  const tree = h.render();
  tree.find(node => node.type === 'Modal').props.onShow();
  tree.find(node => node.type === 'Image' && node.props.onLoad).props.onLoad();
  h.render(); h.render();
  assert.equal(h.repeats.length, 0);
  assert.ok(tree.some(node => node.props?.testID === 'pantry-focus-expiry-warning'));
  h.unmount();
});

test('the inventory clock refreshes at local midnight and foreground and cleans up its timer', () => {
  let now = new Date(2026, 9, 27, 23, 59, 50).getTime();
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  let effect, current, foreground, timer, removed = false;
  const cancelled = [];
  const { usePantryToday } = load('hooks/usePantryToday.ts', {
    react: { useState: initial => { current = initial(); return [current, value => { current = value; }]; },
      useEffect: fn => { effect = fn; } },
    'react-native': { AppState: { addEventListener: (_, fn) => { foreground = fn; return { remove() { removed = true; } }; } } },
    '../lib/pantryLayout': { pantryLocalDateKey: () => layout.pantryLocalDateKey(new ClockDate()) },
  }, { Date: ClockDate, setTimeout: (fn, delay) => { timer = { fn, delay }; return timer; }, clearTimeout: id => cancelled.push(id) });
  assert.equal(usePantryToday(), '2026-10-27');
  const cleanup = effect();
  assert.equal(timer.delay, 10100);
  now += 10100; timer.fn();
  assert.equal(current, '2026-10-28');
  now = new Date(2026, 10, 2, 9).getTime(); foreground('active');
  assert.equal(current, '2026-11-02');
  cleanup();
  assert.equal(removed, true);
  assert.ok(cancelled.includes(timer));
});

test('cleared or distant expiry dates have no highlighted field or warning', () => {
  const h = focusHarness();
  for (const date of [null, '2026-10-31']) {
    h.setExpiry(date);
    const tree = h.render();
    assert.equal(tree.some(node => node.props?.testID === 'pantry-focus-expiry-warning'), false);
    assert.equal(tree.some(node => node.props?.testID === 'pantry-focus-expiry-pulse'), false);
  }
  h.unmount();
});


test('focus places current-list notice below notes and uses trash and glass actions', () => {
  const tree = focusHarness(false, true).render();
  const find = id => tree.find(node => node.props?.testID === id);
  assert.ok(tree.indexOf(find('pantry-focus-in-current-list')) > tree.indexOf(find('pantry-focus-notes')));
  assert.equal(find('pantry-focus-in-current-list').props.children[1].props.children, 'pantry.inCurrentList');
  assert.ok(nodes(find('pantry-focus-finished')).some(node => node.props?.name === 'trash-outline'));
  const glass = find('pantry-focus-cart-glass');
  assert.equal(glass.type, 'GlassSurface');
  assert.equal(glass.props.fallbackColor, '#F1E7DD');
  const label = nodes(glass).find(node => node.type === 'Text');
  assert.equal(label.props.style.color, '#201A17');
  assert.ok(nodes(glass).some(node => node.props?.name === 'cart-outline' && node.props.color === '#201A17'));
  assert.equal(glass.props.style.position, undefined);
  assert.equal(find('pantry-focus-add-cart').props.disabled, false);
  assert.equal(focusHarness().render().some(node => node.props?.testID === 'pantry-focus-in-current-list'), false);
});

test('focus lists signed shelves from both sections with distinct identities and routes external choices', () => {
  let chosen = null;
  const h = focusHarness(false, false, {
    shelfLabels: { 0: { name: 'Desayunos', emoji: '🥣' } }, selectedShelfGroup: 0,
    otherShelfLabels: { 0: { name: 'Lácteos', emoji: '🥛' } },
    onChooseOtherShelf: index => { chosen = index; return true; },
  });
  h.render().find(node => node.props?.testID === 'pantry-focus-shelf-options').props.onPress();
  const tree = h.render();
  const local = tree.find(node => node.props?.testID === 'pantry-focus-shelf-0');
  const other = tree.find(node => node.props?.testID === 'pantry-focus-other-shelf-0');
  assert.equal(local.props.accessibilityState.checked, true);
  assert.equal(other.props.accessibilityState.checked, false);
  assert.equal(other.props.accessibilityLabel, 'pantry.fridge: 🥛 Lácteos');
  other.props.onPress();
  assert.equal(chosen, 0);
  assert.equal(h.render().find(node => node.props?.testID === 'pantry-focus-shelf-options').props.accessibilityState.expanded, false);
});
