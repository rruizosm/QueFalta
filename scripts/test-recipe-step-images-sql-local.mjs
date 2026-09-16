import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
try {
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles(id uuid primary key);
    create table storage.buckets(id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text, owner_id text);
    create function storage.foldername(text) returns text[] language sql as
      $$ select string_to_array($1, '/') $$;
    insert into profiles values ('00000000-0000-0000-0000-000000000001'),
      ('00000000-0000-0000-0000-000000000002');
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260831124403_community_recipes.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into recipes(author_id,title,image_path,ingredients,steps)
    values ('00000000-0000-0000-0000-000000000001','Old recipe','author/cover.jpg','[{}]','["Cook"]')`);
  await db.exec(await readFile(new URL('../supabase/migrations/20260904190745_recipe_engagement.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260912164705_recipe_step_images.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20260915062836_add_recipe_servings.sql', import.meta.url), 'utf8'));
  assert.deepEqual((await db.query('select step_image_paths from recipes')).rows[0].step_image_paths, []);
  assert.equal((await db.query('select servings from recipes')).rows[0].servings, null);
  await db.exec(`set role authenticated; set test.uid = '00000000-0000-0000-0000-000000000001'`);
  await db.exec(`insert into recipes(author_id,title,image_path,servings,ingredients,steps,step_image_paths)
    values (auth.uid(),'New recipe','author/cover.jpg',4,'[{}]','["Wash","Cook","Serve"]',
    array['author/wash.jpg',null,'author/serve.jpg'])`);
  const saved = (await db.query("select steps, servings, to_jsonb(step_image_paths) as step_image_paths from recipes where title='New recipe'")).rows[0];
  assert.deepEqual(saved.step_image_paths, ['author/wash.jpg', null, 'author/serve.jpg']);
  assert.equal(saved.servings, 4);
  assert.equal((await db.query("update recipes set servings=6 where title='New recipe' returning servings")).rows[0].servings, 6);
  await assert.rejects(db.exec(`insert into recipes(author_id,title,image_path,servings,ingredients,steps)
    values (auth.uid(),'Wrong servings','author/cover.jpg',100,'[{}]','["Cook"]')`), /recipes_servings_range/);
  await assert.rejects(db.exec(`insert into recipes(author_id,title,image_path,ingredients,steps,step_image_paths)
    values (auth.uid(),'Wrong length','author/cover.jpg','[{}]','["Cook"]',array[null,null]::text[])`), /recipes_step_image_paths_shape/);
  await assert.rejects(db.exec(`insert into recipes(author_id,title,image_path,ingredients,steps,step_image_paths)
    values (auth.uid(),'Wrong author','author/cover.jpg','[{}]','["Cook"]',array[null])
    returning id; update recipes set author_id='00000000-0000-0000-0000-000000000002'`), /row-level security|permission denied/);
  await db.exec(`set test.uid = '00000000-0000-0000-0000-000000000002'`);
  await assert.rejects(
    db.query("update recipes set step_image_paths='{}' where title='New recipe' returning id"),
    /permission denied/,
  );
  assert.equal((await db.query("update recipes set servings=8 where title='New recipe' returning id")).rows.length, 0);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.query('select * from recipes'), /permission denied/);
  console.log('Recipe photos and servings: legacy defaults, bounds, author isolation and anonymous access passed.');
} finally { await db.close(); }
