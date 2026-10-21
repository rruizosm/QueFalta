import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

function gesture() {
  const handlers = {};
  const options = {};
  const chain = new Proxy({ handlers, options }, { get: (target, key) => key in target ? target[key] : (callback) => {
    if (key.startsWith('on')) handlers[key] = callback;
    else options[key] = callback;
    return chain;
  } });
  return chain;
}
const colors = { paper: '#fbf6ee' };
let frameLayout = { width: 370, height: 514 };
const layoutModule = { exports: {} };
new Function('module', 'exports', ts.transpileModule(readFileSync(
  new URL('../../src/lib/pantryLayout.ts', import.meta.url), 'utf8'),
{ compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(layoutModule, layoutModule.exports);
const layout = layoutModule.exports;
const dependencies = {
  'react/jsx-runtime': { jsx, jsxs },
  react: {
    memo: (component) => component,
    useContext: () => null, useRef: () => ({ current: null }), useCallback: (fn) => fn, useEffect: () => {}, useMemo: (factory) => factory(), useId: () => ':shelf:',
    useState: (initial) => [typeof initial === 'object' ? frameLayout : initial, () => {}],
  },
  'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: (styles) => styles, absoluteFill: {} } },
  '@expo/vector-icons/Ionicons': 'Icon',
  'expo-image': { Image: 'Image' },
  'react-native-svg': { __esModule: true, default: 'Svg', ClipPath: 'ClipPath', Defs: 'Defs', G: 'G',
    Image: 'SvgImage', RadialGradient: 'RadialGradient', LinearGradient: 'LinearGradient', Path: 'Path', Rect: 'Rect', Stop: 'Stop' },
  '../../assets/pantry/oak-shelf-source.png': 'oak-shelf-asset',
  'react-native-gesture-handler': {
    GestureDetector: 'GestureDetector', Gesture: { Tap: gesture, Pan: gesture, Race: (...gestures) => gestures },
  },
  'react-native-reanimated': {
    __esModule: true, default: { View: 'Animated.View' },
    runOnJS: (fn) => fn, useAnimatedStyle: (fn) => ({ ...fn(), evaluate: fn }), useSharedValue: (value) => ({ value }),
  },
  '../constants/colors': { colors },
  '../context/LanguageContext': { useTranslation: () => ({ t: (key) => key }) },
  '../context/ThemeContext': { useThemedStyles: (factory) => factory(), useTheme: () => ({ scheme: 'light' }) },
  '../lib/pantryLayout': layout,
  './PantryShelfLabel': 'PantryShelfLabel',
  './bottom-tabs-pager/PagerGestureContext': { PagerGestureContext: {} },
};
function loadComponent(name) {
  const source = readFileSync(new URL(`../../src/components/${name}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((name) => {
    assert.ok(name in dependencies, `Unexpected dependency (including old cabinet): ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
dependencies['./PantryWoodShelf'] = loadComponent('PantryWoodShelf');
const PantryShelf = loadComponent('PantryShelf').default;
const expectedShelfWidthRatio = 1.12;
const canvasWidth = 370 / expectedShelfWidthRatio;

test('label editing disables pan, tap, add slots and accessibility actions without changing visual positions', () => {
  const item = { instanceId: 'locked', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
    ...layout.defaultPantryPlacement(0) };
  let actions = 0;
  const props = { items: [item], shelfCount: 4, selectedId: null, onSelect: () => actions++, onPlace: () => actions++,
    canAdd: true, onAddAt: () => actions++, scrollGesture: gesture(), onChangeShelfLabel() {} };
  const noLabels = nodes(PantryShelf({ ...props, onChangeShelfLabel: undefined }));
  const normal = nodes(PantryShelf({ ...props, shelfLabels: { 0: { name: 'Básicos', emoji: null } } }));
  const editing = nodes(PantryShelf({ ...props, shelfLabels: { 0: { name: 'Básicos', emoji: null } }, editingLabels: true }));
  assert.equal(noLabels.filter((node) => node.type === 'PantryShelfLabel').length, 0);
  assert.equal(normal.filter((node) => node.type === 'PantryShelfLabel').length, 1);
  assert.ok(normal.find((node) => node.props.testID === 'pantry-canvas').props.style.height
    > noLabels.find((node) => node.props.testID === 'pantry-canvas').props.style.height);
  const product = editing.find((node) => node.props.testID === 'pantry-item-locked');
  assert.equal(product.props.pointerEvents, 'none');
  assert.equal(product.props.accessibilityState.disabled, true);
  assert.deepEqual(product.props.accessibilityActions, []);
  for (const actionName of ['activate', 'left', 'shelfDown']) product.props.onAccessibilityAction({ nativeEvent: { actionName } });
  const gestures = editing.find((node) => node.type === 'GestureDetector').props.gesture;
  assert.ok(gestures.every((g) => g.options.enabled === false));
  gestures[1].handlers.onEnd({}, true);
  assert.equal(actions, 0);
  assert.equal(editing.filter((node) => node.props.testID?.startsWith('pantry-slot-')).length, 0);
  assert.equal(editing.filter((node) => node.type === 'PantryShelfLabel').length, 4);
  assert.deepEqual(frameStyle(product).evaluate(), frameStyle(normal.find((node) => node.props.testID === 'pantry-item-locked')).evaluate());
});

test('dragging between labeled shelves maps visible row spacing back into saved shelf coordinates', () => {
  const item = { instanceId: 'moving', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
    ...layout.defaultPantryPlacement(0) };
  const commits = [];
  const tree = nodes(PantryShelf({ items: [item], shelfCount: 6, selectedId: null, onSelect() {},
    onPlace: (_id, placement) => commits.push(placement), canAdd: true, scrollGesture: gesture(), onChangeShelfLabel() {},
    shelfLabels: { 0: { name: 'Desayuno', emoji: '🥣' } } }));
  const drag = tree.find((node) => node.type === 'GestureDetector').props.gesture[0].handlers;
  const headerHeight = tree.find((node) => node.type === 'PantryShelfLabel').props.editing === false ? 52 : NaN;
  const height = canvasWidth / layout.PANTRY_ASPECT_RATIO;
  drag.onStart();
  drag.onUpdate({ translationX: 0, translationY: 4 * (layout.PANTRY_SHELF_SPACING_Y * height + headerHeight) });
  drag.onFinalize({}, true);
  assert.equal(commits[0].shelfIndex, 4);
  assert.equal(commits[0].size, item.size);
  assert.equal(commits[0].x, item.x);
  const product = tree.find((node) => node.props.testID === 'pantry-item-moving');
  const box = frameStyle(product).evaluate();
  assert.ok(Math.abs(box.top + box.height - (layout.pantryShelfSurfaceY(4) * height + headerHeight)) < 1e-9);
});

// Hit rectangles include the fixed frame and the UI-thread translation.
function frameStyle(product) {
  return { evaluate: () => {
    const movement = product.props.style[2].evaluate();
    return { ...product.props.style[1], left: movement.transform[0].translateX,
      top: movement.transform[1].translateY };
  } };
}

test('extra shelves extend the scene without rescaling products and support drag and accessible movement', () => {
  const item = { instanceId: 'milk-extra', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
    ...layout.pantrySlotPlacement(2, 2) };
  const commits = [];
  const props = { items: [item], selectedId: null, onSelect() {}, onPlace: (_id, placement) => commits.push(placement),
    onAddAt() {}, canAdd: true, scrollGesture: gesture() };
  const oldTree = nodes(PantryShelf(props));
  const tree = nodes(PantryShelf({ ...props, shelfCount: 5 }));
  const boards = (elements) => elements.filter((node) => node.props.testID === 'pantry-wood-shelf').map((node) => node.props.style);
  assert.equal(boards(tree).length, 5);
  assert.deepEqual(boards(tree).slice(0, 3), boards(oldTree));
  assert.equal(tree.filter((node) => node.props.testID?.startsWith('pantry-slot-')).length, 24);
  const product = tree.find((node) => node.props.testID === 'pantry-item-milk-extra');
  const style = frameStyle(product);
  assert.deepEqual(style.evaluate(), frameStyle(oldTree.find((node) => node.props.testID === 'pantry-item-milk-extra')).evaluate());
  product.props.onAccessibilityAction({ nativeEvent: { actionName: 'shelfDown' } });
  assert.equal(commits[0].shelfIndex, 3);
  const pan = tree.find((node) => node.type === 'GestureDetector').props.gesture[0].handlers;
  pan.onStart();
  const height = canvasWidth / layout.PANTRY_ASPECT_RATIO;
  pan.onUpdate({ translationX: 0, translationY: (layout.pantryShelfSurfaceY(4) - layout.pantryShelfSurfaceY(2)) * height });
  pan.onFinalize({}, true);
  assert.equal(commits[1].shelfIndex, 4);
  const box = style.evaluate();
  assert.equal(box.height, item.size * canvasWidth);
  assert.ok(Math.abs(box.top + box.height - layout.pantryShelfSurfaceY(4) * height) < 1e-9);
  assert.ok(tree.find((node) => node.props.testID === 'pantry-canvas').props.style.height > box.top + box.height);
});

function nodes(element) {
  if (!element || typeof element !== 'object') return [];
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (typeof element.type === 'function') return nodes(element.type(element.props));
  return [element, ...nodes(element.props?.children)];
}

test('cupboard trims unused top headroom without clipping tall products or changing shelf coordinates', () => {
  for (const size of [layout.PANTRY_DEFAULT_SIZE, layout.PANTRY_MAX_SIZE]) {
    const item = { instanceId: 'top-product', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
      ...layout.clampPantryPlacement({ x: 0.5, y: 0, size }) };
    const tree = PantryShelf({ items: [item], selectedId: null, onSelect() {}, onPlace() {},
      onAddAt() {}, canAdd: true, scrollGesture: gesture() });
    const rendered = nodes(tree);
    const canvas = rendered.find((node) => node.props.testID === 'pantry-canvas').props.style;
    const product = rendered.find((node) => node.props.testID === 'pantry-item-top-product');
    const rect = frameStyle(product).evaluate();
    assert.ok(Math.abs(rect.top + rect.height - layout.PANTRY_SHELF_SURFACE_Y * canvas.height) < 1e-9);
    assert.ok(rect.top + canvas.top >= -1e-9, 'the entire product remains inside the viewport');
    const frameHeight = frameLayout.width / tree.props.style[1].aspectRatio;
    assert.ok(Math.abs(frameHeight - (canvas.height + canvas.top)) < 1e-9, 'the frame removes the same unused height');
    if (size === layout.PANTRY_DEFAULT_SIZE) {
      assert.ok(canvas.top < -20, 'unused interior space is noticeably reduced');
      assert.ok(Math.abs(rect.top + canvas.top - 8) < 1e-9);
    } else {
      assert.equal(Math.abs(canvas.top), 0, 'maximum-size legacy products retain all their space');
    }
  }
});

test('pantry draws three evenly spaced wooden shelves without adding decorative products', () => {
  const selectedSlots = [];
  const tree = PantryShelf({ items: [], selectedId: null, onSelect() {}, onPlace() {},
    onAddAt: (placement) => selectedSlots.push(placement), canAdd: true, scrollGesture: gesture() });
  assert.equal(tree.props.style[0].backgroundColor, 'transparent');
  assert.equal(nodes(tree).filter((node) => node.type === 'Image').length, 0);
  const boards = nodes(tree).filter((node) => node.props.testID === 'pantry-wood-shelf');
  assert.equal(boards.length, 3);
  assert.deepEqual(boards.map((board) => board.props.pointerEvents), ['none', 'none', 'none']);
  assert.deepEqual(boards.map((board) => board.props.style.width),
    layout.PANTRY_SHELF_SURFACE_YS.map(() => canvasWidth * expectedShelfWidthRatio));
  assert.deepEqual(boards.map((board) => board.props.style.left),
    layout.PANTRY_SHELF_SURFACE_YS.map(() => (canvasWidth - canvasWidth * expectedShelfWidthRatio) / 2));
  const canvasHeight = canvasWidth / layout.PANTRY_ASPECT_RATIO;
  assert.ok(Math.abs((boards[1].props.style.top - boards[0].props.style.top)
    - (layout.PANTRY_SHELF_SURFACE_YS[1] - layout.PANTRY_SHELF_SURFACE_YS[0]) * canvasHeight) < 1e-9);
  assert.ok(Math.abs((boards[2].props.style.top - boards[1].props.style.top)
    - (layout.PANTRY_SHELF_SURFACE_YS[2] - layout.PANTRY_SHELF_SURFACE_YS[1]) * canvasHeight) < 1e-9);
  assert.equal(nodes(tree).filter((node) => node.type === 'SvgImage').length, 3);
  assert.deepEqual(nodes(tree).filter((node) => node.type === 'G' && node.props.clipPath?.startsWith('url(#oak-wood-')).map((node) => node.props.clipPath),
    ['url(#oak-wood-shelf)', 'url(#oak-wood-shelf)', 'url(#oak-wood-shelf)']);
  const slots = nodes(tree).filter((node) => node.props.testID?.startsWith('pantry-slot-'));
  assert.equal(slots.length, layout.PANTRY_SLOT_COUNT * layout.PANTRY_SHELF_SURFACE_YS.length);
  slots[2].props.onPress();
  assert.deepEqual(selectedSlots[0], layout.pantrySlotPlacement(2));
  slots[7].props.onPress();
  assert.deepEqual(selectedSlots[1], layout.pantrySlotPlacement(2, 1));
  slots[12].props.onPress();
  assert.deepEqual(selectedSlots[2], layout.pantrySlotPlacement(2, 2));
});

test('pantry can hide add targets while keeping the shelves and products visible', () => {
  const item = { instanceId: 'milk', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
    ...layout.pantrySlotPlacement(2) };
  const tree = nodes(PantryShelf({ items: [item], selectedId: null, onSelect() {}, onPlace() {},
    onAddAt() {}, canAdd: true, showAddSlots: false, scrollGesture: gesture() }));
  assert.equal(tree.filter((node) => node.props.testID?.startsWith('pantry-slot-')).length, 0);
  assert.equal(tree.filter((node) => node.props.testID === 'pantry-wood-shelf').length, 3);
  assert.ok(tree.some((node) => node.props.testID === 'pantry-item-milk'));
});

test('products render on the shelf even with a legacy vertical position', () => {
  const item = { instanceId: 'milk-1', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
    x: 0.4, y: 0.6, size: 0.28 };
  const tree = PantryShelf({ items: [item], selectedId: null, onSelect() {}, onPlace() {},
    onAddAt() {}, canAdd: true, scrollGesture: gesture() });
  const rendered = nodes(tree);
  assert.deepEqual(rendered.filter((node) => node.type === 'Image').map((node) => node.props.source), [item.product.illustrationUrl]);
  const product = rendered.find((node) => node.props.testID === 'pantry-item-milk-1');
  const placement = frameStyle(product).evaluate();
  assert.equal(placement.width, layout.pantryProductWidth(item.size) * canvasWidth);
  assert.equal(placement.left, item.x * canvasWidth - placement.width / 2);
  const surfaceY = layout.PANTRY_SHELF_SURFACE_Y * (canvasWidth / layout.PANTRY_ASPECT_RATIO);
  assert.ok(Math.abs(placement.top + placement.height - surfaceY) < 1e-10);
  assert.deepEqual(product.props.accessibilityActions.map((action) => action.name),
    ['activate', 'left', 'right', 'shelfDown']);
  assert.equal(product.props.accessibilityRole, 'button');
  assert.equal(product.props.accessibilityValue, undefined);
});

test('accessible movement keeps product size and shelf baseline unchanged', () => {
  const item = { instanceId: 'milk-1', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
    x: 0.4, y: 0.6, size: 0.28 };
  const placements = [];
  const tree = PantryShelf({ items: [item], selectedId: null, onSelect() {},
    onPlace: (id, placement) => placements.push({ id, placement }), onAddAt() {}, canAdd: true,
    scrollGesture: gesture() });
  const product = nodes(tree).find((node) => node.props.testID === 'pantry-item-milk-1');
  product.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
  assert.equal(placements.length, 0, 'selecting with accessibility must not rewrite the saved layout');
  for (const actionName of ['left', 'right']) {
    product.props.onAccessibilityAction({ nativeEvent: { actionName } });
  }
  assert.equal(placements.length, 2);
  for (const { id, placement } of placements) {
    assert.equal(id, item.instanceId);
    assert.equal(placement.size, item.size);
    assert.ok(Math.abs(placement.y + placement.size * layout.PANTRY_ASPECT_RATIO / 2 - layout.PANTRY_SHELF_SURFACE_Y) < 1e-10);
  }
});

test('selection and reduced vertical space preserve every shelf and product rectangle', () => {
  const item = { instanceId: 'milk-1', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
    ...layout.clampPantryPlacement({ x: 0.4, y: 0, size: 0.28 }) };
  const props = { items: [item], onSelect() {}, onPlace() {}, onAddAt() {}, canAdd: true, scrollGesture: gesture() };
  const snapshot = (selectedId, height) => {
    frameLayout = { width: 370, height };
    const tree = PantryShelf({ ...props, selectedId });
    const rendered = nodes(tree);
    const canvas = rendered.find((node) => node.props.testID === 'pantry-canvas');
    const product = rendered.find((node) => node.props.testID === 'pantry-item-milk-1');
    if (selectedId) {
      assert.deepEqual(product.props.style[3], { zIndex: 1 });
      assert.equal(product.props.style[0].borderWidth, undefined);
      assert.equal(product.props.style[0].backgroundColor, undefined);
    }
    assert.equal(tree.props.style[0].flexShrink, 0);
    return {
      canvas: canvas.props.style,
      shelves: rendered.filter((node) => node.props.testID === 'pantry-wood-shelf').map((node) => node.props.style),
      product: frameStyle(product).evaluate(),
    };
  };
  try {
    const before = snapshot(null, 514);
    assert.deepEqual(snapshot(item.instanceId, 340), before);
    assert.deepEqual(snapshot(null, 320), before);
  } finally { frameLayout = { width: 370, height: 514 }; }
});

test('real drag callbacks share occupied positions and expose no pinch gesture', () => {
  const product = { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
  const items = [0.25, 0.55].map((x, i) => ({ instanceId: `milk-${i}`, product,
    ...layout.clampPantryPlacement({ x, y: 0, size: 0.28 }) }));
  const committed = [];
  const selections = [];
  const tree = nodes(PantryShelf({ items, selectedId: null, onSelect: (id) => selections.push(id),
    onPlace: (id, placement) => committed.push({ id, placement }), onAddAt() {}, canAdd: true,
    scrollGesture: gesture() }));
  const gestures = tree.filter((node) => node.type === 'GestureDetector').map((node) => node.props.gesture);
  assert.deepEqual(gestures.map((combined) => combined.length), [2, 2]);
  const styles = tree.filter((node) => node.type === 'Animated.View'
    && node.props.testID?.startsWith('pantry-item-')).map(frameStyle);
  const assertNoOverlap = () => {
    const boxes = styles.map((style) => style.evaluate()).sort((a, b) => a.left - b.left);
    assert.ok(boxes[1].left >= boxes[0].left + boxes[0].width + canvasWidth * layout.PANTRY_PRODUCT_GAP - 1e-9);
  };
  const firstPan = gestures[0][0].handlers;
  const secondPan = gestures[1][0].handlers;
  firstPan.onStart(); secondPan.onStart();
  for (const delta of [30, 60, 90, 120, 150, 180]) {
    firstPan.onUpdate({ translationX: delta, translationY: 0 });
    assertNoOverlap();
    secondPan.onUpdate({ translationX: -delta / 2, translationY: 0 });
    assertNoOverlap();
  }
  firstPan.onFinalize({}, true); secondPan.onFinalize({}, true);
  assert.equal(committed.length, 2);
  assert.deepEqual(selections, [], 'dragging must not open the focus panel');
  gestures[0][1].handlers.onEnd({}, true);
  assert.deepEqual(selections, ['milk-0']);
  assert.equal(committed[0].id, 'milk-0');
  assert.equal(committed[1].id, 'milk-1');
});

test('vertical drag snaps to each shelf and accessible horizontal moves keep that shelf', () => {
  const product = { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
  const item = { instanceId: 'milk-row', product, ...layout.pantrySlotPlacement(2) };
  const commits = [];
  const tree = nodes(PantryShelf({ items: [item], selectedId: null, onSelect() {},
    onPlace: (_id, placement) => commits.push(placement), onAddAt() {}, canAdd: true, scrollGesture: gesture() }));
  const pan = tree.find((node) => node.type === 'GestureDetector').props.gesture[0].handlers;
  const style = frameStyle(tree.find((node) => node.props.testID === 'pantry-item-milk-row'));
  const height = canvasWidth / layout.PANTRY_ASPECT_RATIO;
  pan.onStart();
  for (const shelfIndex of [1, 2]) {
    pan.onUpdate({ translationX: 0, translationY: (layout.PANTRY_SHELF_SURFACE_YS[shelfIndex] - layout.PANTRY_SHELF_SURFACE_Y) * height });
    const frame = style.evaluate();
    assert.equal(frame.height, item.size * canvasWidth);
    assert.ok(Math.abs(frame.top + frame.height - layout.PANTRY_SHELF_SURFACE_YS[shelfIndex] * height) < 1e-9);
  }
  pan.onFinalize({}, true);
  assert.equal(commits[0].shelfIndex, 2);
  const saved = { ...item, ...commits[0] };
  const rendered = nodes(PantryShelf({ items: [saved], selectedId: saved.instanceId, onSelect() {},
    onPlace: (_id, placement) => commits.push(placement), onAddAt() {}, canAdd: true, scrollGesture: gesture() }));
  const element = rendered.find((node) => node.props.testID === 'pantry-item-milk-row');
  assert.deepEqual(element.props.accessibilityActions.map((action) => action.name), ['activate', 'left', 'right', 'shelfUp']);
  element.props.onAccessibilityAction({ nativeEvent: { actionName: 'left' } });
  assert.equal(commits[1].shelfIndex, 2);
  element.props.onAccessibilityAction({ nativeEvent: { actionName: 'shelfUp' } });
  assert.equal(commits[2].shelfIndex, 1);
});

test('pantry editor source contains no resize gesture, controls, or labels', () => {
  const shelfSource = readFileSync(new URL('../../src/components/PantryShelf.tsx', import.meta.url), 'utf8');
  const screenSource = readFileSync(new URL('../../src/screens/PantryScreen.tsx', import.meta.url), 'utf8');
  const translationsSource = readFileSync(new URL('../../src/i18n/translations.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(shelfSource, /Gesture\.Pinch|increment|decrement|pantry\.(?:enlarge|shrink)/);
  assert.doesNotMatch(screenSource, /pantry-(?:enlarge|shrink|size)|pantry\.(?:enlarge|shrink)/);
  assert.doesNotMatch(translationsSource, /enlarge:|shrink:|Pellizca|Pessiga/);
});

test('pantry screen omits passive swipe and add-slot helper messages', () => {
  const screenSource = readFileSync(new URL('../../src/screens/PantryScreen.tsx', import.meta.url), 'utf8');
  const translationsSource = readFileSync(new URL('../../src/i18n/translations.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(screenSource, /pantry\.(?:swipeToReturn|selectHint|empty)\b/);
  assert.doesNotMatch(translationsSource, /swipeToReturn:|selectHint:|Toca un hueco de la balda|Toca un espai del prestatge/);
});

test('saved products remain visible while the UI-thread positions snapshot is still empty', () => {
  const item = { instanceId: 'restored-milk', product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' },
    ...layout.pantrySlotPlacement(2, 1) };
  const props = { items: [item], selectedId: null, onSelect() {}, onPlace() {}, onAddAt() {},
    canAdd: true, scrollGesture: gesture() };
  const findProduct = () => nodes(PantryShelf(props)).find((node) => node.props.testID === 'pantry-item-restored-milk');
  const expected = frameStyle(findProduct()).evaluate();
  const reanimated = dependencies['react-native-reanimated'];
  const original = reanimated.useSharedValue;
  try {
    // AsyncStorage has restored React's items; the UI runtime has not received
    // the effect that synchronizes the shared positions yet.
    reanimated.useSharedValue = (value) => ({ value: value && typeof value === 'object' ? {} : value });
    const restored = frameStyle(findProduct()).evaluate();
    assert.notEqual(restored.opacity, 0, 'a valid saved product must not disappear during hydration');
    assert.deepEqual(restored, expected, 'the saved geometry is sufficient before positions synchronize');
  } finally { reanimated.useSharedValue = original; }
});

test('fridge renders the shared interactive shelf editor with cold shelves and real add/drag callbacks', () => {
  dependencies['react-native'].ScrollView = 'ScrollView';
  dependencies['react-native'].Text = 'Text';
  dependencies['react-native-gesture-handler'].Gesture.Native = gesture;
  dependencies['expo-linear-gradient'] = { LinearGradient: 'LinearGradient' };
  dependencies['../constants/typography'] = { fonts: {} };
  dependencies['./PantryShelf'] = { __esModule: true, default: PantryShelf };
  const PantryFridge = loadComponent('PantryFridge').default;
  const product = { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' };
  const item = { instanceId: 'cold-milk', product, ...layout.pantrySlotPlacement(2, 0) };
  const additions = [];
  const moves = [];
  let addedShelves = 0;
  const rendered = nodes(PantryFridge({ bottomPadding: 100, items: [item], shelfCount: 4, selectedId: null,
    canAdd: true, onSelect() {}, onPlace: (id, placement) => moves.push({ id, placement }),
    onAddAt: (placement) => additions.push(placement), onAddShelf: () => addedShelves++, footer: null }));
  assert.equal(rendered.filter((node) => node.props.testID === 'pantry-wood-shelf').length, 4);
  assert.equal(rendered.filter((node) => node.type === 'SvgImage').length, 0, 'cold boards use the flat finish');
  assert.equal(rendered.filter((node) => node.props.testID?.startsWith('fridge-slot-')).length, 19);
  rendered.find((node) => node.props.testID === 'fridge-slot-8').props.onPress();
  assert.equal(additions[0].shelfIndex, 1);
  const productNode = rendered.find((node) => node.props.testID === 'fridge-item-cold-milk');
  productNode.props.onAccessibilityAction({ nativeEvent: { actionName: 'shelfDown' } });
  assert.equal(moves[0].placement.shelfIndex, 1);
  const drag = rendered.find((node) => node.type === 'GestureDetector' && Array.isArray(node.props.gesture)).props.gesture[0].handlers;
  drag.onStart();
  drag.onUpdate({ translationX: 30, translationY: layout.PANTRY_SHELF_SPACING_Y * canvasWidth / layout.PANTRY_ASPECT_RATIO });
  drag.onFinalize({}, true);
  assert.equal(moves[1].id, item.instanceId);
  assert.equal(moves[1].placement.shelfIndex, 1);
  assert.notEqual(moves[1].placement.x, item.x);
  rendered.find((node) => node.props.testID === 'fridge-add-shelf').props.onPress();
  assert.equal(addedShelves, 1);
});
