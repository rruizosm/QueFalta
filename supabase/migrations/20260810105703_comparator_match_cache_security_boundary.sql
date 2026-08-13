-- La Data API solo expone un wrapper SECURITY INVOKER. La lógica que necesita
-- escribir en las tablas privadas permanece en el esquema no expuesto.

alter function public.catalog_cheaper_products_v3(text, text, text[])
  set schema comparator_internal;

revoke all on function comparator_internal.catalog_cheaper_products_v3(text, text, text[])
  from public, anon;
grant usage on schema comparator_internal to authenticated, service_role;
grant execute on function comparator_internal.catalog_cheaper_products_v3(text, text, text[])
  to authenticated, service_role;

create function public.catalog_cheaper_products_v3(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select *
  from comparator_internal.catalog_cheaper_products_v3(
    p_source_store,
    p_source_product_id,
    p_stores
  );
$function$;

revoke all on function public.catalog_cheaper_products_v3(text, text, text[]) from public, anon;
grant execute on function public.catalog_cheaper_products_v3(text, text, text[]) to authenticated, service_role;
