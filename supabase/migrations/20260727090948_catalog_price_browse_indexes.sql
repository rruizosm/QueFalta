-- Índices para la primera página global ordenada por precio. La ruta "Todos"
-- consulta cada espejo con published=true, unit_price no nulo y ORDER BY
-- unit_price ASC, id ASC; sin este índice Postgres ordena tablas completas y
-- supera el tiempo límite de la API.
do $catalog_price_browse_indexes$
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
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = spec.table_name
          and column_name = 'unit_price'
      )
      and exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = spec.table_name
          and column_name = 'published'
      )
    then
      execute format(
        'create index if not exists %I on public.%I (unit_price, id) where published = true and unit_price is not null',
        spec.table_name || '_price_browse_idx',
        spec.table_name
      );
    end if;
  end loop;
end
$catalog_price_browse_indexes$;
