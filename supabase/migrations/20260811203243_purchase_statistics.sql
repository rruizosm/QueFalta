-- Estadísticas personales de compra para QuéFalta Plus.
-- Las métricas se limitan a las compras que ha finalizado el usuario autenticado:
-- nunca exponen actividad de los demás miembros de un grupo compartido.

alter table public.purchase_items
  add column if not exists store_key text;

comment on column public.purchase_items.store_key is
  'Clave del supermercado al finalizar la compra. NULL solo en historial anterior; el RPC aplica un fallback desde la imagen/id.';

create index if not exists purchases_completed_by_completed_at_idx
  on public.purchases (completed_by, completed_at desc);

create index if not exists purchase_items_purchase_id_idx
  on public.purchase_items (purchase_id);

create or replace function public.my_purchase_statistics()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  -- Mantiene el mismo interruptor que el resto de QuéFalta Plus. Mientras el
  -- paywall global esté apagado, la funcionalidad sigue sin limitarse.
  if public.paywall_enabled() and not public.is_premium(auth.uid()) then
    raise exception 'plus_required';
  end if;

  with own_items as (
    select
      pi.purchase_id,
      pi.product_name,
      pi.quantity,
      coalesce(nullif(btrim(pi.category_name), ''), '__uncategorized__') as category_name,
      coalesce(
        nullif(pi.store_key, ''),
        case
          when pi.mercadona_product_id is not null or coalesce(pi.image_url, '') ilike '%mercadona%' then 'mercadona'
          when coalesce(pi.image_url, '') ilike '%bonpreuesclat%' then 'esclat'
          when coalesce(pi.image_url, '') ilike '%carrefour%' then 'carrefour'
          when coalesce(pi.image_url, '') ilike '%bonarea%' then 'bonarea'
          when coalesce(pi.image_url, '') ilike '%consum%' then 'consum'
          when coalesce(pi.image_url, '') ilike '%dia.es%' then 'dia'
          when coalesce(pi.image_url, '') ilike '%sorliclic%' then 'sorli'
          when coalesce(pi.image_url, '') ilike '%capraboacasa%' then 'caprabo'
          when coalesce(pi.image_url, '') ilike '%eroski%' then 'eroski'
          when coalesce(pi.image_url, '') ilike '%condis%' then 'condis'
          when coalesce(pi.image_url, '') ilike '%ametllerorigen%' then 'ametller'
          when coalesce(pi.image_url, '') ilike '%scene7.com/is/image/aldinord%' then 'aldi'
          when coalesce(pi.image_url, '') ilike '%cdn.hiperdino%' then 'hiperdino'
          when coalesce(pi.image_url, '') ilike '%alcampo%' then 'alcampo'
          when coalesce(pi.image_url, '') ilike '%plusfresc%' then 'plusfresc'
          else 'otros'
        end
      ) as store_key
    from public.purchases p
    join public.purchase_items pi on pi.purchase_id = p.id
    where p.completed_by = auth.uid()
  ),
  top_stores as (
    select store_key as key, sum(quantity) as quantity, count(distinct purchase_id)::integer as purchases
    from own_items
    group by store_key
    order by sum(quantity) desc, count(distinct purchase_id) desc, store_key
    limit 5
  ),
  top_categories as (
    select category_name as label, sum(quantity) as quantity, count(distinct purchase_id)::integer as purchases
    from own_items
    group by category_name
    order by sum(quantity) desc, count(distinct purchase_id) desc, category_name
    limit 5
  ),
  top_products as (
    select product_name as label, sum(quantity) as quantity, count(distinct purchase_id)::integer as purchases
    from own_items
    group by product_name
    order by sum(quantity) desc, count(distinct purchase_id) desc, product_name
    limit 5
  )
  select jsonb_build_object(
    'purchase_count', (select count(*) from public.purchases where completed_by = auth.uid()),
    'stores', coalesce((select jsonb_agg(to_jsonb(top_stores)) from top_stores), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(top_categories)) from top_categories), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(top_products)) from top_products), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke execute on function public.my_purchase_statistics() from public;
grant execute on function public.my_purchase_statistics() to authenticated;
