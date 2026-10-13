/** Offline CPU benchmark. Optional argument: path to an earlier pantryLayout.ts. */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

function load(path) {
  const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  new Function('module', 'exports', outputText)(module, module.exports);
  return module.exports;
}
const current = load(new URL('../src/lib/pantryLayout.ts', import.meta.url));
const versions = process.argv[2] ? [['baseline', load(process.argv[2])], ['current', current]] : [['current', current]];
const results = [];
for (const count of [25, 100, 500]) {
  const shelfCount = Math.ceil(count / current.PANTRY_SLOT_COUNT);
  const items = Array.from({ length: count }, (_, index) => ({
    instanceId: `copy-${index}`,
    product: { id: '10699', name: 'Leche', illustrationUrl: 'https://example.com/milk.webp' },
    ...current.defaultPantryPlacement(index, shelfCount),
  }));
  for (const [version, lib] of versions) {
    for (const operation of ['arrangePantryItems', 'availablePantrySlots']) {
      // Warm the JIT before timing; results are averages, not UI/FPS measurements.
      for (let n = 0; n < 500; n++) lib[operation](items, shelfCount);
      const loops = count === 500 ? 300 : 1000;
      const start = performance.now();
      for (let n = 0; n < loops; n++) lib[operation](items, shelfCount);
      results.push({ version, products: count, operation, meanMs: +((performance.now() - start) / loops).toFixed(3) });
    }
  }
}
console.table(results);
