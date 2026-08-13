-- Soporta la paginación del Catálogo por price_per_unit canónico. Los índices
-- parciales cubren los productos con este dato; los que no lo tienen se añaden
-- al final mediante la ruta de paginación del cliente en ambos sentidos.
do $catalog_price_per_unit_browse_indexes$
declare
  spec record;
begin
  for spec in
    select *
    from (values
      ('mercadona_products'),
      ('bonpreu_products'),
      ('carrefour_products'),
      ('bonarea_products'),
      ('consum_products'),
      ('dia_products'),
      ('sorli_products'),
      ('eroski_products'),
      ('caprabo_products'),
      ('condis_products'),
      ('ametller_products'),
      ('aldi_products'),
      ('hiperdino_products'),
      ('alcampo_products'),
      ('plusfresc_products')
    ) as indexes(table_name)
  loop
    if to_regclass(format('public.%I', spec.table_name)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = spec.table_name
          and column_name = 'price_per_unit'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = spec.table_name
          and column_name = 'published'
      )
    then
      execute format(
        'create index if not exists %I on public.%I (price_per_unit, id) where published = true and price_per_unit is not null',
        spec.table_name || '_price_per_unit_browse_idx',
        spec.table_name
      );
      execute format(
        'create index if not exists %I on public.%I (price_per_unit desc, id) where published = true and price_per_unit is not null',
        spec.table_name || '_price_per_unit_desc_browse_idx',
        spec.table_name
      );
    end if;
  end loop;
end
$catalog_price_per_unit_browse_indexes$;
