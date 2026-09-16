import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/lib/recipeCreatorMotion.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { recipeLocalOrigin, shouldDismissRecipe, measureRecipeButton } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
const root = { x: 0, y: 24, width: 393, height: 828 };
const button = { x: 230, y: 715, width: 147, height: 44 };

test('the pill uses root coordinates without adding the status-bar inset twice', () => {
  assert.deepEqual(recipeLocalOrigin(button, root), { ...button, y: 691 });
  assert.deepEqual(recipeLocalOrigin(button, { ...root, x: 15, y: 0 }), { ...button, x: 215 });
});

test('rotation and a disappearing CTA fall back instead of flying to stale geometry', () => {
  assert.equal(recipeLocalOrigin(null, root), null);
  assert.equal(recipeLocalOrigin(button, null), null);
  assert.equal(recipeLocalOrigin(button, { ...root, width: 852, height: 369 }), null);
  assert.equal(recipeLocalOrigin({ ...button, x: -10 }, root), null);
  assert.equal(recipeLocalOrigin({ ...button, width: 0 }, root), null);
  assert.equal(recipeLocalOrigin({ ...button, y: NaN }, root), null);
});

test('short swipes and reversed swipes preserve the draft; deliberate downswipes dismiss', () => {
  assert.equal(shouldDismissRecipe(55, 0, 852), false);
  assert.equal(shouldDismissRecipe(160, 0, 852), true);
  assert.equal(shouldDismissRecipe(30, 1000, 852), true);
  assert.equal(shouldDismissRecipe(5, 1500, 852), false);
  assert.equal(shouldDismissRecipe(-80, -900, 852), false);
  assert.equal(shouldDismissRecipe(200, -800, 852), false);
  assert.equal(shouldDismissRecipe(80, 0, 393), true);
  assert.equal(shouldDismissRecipe(200, 1000, 0), false);
});

test('native measurement handles missing and zero-size source nodes', async () => {
  assert.equal(await measureRecipeButton(null), null);
  assert.equal(await measureRecipeButton({ measureInWindow: (callback) => callback(0, 0, 0, 0) }), null);
  assert.deepEqual(await measureRecipeButton({
    measureInWindow: (callback) => callback(button.x, button.y, button.width, button.height),
  }), button);
});

test('a lost native callback cannot trap the user in opening or closing', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = measureRecipeButton({ measureInWindow: () => {} });
  t.mock.timers.tick(101);
  assert.equal(await result, null);
});
