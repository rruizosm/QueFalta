-- Estadísticas agregadas de la comunidad para QuéFalta Plus.
--
-- La función necesita leer preferencias y carritos de varias cuentas, por lo
-- que usa SECURITY DEFINER. Solo devuelve agregados: nunca ids de usuarios,
-- grupos, listas o compras. El acceso anónimo se revoca de forma explícita.
create or replace function public.general_purchase_statistics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if public.paywall_enabled() and not public.is_premium(auth.uid()) then
    raise exception 'plus_required' using errcode = '42501';
  end if;

  with selected_preferences as (
    select distinct
      p.id as profile_id,
      lower(btrim(selected_store.store_key)) as store_key
    from public.profiles p
    cross join lateral unnest(coalesce(p.catalog_stores, '{}'::text[]))
      as selected_store(store_key)
    where p.onboarded_at is not null
      and nullif(btrim(selected_store.store_key), '') is not null
  ),
  preference_users as (
    select count(distinct profile_id)::integer as total
    from selected_preferences
  ),
  preferred_stores as (
    select store_key as key, count(*)::integer as users
    from selected_preferences
    group by store_key
  ),
  all_items as (
    -- Los artículos activos todavía viven en list_items. Al finalizar una
    -- compra se archivan en purchase_items y se eliminan de la lista, por lo
    -- que el UNION conserva el histórico sin duplicarlo de forma permanente.
    select
      li.product_name,
      li.quantity,
      li.mercadona_product_id,
      li.store_product_id,
      li.image_url,
      null::text as stored_store_key
    from public.list_items li

    union all

    select
      pi.product_name,
      pi.quantity,
      pi.mercadona_product_id,
      pi.store_product_id,
      pi.image_url,
      pi.store_key as stored_store_key
    from public.purchase_items pi
  ),
  classified_items as (
    select
      product_name,
      greatest(coalesce(quantity, 0), 0) as quantity,
      image_url,
      coalesce(
        nullif(stored_store_key, ''),
        case
          when mercadona_product_id is not null
            or coalesce(image_url, '') ilike '%mercadona%' then 'mercadona'
          when coalesce(image_url, '') ilike '%bonpreuesclat%' then 'esclat'
          when coalesce(image_url, '') ilike '%carrefour%' then 'carrefour'
          when coalesce(image_url, '') ilike '%bonarea%' then 'bonarea'
          when coalesce(image_url, '') ilike '%consum%' then 'consum'
          when coalesce(image_url, '') ilike '%dia.es%' then 'dia'
          when coalesce(image_url, '') ilike '%sorliclic%' then 'sorli'
          when coalesce(image_url, '') ilike '%capraboacasa%' then 'caprabo'
          when coalesce(image_url, '') ilike '%eroski%' then 'eroski'
          when coalesce(image_url, '') ilike '%condis%' then 'condis'
          when coalesce(image_url, '') ilike '%ametllerorigen%' then 'ametller'
          when coalesce(image_url, '') ilike '%scene7.com/is/image/aldinord%' then 'aldi'
          when coalesce(image_url, '') ilike '%cdn.hiperdino%' then 'hiperdino'
          when coalesce(image_url, '') ilike '%alcampo%' then 'alcampo'
          when coalesce(image_url, '') ilike '%plusfresc%' then 'plusfresc'
          when coalesce(image_url, '') ilike '%gadisline%' then 'gadis'
          when coalesce(image_url, '') ilike '%imagedelivery.net/laxGYDNZyT04iZVpzPzryw%' then 'froiz'
          when coalesce(image_url, '') ilike '%ahorramas.com%' then 'ahorramas'
          else 'otros'
        end
      ) as store_key,
      coalesce(
        nullif(mercadona_product_id, ''),
        nullif(store_product_id, ''),
        'name:' || lower(regexp_replace(btrim(product_name), '\s+', ' ', 'g'))
      ) as product_key
    from all_items
    where nullif(btrim(product_name), '') is not null
  ),
  catalog_items as (
    -- Excluye entradas manuales: sus textos son contenido privado escrito por
    -- usuarios y no deben aparecer en un ranking visible para otras cuentas.
    select *
    from classified_items
    where store_key <> 'otros'
  ),
  top_products as (
    select
      store_key,
      product_key as key,
      max(product_name) as label,
      max(nullif(image_url, '')) as image_url,
      sum(quantity) as quantity
    from catalog_items
    group by store_key, product_key
    order by sum(quantity) desc, max(product_name), store_key
    limit 10
  ),
  added_stores as (
    select store_key as key, sum(quantity) as quantity
    from catalog_items
    group by store_key
    order by sum(quantity) desc, store_key
    limit 10
  )
  select jsonb_build_object(
    'preference_user_count', (select total from preference_users),
    'preferred_stores', coalesce((
      select jsonb_agg(
        jsonb_build_object('key', key, 'users', users)
        order by users desc, key
      )
      from preferred_stores
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', key,
          'label', label,
          'store_key', store_key,
          'image_url', image_url,
          'quantity', quantity
        )
        order by quantity desc, label, store_key
      )
      from top_products
    ), '[]'::jsonb),
    'added_stores', coalesce((
      select jsonb_agg(
        jsonb_build_object('key', key, 'quantity', quantity)
        order by quantity desc, key
      )
      from added_stores
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

comment on function public.general_purchase_statistics() is
  'Agregados globales de preferencias y artículos de catálogo añadidos; no expone actividad individual.';

revoke all on function public.general_purchase_statistics() from public;
revoke all on function public.general_purchase_statistics() from anon;
grant execute on function public.general_purchase_statistics() to authenticated;
