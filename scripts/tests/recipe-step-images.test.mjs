import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function load(path, dependencies = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const mod = { exports: {} };
  vm.runInNewContext(outputText, {
    module: mod, exports: mod.exports, AbortController, setTimeout, clearTimeout, ...globals,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return mod.exports;
}

const stepsLib = load('../../src/lib/recipeSteps.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup({ uploadFailure, insertError, fetchedRows = [] } = {}) {
  const uploads = [], removed = [], writes = [], processed = [], queries = [];
  const storage = {
    getPublicUrl: (path) => ({ data: { publicUrl: `https://images.test/${path}` } }),
    async upload(path, bytes, options) {
      uploads.push({ path, options });
      return { error: uploads.length === uploadFailure ? new Error('Upload failed') : null };
    },
    async remove(paths) { removed.push([...paths]); return { error: null }; },
  };
  const supabase = {
    storage: { from: () => storage },
    from(table) {
      return {
        insert(row) {
          writes.push(row);
          return { select: () => ({ single: async () => ({
            error: insertError ?? null,
            data: { ...row, id: 'recipe', created_at: '2026-09-12', like_count: 0, save_count: 0 },
          }) }) };
        },
        select() {
          if (table === 'recipes') {
            const query = { filters: [] };
            queries.push(query);
            const builder = {
              eq(key, value) { query.filters.push([key, value]); return builder; },
              order() { return builder; },
              limit() { return builder; },
              async abortSignal() { return { data: fetchedRows }; },
            };
            return builder;
          }
          return { eq: () => ({ in: async () => ({ data: [] }) }) };
        },
      };
    },
  };
  const api = load('../../src/api/recipes.ts', {
    '../lib/recipeSteps': stepsLib,
    '../lib/supabase': { supabase },
    'expo-image-manipulator': {
      SaveFormat: { JPEG: 'jpeg' },
      ImageManipulator: { manipulate(uri) {
        processed.push(uri);
        return { resize() {}, renderAsync: async () => ({ saveAsync: async () => ({ uri }) }) };
      } },
    },
  }, { fetch: async () => ({ arrayBuffer: async () => new ArrayBuffer(4) }) });
  return { ...api, uploads, removed, writes, processed, queries };
}

const input = {
  userId: 'author', title: ' Arroz ', imageUri: 'cover.jpg', profile: null,
  ingredients: [{ quantity: '250 g', product: { store: 'mercadona', id: 'rice', name: 'Arroz' } }],
  steps: [
    { text: ' ', ingredientKeys: [] },
    { text: 'Lava.', ingredientKeys: ['mercadona:rice'], imageUri: 'wash.jpg' },
    { text: 'Cuece.', ingredientKeys: [] },
    { text: 'Sirve.', ingredientKeys: [], imageUri: 'serve.jpg' },
  ],
};

test('optional photos stay aligned after empty steps are removed and survive a read', async () => {
  const api = setup();
  const recipe = await api.createCommunityRecipe(input);
  assert.deepEqual(api.processed, ['cover.jpg', 'wash.jpg', 'serve.jpg']);
  const row = api.writes[0];
  assert.deepEqual(plain(row.steps), ['Lava.', 'Cuece.', 'Sirve.']);
  assert.deepEqual(plain(row.ingredients[0].stepIndexes), [0]);
  assert.equal(row.step_image_paths[0], api.uploads[1].path);
  assert.equal(row.step_image_paths[1], null);
  assert.equal(row.step_image_paths[2], api.uploads[2].path);
  assert.equal(recipe.stepImageUrls[1], null);
  assert.equal(recipe.stepImageUrls[2], `https://images.test/${api.uploads[2].path}`);
  assert(api.uploads.every(({ options }) => options.contentType === 'image/jpeg' && options.upsert === false));
  const reader = setup({ fetchedRows: [{ ...row, id: 'saved' }] });
  const [saved] = await reader.fetchCommunityRecipes('author');
  assert.deepEqual(plain(saved.stepImageUrls), plain(recipe.stepImageUrls));
});

test('all steps may be text-only and legacy recipes still load', async () => {
  const api = setup();
  const recipe = await api.createCommunityRecipe({ ...input, steps: [{ text: 'Cuece.', ingredientKeys: [] }] });
  assert.equal(api.uploads.length, 1);
  assert.deepEqual(plain(recipe.stepImageUrls), [null]);
  const { step_image_paths, ...legacy } = api.writes[0];
  const reader = setup({ fetchedRows: [legacy] });
  assert.deepEqual(plain((await reader.fetchCommunityRecipes('author'))[0].stepImageUrls), [null]);
});

test('a failed step upload cleans earlier photos and does not publish a partial recipe', async () => {
  const api = setup({ uploadFailure: 3 });
  await assert.rejects(api.createCommunityRecipe(input), /Upload failed/);
  assert.equal(api.writes.length, 0);
  assert.deepEqual(api.removed, [[api.uploads[0].path, api.uploads[1].path]]);
});

test('a rejected insert cleans every uploaded photo', async () => {
  const api = setup({ insertError: { code: '23514', message: 'Rejected' } });
  await assert.rejects(api.createCommunityRecipe(input));
  assert.deepEqual(api.removed, [api.uploads.map(({ path }) => path)]);
});

test('an uncertain insert response retains photos that may already belong to a saved recipe', async () => {
  const api = setup({ insertError: { code: '', message: 'Network error' } });
  await assert.rejects(api.createCommunityRecipe(input));
  assert.equal(api.removed.length, 0);
});

test('a photo without a step description is not silently lost', async () => {
  const api = setup();
  await assert.rejects(api.createCommunityRecipe({ ...input,
    steps: [{ text: ' ', ingredientKeys: [], imageUri: 'photo.jpg' }],
  }), /requires a description/);
  assert.equal(api.uploads.length, 0);
});

test('malformed or foreign image paths are not rendered and never shift later images', async () => {
  const api = setup({ fetchedRows: [{ author_id: 'author', image_path: 'author/cover.jpg',
    steps: ['A', 'B', 'C', 'D'], ingredients: [],
    step_image_paths: ['https://external.test/a.jpg', 'other/a.jpg', 'author/../a.jpg', 'author/good.jpg'],
  }] });
  const [recipe] = await api.fetchCommunityRecipes('author');
  assert.deepEqual(plain(recipe.stepImageUrls), [null, null, null, 'https://images.test/author/good.jpg']);
});

test('the feed uses one query and includes recipes with no likes or saves', async () => {
  const api = setup({ fetchedRows: [
    { id: 'plain', author_id: 'author', image_path: 'author/cover.jpg', steps: ['Cook'], ingredients: [],
      recipe_likes: [], recipe_saves: [], like_count: 4, save_count: 2 },
    { id: 'mine', author_id: 'author', image_path: 'author/cover.jpg', steps: ['Cook'], ingredients: [],
      recipe_likes: [{ user_id: 'viewer' }], recipe_saves: [{ user_id: 'viewer' }], like_count: 1, save_count: 1 },
  ] });
  const rows = await api.fetchCommunityRecipes('viewer');
  assert.equal(api.queries.length, 1);
  assert.deepEqual(api.queries[0].filters, [['recipe_likes.user_id', 'viewer'], ['recipe_saves.user_id', 'viewer']]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].isLiked, false);
  assert.equal(rows[0].isSaved, false);
  assert.equal(rows[0].likeCount, 4);
  assert.equal(rows[1].isLiked, true);
  assert.equal(rows[1].isSaved, true);
});
