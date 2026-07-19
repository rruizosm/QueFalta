-- Índices B-tree para la navegación alfabética por keyset del catálogo.
--
-- Las búsquedas por texto usan los índices GIN/trigram existentes. La pestaña
-- Productos, en cambio, filtra published=true y ordena por
-- (display_name[_ca]_norm, id). Estos índices parciales reproducen exactamente
-- ese WHERE + ORDER BY, evitando ordenar todo el catálogo antes de devolver 50
-- filas. El bloque comprueba tabla y columnas porque algunas instalaciones aún
-- no han ejecutado las migraciones de los supermercados más nuevos.

do $catalog_browse_indexes$
declare
  spec record;
begin
  for spec in
    select *
    from (values
      ('mercadona_products', 'display_name_norm'),
      ('bonpreu_products',   'display_name_norm'),
      ('carrefour_products', 'display_name_norm'),
      ('bonarea_products',   'display_name_norm'),
      ('consum_products',    'display_name_norm'),
      ('dia_products',       'display_name_norm'),
      ('sorli_products',     'display_name_norm'),
      ('eroski_products',    'display_name_norm'),
      ('caprabo_products',   'display_name_norm'),
      ('condis_products',    'display_name_norm'),
      ('ametller_products',  'display_name_norm'),
      ('aldi_products',      'display_name_norm'),
      ('hiperdino_products', 'display_name_norm'),
      ('alcampo_products',   'display_name_norm'),
      ('plusfresc_products', 'display_name_norm'),
      ('mercadona_products', 'display_name_ca_norm'),
      ('bonpreu_products',   'display_name_ca_norm'),
      ('bonarea_products',   'display_name_ca_norm'),
      ('sorli_products',     'display_name_ca_norm'),
      ('condis_products',    'display_name_ca_norm'),
      ('ametller_products',  'display_name_ca_norm'),
      ('plusfresc_products', 'display_name_ca_norm')
    ) as indexes(table_name, order_column)
  loop
    if to_regclass(format('public.%I', spec.table_name)) is not null
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = spec.table_name
          and column_name = spec.order_column
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
        'create index if not exists %I on public.%I (%I, id) where published = true',
        spec.table_name || '_' || spec.order_column || '_browse_idx',
        spec.table_name,
        spec.order_column
      );
    end if;
  end loop;
end
$catalog_browse_indexes$;
