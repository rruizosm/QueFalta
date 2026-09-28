import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/api/profile.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function createHarness() {
  const userId = '31f6ca06-eaae-44f6-bc41-446b9cd85663';
  const path = `${userId}/avatar.jpg`;
  const publicUrl = `https://example.test/storage/v1/object/public/avatars/${path}`;
  const publicFiles = new Map([[path, new Uint8Array([1, 2, 3]).buffer]]);
  const privateFiles = new Map();
  const row = { id: userId, avatar_url: publicUrl, avatar_friends_only: false };
  let failPublicRemove = false;
  let failPublicUpload = false;

  const storage = (bucket) => {
    const files = bucket === 'avatars' ? publicFiles : privateFiles;
    return {
      getPublicUrl: (name) => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${name}` } }),
      createSignedUrl: async (name) => files.has(name)
        ? { data: { signedUrl: `https://example.test/storage/v1/object/sign/${bucket}/${name}?token=ok` }, error: null }
        : { data: null, error: new Error('missing') },
      upload: async (name, bytes) => {
        if (bucket === 'avatars' && failPublicUpload) return { error: new Error('upload failed') };
        files.set(name, bytes);
        return { error: null };
      },
      remove: async (names) => {
        if (bucket === 'avatars' && failPublicRemove) return { error: new Error('remove failed') };
        names.forEach((name) => files.delete(name));
        return { error: null };
      },
      list: async (folder) => ({
        data: [...files.keys()]
          .filter((name) => name.startsWith(`${folder}/`))
          .map((name) => ({ name: name.split('/')[1] })),
        error: null,
      }),
    };
  };

  const supabase = {
    storage: { from: storage },
    from: () => ({
      update: (updates) => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              Object.assign(row, updates);
              return { data: { id: userId }, error: null };
            },
          }),
        }),
      }),
    }),
  };

  const fetch = async (url) => {
    const bucket = url.includes('/sign/avatars-private/') ? 'avatars-private' : 'avatars';
    const bytes = (bucket === 'avatars' ? publicFiles : privateFiles).get(path);
    return { ok: !!bytes, arrayBuffer: async () => bytes };
  };

  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    fetch,
    require: (name) => {
      if (name === '../lib/supabase') return { supabase };
      if (name === '../constants/stores') return { CATALOG_STORE_KEYS: [] };
      if (name === 'expo-image-manipulator') return {};
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return {
    api: exports, userId, path, publicUrl, publicFiles, privateFiles, row,
    setFailPublicRemove: (v) => { failPublicRemove = v; },
    setFailPublicUpload: (v) => { failPublicUpload = v; },
  };
}

test('avatar moves to the private bucket and back without changing normal public photos', async () => {
  const h = createHarness();
  const privateUrl = await h.api.setAvatarFriendsOnly({
    id: h.userId, avatarUrl: h.publicUrl, avatarFriendsOnly: false,
  }, true);
  assert.match(privateUrl, /^private:/);
  assert.equal(h.row.avatar_friends_only, true);
  assert.equal(h.publicFiles.has(h.path), false);
  assert.equal(h.privateFiles.has(h.path), true);

  const restoredUrl = await h.api.setAvatarFriendsOnly({
    id: h.userId, avatarUrl: privateUrl, avatarFriendsOnly: true,
  }, false);
  assert.match(restoredUrl, /^https:\/\/example[.]test\//);
  assert.equal(h.row.avatar_friends_only, false);
  assert.equal(h.publicFiles.has(h.path), true);
  assert.equal(h.privateFiles.has(h.path), false);
});

test('a failed public deletion never confirms the private preference', async () => {
  const h = createHarness();
  h.setFailPublicRemove(true);
  await assert.rejects(h.api.setAvatarFriendsOnly({
    id: h.userId, avatarUrl: h.publicUrl, avatarFriendsOnly: false,
  }, true), /remove failed/);
  assert.equal(h.row.avatar_friends_only, false);
  assert.equal(h.publicFiles.has(h.path), true);
});

test('a failed move back to the public bucket restores the private preference', async () => {
  const h = createHarness();
  const privateUrl = await h.api.setAvatarFriendsOnly({
    id: h.userId, avatarUrl: h.publicUrl, avatarFriendsOnly: false,
  }, true);
  h.setFailPublicUpload(true);
  await assert.rejects(h.api.setAvatarFriendsOnly({
    id: h.userId, avatarUrl: privateUrl, avatarFriendsOnly: true,
  }, false), /upload failed/);
  assert.equal(h.row.avatar_friends_only, true);
  assert.equal(h.row.avatar_url, privateUrl);
  assert.equal(h.privateFiles.has(h.path), true);
  assert.equal(h.publicFiles.has(h.path), false);
});
