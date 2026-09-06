import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function loadRecipeSteps() {
  const source = readFileSync(
    new URL('../../src/lib/recipeSteps.ts', import.meta.url),
    'utf8',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(output, { module: mod, exports: mod.exports });
  return mod.exports;
}

const {
  cleanRecipeSteps,
  normalizeRecipeStepIndexes,
  recipeProductKey,
  stepIndexesForIngredient,
} = loadRecipeSteps();

test('step ingredient links follow non-empty preparation steps after cleanup', () => {
  const rice = recipeProductKey({ store: 'mercadona', id: 'rice-1' });
  const oil = recipeProductKey({ store: 'esclat', id: 'oil-1' });
  const steps = cleanRecipeSteps([
    { text: '   ', ingredientKeys: [rice] },
    { text: '  Cuece el arroz. ', ingredientKeys: [rice, oil, rice] },
    { text: 'Sirve.', ingredientKeys: [rice] },
  ]);

  assert.deepEqual(
    JSON.parse(JSON.stringify(steps)),
    [
      { text: 'Cuece el arroz.', ingredientKeys: [rice, oil] },
      { text: 'Sirve.', ingredientKeys: [rice] },
    ],
  );
  assert.deepEqual([...stepIndexesForIngredient(steps, rice)], [0, 1]);
  assert.deepEqual([...stepIndexesForIngredient(steps, oil)], [0]);
});

test('stored step indexes are deduplicated and constrained to existing steps', () => {
  assert.deepEqual(
    [...normalizeRecipeStepIndexes([2, 0, 2, -1, 3, 1.5, '1', null], 3)],
    [0, 2],
  );
  assert.deepEqual([...normalizeRecipeStepIndexes(null, 3)], []);
});

test('recipe UI stores links without changing the legacy string steps contract', () => {
  const api = readFileSync(new URL('../../src/api/recipes.ts', import.meta.url), 'utf8');
  const creator = readFileSync(
    new URL('../../src/components/CreateRecipeModal.tsx', import.meta.url),
    'utf8',
  );
  const detail = readFileSync(
    new URL('../../src/components/CommunityRecipeDetailModal.tsx', import.meta.url),
    'utf8',
  );

  assert.match(api, /stepIndexesForIngredient\(cleanSteps, recipeProductKey\(ingredient\.product\)\)/);
  assert.match(api, /steps: cleanSteps\.map\(\(step\) => step\.text\)/);
  assert.match(api, /normalizeRecipeStepIndexes\(ingredient\.stepIndexes, steps\.length\)/);
  assert.match(creator, /accessibilityRole="checkbox"/);
  assert.match(creator, /ingredientKeys: step\.ingredientKeys\.filter/);
  assert.match(detail, /ingredient\.stepIndexes\?\.includes\(index\)/);
  assert.match(detail, /ingredient\.quantity/);
});
