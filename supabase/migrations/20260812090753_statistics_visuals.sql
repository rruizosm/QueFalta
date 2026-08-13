-- Añade las miniaturas de los productos destacados sin ampliar el alcance del
-- RPC base: la función original sigue aplicando el paywall y auth.uid().
create or replace function public.my_purchase_statistics_visuals()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  result jsonb;
begin
  result := public.my_purchase_statistics();
  result := jsonb_set(
    result,
    '{products}',
    coalesce((
      select jsonb_agg(
        product_row || jsonb_build_object('image_url', product_image.image_url)
        order by (product_row->>'quantity')::numeric desc, (product_row->>'purchases')::numeric desc, product_row->>'label'
      )
      from jsonb_array_elements(coalesce(result->'products', '[]'::jsonb)) as rows(product_row)
      left join lateral (
        select max(nullif(pi.image_url, '')) as image_url
        from public.purchase_items pi
        join public.purchases p on p.id = pi.purchase_id
        where p.completed_by = auth.uid()
          and pi.product_name = rows.product_row->>'label'
      ) product_image on true
    ), '[]'::jsonb),
    true
  );
  return result;
end;
$$;

revoke execute on function public.my_purchase_statistics_visuals() from public;
grant execute on function public.my_purchase_statistics_visuals() to authenticated;
