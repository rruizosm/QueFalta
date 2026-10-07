import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, modules = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../../src/components/bottom-tabs-pager/${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const sandbox = { exports: {}, require: (name) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`);
    return modules[name];
  } };
  vm.runInNewContext(outputText, sandbox);
  return sandbox.exports;
}

const physics = load('physics.ts');
const constants = load('constants.ts');
const tabs = ['Pantry', 'Home', 'Catalog', 'QueCocino', 'List', 'Groups']
  .map((key) => ({ key, label: key, icon: 'circle', renderPage: () => key }));

function fixture(initialIndex = 1) {
  let cursor = 0;
  const values = [];
  const effects = [];
  const pan = new Proxy({}, { get: () => () => pan });
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react: { useCallback: (fn) => fn, useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': {
      View: 'View', ScrollView: 'ScrollView', StyleSheet: { create: (styles) => styles },
      AppState: { addEventListener: () => ({ remove() {} }) },
    },
    'react-native-gesture-handler': { Gesture: { Pan: () => pan }, GestureDetector: 'GestureDetector' },
    'react-native-reanimated': {
      default: { View: 'Animated.View' }, __esModule: true,
      useSharedValue(value) { const slot = cursor++; return values[slot] ??= { value }; },
      useDerivedValue: (fn) => ({ get value() { return fn(); } }),
      useAnimatedStyle: (fn) => fn(), useFrameCallback() {}, cancelAnimation() {},
      runOnUI: (fn) => fn, runOnJS: (fn) => fn,
      withSpring: (value) => value, withTiming: (value) => value,
    },
    './constants': constants, './physics': physics,
    './ContentBlur': { ContentBlur: 'ContentBlur', gaussianFilterAvailable: false },
  };
  const { useTabAnimation } = load('useTabAnimation.ts', modules);
  const { Pager } = load('Pager.tsx', modules);
  return {
    animation(width) {
      cursor = 0;
      return useTabAnimation({ width, count: tabs.length, initialIndex, reducedMotion: false, onSettled() {} });
    },
    flushEffects() { effects.splice(0).forEach((fn) => fn()); },
    track(width, animation) {
      const tree = Pager({ tabs, width, animation, activeIndex: initialIndex, pageContext: {}, handleGesture: false });
      const walk = (node) => {
        if (!node?.props) return null;
        const style = Object.assign({}, ...(Array.isArray(node.props.style) ? node.props.style : [node.props.style]));
        if (style.transform?.some((transform) => 'translateX' in transform)) return style;
        for (const child of [node.props.children].flat()) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      };
      const style = walk(tree);
      assert.ok(style, 'Pager should render a translated page strip');
      return { width: style.width, x: style.transform.find((transform) => 'translateX' in transform).translateX };
    },
  };
}

test('first measured render shows Home even before the animation width effect runs', () => {
  const f = fixture();
  f.animation(0);
  f.flushEffects();
  const animation = f.animation(402);
  // React has measured the viewport and mounted Pager; its passive effect has
  // not synchronized the UI shared width yet. This was invisible at index 0.
  assert.equal(animation.scrollX.value, 0);
  const track = f.track(402, animation);
  assert.equal(track.width, 6 * 402);
  assert.equal(track.x + 402, 0, 'Home must start at the viewport left edge, not Pantry');
  f.flushEffects();
  assert.equal(f.track(402, animation).x, track.x, 'the width effect must not cause a visual jump');
});

test('the track style worklet uses resized width while the animation layout lags', () => {
  const f = fixture();
  const animation = f.animation(402);
  f.flushEffects();
  animation.progress.value = 0.6;
  const resized = f.animation(844);
  assert.equal(resized.scrollX.value, 0.6 * 402);
  const track = f.track(844, resized);
  assert.equal(track.width, 6 * 844);
  assert.equal(track.x, -0.6 * 844);
});
