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
  new URL('../supabase/migrations/20260911173959_defer_unavailable_products.sql', import.meta.url),
  'utf8',
);

const MEMBER = '00000000-0000-0000-0000-000000000001';
const OUTSIDER = '00000000-0000-0000-0000-000000000002';
const GROUP = '10000000-0000-0000-0000-000000000001';
const LIST = '20000000-0000-0000-0000-000000000001';
const LEGACY_LIST = '20000000-0000-0000-0000-000000000002';
const UNRESOLVED_LIST = '20000000-0000-0000-0000-000000000003';
const MILK = '30000000-0000-0000-0000-000000000001';
const BREAD = '30000000-0000-0000-0000-000000000002';
const LEGACY = '30000000-0000-0000-0000-000000000003';
const UNRESOLVED = '30000000-0000-0000-0000-000000000004';

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
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('test.uid', true), '')::uuid$$;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated;

    create table public.groups (id uuid primary key);
    create table public.group_members (
      group_id uuid not null references public.groups(id),
      user_id uuid not null,
      primary key (group_id, user_id)
    );
    create table public.shopping_lists (
      id uuid primary key,
      group_id uuid not null references public.groups(id)
    );
    create table public.list_items (
      id uuid primary key default gen_random_uuid(),
      list_id uuid not null references public.shopping_lists(id),
      product_name text not null,
      quantity integer not null default 1,
      unit text not null default 'ud',
      in_cart boolean not null default false,
      assigned_to uuid,
      category_emoji text,
      category_name text,
      mercadona_product_id text,
      store_product_id text,
      store_key text not null default 'otros',
      unit_price numeric,
      image_url text,
      note text,
      note_product_store text,
      note_product_id text,
      note_product_name text,
      note_product_image_url text,
      note_product_unit_price numeric,
      created_at timestamptz not null default now()
    );
    create table public.purchases (
      id uuid primary key default gen_random_uuid(),
      group_id uuid not null references public.groups(id),
      total numeric not null,
      item_count integer not null,
      completed_by uuid not null,
      completed_at timestamptz not null default now()
    );
    create table public.purchase_items (
      id uuid primary key default gen_random_uuid(),
      purchase_id uuid not null references public.purchases(id),
      product_name text not null,
      quantity integer not null,
      unit text not null,
      category_emoji text,
      category_name text,
      mercadona_product_id text,
      store_product_id text,
      store_key text not null,
      unit_price numeric,
      image_url text,
      note text,
      note_product_store text,
      note_product_id text,
      note_product_name text,
      note_product_image_url text,
      note_product_unit_price numeric
    );

    create function public.is_group_member(gid uuid)
    returns boolean language sql security definer set search_path = '' stable as
      $$select exists(
        select 1 from public.group_members
        where group_id = gid and user_id = auth.uid()
      )$$;

    alter table public.shopping_lists enable row level security;
    alter table public.list_items enable row level security;
    alter table public.purchases enable row level security;
    alter table public.purchase_items enable row level security;

    create policy shopping_lists_member on public.shopping_lists
      for select to authenticated using (public.is_group_member(group_id));
    create policy list_items_member on public.list_items
      for all to authenticated
      using (public.is_group_member((select group_id from public.shopping_lists where id = list_id)))
      with check (public.is_group_member((select group_id from public.shopping_lists where id = list_id)));
    create policy purchases_member on public.purchases
      for all to authenticated
      using (public.is_group_member(group_id))
      with check (public.is_group_member(group_id) and completed_by = auth.uid());
    create policy purchase_items_member on public.purchase_items
      for all to authenticated
      using (public.is_group_member((select group_id from public.purchases where id = purchase_id)))
      with check (public.is_group_member((select group_id from public.purchases where id = purchase_id)));

    grant select on public.shopping_lists to authenticated;
    grant select, insert, update, delete on public.list_items to authenticated;
    grant select, insert, update, delete on public.purchases to authenticated;
    grant select, insert, update, delete on public.purchase_items to authenticated;

    insert into public.groups(id) values ('${GROUP}');
    insert into public.group_members(group_id, user_id) values ('${GROUP}', '${MEMBER}');
    insert into public.shopping_lists(id, group_id) values
      ('${LIST}', '${GROUP}'),
      ('${LEGACY_LIST}', '${GROUP}'),
      ('${UNRESOLVED_LIST}', '${GROUP}');
    insert into public.list_items(
      id, list_id, product_name, quantity, in_cart, assigned_to,
      category_name, store_key, unit_price, note
    ) values
      ('${MILK}', '${LIST}', 'Leche', 2, true, '${MEMBER}', 'Lácteos', 'mercadona', 1.50, 'Semidesnatada'),
      ('${BREAD}', '${LIST}', 'Pan', 1, false, '${MEMBER}', 'Panadería', 'mercadona', 1.10, 'Integral'),
      ('${LEGACY}', '${LEGACY_LIST}', 'Huevos', 1, true, '${MEMBER}', 'Lácteos', 'mercadona', 2.40, null),
      ('${UNRESOLVED}', '${UNRESOLVED_LIST}', 'Arroz', 1, false, '${MEMBER}', 'Despensa', 'mercadona', 1.25, null);
  `);

  await db.exec(migration);

  const deferred = await asUser(MEMBER, `
    select public.set_list_items_deferred(array['${BREAD}'::uuid], true) as count
  `);
  assert.equal(Number(deferred[0].count), 1);
  assert.deepEqual((await rows(`
    select in_cart, deferred_to_next_purchase
    from public.list_items where id = '${BREAD}'
  `))[0], { in_cart: false, deferred_to_next_purchase: true });

  await asUser(MEMBER, `
    select public.set_list_items_in_cart(array['${BREAD}'::uuid], true)
  `);
  assert.deepEqual((await rows(`
    select in_cart, deferred_to_next_purchase
    from public.list_items where id = '${BREAD}'
  `))[0], { in_cart: true, deferred_to_next_purchase: false });
  await asUser(MEMBER, `
    select public.set_list_items_deferred(array['${BREAD}'::uuid], true)
  `);

  await assert.rejects(
    asUser(OUTSIDER, `select public.set_list_items_deferred(array['${BREAD}'::uuid], false)`),
    /missing or inaccessible/,
  );

  await asUser(MEMBER, `select public.finish_list_purchase('${LIST}')`);
  assert.deepEqual(await rows(`
    select product_name, in_cart, deferred_to_next_purchase, assigned_to, note, category_name
    from public.list_items where list_id = '${LIST}'
  `), [{
    product_name: 'Pan',
    in_cart: false,
    deferred_to_next_purchase: false,
    assigned_to: null,
    note: 'Integral',
    category_name: 'Panadería',
  }]);
  assert.deepEqual((await rows(`
    select product_name, quantity from public.purchase_items order by product_name
  `)), [{ product_name: 'Leche', quantity: 2 }]);
  assert.deepEqual((await rows(`
    select total::text, item_count from public.purchases order by completed_at limit 1
  `))[0], { total: '3.00', item_count: 1 });

  await asUser(MEMBER, `select public.finish_list_purchase('${LEGACY_LIST}')`);
  assert.equal(Number((await rows(`
    select count(*) from public.list_items where list_id = '${LEGACY_LIST}'
  `))[0].count), 0);

  await assert.rejects(
    asUser(MEMBER, `select public.finish_list_purchase('${UNRESOLVED_LIST}')`),
    /collected or deferred/,
  );
  assert.equal(Number((await rows(`
    select count(*) from public.list_items where list_id = '${UNRESOLVED_LIST}'
  `))[0].count), 1);

  console.log('PASS: producto aplazado, compra parcial, compatibilidad y RLS verificados.');
} finally {
  await db.close();
}
