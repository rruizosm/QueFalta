import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const module = { exports: {} };
new Function('module', 'exports', ts.transpileModule(readFileSync(new URL('../../src/lib/pantryImageData.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(module, module.exports);
const { pantryImageDataUrl } = module.exports;

test('native image fetch passes the original bytes to the canvas as a data URL without CDN CORS', async () => {
  const originalFetch = globalThis.fetch, originalReader = globalThis.FileReader;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, blob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }) };
    };
    globalThis.FileReader = class {
      async readAsDataURL(blob) {
        this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
        this.onload();
      }
    };
    const controller = new AbortController();
    assert.equal(await pantryImageDataUrl('https://images.example.com/photo.png', controller.signal), 'data:image/png;base64,iVBORw==');
    assert.equal(calls[0].url, 'https://images.example.com/photo.png');
    assert.equal(calls[0].options.signal, controller.signal);
  } finally { globalThis.fetch = originalFetch; globalThis.FileReader = originalReader; }
});

test('failed downloads and already cancelled requests do not reach the image decoder', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: false });
    await assert.rejects(pantryImageDataUrl('https://example.com/missing.png', new AbortController().signal), /unavailable/);
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob() });
    const controller = new AbortController(); controller.abort();
    await assert.rejects(pantryImageDataUrl('https://example.com/photo.png', controller.signal), /cancelled/);
  } finally { globalThis.fetch = originalFetch; }
});

test('switching inventories can cancel a pending native blob read', async () => {
  const originalFetch = globalThis.fetch, originalReader = globalThis.FileReader;
  let reading = false;
  try {
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob() });
    globalThis.FileReader = class {
      readAsDataURL() { reading = true; }
      abort() { this.onabort(); }
    };
    const controller = new AbortController();
    const request = pantryImageDataUrl('https://example.com/photo.png', controller.signal);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reading, true);
    const rejection = assert.rejects(request, /cancelled/);
    controller.abort();
    await rejection;
  } finally { globalThis.fetch = originalFetch; globalThis.FileReader = originalReader; }
});
