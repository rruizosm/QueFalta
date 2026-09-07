#!/usr/bin/env node
// Ejecuta la migración real en PostgreSQL embebido con usuarios ficticios.
// No usa red, credenciales ni datos de producción.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath || !isAbsolute(modulePath)) {
  throw new Error('Indica el módulo PGlite temporal con ruta absoluta');
}

const { PGlite } = await import(pathToFileURL(modulePath).href);
const db = new PGlite();
const migration = await readFile(
  new URL('../supabase/migrations/20260907084525_multiple_group_admins.sql', import.meta.url),
  'utf8',
);
const orphanBackfill = await readFile(
  new URL('../supabase/migrations/20260907085000_backfill_adminless_group_admins.sql', import.meta.url),
  'utf8',
);

const CREATOR = '00000000-0000-0000-0000-000000000001';
const LEGACY_ADMIN = '00000000-0000-0000-0000-000000000002';
const MEMBER = '00000000-0000-0000-0000-000000000003';
const NEW_CREATOR = '00000000-0000-0000-0000-000000000004';
const GROUP = '10000000-0000-0000-0000-000000000001';
const ORPHANED = '10000000-0000-0000-0000-000000000002';

const rows = async (sql) => (await db.query(sql)).rows;
const asUser = async (uid, sql) => {
  await db.exec(`set role authenticated; set test.uid = '${uid}'`);
  try {
    return await rows(sql);
  } finally {
    await db.exec('reset role; reset test.uid');
  }
};

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;

    create table public.profiles (
      id uuid primary key,
      discoverable boolean not null default true
    );
    create table public.groups (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      created_by uuid,
      created_at timestamptz not null default now(),
      owner_id uuid,
      creation_key text,
      icon_emoji text
    );
    create unique index groups_created_by_creation_key_uq
      on public.groups(created_by, creation_key) where creation_key is not null;
    create table public.group_members (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id) on delete cascade,
      user_id uuid not null references public.profiles(id) on delete cascade,
      joined_at timestamptz not null default now(),
      unique(group_id, user_id)
    );

    alter table public.groups enable row level security;
    alter table public.group_members enable row level security;
    grant select, insert, update, delete on public.groups to authenticated;
    grant select, insert, update, delete on public.group_members to authenticated;

    create function public.is_discoverable(uid uuid)
    returns boolean language sql security definer set search_path = '' stable as
      $$select coalesce((select discoverable from public.profiles where id = uid), false)$$;
    create function public.is_group_member(gid uuid)
    returns boolean language sql security definer set search_path = '' stable as
      $$select exists(select 1 from public.group_members where group_id = gid and user_id = auth.uid())$$;
    create function public.is_group_admin(gid uuid)
    returns boolean language sql security definer set search_path = '' stable as
      $$select exists(select 1 from public.groups where id = gid and owner_id = auth.uid())$$;
    create policy "group_members: ver si eres miembro"
      on public.group_members for select to authenticated
      using (public.is_group_member(group_id));
    create policy "groups: ver si eres miembro"
      on public.groups for select to authenticated
      using (owner_id = auth.uid() or public.is_group_member(id));

    insert into public.profiles(id) values
      ('${CREATOR}'), ('${LEGACY_ADMIN}'), ('${MEMBER}'), ('${NEW_CREATOR}');
    insert into public.groups(id, name, created_by, owner_id) values
      ('${GROUP}', 'Familia', '${CREATOR}', '${LEGACY_ADMIN}'),
      ('${ORPHANED}', 'Antiguo', '${CREATOR}', '${CREATOR}');
    insert into public.group_members(group_id, user_id) values
      ('${GROUP}', '${CREATOR}'),
      ('${GROUP}', '${LEGACY_ADMIN}'),
      ('${GROUP}', '${MEMBER}'),
      ('${ORPHANED}', '${MEMBER}');
  `);

  await db.exec(migration);

  const roles = await rows(`
    select user_id::text, role
    from public.group_members
    where group_id = '${GROUP}'
    order by user_id
  `);
  assert.deepEqual(roles, [
    { user_id: CREATOR, role: 'admin' },
    { user_id: LEGACY_ADMIN, role: 'admin' },
    { user_id: MEMBER, role: 'member' },
  ]);
  assert.equal(
    Number((await rows(`select count(*) from public.group_members where group_id = '${ORPHANED}'`))[0].count),
    1,
    'la migración no debe reinsertar al creador que ya abandonó el grupo',
  );
  await db.exec(orphanBackfill);
  assert.equal(
    (await rows(`select role from public.group_members where group_id = '${ORPHANED}'`))[0].role,
    'admin',
    'un grupo heredado con miembros no debe quedar sin administrador operativo',
  );

  assert.equal(
    (await asUser(MEMBER, `
      update public.groups set name = 'Sin permiso'
      where id = '${GROUP}' returning name
    `)).length,
    0,
    'un miembro normal no puede editar el grupo',
  );
  assert.equal(
    (await asUser(MEMBER, `delete from public.groups where id = '${GROUP}' returning id`)).length,
    0,
    'un miembro normal no puede eliminar el grupo',
  );

  assert.equal(
    (await asUser(LEGACY_ADMIN, `
      update public.group_members set role = 'admin'
      where group_id = '${GROUP}' and user_id = '${MEMBER}'
      returning role
    `))[0].role,
    'admin',
  );
  assert.equal(
    (await asUser(MEMBER, `
      update public.groups set name = 'Administrado'
      where id = '${GROUP}' returning name
    `))[0].name,
    'Administrado',
  );
  assert.equal(
    (await asUser(LEGACY_ADMIN, `
      update public.group_members set role = 'member'
      where group_id = '${GROUP}' and user_id = '${MEMBER}'
      returning role
    `))[0].role,
    'member',
    'un administrador puede retirar el rol a otro administrador que no sea el creador',
  );
  assert.equal(
    (await asUser(MEMBER, `
      update public.groups set name = 'Ya no administra'
      where id = '${GROUP}' returning name
    `)).length,
    0,
    'la degradación retira los permisos operativos de inmediato',
  );

  assert.equal(
    (await asUser(LEGACY_ADMIN, `delete from public.groups where id = '${GROUP}' returning id`)).length,
    0,
    'un administrador que no es creador no puede eliminar el grupo',
  );
  assert.equal(
    (await asUser(LEGACY_ADMIN, `
      update public.group_members set role = 'member'
      where group_id = '${GROUP}' and user_id = '${CREATOR}' returning role
    `)).length,
    0,
    'ningún administrador puede retirar el rol del creador',
  );
  assert.equal(
    (await asUser(CREATOR, `
      delete from public.group_members
      where group_id = '${GROUP}' and user_id = '${CREATOR}' returning id
    `)).length,
    0,
    'la membresía del creador no se elimina por separado',
  );

  const created = await asUser(NEW_CREATOR, `
    select public.create_group_with_owner('Nuevo', 'request-1')::text as id
  `);
  const newGroupId = created[0].id;
  const creatorMembership = await rows(`
    select role from public.group_members
    where group_id = '${newGroupId}' and user_id = '${NEW_CREATOR}'
  `);
  assert.equal(creatorMembership[0].role, 'admin');

  assert.equal(
    (await asUser(CREATOR, `delete from public.groups where id = '${GROUP}' returning id`)).length,
    1,
    'solo el creador elimina el grupo',
  );
  assert.equal(
    Number((await rows(`select count(*) from public.group_members where group_id = '${GROUP}'`))[0].count),
    0,
    'el borrado del creador conserva el cascade de membresías',
  );

  console.log('PASS: administradores múltiples, creador protegido y borrado exclusivo verificados.');
} finally {
  await db.close();
}
