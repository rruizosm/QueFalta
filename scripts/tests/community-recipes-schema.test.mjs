import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../../supabase/migrations/20260831124403_community_recipes.sql',
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
