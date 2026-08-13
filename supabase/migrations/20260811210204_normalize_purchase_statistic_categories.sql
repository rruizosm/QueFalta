-- Las categorías del catálogo se conservan tal y como las ofrece cada tienda,
-- por lo que un mismo concepto puede llegar en castellano o catalán. Para las
-- estadísticas usamos una clave estable y dejamos que la app traduzca su etiqueta.
-- Así se agrupa el histórico sin alterar las líneas archivadas, necesarias para
-- volver a añadir una compra a la lista.

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
  categorized_items as (
    select
      *,
      case lower(category_name)
        when 'fruta y verdura' then 'produce'
        when 'fruita i verdura' then 'produce'
        when 'congelados' then 'frozen'
        when 'congelats' then 'frozen'
        when 'cereales y galletas' then 'cereals'
        when 'cereals i galetes' then 'cereals'
        when 'cacao, café e infusiones' then 'coffee'
        when 'cacau, cafè i infusions' then 'coffee'
        when 'pizzas y platos preparados' then 'prepared'
        when 'pizzes i plats preparats' then 'prepared'
        when 'charcutería y quesos' then 'deli'
        when 'xarcuteria i formatges' then 'deli'
        when 'postres y yogures' then 'desserts'
        when 'postres i iogurts' then 'desserts'
        when 'conservas, caldos y cremas' then 'preserves'
        when 'conserves, brous i cremes' then 'preserves'
        when 'agua y refrescos' then 'water'
        when 'aigua i refrescos' then 'water'
        when 'carne' then 'meat'
        when 'carn' then 'meat'
        when 'aperitivos' then 'snacks'
        when 'aperitius' then 'snacks'
        when 'aceite, especias y salsas' then 'oils'
        when 'oli, espècies i salses' then 'oils'
        when 'huevos, leche y mantequilla' then 'dairy'
        when 'ous, llet i mantega' then 'dairy'
        when 'limpieza y hogar' then 'cleaning'
        when 'neteja i llar' then 'cleaning'
        when 'cuidado facial y corporal' then 'body_care'
        when 'cura facial i corporal' then 'body_care'
        when 'cuidado del cabello' then 'hair_care'
        when 'cura dels cabells' then 'hair_care'
        when 'pasta, arroz y legumbres' then 'pasta'
        when 'arròs, llegums i pasta' then 'pasta'
        when 'azúcar, caramelos y chocolate' then 'sweets'
        when 'sucre, caramels i xocolata' then 'sweets'
        when 'panadería y pastelería' then 'bakery'
        when 'forn i pastisseria' then 'bakery'
        when 'fitoterapia y parafarmacia' then 'diet'
        when 'fitoteràpia i parafarmàcia' then 'diet'
        else null
      end as category_key
    from own_items
  ),
  category_stat_items as (
    select
      *,
      case category_key
        when 'produce' then 'Fruta y verdura'
        when 'frozen' then 'Congelados'
        when 'cereals' then 'Cereales y galletas'
        when 'coffee' then 'Cacao, café e infusiones'
        when 'prepared' then 'Pizzas y platos preparados'
        when 'deli' then 'Charcutería y quesos'
        when 'desserts' then 'Postres y yogures'
        when 'preserves' then 'Conservas, caldos y cremas'
        when 'water' then 'Agua y refrescos'
        when 'meat' then 'Carne'
        when 'snacks' then 'Aperitivos'
        when 'oils' then 'Aceite, especias y salsas'
        when 'dairy' then 'Huevos, leche y mantequilla'
        when 'cleaning' then 'Limpieza y hogar'
        when 'body_care' then 'Cuidado facial y corporal'
        when 'hair_care' then 'Cuidado del cabello'
        when 'pasta' then 'Pasta, arroz y legumbres'
        when 'sweets' then 'Azúcar, caramelos y chocolate'
        when 'bakery' then 'Panadería y pastelería'
        when 'diet' then 'Fitoterapia y parafarmacia'
        else category_name
      end as category_label
    from categorized_items
  ),
  top_stores as (
    select store_key as key, sum(quantity) as quantity, count(distinct purchase_id)::integer as purchases
    from category_stat_items
    group by store_key
    order by sum(quantity) desc, count(distinct purchase_id) desc, store_key
    limit 5
  ),
  top_categories as (
    select
      case when category_key is null then null else 'statistics.category.' || category_key end as key,
      category_label as label,
      sum(quantity) as quantity,
      count(distinct purchase_id)::integer as purchases
    from category_stat_items
    group by category_key, category_label
    order by sum(quantity) desc, count(distinct purchase_id) desc, category_key,
      category_label
    limit 5
  ),
  top_products as (
    select product_name as label, sum(quantity) as quantity, count(distinct purchase_id)::integer as purchases
    from category_stat_items
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
