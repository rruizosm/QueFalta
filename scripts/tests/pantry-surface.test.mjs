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
    useContext: () => null, useRef: (initial) => ({ current: initial }), useCallback: (fn) => fn, useEffect: () => {}, useMemo: (factory) => factory(), useId: () => ':shelf:',
    useState: (initial) => [typeof initial === 'object' ? frameLayout : initial, () => {}],
  },
  'react-native': { Pressable: 'Pressable', View: 'View', Text: 'Text', StyleSheet: { create: (styles) => styles, absoluteFill: {} } },
  '../constants/typography': { fonts: { semibold: 'semibold' } },
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
    Easing: { inOut: fn => fn, cubic: value => value }, withTiming: value => value,
    runOnJS: (fn) => fn, useAnimatedStyle: (fn) => ({ ...fn(), evaluate: fn }), useSharedValue: (value) => ({ value }),
  },
  '../hooks/useReducedMotion': { useReducedMotion: () => false },
  '../constants/colors': { colors },
  '../context/LanguageContext': { useTranslation: () => ({ t: (key) => key }) },
  '../context/ThemeContext': { useThemedStyles: (factory) => factory(), useTheme: () => ({ scheme: 'light' }) },
  '../lib/pantryLayout': layout,
  './PantryShelfLabel': 'PantryShelfLabel',
  './PantryNoteButton': 'PantryNoteButton',
  './PantryExpiryAlarm': 'PantryExpiryAlarm',
  './PantryImageBoundsProbe': { __esModule: true, default: 'PantryImageBoundsProbe', pantryImageBoundsCache: new Map() },
  './bottom-tabs-pager/PagerGestureContext': { PagerGestureContext: {} },
};
function loadComponent(name, overrides = {}) {
  const source = readFileSync(new URL(`../../src/components/${name}.tsx`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)((name) => {
    assert.ok(name in overrides || name in dependencies, `Unexpected dependency (including old cabinet): ${name}`);
    return overrides[name] ?? dependencies[name];
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
  assert.equal(normal.filter((node) => node.type === 'PantryShelfLabel' && node.props.label).length, 1);
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
  const headerHeight = tree.find((node) => node.type === 'PantryShelfLabel').props.editing === false ? 40 : NaN;
  const height = canvasWidth / layout.PANTRY_ASPECT_RATIO;
  drag.onStart();
  drag.onUpdate({ translationX: 0, translationY: 4 * layout.PANTRY_SHELF_SPACING_Y * height });
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
  assert.equal(tree.filter((node) => node.props.testID?.startsWith('pantry-slot-')).length, 22);
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
  const flattened = { ...element, props: { ...element.props, style: Array.isArray(element.props?.style)
    ? element.props.style.filter(Boolean).reduce((style, part) => ({ ...style, ...part }), {}) : element.props?.style } };
  if (flattened.props.style && !Array.isArray(flattened.props.style)) delete flattened.props.style.evaluate;
  // Product frame assertions explicitly inspect the fixed frame and animated mapper.
  if (element.props?.testID?.includes('-item-') || element.props?.testID?.includes('-move-space-')) flattened.props.style = element.props.style;
  return [flattened, ...nodes(element.props?.children)];
}

test('shelves reserve native flow height before animated styles update so the add button stays below', () => {
  const reanimated = dependencies['react-native-reanimated'];
  const originalAnimatedStyle = reanimated.useAnimatedStyle;
  const originalLayout = frameLayout;
  try {
    // Model the first native layout before the UI-thread style update arrives.
    reanimated.useAnimatedStyle = () => ({});
    const Shelf = loadComponent('PantryShelf').default;
    for (const width of [320, 532]) for (const shelfCount of [3, 6]) for (const finish of ['wood', 'ice']) {
      frameLayout = { width, height: 0 };
      const rendered = nodes(Shelf({ items: [], shelfCount, finish, selectedId: null,
        onSelect() {}, onPlace() {}, canAdd: true, scrollGesture: gesture() }));
      const spacer = rendered.find(node => node.props.testID === 'pantry-shelf-spacer');
      const canvasWidth = width / expectedShelfWidthRatio;
      const canvasHeight = canvasWidth / layout.PANTRY_ASPECT_RATIO;
      const trim = Math.max(0, layout.pantryShelfSurfaceY(0) * canvasHeight - layout.PANTRY_DEFAULT_SIZE * canvasWidth - 8);
      assert.equal(spacer.props.style.height, canvasHeight * layout.pantryCanvasHeightRatio(shelfCount) - trim);
      assert.ok(spacer.props.style.height > 0);
      assert.equal(spacer.props.pointerEvents, 'none');
    }
  } finally {
    reanimated.useAnimatedStyle = originalAnimatedStyle;
    frameLayout = originalLayout;
  }
});

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
    const frameHeight = rendered.find(node => node.props.testID === 'pantry-shelf-spacer').props.style.height
      + rendered.find(node => node.props.testID === 'pantry-shelf-frame').props.style.paddingBottom;
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

test('only one held product can preview at once and dragging never selects it', () => {
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
  const before = styles.map(style => style.evaluate());
  const firstPan = gestures[0][0].handlers;
  const secondPan = gestures[1][0].handlers;
  firstPan.onStart(); secondPan.onStart();
  for (const delta of [30, 60, 90, 120, 150, 180]) {
    firstPan.onUpdate({ translationX: delta, translationY: 0 });
    assert.ok(Math.abs(styles[0].evaluate().left - before[0].left - delta) < 1e-9);

    const preview = styles.map(style => style.evaluate());
    secondPan.onUpdate({ translationX: -delta / 2, translationY: 0 });
    assert.deepEqual(styles.map(style => style.evaluate()), preview, 'second gesture cannot change the active preview');

  }
  firstPan.onFinalize({}, true); secondPan.onFinalize({}, true);
  assert.equal(committed.length, 1, 'the active product can insert after its neighbour');
  assert.deepEqual(selections, [], 'dragging must not open the focus panel');
  gestures[0][1].handlers.onEnd({}, true);
  assert.deepEqual(selections, ['milk-0']);
  assert.ok(gestures.every(combined => combined[0].options.activateAfterLongPress === 350));
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
  assert.equal(rendered.filter((node) => node.props.testID?.startsWith('fridge-slot-')).length, 17);
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


test('fridge label editing uses cold signs and prevents adding shelves or interacting with products', () => {
  const PantryFridge = loadComponent('PantryFridge').default;
  const item = { instanceId: 'cold-locked', product: { id: '1', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' },
    ...layout.defaultPantryPlacement(0) };
  let writes = 0;
  const label = { name: 'Lácteos', emoji: '🥛' };
  const rendered = nodes(PantryFridge({ bottomPadding: 100, items: [item], shelfCount: 3, selectedId: null,
    canAdd: true, showAddSlots: false, editingLabels: true, shelfLabels: { 0: label },
    onSelect() { writes++; }, onPlace() { writes++; }, onAddShelf() { writes++; },
    onChangeShelfLabel() { writes++; }, footer: null }));
  const signs = rendered.filter(node => node.type === 'PantryShelfLabel');
  assert.equal(signs.length, 3);
  assert.equal(signs[0].props.finish, 'ice');
  assert.equal(signs[0].props.testIDPrefix, 'fridge');
  assert.deepEqual(signs[0].props.label, label);
  const addShelf = rendered.find(node => node.props.testID === 'fridge-add-shelf');
  assert.equal(addShelf.props.disabled, true);
  addShelf.props.onPress();
  const product = rendered.find(node => node.props.testID === 'fridge-item-cold-locked');
  assert.equal(product.props.accessibilityState.disabled, true);
  product.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } });
  assert.equal(writes, 0);
});


test('delete mode exposes a red trash button per instance and blocks selection and movement', () => {
  const product = { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
  const items = ['milk-one', 'milk-two'].map((instanceId, index) => ({ instanceId, product,
    ...layout.pantrySlotPlacement(index, 0) }));
  const removed = [];
  let interactions = 0;
  const props = { items, selectedId: null, canAdd: true, showAddSlots: false,
    scrollGesture: gesture(), onSelect() { interactions++; }, onPlace() { interactions++; } };
  const normal = nodes(PantryShelf(props));
  assert.equal(normal.filter(node => node.props.testID?.startsWith('pantry-delete-item-')).length, 0);
  const deleting = nodes(PantryShelf({ ...props, onRemove: id => removed.push(id) }));
  const buttons = deleting.filter(node => node.props.testID?.startsWith('pantry-delete-item-'));
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(button => nodes(button).some(node => node.props.name === 'trash' && node.props.color === '#D32F2F')));
  buttons[1].props.onPress({ stopPropagation() {} });
  assert.deepEqual(removed, ['milk-two'], 'delete only the chosen copy of a product');
  for (const node of deleting.filter(node => node.type === 'GestureDetector')) {
    assert.ok(node.props.gesture.every(g => g.options.enabled === false));
    node.props.gesture[1].handlers.onEnd({}, true);
  }
  const item = deleting.find(node => node.props.testID === 'pantry-item-milk-one');
  assert.equal(item.props.accessible, false, 'the nested delete button stays accessible');
  item.props.onAccessibilityAction({ nativeEvent: { actionName: 'shelfDown' } });
  assert.equal(interactions, 0);
  assert.deepEqual(frameStyle(item).evaluate(), frameStyle(normal.find(node => node.props.testID === 'pantry-item-milk-one')).evaluate());
});

test('trash badge follows the visible image corner including contain offset and retains its touch size', () => {
  const url = 'https://example.com/transparent-bottle.png';
  const cache = dependencies['./PantryImageBoundsProbe'].pantryImageBoundsCache;
  cache.set(url, { left: .35, top: .2, right: .65, bottom: .95 });
  try {
    const item = { instanceId: 'bottle', product: { id: 'bottle', name: 'Botella', illustrationUrl: url },
      ...layout.defaultPantryPlacement(0) };
    const rendered = nodes(PantryShelf({ items: [item], selectedId: null, canAdd: true, showAddSlots: false,
      scrollGesture: gesture(), onSelect() {}, onPlace() {}, onRemove() {} }));
    const button = rendered.find(node => node.props.testID === 'pantry-delete-item-bottle');
    const imageSide = item.size * canvasWidth;
    const imageLeft = (layout.pantryProductWidth(item.size) * canvasWidth - imageSide) / 2;
    // The center of the 44 pt touch target is exactly the visible upper-right corner.
    const target = rendered.find(node => node.props.testID === 'pantry-delete-target-bottle');
    const buttonStyle = target.props.style;
    assert.ok(Math.abs(buttonStyle.left + 22 - (imageLeft + .65 * imageSide)) < 1e-9);
    assert.ok(Math.abs(buttonStyle.top + 22 - .2 * imageSide) < 1e-9);
    assert.equal(buttonStyle.width, 44);
    assert.equal(buttonStyle.height, 44);
    assert.equal(buttonStyle.zIndex, 10, 'animated positioning must preserve the trash layer above neighboring products');
    const touchStyle = Object.assign({}, ...button.props.style({ pressed: false }).filter(Boolean));
    assert.equal(touchStyle.width, 44);
    assert.equal(touchStyle.height, 44);
    const productNode = rendered.find(node => node.props.testID === 'pantry-item-bottle');
    assert.equal(nodes(productNode).some(node => node.props.testID === 'pantry-delete-item-bottle'), false,
      'delete control must live outside the compact product hit rectangle');
    const face = rendered.find(node => node.props.style?.width === 26.4);
    assert.equal(face.props.style.height, 26.4);
  } finally { cache.delete(url); }
});

test('measured art uses its visible interaction frame and carries the same bounds through drag and accessible moves', () => {
  const visibleBounds = { left: .05, top: .1, right: .95, bottom: .98 };
  const url = 'https://example.com/wide-bread.png';
  const first = { instanceId: 'bread-wide', product: { id: '1', name: 'Panecillos', illustrationUrl: url },
    boundsImageUrl: url, ...layout.clampPantryPlacement({ x: .25, y: 0, size: .28, visibleBounds }) };
  const second = { ...first, instanceId: 'pasta-wide', ...layout.clampPantryPlacement({ x: .65, y: 0, size: .28, visibleBounds }) };
  const commits = [];
  const tree = nodes(PantryShelf({ items: [first, second], selectedId: null, canAdd: true,
    showAddSlots: false, scrollGesture: gesture(), onSelect() {}, onPlace: (id, placement) => commits.push({ id, placement }) }));
  const product = tree.find(node => node.props.testID === 'pantry-item-bread-wide');
  const frame = frameStyle(product).evaluate();
  assert.ok(Math.abs(frame.width - .9 * first.size * canvasWidth) < 1e-9);
  assert.ok(Math.abs(frame.left - (first.x + first.size * (.05 - .5)) * canvasWidth) < 1e-9);
  const detector = tree.find(node => node.type === 'GestureDetector');
  const pan = detector.props.gesture[0].handlers;
  pan.onStart();
  pan.onUpdate({ translationX: 0, translationY: layout.PANTRY_SHELF_SPACING_Y * canvasWidth / layout.PANTRY_ASPECT_RATIO });
  pan.onFinalize({}, true);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].placement.visibleBounds, visibleBounds);
  const otherFrame = frameStyle(tree.find(node => node.props.testID === 'pantry-item-pasta-wide')).evaluate();
  const movedSecond = { ...second, x: otherFrame.left / canvasWidth + layout.pantryHorizontalExtents(second).left };
  assert.equal(layout.isPantryPlacementFree(commits[0].placement, [movedSecond]), true);
  product.props.onAccessibilityAction({ nativeEvent: { actionName: 'right' } });
  assert.deepEqual(commits[1].placement.visibleBounds, visibleBounds);
  assert.equal(commits[1].placement.size, first.size);
});

test('cancelled free drag restores neighbours and accessible arrows choose adjacent positions', () => {
  const product = { id: '1', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
  const visibleBounds = { left: .225, top: 0, right: .775, bottom: 1 };
  const row = layout.compactPantryRow(Array.from({ length: 3 }, () => ({ x: 0, y: 0, size: .28, visibleBounds })), 0);
  const items = row.map((placement, index) => ({ instanceId: `milk-${index}`, product, boundsImageUrl: product.illustrationUrl, ...placement }));
  const moves = [];
  const tree = nodes(PantryShelf({ items, selectedId: null, canAdd: true, showAddSlots: false,
    scrollGesture: gesture(), onSelect() {}, onPlace: (id, placement, beforeId) => moves.push({ id, placement, beforeId }) }));
  const products = items.map(i => tree.find(node => node.props.testID === `pantry-item-${i.instanceId}`));
  const before = products.map(p => frameStyle(p).evaluate());
  const pan = tree.find(node => node.type === 'GestureDetector').props.gesture[0].handlers;
  pan.onStart();
  pan.onUpdate({ translationX: canvasWidth, translationY: 0 });
  assert.notDeepEqual(products.map(p => frameStyle(p).evaluate()), before);
  pan.onFinalize({}, false);
  assert.deepEqual(products.map(p => frameStyle(p).evaluate()), before);
  assert.equal(moves.length, 0, 'a cancelled preview never writes stock');
  products[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'right' } });
  assert.equal(moves[0].beforeId, 'milk-2', 'right moves past exactly one neighbour');
  products[2].props.onAccessibilityAction({ nativeEvent: { actionName: 'left' } });
  assert.equal(moves[1].beforeId, 'milk-1', 'left inserts immediately before the previous neighbour');
});

test('edit controls insert below the chosen shelf, with or without a sign, in both inventories', () => {
  const previousState = dependencies.react.useState;
  let dismissals = 0;
  dependencies.react.useState = initial => [initial, () => {}];
  dependencies['react-native'].Keyboard = { dismiss() { dismissals++; } };
  dependencies['../constants/typography'] = { fonts: { semibold: 'semibold' } };
  dependencies['./GroupIconPickerSheet'] = 'GroupIconPickerSheet';
  dependencies['./PantryWoodSign'] = 'PantryWoodSign';
  try {
    const ShelfLabel = loadComponent('PantryShelfLabel').default;
    for (const [testIDPrefix, finish] of [['pantry', 'wood'], ['fridge', 'ice']]) {
      for (const label of [undefined, { name: 'Galletas', emoji: '🍪' }]) {
        const calls = [];
        const props = { index: 1, label, testIDPrefix, finish, onChange() {}, onInsertShelfBelow: index => calls.push(index), onRemoveShelf: index => calls.push(`remove-${index}`) };
        const normal = nodes(ShelfLabel({ ...props, editing: false }));
        assert.ok(!normal.some(node => node.props.testID === `${testIDPrefix}-insert-shelf-below-1`));
        const editing = nodes(ShelfLabel({ ...props, editing: true }));
        const button = editing.find(node => node.props.testID === `${testIDPrefix}-insert-shelf-below-1`);
        assert.equal(button.props.accessibilityRole, 'button');
        assert.equal(button.props.accessibilityLabel, 'pantry.insertShelfBelow');
        button.props.onPress();
        const removeID = `${testIDPrefix}-remove-shelf-1`;
        assert.ok(!normal.some(node => node.props.testID === removeID));
        const remove = editing.find(node => node.props.testID === removeID);
        assert.equal(remove.props.accessibilityLabel, 'pantry.removeShelf');
        const rowStyle = Object.assign({}, ...ShelfLabel({ ...props, editing: true }).props.style);
        const removeStyle = Object.assign({}, ...remove.props.style({ pressed: false }));
        assert.ok(removeStyle.top >= 0 && removeStyle.top + removeStyle.height <= rowStyle.height,
          'the full delete touch target must stay inside its native parent');
        remove.props.onPress();
        assert.deepEqual(calls, [1, 'remove-1']);
        const occupied = nodes(ShelfLabel({ ...props, editing: true, onRemoveShelf: undefined }));
        assert.ok(!occupied.some(node => node.props.testID === removeID));
      }
    }
    assert.equal(dismissals, 8);
  } finally {
    dependencies.react.useState = previousState;
  }
});


test('holding reveals photo-sized free spaces and release/cancel clears all hints', () => {
  const product = { id: '1', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
  const visibleBounds = { left: .4, top: .1, right: .6, bottom: .95 };
  const row = layout.compactPantryRow([{ x: .5, y: 0, size: .28, visibleBounds }], 0);
  const item = { ...row[0], instanceId: 'held', product, boundsImageUrl: product.illustrationUrl };
  const commits = [];
  const tree = nodes(PantryShelf({ items: [item], selectedId: null, canAdd: true,
    showAddSlots: false, scrollGesture: gesture(), onSelect() {}, onPlace: (...args) => commits.push(args) }));
  const detector = tree.find(node => node.type === 'GestureDetector');
  const hints = tree.filter(node => node.props.testID?.startsWith('pantry-move-space-'));
  const visibleHints = () => hints.map(node => node.props.style[1].evaluate()).filter(style => style.opacity > 0);
  assert.equal(visibleHints().length, 0);
  assert.equal(detector.props.gesture[0].options.activateAfterLongPress, 350);
  const pan = detector.props.gesture[0].handlers;
  pan.onStart();
  assert.equal(visibleHints().length, 3, 'show fitting empty space on every shelf without moving a finger');
  assert.ok(visibleHints().every(style => style.width >= .28 * .2 * canvasWidth));
  assert.ok(hints.every(node => node.props.pointerEvents === 'none'));
  pan.onUpdate({ translationX: 20, translationY: layout.PANTRY_SHELF_SPACING_Y * canvasWidth / layout.PANTRY_ASPECT_RATIO });
  pan.onFinalize({}, true);
  assert.equal(commits[0][1].shelfIndex, 1);
  assert.equal(visibleHints().length, 0);
  pan.onStart();
  assert.ok(visibleHints().length > 0);
  pan.onFinalize({}, false);
  assert.equal(visibleHints().length, 0);
  assert.equal(commits.length, 1);
});


test('floating movement crosses boards smoothly and approximate releases align only after release', () => {
  const product = { id: '1', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
  const bounds = { left: .3, right: .7, top: 0, bottom: 1 };
  const row = layout.compactPantryRow(Array.from({ length: 2 }, () => ({ x: .5, y: 0, size: .28, visibleBounds: bounds })), 0);
  const items = row.map((placement, i) => ({ ...placement, instanceId: `float-${i}`, product, boundsImageUrl: product.illustrationUrl }));
  const commits = [];
  const tree = nodes(PantryShelf({ items, selectedId: null, canAdd: true,
    scrollGesture: gesture(), onSelect() {}, onPlace: (...args) => commits.push(args) }));
  const moving = tree.find(node => node.props.testID === 'pantry-item-float-0');
  const other = tree.find(node => node.props.testID === 'pantry-item-float-1');
  const pan = tree.find(node => node.type === 'GestureDetector').props.gesture[0].handlers;
  const origin = frameStyle(moving).evaluate(), neighbour = frameStyle(other).evaluate();
  pan.onStart();
  for (const delta of [1, 20, 50, 80]) {
    pan.onUpdate({ translationX: 12, translationY: delta });
    const frame = frameStyle(moving).evaluate();
    assert.ok(Math.abs(frame.top - origin.top - delta) < 1e-9);
    assert.ok(Math.abs(frame.left - origin.left - 12) < 1e-9);
    assert.equal(moving.props.style.at(-1).evaluate().zIndex, 20);
    assert.equal(frameStyle(other).evaluate().width, neighbour.width);
  }
  pan.onFinalize({}, false);
  assert.equal(commits.length, 0, 'cancelling a floating drag restores its origin');
  assert.deepEqual(frameStyle(moving).evaluate(), origin);
  pan.onStart();
  pan.onUpdate({ translationX: (items[1].x - items[0].x + .001) * canvasWidth, translationY: 0 });
  assert.ok(Math.abs(frameStyle(moving).evaluate().left - neighbour.left) < 1, 'overlap is allowed while held');
  pan.onFinalize({}, true);
  assert.equal(commits.length, 1, 'an approximate release can align to the adjacent fitting gap');
  assert.ok(frameStyle(moving).evaluate().left > frameStyle(other).evaluate().left, 'held product inserts after its neighbour');
});


test('shelf editor exposes removal for occupied shelves allowed by the complete inventory', () => {
  const calls = [];
  const inventory = { shelfCount: 3, items: [{ ...layout.clampPantryPlacement({ x: .3, y: 0, size: .2, shelfIndex: 1 }),
    instanceId: 'milk', product: { id: '1', name: 'Leche' } }] };
  const props = { ...inventory, selectedId: null, canAdd: true, editingLabels: true,
    scrollGesture: gesture(), onSelect() {}, onPlace() {}, onChangeShelfLabel() {},
    removableShelfIndices: layout.removablePantryShelfIndices(inventory), onRemoveShelf: index => calls.push(index) };
  const signs = nodes(PantryShelf(props)).filter(node => node.type === 'PantryShelfLabel');
  assert.equal(typeof signs[0].props.onRemoveShelf, 'function');
  assert.equal(typeof signs[2].props.onRemoveShelf, 'function');
  signs[1].props.onRemoveShelf(1);
  assert.deepEqual(calls, [1]);
  const loading = nodes(PantryShelf({ ...props, canAdd: false })).filter(node => node.type === 'PantryShelfLabel');
  assert.ok(loading.every(node => node.props.onRemoveShelf === undefined));
});


test('hover insertion opens space on a fitting shelf, remains stable and restores every neighbour on cancellation', () => {
  const product = { id: '1', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
  const bounds = { left: .3, right: .7, top: 0, bottom: 1 };
  const photo = { x: .5, y: 0, size: .28, visibleBounds: bounds };
  const row = layout.compactPantryRow([photo, photo], 1);
  const full = layout.compactPantryRow(Array.from({ length: 3 }, () => ({ ...photo, visibleBounds: undefined })), 2);
  const items = [{ ...layout.clampPantryPlacement({ ...photo, shelfIndex: 0 }), instanceId: 'held' },
    ...row.map((p, i) => ({ ...p, instanceId: `target-${i}` })),
    ...full.map((p, i) => ({ ...p, instanceId: `full-${i}` }))].map(item =>
    ({ ...item, product, boundsImageUrl: item.visibleBounds ? product.illustrationUrl : undefined }));
  const commits = [];
  const tree = nodes(PantryShelf({ items, selectedId: null, canAdd: true,
    scrollGesture: gesture(), onSelect() {}, onPlace: (...args) => commits.push(args) }));
  const products = items.map(item => tree.find(node => node.props.testID === `pantry-item-${item.instanceId}`));
  const frames = () => products.map(p => frameStyle(p).evaluate());
  const initial = frames();
  const pan = tree.find(node => node.type === 'GestureDetector').props.gesture[0].handlers;
  const dx = ((row[0].x + row[1].x) / 2 - items[0].x) * canvasWidth;
  const dy = layout.PANTRY_SHELF_SPACING_Y * canvasWidth / layout.PANTRY_ASPECT_RATIO;
  pan.onStart();
  pan.onUpdate({ translationX: dx, translationY: dy });
  const preview = frames();
  assert.ok(preview[2].left > initial[2].left, 'second neighbour opens the insertion space');
  assert.ok(Math.abs(preview[0].left - initial[0].left - dx) < 1e-9, 'held photo follows the finger');
  for (let i = 0; i < 5; i++) {
    pan.onUpdate({ translationX: dx, translationY: dy });
    assert.deepEqual(frames(), preview, 'hover does not oscillate or accumulate displacement');
  }
  assert.equal(commits.length, 0, 'preview never writes inventory');
  pan.onUpdate({ translationX: dx, translationY: dy * 2 });
  assert.deepEqual(frames().slice(1), initial.slice(1), 'full destination restores the previous preview');
  pan.onUpdate({ translationX: dx, translationY: dy });
  pan.onFinalize({}, false);
  assert.deepEqual(frames(), initial);
  assert.equal(commits.length, 0);
  pan.onStart();
  pan.onUpdate({ translationX: dx, translationY: dy });
  pan.onFinalize({}, true);
  assert.equal(commits.length, 1);
  assert.equal(commits[0][1].shelfIndex, 1);
  assert.equal(commits[0][2], 'target-1', 'save preserves the intended neighbour anchor');
  assert.ok(frames()[2].left > initial[2].left);
});

test('product notes sit inward from the visible trash corner and stay above neighbors, with trash taking priority', () => {
  const annotated = { instanceId: 'annotated', product: { id: 'a', name: 'Leche', illustrationUrl: 'https://example.com/a.png' },
    notes: 'Abierto\nConsumir pronto', ...layout.defaultPantryPlacement(0), visibleBounds: { left: .2, top: .1, right: .8, bottom: .9 } };
  annotated.boundsImageUrl = annotated.product.illustrationUrl;
  for (const prefix of ['pantry', 'fridge']) {
    const props = { items: [annotated], selectedId: null, canAdd: true, scrollGesture: gesture(), onSelect() {}, onPlace() {}, testIDPrefix: prefix };
    const rendered = nodes(PantryShelf(props));
    const note = rendered.find(node => node.type === 'PantryNoteButton');
    assert.equal(note.props.notes, annotated.notes);
    assert.equal(note.props.testID, `${prefix}-note-item-annotated`);
    const target = rendered.find(node => node.props.testID === `${prefix}-note-target-annotated`);
    assert.equal(target.props.style.zIndex, 10);
    const deleting = nodes(PantryShelf({ ...props, onRemove() {} }));
    assert.equal(deleting.some(node => node.type === 'PantryNoteButton'), false);
    const trashTarget = deleting.find(node => node.props.testID === `${prefix}-delete-target-annotated`);
    assert.deepEqual(target.props.style, { ...trashTarget.props.style,
      left: trashTarget.props.style.left - 6, top: trashTarget.props.style.top + 6 },
    'note moves toward the photo center while retaining its touch layer');
    assert.equal(nodes(PantryShelf({ ...props, editingLabels: true })).some(node => node.type === 'PantryNoteButton'), false);
    const hidden = nodes(PantryShelf({ ...props, notesEnabled: false }));
    assert.equal(hidden.find(node => node.type === 'PantryNoteButton').props.enabled, false);
    assert.equal(nodes(PantryShelf({ ...props, items: [{ ...annotated, notes: '  \n ' }] })).some(node => node.type === 'PantryNoteButton'), false);
  }
});

test('shelf quantities show only multiple units at the photo bottom and keep product activation', () => {
  for (const prefix of ['pantry', 'fridge']) {
    for (const quantity of [undefined, 1, 2, 12, 999]) {
      const item = { instanceId: 'stock', quantity,
        product: { id: 'milk', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' },
        ...layout.defaultPantryPlacement(0), visibleBounds: { left: .2, top: .1, right: .8, bottom: .9 } };
      item.boundsImageUrl = item.product.illustrationUrl;
      let selected;
      const props = { items: [item], selectedId: null, canAdd: true, scrollGesture: gesture(),
        onSelect: id => { selected = id; }, onPlace() {}, testIDPrefix: prefix };
      const rendered = nodes(PantryShelf(props));
      const badge = rendered.find(node => node.props.testID === `${prefix}-quantity-stock`);
      assert.equal(!!badge, quantity > 1);
      const product = rendered.find(node => node.props.testID === `${prefix}-item-stock`);
      assert.equal(product.props.accessibilityLabel, `Leche. ${quantity > 1 ? 'pantry.units' : 'pantry.oneUnit'}`);
      if (!badge) continue;
      assert.equal(badge.props.pointerEvents, 'none');
      assert.equal(badge.props.accessibilityElementsHidden, true);
      assert.equal(badge.props.style.width, 21.6);
      assert.equal(badge.props.style.height, badge.props.style.width);
      assert.equal(badge.props.style.borderRadius, badge.props.style.width / 2);
      assert.ok(Math.abs(badge.props.style.right - 4) < 1e-9);
      assert.ok(Math.abs(badge.props.style.bottom - (item.size * canvasWidth * .1 + 4)) < 1e-9);
      assert.equal(nodes(badge).find(node => node.type === 'Text').props.children, quantity);
      const detector = rendered.find(node => node.type === 'GestureDetector' && Array.isArray(node.props.gesture));
      detector.props.gesture[1].handlers.onEnd({}, true);
      assert.equal(selected, 'stock');
      const hidden = nodes(PantryShelf({ ...props, hiddenId: 'stock' }));
      assert.equal(hidden.find(node => node.props.testID === `${prefix}-quantity-stock`).props.style.opacity, 0);
    }
  }
});

test('expiry alarm replaces notes at the same corner and lets taps open either inventory product', () => {
  for (const prefix of ['pantry', 'fridge']) {
    const item = { instanceId: 'expiry', notes: 'Una nota', expiryDate: '2026-10-30',
      product: { id: 'a', name: 'Leche', illustrationUrl: 'https://example.com/a.png' },
      ...layout.defaultPantryPlacement(0) };
    let selected;
    const props = { items: [item], today: '2026-10-27', selectedId: null, canAdd: true,
      scrollGesture: gesture(), onSelect: id => { selected = id; }, onPlace() {}, testIDPrefix: prefix };
    const alarmTree = nodes(PantryShelf(props));
    const alarm = alarmTree.find(node => node.props.testID === `${prefix}-expiry-alarm-expiry`);
    assert.equal(alarm.props.pointerEvents, 'none');
    assert.equal(alarm.props.style.zIndex, 10);
    assert.equal(alarmTree.some(node => node.type === 'PantryNoteButton'), false);
    assert.match(alarmTree.find(node => node.props.testID === `${prefix}-item-expiry`).props.accessibilityLabel, /pantry.expiringSoon/);
    alarmTree.find(node => node.type === 'GestureDetector' && Array.isArray(node.props.gesture)).props.gesture[1].handlers.onEnd({}, true);
    assert.equal(selected, 'expiry');
    const future = nodes(PantryShelf({ ...props, items: [{ ...item, expiryDate: '2026-10-31' }] }));
    const note = future.find(node => node.props.testID === `${prefix}-note-target-expiry`);
    assert.deepEqual(alarm.props.style, note.props.style);
    const cleared = nodes(PantryShelf({ ...props, items: [{ ...item, expiryDate: undefined }] }));
    assert.ok(cleared.some(node => node.type === 'PantryNoteButton'));
    const expired = nodes(PantryShelf({ ...props, items: [{ ...item, expiryDate: '2026-10-26' }] }));
    assert.match(expired.find(node => node.props.testID === `${prefix}-item-expiry`).props.accessibilityLabel, /pantry.expired/);
    for (const extra of [{ editingLabels: true }, { onRemove() {} }]) {
      assert.equal(nodes(PantryShelf({ ...props, ...extra })).some(node => node.type === 'PantryExpiryAlarm'), false);
    }
    assert.equal(nodes(PantryShelf({ ...props, hiddenId: 'expiry' })).find(node => node.props.testID === `${prefix}-expiry-alarm-expiry`).props.style.opacity, 0);
  }
});

test('long-press release keeps a deliberate gap on pantry and fridge shelves', () => {
  for (const testIDPrefix of ['pantry', 'fridge']) {
    const product = { id: '1', name: 'Leche', illustrationUrl: 'https://example.com/milk.png' };
    const visibleBounds = { left: .3, right: .7, top: 0, bottom: 1 };
    const row = layout.compactPantryRow(Array.from({ length: 2 }, () => ({ x: .5, y: 0, size: .28, visibleBounds })), 0);
    const items = row.map((placement, i) => ({ ...placement, instanceId: `free-${i}`, product, boundsImageUrl: product.illustrationUrl }));
    const commits = [];
    const tree = nodes(PantryShelf({ items, testIDPrefix, selectedId: null, canAdd: true,
      scrollGesture: gesture(), onSelect() {}, onPlace: (...args) => commits.push(args) }));
    const detectors = tree.filter(node => node.type === 'GestureDetector');
    const pan = detectors[1].props.gesture[0].handlers;
    const neighbour = tree.find(node => node.props.testID === `${testIDPrefix}-item-free-0`);
    const origin = frameStyle(neighbour).evaluate();
    pan.onStart();
    pan.onUpdate({ translationX: (.8 - row[1].x) * canvasWidth, translationY: 0 });
    pan.onFinalize({}, true);
    assert.equal(commits.length, 1);
    assert.ok(Math.abs(commits[0][1].x - .8) < 1e-9);
    assert.equal(commits[0][1].manualPosition, true);
    assert.deepEqual(frameStyle(neighbour).evaluate(), origin);
  }
});


test('sign names accept only native-measured prefixes that fit with the emoji and editing buttons', () => {
  let cursor = 0;
  const state = [];
  const writes = [];
  const ShelfLabel = loadComponent('PantryShelfLabel', {
    react: { ...dependencies.react,
      useState(initial) {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = initial;
        return [state[slot], value => { state[slot] = value; }];
      },
      useRef(initial) {
        const slot = cursor++;
        return state[slot] ??= { current: initial };
      },
    },
    'react-native': { ...dependencies['react-native'], TextInput: 'TextInput', Keyboard: { dismiss() {} } },
    './GroupIconPickerSheet': 'GroupIconPickerSheet',
    './PantryWoodSign': 'PantryWoodSign',
  }).default;
  let label = { name: 'Aceite', emoji: '🫒' };
  const render = () => {
    cursor = 0;
    return ShelfLabel({ index: 0, editing: true, label,
      onChange: (_, next) => { writes.push(next); label = next; } });
  };
  const find = (tree, id) => nodes(tree).find(node => node.props.testID === id);
  render().props.onLayout({ nativeEvent: { layout: { width: 370 } } });
  const input = () => find(render(), 'pantry-label-name-0');
  input().props.onChangeText('Aceite de oliva virgen extra');
  assert.equal(writes.length, 0, 'never persist an overflowing candidate before measuring');
  assert.equal(input().props.value, 'Aceite de oliva virgen extra',
    'keep native typing visible while its asynchronous measurement is pending');
  assert.ok(nodes(render()).some(node => node.type === 'Text'
    && node.props.children === 'Aceite de oliva virgen extra'),
  'size the input from the same draft so new characters are not clipped');
  let probe = find(render(), 'pantry-label-fit-0');
  const prefixes = probe.props.children.split('\n');
  assert.equal(prefixes.at(-1), '🫒  Aceite de oliva virgen extra');
  // 370 * .76 - padding 36 - buttons 68 - safety 2 = 175.2 pt.
  probe.props.onTextLayout({ nativeEvent: { lines: prefixes.map((_, i) => ({ width: 25 + i * 8 })) } });
  assert.equal(label.name, 'Aceite de oliva vi');
  assert.equal(label.emoji, '🫒');
  input().props.onChangeText('iiiiiiiiiiiiiiiiiiiiiiii');
  const stale = find(render(), 'pantry-label-fit-0');
  input().props.onChangeText('WWWWWWWWWWWWWWWWWWWWWWWW');
  assert.equal(input().props.value, 'WWWWWWWWWWWWWWWWWWWWWWWW');
  stale.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: 25 }, () => ({ width: 100 })) } });
  assert.equal(writes.length, 1, 'ignore a measurement superseded by newer typing');
  assert.equal(input().props.value, 'WWWWWWWWWWWWWWWWWWWWWWWW',
    'a stale measurement must not rewind the native field');
  probe = find(render(), 'pantry-label-fit-0');
  probe.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: 25 }, (_, i) => ({ width: 25 + i * 15 })) } });
  assert.equal(label.name, 'WWWWWWWWWW', 'wide letters consume more of the available space');
  assert.equal(input().props.value, label.name, 'show the fitted name once the current measurement completes');
  find(render(), 'pantry-label-emoji-0').props.onPress();
  nodes(render()).find(node => node.type === 'GroupIconPickerSheet').props.onSave('🥫');
  probe = find(render(), 'pantry-label-fit-0');
  assert.equal(probe.props.children.split('\n')[0], '🥫  ');
  probe.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: 11 }, (_, i) => ({ width: 35 + i * 15 })) } });
  assert.equal(label.name, 'WWWWWWWWW');
  assert.equal(label.emoji, '🥫', 'changing the emoji also validates the remaining space');
  input().props.onChangeText('iiiiiiiiiiiiiiiiiiiiiiii');
  probe = find(render(), 'pantry-label-fit-0');
  probe.props.onTextLayout({ nativeEvent: { lines: Array.from({ length: 25 }, (_, i) => ({ width: 35 + i * 3 })) } });
  assert.equal(label.name.length, 24, 'narrow letters are allowed to use all available space');
});
