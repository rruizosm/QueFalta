import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

function harness(reducedMotion = false) {
  let stateCursor, refCursor, effectCursor;
  const states = [], refs = [], effects = [], pending = [];
  let size = { width: 390, height: 844 };
  let measurement;
  const animations = [];
  const animationQueue = [];
  let props = { notes: 'Abierto\nConsumir pronto', name: 'Leche', testID: 'note-milk', enabled: true };
  const dependencies = {
    'react/jsx-runtime': { jsx, jsxs },
    react: {
      useCallback: fn => fn,
      useState: initial => {
        const i = stateCursor++;
        if (!(i in states)) states[i] = initial;
        return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
      },
      useRef: initial => refs[refCursor++] ??= { current: initial },
      useEffect: (fn, deps) => {
        const i = effectCursor++;
        if (!effects[i] || deps.some((dep, index) => dep !== effects[i].deps[index])) {
          effects[i]?.cleanup?.();
          effects[i] = { deps };
          pending.push(() => { effects[i].cleanup = fn(); });
        }
      },
    },
    'react-native': { Modal: 'Modal', View: 'View', Pressable: 'Pressable', Text: 'Text', ScrollView: 'ScrollView',
      StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute' } }, useWindowDimensions: () => size },
    '@expo/vector-icons/Ionicons': 'Icon',
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 50, bottom: 34, left: 0, right: 0 }) },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'Animated.View' },
      Easing: { cubic: 'cubic', out: value => `out-${value}`, inOut: value => `inOut-${value}` },
      runOnJS: fn => fn,
      useSharedValue: initial => {
        const i = refCursor++;
        if (!refs[i]) {
          const shared = { value: initial, set(next) {
            if (typeof next === 'object') {
              animations.push(next);
              animationQueue.push({ shared, ...next });
            } else shared.value = next;
          } };
          refs[i] = { current: shared };
        }
        return refs[i].current;
      },
      withTiming: (value, config, callback) => ({ value, config, callback }),
      cancelAnimation: shared => {
        for (let i = animationQueue.length - 1; i >= 0; i--) if (animationQueue[i].shared === shared) animationQueue.splice(i, 1);
      },
      useAnimatedStyle: fn => ({ evaluate: fn }),
    },
    '../hooks/useReducedMotion': { useReducedMotion: () => reducedMotion },
    '../constants/colors': { colors: {} }, '../constants/typography': { fonts: {} },
    '../context/LanguageContext': { useTranslation: () => ({ t: key => key }) },
    '../context/ThemeContext': { useThemedStyles: factory => factory() },
  };
  const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/components/PantryNoteButton.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(name => {
    assert.ok(name in dependencies, name);
    return dependencies[name];
  }, module, module.exports);
  const render = changes => {
    props = { ...props, ...changes };
    stateCursor = refCursor = effectCursor = 0;
    const tree = module.exports.default(props);
    pending.splice(0).forEach(fn => fn());
    const button = find(tree, 'note-milk');
    if (button) button.props.ref.current = { measureInWindow: callback => { measurement = callback; } };
    return tree;
  };
  return { render, measure: (x = 250, y = 430) => measurement(x, y, 44, 44),
    animations, finishAnimations: () => animationQueue.splice(0).forEach(({ shared, value, callback }) => { shared.value = value; callback?.(true); }),
    resize: value => { size = value; }, unmount: () => effects.forEach(effect => effect?.cleanup?.()) };
}
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const find = (tree, id) => nodes(tree).find(node => node.props?.testID === id);
const modal = tree => nodes(tree).find(node => node.type === 'Modal');
function press(h) {
  let stopped = false;
  find(h.render(), 'note-milk').props.onPress({ stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'reading a note must not also open the product');
}

test('notes need nonempty text and an enabled inventory; the button retains the trash touch size and feedback', () => {
  const h = harness();
  assert.equal(h.render({ notes: ' \n ' }), null);
  assert.equal(h.render({ notes: 'Nota', enabled: false }), null);
  const button = find(h.render({ enabled: true }), 'note-milk');
  const style = Object.assign({}, ...button.props.style({ pressed: true }));
  assert.equal(style.width, 44);
  assert.equal(style.height, 44);
  assert.equal(style.opacity, 0.5);
  assert.equal(modal(h.render()), undefined);
});

test('reading opens a native overlay above the product with unchanged multiline text and accessibility dismissal', () => {
  const h = harness();
  press(h);
  h.measure();
  let tree = h.render();
  assert.equal(modal(tree).props.transparent, true);
  assert.equal(modal(tree).props.presentationStyle, 'overFullScreen');
  find(tree, 'note-milk-popup').props.onLayout({ nativeEvent: { layout: { height: 180 } } });
  tree = h.render();
  const popup = find(tree, 'note-milk-popup');
  const bubble = find(tree, 'note-milk-bubble');
  const position = Object.assign({}, ...bubble.props.style);
  assert.equal(position.top, 430 + 22 - 14 - 14 - 180);
  assert.deepEqual(position.transformOrigin, [250 + 22 - position.left, 194, 0]);
  assert.equal(bubble.props.style.at(-1).evaluate().opacity, 0, 'starts collapsed at the tip');
  h.finishAnimations();
  assert.equal(bubble.props.style.at(-1).evaluate().opacity, 1);
  assert.equal(popup.props.accessibilityViewIsModal, true);
  assert.ok(nodes(tree).some(node => node.type === 'ScrollView'));
  assert.ok(nodes(tree).some(node => node.type === 'Text' && node.props.children === 'Abierto\nConsumir pronto'));
  assert.equal(find(tree, 'note-milk').props.accessibilityState.expanded, true);
  find(tree, 'note-milk-popup').props.onAccessibilityEscape();
  assert.ok(modal(h.render()), 'keep the bubble mounted throughout the closing animation');
  h.finishAnimations();
  assert.equal(modal(h.render()), undefined);
});

test('notes stay within safe screen edges, support long text, and close through backdrop or platform back', () => {
  const h = harness();
  h.render({ notes: 'Texto largo\n'.repeat(200) });
  press(h);
  h.measure(0, 30);
  find(h.render(), 'note-milk-popup').props.onLayout({ nativeEvent: { layout: { height: 360 } } });
  let tree = h.render();
  const position = Object.assign({}, ...find(tree, 'note-milk-bubble').props.style);
  assert.equal(position.top, 30 + 22 + 14 + 14, 'opens below a product near the top edge');
  assert.equal(position.left, 12);
  assert.equal(Object.assign({}, ...find(tree, 'note-milk-popup').props.style).maxHeight, 360);
  assert.equal(position.transformOrigin[1], -14, 'upward tip is also the animation origin');
  find(tree, 'note-milk-backdrop').props.onPress();
  h.finishAnimations();
  assert.equal(modal(h.render()), undefined);
  press(h); h.measure();
  tree = h.render();
  modal(tree).props.onRequestClose();
  h.finishAnimations();
  assert.equal(modal(h.render()), undefined);
});

test('late native measurements cannot reopen a note after hiding the inventory or unmounting', () => {
  for (const change of ['disabled', 'unmounted', 'resized', 'note-edited']) {
    const h = harness();
    press(h);
    if (change === 'disabled') h.render({ enabled: false });
    if (change === 'unmounted') h.unmount();
    if (change === 'resized') { h.resize({ width: 844, height: 390 }); h.render(); }
    if (change === 'note-edited') h.render({ notes: 'Nueva nota' });
    h.measure();
    assert.equal(modal(h.render()), undefined, change);
  }
});

test('bubble reveal and collapse use the tail origin, wait for exit, and respect reduced motion', () => {
  for (const reduced of [false, true]) {
    const h = harness(reduced);
    press(h); h.measure();
    find(h.render(), 'note-milk-popup').props.onLayout({ nativeEvent: { layout: { height: 180 } } });
    const tree = h.render();
    assert.equal(h.animations.at(-1).value, 1);
    assert.equal(h.animations.at(-1).config.duration, reduced ? 0 : 240);
    h.finishAnimations();
    const bubble = find(tree, 'note-milk-bubble');
    assert.equal(bubble.props.style.at(-1).evaluate().transform[0].scale, 1);
    assert.ok(find(tree, 'note-milk-tail'));
    find(tree, 'note-milk-popup').props.onAccessibilityEscape();
    if (reduced) assert.equal(modal(h.render()), undefined);
    else {
      assert.equal(h.animations.at(-1).value, 0);
      assert.equal(h.animations.at(-1).config.duration, 180);
      assert.ok(modal(h.render()));
      h.finishAnimations();
      assert.equal(modal(h.render()), undefined);
    }
  }
});

test('a closing animation cannot restore a hidden note when its content or inventory changes', () => {
  const h = harness();
  press(h); h.measure();
  find(h.render(), 'note-milk-popup').props.onLayout({ nativeEvent: { layout: { height: 180 } } });
  h.render(); h.finishAnimations();
  find(h.render(), 'note-milk-backdrop').props.onPress();
  h.render({ notes: 'Nueva nota', enabled: false });
  h.finishAnimations();
  assert.equal(modal(h.render({ enabled: true })), undefined);
});
