import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const module = { exports: {} };
const source = readFileSync(new URL('../../src/lib/pantryVisibleBounds.ts', import.meta.url), 'utf8');
new Function('module', 'exports', ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(module, module.exports);
const measure = new Function(`return (${module.exports.pantryVisibleBoundsScript})`)();
function pixels(width, height, bounds) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = bounds.top; y < bounds.bottom; y++) {
    for (let x = bounds.left; x < bounds.right; x++) data[(y * width + x) * 4 + 3] = 255;
  }
  return data;
}
test('transparent margins determine the visible corner instead of the canvas corner', () => {
  const data = pixels(100, 100, { left: 30, top: 20, right: 70, bottom: 90 });
  data[3] = 5; // Nearly invisible stray pixel must not pull the corner outwards.
  assert.deepEqual(measure(data, 100, 100), { left: .3, top: .2, right: .7, bottom: .9 });
});
test('non-square images include the centered contain offsets', () => {
  assert.deepEqual(measure(pixels(40, 100, { left: 0, top: 0, right: 40, bottom: 100 }), 40, 100),
    { left: .3, top: 0, right: .7, bottom: 1 });
  assert.deepEqual(measure(pixels(100, 40, { left: 10, top: 5, right: 90, bottom: 35 }), 100, 40),
    { left: .1, top: .35, right: .9, bottom: .65 });
});
test('transparent images have no visible bounds and opaque square images use the full canvas', () => {
  assert.equal(measure(new Uint8ClampedArray(400), 10, 10), null);
  assert.deepEqual(measure(pixels(10, 10, { left: 0, top: 0, right: 10, bottom: 10 }), 10, 10),
    { left: 0, top: 0, right: 1, bottom: 1 });
});

test('decoder HTML measures real RGBA buffers and passes validated bounds through the native bridge', async () => {
  const { jsx, jsxs } = await import('react/jsx-runtime');
  const { runInNewContext } = await import('node:vm');
  const dependencies = {
    react: { memo: x => x, useMemo: fn => fn(), useRef: () => ({ current: null }), useState: () => [false, () => {}], useEffect() {} },
    'react/jsx-runtime': { jsx, jsxs },
    'react-native': { View: 'View', StyleSheet: { create: x => x } },
    './CompatibleWebView': { CompatibleWebView: 'WebView' },
    '../lib/pantryVisibleBounds': module.exports,
    '../lib/pantryImageData': { pantryImageDataUrl() {} },
  };
  const probeModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../../src/components/PantryImageBoundsProbe.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => dependencies[name], probeModule, probeModule.exports);
  const url = 'https://example.com/bottle.png';
  const received = [];
  const decoder = probeModule.exports.default({ urls: [url], onBounds: (...args) => received.push(args) });
  const webView = decoder.type(decoder.props).props.children;
  let requestedUrl;
  class FakeImage {
    naturalWidth = 40;
    naturalHeight = 100;
    set src(value) {
      requestedUrl = value;
      queueMicrotask(() => this.onload());
    }
  }
  const script = webView.props.source.html.split('<script>')[1].split('</script>')[0];
  const sandbox = {
    Image: FakeImage, setTimeout, clearTimeout,
    document: { createElement: () => ({ getContext: () => ({
      drawImage() {}, getImageData: () => ({ data: pixels(40, 100, { left: 5, top: 10, right: 35, bottom: 95 }) }),
    }) }) },
    window: { ReactNativeWebView: { postMessage: data => webView.props.onMessage({ nativeEvent: { data } }) } },
  };
  runInNewContext(script, sandbox);
  sandbox.window.measurePantryImage(url, 'data:image/png;base64,test');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestedUrl, 'data:image/png;base64,test');
  assert.deepEqual(received, [[url, { left: .35, top: .1, right: .65, bottom: .95 }]]);
  webView.props.onMessage({ nativeEvent: { data: JSON.stringify({ url: 'https://unexpected.test', bounds: received[0][1] }) } });
  assert.equal(received.length, 1, 'ignore results outside the current URL list');

  probeModule.exports.pantryImageBoundsCache.clear();
  const bounds = received[0][1];
  const saved = { product: { illustrationUrl: url }, boundsImageUrl: url, visibleBounds: bounds };
  const props = { urls: [url], items: [saved], onBounds() {} };
  assert.equal(probeModule.exports.default(props), null, 'saved geometry needs no WebView after a cold start');
  const plan = probeModule.exports.pantryMeasurementPlan;
  assert.deepEqual(plan([url, url], [saved]), { pending: [], reusable: [[url, bounds]] });
  assert.deepEqual(plan([url], [{ ...saved, boundsImageUrl: 'https://example.com/old.webp' }]).pending, [url],
    'a changed photo cannot reuse stale geometry');
  assert.deepEqual(plan([url], [{ ...saved, visibleBounds: { ...bounds, left: NaN } }]).pending, [url],
    'invalid geometry must still be measured');
  const copy = { ...saved, boundsImageUrl: undefined, visibleBounds: undefined };
  assert.deepEqual(plan([url], [saved, copy]).reusable, [[url, bounds]], 'new copies reuse saved measurements');
  probeModule.exports.pantryImageBoundsCache.set(url, bounds);
  assert.equal(probeModule.exports.default({ ...props, items: [copy] }), null, 'cached photos need no decoder either');
});
