import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { jsx, jsxs } from 'react/jsx-runtime';

function harness() {
  let cursor = 0, reduced = false;
  const slots = [], deps = [], effects = [], cleanups = [], animations = [];
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial;
      return [slots[i], value => { slots[i] = value; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(fn, next) { const i = cursor++;
      if (!deps[i] || next.some((v, index) => !Object.is(v, deps[i][index]))) {
        deps[i] = next; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); });
      }
    },
  };
  class Value {
    constructor(value) { this.value = value; }
    interpolate(config) { return { value: this, config }; }
    stopAnimation() {}
    setValue(value) { this.value = value; }
  }
  const source = readFileSync(new URL('../../src/components/PantryPendingPopover.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs },
    '../hooks/useReducedMotion': { useReducedMotion: () => reduced },
    'react-native': { Animated: { Value, View: 'AnimatedView', timing(value, config) {
      const animation = { config, stopped: false,
        start(callback) { this.callback = callback; },
        stop() { this.stopped = true; this.callback?.({ finished: false }); },
        finish() { value.setValue(config.toValue); this.callback?.({ finished: true }); },
      };
      animations.push(animation); return animation;
    } }, Easing: { bezier: (...curve) => curve } },
  };
  new Function('require', 'module', 'exports', code)(name => {
    assert.ok(name in dependencies, `Unexpected import ${name}`); return dependencies[name];
  }, module, module.exports);
  return {
    animations, reduce: value => { reduced = value; },
    render(open) { cursor = 0;
      const tree = module.exports.default({ open, testID: 'panel', style: {}, children: 'products' });
      effects.splice(0).forEach(fn => fn()); return tree;
    },
    unmount() { cleanups.forEach(fn => fn?.()); },
  };
}

test('panel opens natively, remains mounted during contraction and releases content at completion', () => {
  const h = harness();
  assert.equal(h.render(false), null);
  h.animations.at(-1).finish();
  let panel = h.render(true);
  assert.equal(panel.props.pointerEvents, 'auto');
  assert.equal(h.animations.at(-1).config.useNativeDriver, true);
  assert.equal(h.animations.at(-1).config.duration, 280);
  h.animations.at(-1).finish();
  panel = h.render(false);
  assert.ok(panel);
  assert.equal(panel.props.pointerEvents, 'none');
  assert.equal(panel.props.accessibilityElementsHidden, true);
  assert.equal(h.animations.at(-1).config.duration, 200);
  h.animations.at(-1).finish();
  assert.equal(h.render(false), null);
});

test('reopening cancels contraction without hiding the newly opened panel', () => {
  const h = harness(); h.render(true); h.animations.at(-1).finish();
  h.render(false); const closing = h.animations.at(-1);
  const panel = h.render(true);
  assert.equal(closing.stopped, true);
  assert.equal(panel.props.accessibilityElementsHidden, false);
  h.animations.at(-1).finish();
  assert.ok(h.render(true));
  h.unmount();
  assert.equal(h.animations.at(-1).stopped, true);
});

test('Reduce Motion skips animation and immediately releases closed content', () => {
  const h = harness(); h.reduce(true);
  const panel = h.render(true);
  assert.equal(h.animations.length, 0);
  assert.equal(panel.props.style[1].opacity.value, 1);
  h.render(false);
  assert.equal(h.render(false), null);
  assert.equal(h.animations.length, 0);
});
