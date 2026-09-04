-- Integra Lidl en el motor de búsqueda y feeds del catálogo de QuéFalta.

create index if not exists lidl_products_name_browse_idx
  on public.lidl_products (display_name_norm, id)
  where published;

create index if not exists lidl_products_search_fts_idx
  on public.lidl_products using gin (
    to_tsvector('simple'::regconfig, display_name_norm)
  ) where published;

create or replace function public.search_lidl_products(
  p_query text,
  p_lang text default 'es',
  p_region text default null,
  p_center text default null,
  p_order text default 'relevance',
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.lidl_products
language sql
stable
parallel safe
security invoker
set search_path = ''
as $function$
  with search as (
    select query_norm,
      public.catalog_search_words(query_norm) as words,
      public.catalog_search_tsquery(query_norm) as parsed_query
    from (select public.catalog_search_normalize(p_query) as query_norm) normalized
  ), candidates as (
    select p.id, p.display_name_norm as search_name
    from public.lidl_products p cross join search
    where p.published
      and length(search.query_norm) >= 2
      and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query
    union
    select p.id, p.display_name_norm as search_name
    from public.lidl_products p cross join search
    where p.published
      and length(search.query_norm) >= 3
      and search.query_norm operator(public.<%) p.display_name_norm
  )
  select p
  from candidates
  join public.lidl_products p on p.id = candidates.id
  cross join search
  order by
    case when lower(coalesce(p_order, 'relevance')) = 'priceasc' then p.unit_price end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'pricedesc' then p.unit_price end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitasc' then p.price_per_unit end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitdesc' then p.price_per_unit end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'relevance' then
      public.catalog_search_rank(candidates.search_name, search.query_norm, search.words, search.parsed_query)
    end desc nulls last,
    candidates.search_name,
    p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

create or replace function public.search_lidl_feed_products(
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
returns setof public.lidl_products
language sql
stable
parallel safe
security invoker
set search_path = ''
as $function$
  with search as (
    select query_norm,
      public.catalog_search_words(query_norm) as words,
      public.catalog_search_tsquery(query_norm) as parsed_query
    from (select public.catalog_search_normalize(p_query) as query_norm) normalized
    where length(query_norm) >= 2
  ), feed_counts as (
    select count(*) filter (where p.first_seen_at >= p_since) as recent_count,
      count(*) as published_count
    from public.lidl_products p
    where lower(coalesce(p_feed, '')) = 'new' and p.published
  ), feed_stats as (
    select recent_count > 400
      and recent_count::numeric / nullif(published_count, 0) >= 0.75 as initial_fill
    from feed_counts
  ), candidates as (
    select p.id, p.display_name_norm as search_name
    from public.lidl_products p cross join search cross join feed_stats
    where p.published
      and ((lower(coalesce(p_feed, '')) = 'new' and p.first_seen_at >= p_since and not feed_stats.initial_fill)
        or (lower(coalesce(p_feed, '')) = 'offer' and p.promo_name is not null))
      and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
      and (p_price_min is null or p.unit_price > p_price_min)
      and (p_price_max is null or p.unit_price <= p_price_max)
      and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query
    union
    select p.id, p.display_name_norm as search_name
    from public.lidl_products p cross join search cross join feed_stats
    where p.published and length(search.query_norm) >= 3
      and ((lower(coalesce(p_feed, '')) = 'new' and p.first_seen_at >= p_since and not feed_stats.initial_fill)
        or (lower(coalesce(p_feed, '')) = 'offer' and p.promo_name is not null))
      and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
      and (p_price_min is null or p.unit_price > p_price_min)
      and (p_price_max is null or p.unit_price <= p_price_max)
      and search.query_norm operator(public.<%) p.display_name_norm
  )
  select p
  from candidates
  join public.lidl_products p on p.id = candidates.id
  cross join search
  order by
    case when lower(coalesce(p_order, 'relevance')) = 'priceasc' then p.unit_price end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'pricedesc' then p.unit_price end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitasc' then p.price_per_unit end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitdesc' then p.price_per_unit end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) not in ('priceasc', 'pricedesc', 'priceperunitasc', 'priceperunitdesc') then
      public.catalog_search_rank(candidates.search_name, search.query_norm, search.words, search.parsed_query)
    end desc nulls last,
    case when lower(coalesce(p_feed, '')) = 'new' then p.first_seen_at end desc nulls last,
    candidates.search_name,
    p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

revoke all on function public.search_lidl_products(text,text,text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_lidl_products(text,text,text,text,text,integer,integer)
  to anon, authenticated, service_role;

revoke all on function public.search_lidl_feed_products(text,text,text,text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_lidl_feed_products(text,text,text,text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
