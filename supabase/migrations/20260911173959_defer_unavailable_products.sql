-- Let members resolve an unavailable product without archiving it as purchased.
-- Deferred rows stay in the shared list and become ordinary pending rows when
-- the current purchase is completed.

alter table public.list_items
  add column if not exists deferred_to_next_purchase boolean not null default false;

alter table public.list_items
  drop constraint if exists list_items_cart_state_exclusive;
alter table public.list_items
  add constraint list_items_cart_state_exclusive
  check (not (in_cart and deferred_to_next_purchase));

comment on column public.list_items.deferred_to_next_purchase is
  'True while the item is resolved as unavailable for the current shopping trip.';

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
  set in_cart = p_in_cart,
      deferred_to_next_purchase = false
  where id = any(p_item_ids);
  get diagnostics v_updated = row_count;

  if v_updated <> v_expected then
    raise exception 'Some list items are missing or inaccessible' using errcode = '42501';
  end if;
  return v_updated;
end;
$$;

create or replace function public.set_list_items_deferred(
  p_item_ids uuid[],
  p_deferred boolean
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

  if p_deferred is null then
    raise exception 'Deferred state is required' using errcode = '22023';
  end if;

  select count(*)::integer
  into v_expected
  from (select distinct unnest(coalesce(p_item_ids, '{}'::uuid[])) as id) requested;

  if v_expected = 0 then return 0; end if;

  update public.list_items
  set deferred_to_next_purchase = p_deferred,
      in_cart = false
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
  v_purchased_row_count integer;
  v_deferred_row_count integer;
  v_unresolved_row_count integer;
  v_affected integer;
  v_total numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

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
    count(*) filter (where li.in_cart)::integer,
    count(*) filter (where li.deferred_to_next_purchase)::integer,
    count(*) filter (
      where not li.in_cart and not li.deferred_to_next_purchase
    )::integer
  into v_purchased_row_count, v_deferred_row_count, v_unresolved_row_count
  from public.list_items li
  where li.list_id = p_list_id;

  if v_unresolved_row_count > 0 then
    raise exception 'All list items must be collected or deferred' using errcode = '22023';
  end if;

  if v_purchased_row_count = 0 then
    raise exception 'At least one collected item is required' using errcode = '22023';
  end if;

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
  where li.list_id = p_list_id
    and li.in_cart;

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
    and li.in_cart
  group by
    li.store_key,
    coalesce(
      nullif(li.store_product_id, ''),
      nullif(li.mercadona_product_id, ''),
      'manual:' || lower(btrim(li.product_name)) || ':' || coalesce(li.image_url, '')
    );

  delete from public.list_items
  where list_id = p_list_id
    and in_cart;
  get diagnostics v_affected = row_count;

  if v_affected <> v_purchased_row_count then
    raise exception 'Collected list items changed while finishing purchase' using errcode = '40001';
  end if;

  update public.list_items
  set deferred_to_next_purchase = false,
      in_cart = false,
      assigned_to = null
  where list_id = p_list_id
    and deferred_to_next_purchase;
  get diagnostics v_affected = row_count;

  if v_affected <> v_deferred_row_count then
    raise exception 'Deferred list items changed while finishing purchase' using errcode = '40001';
  end if;

  return v_purchase_id;
end;
$$;

revoke all on function public.set_list_items_in_cart(uuid[], boolean) from public, anon;
revoke all on function public.set_list_items_deferred(uuid[], boolean) from public, anon;
revoke all on function public.finish_list_purchase(uuid) from public, anon;
grant execute on function public.set_list_items_in_cart(uuid[], boolean) to authenticated;
grant execute on function public.set_list_items_deferred(uuid[], boolean) to authenticated;
grant execute on function public.finish_list_purchase(uuid) to authenticated;

comment on function public.set_list_items_deferred(uuid[], boolean) is
  'Atomically marks accessible list items as unavailable for the current trip.';
comment on function public.finish_list_purchase(uuid) is
  'Archives collected rows and resets deferred rows for the next shopping trip.';
