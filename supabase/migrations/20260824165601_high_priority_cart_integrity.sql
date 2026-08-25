-- High-priority integrity fixes for shared carts.
--
-- 1. Persist the supermarket explicitly instead of deriving it in the app from
--    a mutable image URL.
-- 2. Replace client-side Promise.all batches with single atomic RPC updates.
-- 3. Archive and clear a finished purchase in one database transaction.

create schema if not exists private;

create or replace function private.infer_cart_store_key(
  p_image_url text,
  p_mercadona_product_id text
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_mercadona_product_id is not null or coalesce(p_image_url, '') like '%mercadona%' then 'mercadona'
    when coalesce(p_image_url, '') like '%bonpreuesclat%' then 'esclat'
    when coalesce(p_image_url, '') like '%carrefour%' then 'carrefour'
    when coalesce(p_image_url, '') like '%bonarea%' then 'bonarea'
    when coalesce(p_image_url, '') like '%consum%' then 'consum'
    when coalesce(p_image_url, '') like '%dia.es%' then 'dia'
    when coalesce(p_image_url, '') like '%sorliclic%' then 'sorli'
    when coalesce(p_image_url, '') like '%eroski%' then 'eroski'
    when coalesce(p_image_url, '') like '%capraboacasa%' then 'caprabo'
    when coalesce(p_image_url, '') like '%condis%' then 'condis'
    when coalesce(p_image_url, '') like '%ametllerorigen%' then 'ametller'
    when coalesce(p_image_url, '') like '%scene7.com/is/image/aldinord%' then 'aldi'
    when coalesce(p_image_url, '') like '%cdn.hiperdino%' then 'hiperdino'
    when coalesce(p_image_url, '') like '%alcampo%' then 'alcampo'
    when coalesce(p_image_url, '') like '%plusfresc%' then 'plusfresc'
    when coalesce(p_image_url, '') like '%gadisline%' then 'gadis'
    when coalesce(p_image_url, '') like '%imagedelivery.net/laxGYDNZyT04iZVpzPzryw%' then 'froiz'
    when coalesce(p_image_url, '') like '%ahorramas.com%' then 'ahorramas'
    else 'otros'
  end;
$$;

alter table public.list_items
  add column if not exists store_key text;

update public.list_items
set store_key = private.infer_cart_store_key(image_url, mercadona_product_id)
where store_key is null or store_key = '' or store_key = 'otros';

update public.purchase_items
set store_key = private.infer_cart_store_key(image_url, mercadona_product_id)
where store_key is null or store_key = '' or store_key = 'otros';

alter table public.list_items
  alter column store_key set default 'otros',
  alter column store_key set not null;

alter table public.purchase_items
  alter column store_key set default 'otros',
  alter column store_key set not null;

alter table public.list_items
  drop constraint if exists list_items_store_key_allowed;
alter table public.list_items
  add constraint list_items_store_key_allowed check (store_key in (
    'mercadona', 'esclat', 'carrefour', 'bonarea', 'consum', 'dia',
    'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi',
    'hiperdino', 'alcampo', 'plusfresc', 'gadis', 'froiz', 'ahorramas', 'otros'
  ));

alter table public.purchase_items
  drop constraint if exists purchase_items_store_key_allowed;
alter table public.purchase_items
  add constraint purchase_items_store_key_allowed check (store_key in (
    'mercadona', 'esclat', 'carrefour', 'bonarea', 'consum', 'dia',
    'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi',
    'hiperdino', 'alcampo', 'plusfresc', 'gadis', 'froiz', 'ahorramas', 'otros'
  ));

comment on column public.list_items.store_key is
  'Canonical supermarket key. Explicit for new clients; inferred only for legacy inserts.';

create or replace function private.ensure_cart_store_key()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.store_key is null or new.store_key = '' or new.store_key = 'otros' then
    new.store_key := private.infer_cart_store_key(new.image_url, new.mercadona_product_id);
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_list_item_store_key on public.list_items;
create trigger ensure_list_item_store_key
before insert or update of store_key, image_url, mercadona_product_id
on public.list_items
for each row execute function private.ensure_cart_store_key();

drop trigger if exists ensure_purchase_item_store_key on public.purchase_items;
create trigger ensure_purchase_item_store_key
before insert or update of store_key, image_url, mercadona_product_id
on public.purchase_items
for each row execute function private.ensure_cart_store_key();

create or replace function public.set_list_items_in_cart(
  p_item_ids uuid[],
  p_in_cart boolean
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_expected
  from (select distinct unnest(coalesce(p_item_ids, '{}'::uuid[])) as id) requested;

  if v_expected = 0 then return 0; end if;

  update public.list_items
  set in_cart = p_in_cart
  where id = any(p_item_ids);
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'Some list items are missing or inaccessible' using errcode = '42501';
  end if;
  return v_updated;
end;
$$;

create or replace function public.assign_list_items(
  p_item_ids uuid[],
  p_assigned_to uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expected integer;
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select count(*)::integer
  into v_expected
  from (select distinct unnest(coalesce(p_item_ids, '{}'::uuid[])) as id) requested;

  if v_expected = 0 then return 0; end if;

  if p_assigned_to is not null and exists (
    select 1
    from public.list_items li
    join public.shopping_lists sl on sl.id = li.list_id
    where li.id = any(p_item_ids)
      and not exists (
        select 1
        from public.group_members gm
        where gm.group_id = sl.group_id
          and gm.user_id = p_assigned_to
      )
  ) then
    raise exception 'Assignee is not a member of the list group' using errcode = '23514';
  end if;

  update public.list_items
  set assigned_to = p_assigned_to
  where id = any(p_item_ids);
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'Some list items are missing or inaccessible' using errcode = '42501';
  end if;
  return v_updated;
end;
$$;

create or replace function public.finish_list_purchase(p_list_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_group_id uuid;
  v_purchase_id uuid;
  v_item_count integer;
  v_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Serializes repeated finish requests for this list without holding a broad
  -- table lock. The lock is released automatically with the transaction.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_list_id::text, 0)
  );

  select sl.group_id
  into v_group_id
  from public.shopping_lists sl
  where sl.id = p_list_id;

  if not found or v_group_id is null then
    raise exception 'Shopping list is missing or inaccessible' using errcode = '42501';
  end if;

  perform 1
  from public.list_items li
  where li.list_id = p_list_id
  order by li.id
  for update;

  select
    count(distinct (
      li.store_key,
      coalesce(
        nullif(li.store_product_id, ''),
        nullif(li.mercadona_product_id, ''),
        'manual:' || lower(btrim(li.product_name)) || ':' || coalesce(li.image_url, '')
      )
    ))::integer,
    coalesce(sum(coalesce(li.unit_price, 0) * li.quantity), 0)
  into v_item_count, v_total
  from public.list_items li
  where li.list_id = p_list_id;

  if v_item_count = 0 then
    raise exception 'Shopping list is empty' using errcode = '22023';
  end if;

  insert into public.purchases (group_id, total, item_count, completed_by)
  values (v_group_id, v_total, v_item_count, auth.uid())
  returning id into v_purchase_id;

  insert into public.purchase_items (
    purchase_id, product_name, quantity, unit, category_emoji, category_name,
    mercadona_product_id, store_product_id, store_key, unit_price, image_url,
    note, note_product_store, note_product_id, note_product_name,
    note_product_image_url, note_product_unit_price
  )
  select
    v_purchase_id,
    (array_agg(li.product_name order by li.created_at, li.id))[1],
    sum(li.quantity),
    (array_agg(li.unit order by li.created_at, li.id))[1],
    (array_agg(li.category_emoji order by li.created_at, li.id)
      filter (where li.category_emoji is not null))[1],
    (array_agg(li.category_name order by li.created_at, li.id)
      filter (where li.category_name is not null))[1],
    (array_agg(li.mercadona_product_id order by li.created_at, li.id)
      filter (where li.mercadona_product_id is not null))[1],
    (array_agg(li.store_product_id order by li.created_at, li.id)
      filter (where li.store_product_id is not null))[1],
    li.store_key,
    (array_agg(li.unit_price order by li.created_at, li.id)
      filter (where li.unit_price is not null))[1],
    (array_agg(li.image_url order by li.created_at, li.id)
      filter (where li.image_url is not null))[1],
    (array_agg(li.note order by li.created_at, li.id)
      filter (where li.note is not null))[1],
    (array_agg(li.note_product_store order by li.created_at, li.id)
      filter (where li.note_product_store is not null))[1],
    (array_agg(li.note_product_id order by li.created_at, li.id)
      filter (where li.note_product_id is not null))[1],
    (array_agg(li.note_product_name order by li.created_at, li.id)
      filter (where li.note_product_name is not null))[1],
    (array_agg(li.note_product_image_url order by li.created_at, li.id)
      filter (where li.note_product_image_url is not null))[1],
    (array_agg(li.note_product_unit_price order by li.created_at, li.id)
      filter (where li.note_product_unit_price is not null))[1]
  from public.list_items li
  where li.list_id = p_list_id
  group by
    li.store_key,
    coalesce(
      nullif(li.store_product_id, ''),
      nullif(li.mercadona_product_id, ''),
      'manual:' || lower(btrim(li.product_name)) || ':' || coalesce(li.image_url, '')
    );

  delete from public.list_items where list_id = p_list_id;
  return v_purchase_id;
end;
$$;

revoke all on function public.set_list_items_in_cart(uuid[], boolean) from public, anon;
revoke all on function public.assign_list_items(uuid[], uuid) from public, anon;
revoke all on function public.finish_list_purchase(uuid) from public, anon;
grant execute on function public.set_list_items_in_cart(uuid[], boolean) to authenticated;
grant execute on function public.assign_list_items(uuid[], uuid) to authenticated;
grant execute on function public.finish_list_purchase(uuid) to authenticated;

comment on function public.finish_list_purchase(uuid) is
  'Atomically archives the visible cart rows and clears the shared list.';
