-- Localiza los nombres de producto del Radar de ahorro. La comparación sigue
-- usando el snapshot semántico canónico en castellano; solo se localiza el
-- nombre devuelto al cliente, con fallback al original cuando una cadena no
-- publica catálogo catalán.

set lock_timeout = '5s';
set statement_timeout = '120s';

create or replace function comparator_internal.catalog_localized_product_name_v1(
  p_store text,
  p_product_id text,
  p_language text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null
      and coalesce((select auth.jwt() ->> 'role'), '') <> 'service_role'
      then null
    when lower(coalesce(p_language, 'es')) <> 'ca' then null
    when p_store = 'mercadona' then (
      select nullif(btrim(product.display_name_ca), '')
      from public.mercadona_products as product
      where product.id::text = p_product_id
    )
    when p_store = 'esclat' then (
      select nullif(btrim(product.display_name_ca), '')
      from public.bonpreu_products as product
      where product.id::text = p_product_id
    )
    when p_store = 'bonarea' then (
      select nullif(btrim(product.display_name_ca), '')
      from public.bonarea_products as product
      where product.id::text = p_product_id
    )
    when p_store = 'sorli' then (
      select nullif(btrim(product.display_name_ca), '')
      from public.sorli_products as product
      where product.id::text = p_product_id
    )
    when p_store = 'condis' then (
      select nullif(btrim(product.display_name_ca), '')
      from public.condis_products as product
      where product.id::text = p_product_id
    )
    when p_store = 'ametller' then (
      select nullif(btrim(product.display_name_ca), '')
      from public.ametller_products as product
      where product.id::text = p_product_id
    )
    when p_store = 'plusfresc' then (
      select nullif(btrim(product.display_name_ca), '')
      from public.plusfresc_products as product
      where product.id::text = p_product_id
    )
    else null
  end
$$;

revoke all on function comparator_internal.catalog_localized_product_name_v1(text, text, text)
  from public, anon;
grant execute on function comparator_internal.catalog_localized_product_name_v1(text, text, text)
  to authenticated, service_role;

comment on function comparator_internal.catalog_localized_product_name_v1(text, text, text) is
  'Returns the Catalan catalog name when the source publishes one; otherwise null.';

-- La v7 mantiene el cupo transaccional de v6 y añade el idioma explícito.
-- v6 permanece intacta para clientes ya publicados.
create or replace function public.catalog_cheaper_products_v7(
  p_source_store text,
  p_source_product_id text,
  p_stores text[],
  p_language text
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  entitlement record;
  matches jsonb;
begin
  select * into entitlement
  from private.claim_free_comparator_use();

  if not entitlement.allowed then
    return jsonb_build_object(
      'allowed', false,
      'remaining', 0,
      'results', '[]'::jsonb
    );
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(result) || jsonb_build_object(
        'display_name',
        coalesce(
          comparator_internal.catalog_localized_product_name_v1(
            result.store,
            result.id,
            p_language
          ),
          result.display_name
        )
      )
    ),
    '[]'::jsonb
  )
  into matches
  from comparator_internal.catalog_cheaper_products_v5(
    p_source_store,
    p_source_product_id,
    p_stores
  ) as result;

  return jsonb_build_object(
    'allowed', true,
    'remaining', entitlement.remaining,
    'results', matches
  );
end
$$;

alter function public.catalog_cheaper_products_v7(text, text, text[], text)
  set statement_timeout = '60s';

revoke all on function public.catalog_cheaper_products_v7(text, text, text[], text)
  from public, anon;
grant execute on function public.catalog_cheaper_products_v7(text, text, text[], text)
  to authenticated, service_role;

comment on function public.catalog_cheaper_products_v7(text, text, text[], text) is
  'Savings Radar results with localized display names and atomic free-tier allowance.';
