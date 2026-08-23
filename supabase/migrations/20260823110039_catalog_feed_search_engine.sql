-- Lleva el mismo motor FTS + pg_trgm del catálogo a Novedades y Ofertas.
-- Las funciones solo se usan cuando hay al menos dos letras; la navegación sin
-- texto conserva sus consultas keyset actuales. Los filtros del feed se aplican
-- antes de ranking/LIMIT/OFFSET para que todas las coincidencias sean alcanzables.

do $migration$
declare
  catalog record;
  availability_expression text;
  stats_availability_expression text;
  new_expression text;
  offer_expression text;
  candidates_sql text;
begin
  for catalog in
    select *
    from (values
      ('search_mercadona_feed_products', 'mercadona_products', true,  true,  false, 'default',    'none'),
      ('search_bonpreu_feed_products',   'bonpreu_products',   true,  false, false, 'default',    'promo'),
      ('search_carrefour_feed_products', 'carrefour_products', false, true,  false, 'default',    'carrefour'),
      ('search_bonarea_feed_products',   'bonarea_products',   true,  false, false, 'default',    'none'),
      ('search_consum_feed_products',    'consum_products',    false, true,  false, 'default',    'consum'),
      ('search_dia_feed_products',       'dia_products',       false, true,  false, 'default',    'dia'),
      ('search_sorli_feed_products',     'sorli_products',     true,  false, false, 'default',    'live_promo'),
      ('search_eroski_feed_products',    'eroski_products',    false, false, false, 'default',    'live_promo'),
      ('search_caprabo_feed_products',   'caprabo_products',   false, false, false, 'default',    'live_promo'),
      ('search_condis_feed_products',    'condis_products',    true,  false, false, 'default',    'live_promo'),
      ('search_ametller_feed_products',  'ametller_products',  true,  false, false, 'default',    'live_promo'),
      ('search_aldi_feed_products',      'aldi_products',      false, false, false, 'default',    'aldi'),
      ('search_gadis_feed_products',     'gadis_products',     false, false, false, 'explicit',   'gadis'),
      ('search_froiz_feed_products',     'froiz_products',     false, false, false, 'explicit_if_initial', 'none'),
      ('search_ahorramas_feed_products', 'ahorramas_products', false, false, false, 'default',    'live_promo'),
      ('search_hiperdino_feed_products', 'hiperdino_products', false, false, false, 'default',    'price_drop'),
      ('search_alcampo_feed_products',   'alcampo_products',   false, false, false, 'default',    'live_promo'),
      ('search_plusfresc_feed_products', 'plusfresc_products', true,  false, true,  'default',    'plusfresc')
    ) as configured(function_name, table_name, bilingual, regional, centered, new_kind, offer_kind)
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
    stats_availability_expression := case
      when catalog.regional then
        '(p_region is null or s.regions is null or s.regions = ''{}''::text[] '
        || 'or p_region = any(s.regions))'
      when catalog.centered then
        '(p_center is null or s.centers is null or s.centers = ''{}''::text[] '
        || 'or p_center = any(s.centers))'
      else 'true'
    end;

    new_expression := case catalog.new_kind
      when 'explicit' then
        '(p.first_seen_at >= p_since or coalesce(p.is_new, false))'
      when 'explicit_if_initial' then
        '(coalesce(p.is_new, false) or '
        || '(p.first_seen_at >= p_since and not feed_stats.initial_fill))'
      else
        '(p.first_seen_at >= p_since and not feed_stats.initial_fill)'
    end;

    offer_expression := case catalog.offer_kind
      when 'promo' then
        'p.promo_name is not null'
      when 'carrefour' then
        '(p.strikethrough_price is not null or '
        || '(p.promo_name is not null and (p.promo_end is null or p.promo_end >= p_today)))'
      when 'consum' then
        '(p_zone is not null and p.offer_zones is not null and p_zone = any(p.offer_zones))'
      when 'dia' then
        '(p.promo_name is not null and '
        || '(p_region is null or p.offer_regions is null or p.offer_regions = ''{}''::text[] '
        || 'or p_region = any(p.offer_regions)))'
      when 'live_promo' then
        '(p.promo_name is not null and (p.promo_end is null or p.promo_end >= p_today))'
      when 'aldi' then
        '(p.promo_base_price is not null and (p.promo_end is null or p.promo_end >= p_today))'
      when 'gadis' then
        '(coalesce(p.promo_is_coupon, false) = false and p.promo_name is not null '
        || 'and (p.promo_end is null or p.promo_end >= p_today))'
      when 'price_drop' then
        '(p.promo_base_price is not null and p.unit_price is not null '
        || 'and p.promo_base_price > p.unit_price)'
      when 'plusfresc' then
        '(p_center is not null and p.offer_centers is not null '
        || 'and p_center = any(p.offer_centers) '
        || 'and (p.promo_end is null or p.promo_end >= p_today))'
      else 'false'
    end;

    if catalog.bilingual then
      candidates_sql := format($candidates$
        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        cross join feed_stats
        where lower(coalesce(p_lang, 'es')) <> 'ca'
          and p.published
          and %s
          and (
            (lower(coalesce(p_feed, '')) = 'new' and %s)
            or (lower(coalesce(p_feed, '')) = 'offer' and %s)
          )
          and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
          and (p_price_min is null or p.unit_price > p_price_min)
          and (p_price_max is null or p.unit_price <= p_price_max)
          and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query

        union

        select p.id, p.display_name_ca_norm as search_name
        from public.%I as p
        cross join search
        cross join feed_stats
        where lower(coalesce(p_lang, 'es')) = 'ca'
          and p.published
          and %s
          and (
            (lower(coalesce(p_feed, '')) = 'new' and %s)
            or (lower(coalesce(p_feed, '')) = 'offer' and %s)
          )
          and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
          and (p_price_min is null or p.unit_price > p_price_min)
          and (p_price_max is null or p.unit_price <= p_price_max)
          and to_tsvector('simple'::regconfig, p.display_name_ca_norm) @@ search.parsed_query

        union

        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        cross join feed_stats
        where lower(coalesce(p_lang, 'es')) <> 'ca'
          and p.published
          and length(search.query_norm) >= 3
          and %s
          and (
            (lower(coalesce(p_feed, '')) = 'new' and %s)
            or (lower(coalesce(p_feed, '')) = 'offer' and %s)
          )
          and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
          and (p_price_min is null or p.unit_price > p_price_min)
          and (p_price_max is null or p.unit_price <= p_price_max)
          and search.query_norm operator(public.<%%) p.display_name_norm

        union

        select p.id, p.display_name_ca_norm as search_name
        from public.%I as p
        cross join search
        cross join feed_stats
        where lower(coalesce(p_lang, 'es')) = 'ca'
          and p.published
          and length(search.query_norm) >= 3
          and %s
          and (
            (lower(coalesce(p_feed, '')) = 'new' and %s)
            or (lower(coalesce(p_feed, '')) = 'offer' and %s)
          )
          and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
          and (p_price_min is null or p.unit_price > p_price_min)
          and (p_price_max is null or p.unit_price <= p_price_max)
          and search.query_norm operator(public.<%%) p.display_name_ca_norm
      $candidates$,
        catalog.table_name, availability_expression, new_expression, offer_expression,
        catalog.table_name, availability_expression, new_expression, offer_expression,
        catalog.table_name, availability_expression, new_expression, offer_expression,
        catalog.table_name, availability_expression, new_expression, offer_expression
      );
    else
      candidates_sql := format($candidates$
        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        cross join feed_stats
        where p.published
          and %s
          and (
            (lower(coalesce(p_feed, '')) = 'new' and %s)
            or (lower(coalesce(p_feed, '')) = 'offer' and %s)
          )
          and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
          and (p_price_min is null or p.unit_price > p_price_min)
          and (p_price_max is null or p.unit_price <= p_price_max)
          and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query

        union

        select p.id, p.display_name_norm as search_name
        from public.%I as p
        cross join search
        cross join feed_stats
        where p.published
          and length(search.query_norm) >= 3
          and %s
          and (
            (lower(coalesce(p_feed, '')) = 'new' and %s)
            or (lower(coalesce(p_feed, '')) = 'offer' and %s)
          )
          and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
          and (p_price_min is null or p.unit_price > p_price_min)
          and (p_price_max is null or p.unit_price <= p_price_max)
          and search.query_norm operator(public.<%%) p.display_name_norm
      $candidates$,
        catalog.table_name, availability_expression, new_expression, offer_expression,
        catalog.table_name, availability_expression, new_expression, offer_expression
      );
    end if;

    execute format($function$
      create or replace function public.%I(
        p_query text,
        p_feed text default 'new',
        p_lang text default 'es',
        p_region text default null,
        p_center text default null,
        p_zone text default null,
        p_since timestamptz default (now() - interval '8 days'),
        p_today date default current_date,
        p_categories text[] default null,
        p_price_min numeric default null,
        p_price_max numeric default null,
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
          where length(query_norm) >= 2
        ), feed_counts as (
          select
            count(*) filter (where s.first_seen_at >= p_since) as recent_count,
            count(*) as published_count
          from public.%I as s
          where lower(coalesce(p_feed, '')) = 'new'
            and s.published
            and %s
        ), feed_stats as (
          select
            recent_count > 400
            and recent_count::numeric / nullif(published_count, 0) >= 0.75
              as initial_fill
          from feed_counts
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
          case when lower(coalesce(p_order, 'relevance')) not in (
            'priceasc', 'pricedesc', 'priceperunitasc', 'priceperunitdesc'
          ) then public.catalog_search_rank(
            candidates.search_name,
            search.query_norm,
            search.words,
            search.parsed_query
          ) end desc nulls last,
          case when lower(coalesce(p_feed, '')) = 'new'
            then p.first_seen_at end desc nulls last,
          candidates.search_name asc,
          p.id asc
        limit least(greatest(coalesce(p_limit, 50), 1), 200)
        offset greatest(coalesce(p_offset, 0), 0);
      $body$;
    $function$,
      catalog.function_name,
      catalog.table_name,
      catalog.table_name,
      stats_availability_expression,
      candidates_sql,
      catalog.table_name
    );

    execute format(
      'revoke all on function public.%I('
      || 'text,text,text,text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer) '
      || 'from public, anon, authenticated',
      catalog.function_name
    );
    execute format(
      'grant execute on function public.%I('
      || 'text,text,text,text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer) '
      || 'to anon, authenticated, service_role',
      catalog.function_name
    );
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';
