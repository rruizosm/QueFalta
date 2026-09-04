-- Ofertas públicas de tienda Lidl. El catálogo conserva el precio ordinario;
-- promo_price solo contiene el precio final cuando la promoción lo publica.

alter table public.lidl_products
  add column if not exists promo_price numeric,
  add column if not exists promo_start date,
  add column if not exists promo_end date,
  add column if not exists offer_unit_price numeric
    generated always as (coalesce(promo_price, unit_price)) stored;

alter table public.lidl_products
  add constraint lidl_products_promo_price_nonnegative
    check (promo_price is null or promo_price >= 0),
  add constraint lidl_products_promo_dates_ordered
    check (promo_start is null or promo_end is null or promo_start <= promo_end);

create index if not exists lidl_products_live_offers_idx
  on public.lidl_products (promo_end, display_name_norm, id)
  where published and promo_name is not null;

create index if not exists lidl_products_offer_price_idx
  on public.lidl_products (offer_unit_price, id)
  where published and promo_name is not null;

comment on column public.lidl_products.promo_price is
  'Precio final directo de la oferta Lidl; NULL para promociones sin precio unitario final.';
comment on column public.lidl_products.promo_start is
  'Primer día de validez de la oferta de tienda Lidl.';
comment on column public.lidl_products.promo_end is
  'Último día de validez de la oferta de tienda Lidl.';
comment on column public.lidl_products.offer_unit_price is
  'Precio efectivo generado para filtrar y ordenar ofertas (promo o, si no existe, ordinario).';

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
      and ((lower(coalesce(p_feed, '')) = 'new'
          and p.first_seen_at >= p_since and not feed_stats.initial_fill)
        or (lower(coalesce(p_feed, '')) = 'offer'
          and p.promo_name is not null
          and (p.promo_start is null or p.promo_start <= p_today)
          and (p.promo_end is null or p.promo_end >= p_today)))
      and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
      and (p_price_min is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then coalesce(p.promo_price, p.unit_price) else p.unit_price end) > p_price_min)
      and (p_price_max is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then coalesce(p.promo_price, p.unit_price) else p.unit_price end) <= p_price_max)
      and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query
    union
    select p.id, p.display_name_norm as search_name
    from public.lidl_products p cross join search cross join feed_stats
    where p.published and length(search.query_norm) >= 3
      and ((lower(coalesce(p_feed, '')) = 'new'
          and p.first_seen_at >= p_since and not feed_stats.initial_fill)
        or (lower(coalesce(p_feed, '')) = 'offer'
          and p.promo_name is not null
          and (p.promo_start is null or p.promo_start <= p_today)
          and (p.promo_end is null or p.promo_end >= p_today)))
      and (p_categories is null or cardinality(p_categories) = 0 or p.category_name = any(p_categories))
      and (p_price_min is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then coalesce(p.promo_price, p.unit_price) else p.unit_price end) > p_price_min)
      and (p_price_max is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then coalesce(p.promo_price, p.unit_price) else p.unit_price end) <= p_price_max)
      and search.query_norm operator(public.<%) p.display_name_norm
  )
  select p
  from candidates
  join public.lidl_products p on p.id = candidates.id
  cross join search
  order by
    case when lower(coalesce(p_order, 'relevance')) = 'priceasc' then
      case when lower(coalesce(p_feed, '')) = 'offer' then coalesce(p.promo_price, p.unit_price) else p.unit_price end
    end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'pricedesc' then
      case when lower(coalesce(p_feed, '')) = 'offer' then coalesce(p.promo_price, p.unit_price) else p.unit_price end
    end desc nulls last,
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

revoke all on function public.search_lidl_feed_products(text,text,text,text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_lidl_feed_products(text,text,text,text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
