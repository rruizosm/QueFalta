import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260831124403_community_recipes.sql',
  import.meta.url,
);
const engagementMigrationUrl = new URL(
  '../../supabase/migrations/20260904190745_recipe_engagement.sql',
  import.meta.url,
);

test('community recipes schema is protected and tied to catalog products', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /create table if not exists public\.recipes/i);
  assert.match(sql, /author_id uuid not null references public\.profiles\(id\)/i);
  assert.match(sql, /ingredients jsonb not null/i);
  assert.match(sql, /jsonb_array_length\(ingredients\) between 1 and 50/i);
  assert.match(sql, /jsonb_array_length\(steps\) between 1 and 30/i);
  assert.match(sql, /alter table public\.recipes enable row level security/i);
  assert.match(sql, /with check \(\(select auth\.uid\(\)\) = author_id\)/i);
  assert.match(sql, /revoke all on table public\.recipes from anon/i);
  assert.match(sql, /grant select, insert, update, delete on table public\.recipes to authenticated/i);
  assert.match(sql, /'recipe-images',[\s\S]*true,[\s\S]*6291456/i);
  assert.match(sql, /storage\.foldername\(name\)\)\[1\] = \(select auth\.uid\(\)::text\)/i);
});

test('recipe engagement keeps identities private and counters server-controlled', async () => {
  const sql = await readFile(engagementMigrationUrl, 'utf8');

  assert.match(sql, /add column like_count integer not null default 0/i);
  assert.match(sql, /add column save_count integer not null default 0/i);
  assert.match(sql, /create table public\.recipe_likes/i);
  assert.match(sql, /create table public\.recipe_saves/i);
  assert.match(sql, /primary key \(recipe_id, user_id\)/i);
  assert.match(sql, /alter table public\.recipe_likes enable row level security/i);
  assert.match(sql, /alter table public\.recipe_saves enable row level security/i);
  assert.match(sql, /recipe likes select: own[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /recipe saves select: own[\s\S]*using \(\(select auth\.uid\(\)\) = user_id\)/i);
  assert.match(sql, /grant select, insert, delete on table public\.recipe_likes, public\.recipe_saves[\s\S]*to authenticated/i);
  assert.doesNotMatch(sql, /grant[\s\S]{0,80}update[\s\S]{0,80}recipe_(likes|saves)/i);
  assert.match(sql, /create function private\.sync_recipe_like_count\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /create function private\.sync_recipe_save_count\(\)[\s\S]*security definer[\s\S]*set search_path = ''/i);
  assert.match(sql, /revoke all on function private\.sync_recipe_like_count\(\)[\s\S]*from public, anon, authenticated/i);
  assert.match(sql, /revoke update on table public\.recipes from authenticated/i);
  assert.match(sql, /grant update \(title, image_path, ingredients, steps, updated_at\)/i);
});
