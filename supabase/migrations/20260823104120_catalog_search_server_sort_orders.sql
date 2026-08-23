-- Añade una firma con p_order para que relevancia, precio de envase y precio
-- unitario se ordenen antes de LIMIT/OFFSET. La firma v1 de seis argumentos se
-- conserva para clientes intermedios y herramientas internas.

do $migration$
declare
  catalog record;
  availability_expression text;
  candidates_sql text;
begin
  for catalog in
    select *
    from (values
      ('search_mercadona_products', 'mercadona_products', true,  true,  false),
      ('search_bonpreu_products',   'bonpreu_products',   true,  false, false),
      ('search_carrefour_products', 'carrefour_products', false, true,  false),
      ('search_bonarea_products',   'bonarea_products',   true,  false, false),
      ('search_consum_products',    'consum_products',    false, true,  false),
      ('search_dia_products',       'dia_products',       false, true,  false),
      ('search_sorli_products',     'sorli_products',     true,  false, false),
      ('search_eroski_products',    'eroski_products',    false, false, false),
      ('search_caprabo_products',   'caprabo_products',   false, false, false),
      ('search_condis_products',    'condis_products',    true,  false, false),
      ('search_ametller_products',  'ametller_products',  true,  false, false),
      ('search_aldi_products',      'aldi_products',      false, false, false),
      ('search_gadis_products',     'gadis_products',     false, false, false),
      ('search_froiz_products',     'froiz_products',     false, false, false),
      ('search_ahorramas_products', 'ahorramas_products', false, false, false),
      ('search_hiperdino_products', 'hiperdino_products', false, false, false),
      ('search_alcampo_products',   'alcampo_products',   false, false, false),
      ('search_plusfresc_products', 'plusfresc_products', true,  false, true)
    ) as configured(function_name, table_name, bilingual, regional, centered)
  loop
    availability_expression := case
      when catalog.regional then
        '(p_region is null or p.regions is null or p.regions = ''{}''::text[] '
        || 'or p_region = any(p.regions))'
      when catalog.centered then
        '(p_center is null or p.centers is null or p.centers = ''{}''::text[] '
        || 'or p_center = any(p.centers))'
      else 'true'
    end;

    if catalog.bilingual then
      candidates_sql := format($candidates$
        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        where lower(coalesce(p_lang, 'es')) <> 'ca'
          and p.published
          and length(search.query_norm) >= 2
          and %s
          and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query

        union

        select p.id, p.display_name_ca_norm as search_name
        from public.%I as p
        cross join search
        where lower(coalesce(p_lang, 'es')) = 'ca'
          and p.published
          and length(search.query_norm) >= 2
          and %s
          and to_tsvector('simple'::regconfig, p.display_name_ca_norm) @@ search.parsed_query

        union

        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        where lower(coalesce(p_lang, 'es')) <> 'ca'
          and p.published
          and length(search.query_norm) >= 3
          and %s
          and search.query_norm operator(public.<%%) p.display_name_norm

        union

        select p.id, p.display_name_ca_norm as search_name
        from public.%I as p
        cross join search
        where lower(coalesce(p_lang, 'es')) = 'ca'
          and p.published
          and length(search.query_norm) >= 3
          and %s
          and search.query_norm operator(public.<%%) p.display_name_ca_norm
      $candidates$,
        catalog.table_name, availability_expression,
        catalog.table_name, availability_expression,
        catalog.table_name, availability_expression,
        catalog.table_name, availability_expression
      );
    else
      candidates_sql := format($candidates$
        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        where p.published
          and length(search.query_norm) >= 2
          and %s
          and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query

        union

        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        where p.published
          and length(search.query_norm) >= 3
          and %s
          and search.query_norm operator(public.<%%) p.display_name_norm
      $candidates$,
        catalog.table_name, availability_expression,
        catalog.table_name, availability_expression
      );
    end if;

    execute format($function$
      create or replace function public.%I(
        p_query text,
        p_lang text default 'es',
        p_region text default null,
        p_center text default null,
        p_order text default 'relevance',
        p_limit integer default 50,
        p_offset integer default 0
      )
      returns setof public.%I
      language sql
      stable
      parallel safe
      security invoker
      set search_path = ''
      as $body$
        with search as (
          select
            query_norm,
            public.catalog_search_words(query_norm) as words,
            public.catalog_search_tsquery(query_norm) as parsed_query
          from (
            select public.catalog_search_normalize(p_query) as query_norm
          ) normalized
        ), candidates as (
          %s
        )
        select p
        from candidates
        join public.%I as p on p.id = candidates.id
        cross join search
        order by
          case when lower(coalesce(p_order, 'relevance')) = 'priceasc'
            then p.unit_price end asc nulls last,
          case when lower(coalesce(p_order, 'relevance')) = 'pricedesc'
            then p.unit_price end desc nulls last,
          case when lower(coalesce(p_order, 'relevance')) = 'priceperunitasc'
            then p.price_per_unit end asc nulls last,
          case when lower(coalesce(p_order, 'relevance')) = 'priceperunitdesc'
            then p.price_per_unit end desc nulls last,
          case when lower(coalesce(p_order, 'relevance')) = 'relevance'
            then public.catalog_search_rank(
              candidates.search_name,
              search.query_norm,
              search.words,
              search.parsed_query
            ) end desc nulls last,
          candidates.search_name asc,
          p.id asc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
        offset greatest(coalesce(p_offset, 0), 0);
      $body$;
    $function$,
      catalog.function_name,
      catalog.table_name,
      candidates_sql,
      catalog.table_name
    );

    execute format(
      'revoke all on function public.%I(text,text,text,text,text,integer,integer) '
      || 'from public, anon, authenticated',
      catalog.function_name
    );
    execute format(
      'grant execute on function public.%I(text,text,text,text,text,integer,integer) '
      || 'to anon, authenticated, service_role',
      catalog.function_name
    );
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
