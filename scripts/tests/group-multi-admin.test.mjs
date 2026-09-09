import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const api = read('src/api/groups.ts');
const membersScreen = read('src/screens/GroupMembersScreen.tsx');
const detailScreen = read('src/screens/GroupDetailScreen.tsx');
const migration = read('supabase/migrations/20260907084525_multiple_group_admins.sql');
const orphanBackfill = read('supabase/migrations/20260907085000_backfill_adminless_group_admins.sql');

test('el cliente obtiene y actualiza roles múltiples de grupo', () => {
  assert.match(api, /group_members\(role, profiles/);
  assert.match(api, /isAdmin: role === 'admin'/);
  assert.match(api, /export async function setGroupMemberAdmin/);
  assert.match(api, /update\(\{ role: isAdmin \? 'admin' : 'member' \}\)/);
  assert.match(api, /Group deletion was not authorized/);
  assert.match(api, /Group member removal was not authorized/);
  assert.match(membersScreen, /member\.id === userId && member\.isAdmin/);
  assert.match(detailScreen, /member\.id === session\?\.user\.id && member\.isAdmin/);
});

test('la interfaz separa administrador y creador', () => {
  assert.match(membersScreen, /const isCreator = group\?\.createdBy === userId/);
  assert.match(membersScreen, /actionMember\.isAdmin \? 'demote' : 'promote'/);
  assert.match(membersScreen, /isCreator \? \(/);
  assert.match(membersScreen, /setDeleteVisible\(true\)/);
  assert.match(membersScreen, /isMemberCreator \|\| isMemberAdmin/);
});

test('RLS autoriza administradores y reserva DELETE al creador', () => {
  assert.match(migration, /add column if not exists role text not null default 'member'/);
  assert.match(migration, /create policy "group_members update: admins manage roles"/);
  assert.match(migration, /private\.is_group_admin\(group_id\)/);
  assert.match(migration, /not \(select private\.is_group_creator\(group_id, user_id\)\)/);
  assert.match(migration, /create policy "groups: eliminar si eres creador"/);
  assert.match(migration, /using \(created_by = \(select auth\.uid\(\)\)\)/);
  assert.doesNotMatch(migration, /security definer[\s\S]{0,80}function public\.is_group_admin/i);
  assert.match(orphanBackfill, /having count\(\*\) filter \(where gm\.role = 'admin'\) = 0/);
  assert.match(orphanBackfill, /set role = 'admin'/);
});
