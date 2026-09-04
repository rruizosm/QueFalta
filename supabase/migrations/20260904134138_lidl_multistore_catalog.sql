-- Lidl: separa la ficha comun del producto de precio, promocion, surtido y
-- disponibilidad, que son datos autoritativos de una tienda concreta.
--
-- La tabla lidl_products se conserva durante la transicion para que las builds
-- publicadas sigan leyendo el catalogo de referencia ES3572. La ficha maestra
-- nueva vive en lidl_product_master; las builds nuevas leen
-- lidl_product_stores y nunca mezclan variantes de tiendas distintas.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $preflight$
begin
  if to_regclass('public.lidl_products') is null
     or to_regclass('public.lidl_categories') is null then
    raise exception 'lidl_multistore_preflight_failed: legacy Lidl catalog is missing';
  end if;

  if to_regprocedure('public.f_unaccent(text)') is null
     or to_regprocedure('public.catalog_search_normalize(text)') is null
     or to_regprocedure('public.catalog_search_words(text)') is null
     or to_regprocedure('public.catalog_search_tsquery(text)') is null
     or to_regprocedure('public.catalog_search_rank(text,text,text[],tsquery)') is null then
    raise exception 'lidl_multistore_preflight_failed: catalog search helpers are missing';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Directorio nacional y resolucion CP -> candidatos
-- ---------------------------------------------------------------------------

create table public.lidl_stores (
  id                      text primary key,
  directory_object_number text not null unique,
  name                    text not null,
  street                  text,
  street_number           text,
  postal_code             text not null,
  city                    text not null,
  autonomous_community    text,
  latitude                double precision not null,
  longitude               double precision not null,
  offer_region            text,
  offer_region_name       text,
  zone                    text not null,
  zone_name               text,
  status                  text not null,
  status_from             timestamptz,
  status_to               timestamptz,
  selectable              boolean not null default true,
  published               boolean not null default true,
  raw                     jsonb not null default '{}'::jsonb,
  synced_at               timestamptz not null default now(),
  constraint lidl_stores_id_check check (id ~ '^ES[0-9]+$'),
  constraint lidl_stores_directory_id_check
    check (directory_object_number ~ '^ES[0-9]{5}$'),
  constraint lidl_stores_postal_code_check check (postal_code ~ '^[0-9]{5}$'),
  constraint lidl_stores_zone_check check (zone in ('PEN', 'BAL', 'CAN')),
  constraint lidl_stores_coordinates_check
    check (latitude between -90 and 90 and longitude between -180 and 180)
);

create table public.lidl_postal_stores (
  postal_code text not null,
  store_id    text not null references public.lidl_stores(id)
                on update cascade on delete cascade,
  match_kind  text not null default 'exact',
  distance_km numeric,
  rank        smallint not null,
  is_default  boolean not null default false,
  published   boolean not null default true,
  synced_at   timestamptz not null default now(),
  primary key (postal_code, store_id),
  constraint lidl_postal_stores_postal_code_check
    check (postal_code ~ '^[0-9]{5}$'),
  constraint lidl_postal_stores_match_kind_check
    check (match_kind in ('exact', 'nearby')),
  constraint lidl_postal_stores_distance_check
    check (distance_km is null or distance_km >= 0),
  constraint lidl_postal_stores_rank_check check (rank > 0)
);

create index lidl_stores_postal_idx
  on public.lidl_stores (postal_code, id)
  where published and selectable;
create index lidl_stores_offer_region_idx
  on public.lidl_stores (offer_region, id)
  where published and selectable;
create index lidl_stores_coordinates_idx
  on public.lidl_stores (latitude, longitude)
  where published and selectable;
create index lidl_postal_stores_rank_idx
  on public.lidl_postal_stores (postal_code, rank, store_id);
create unique index lidl_postal_stores_one_default_idx
  on public.lidl_postal_stores (postal_code)
  where is_default and published;

comment on table public.lidl_stores is
  'Directorio oficial de tiendas Lidl; id es el identificador usado por Product Catalog.';
comment on table public.lidl_postal_stores is
  'Candidatos precomputados para un CP: coincidencias exactas o las tiendas cercanas ordenadas.';
comment on column public.lidl_stores.offer_region is
  'Agrupacion comercial de Lidl; nunca se usa como garantia de precio.';

-- Compatibilidad con el catalogo productivo ya publicado. El sincronizador del
-- directorio sustituira/actualizara esta semilla con el registro oficial.
insert into public.lidl_stores (
  id, directory_object_number, name, street, street_number, postal_code, city,
  autonomous_community, latitude, longitude, offer_region, offer_region_name,
  zone, zone_name, status, selectable, published, raw
)
values (
  'ES3572', 'ES03572', 'Sant Joan d''Alacant-Benimagrell',
  'Avenida de Miguel Hernandez', '36', '03550', 'Sant Joan d''Alacant',
  'Cdad. Valenciana', 38.39341, -0.43352, '38', 'Alicante',
  'PEN', 'Peninsula', 'open', true, true, '{}'::jsonb
)
on conflict (id) do nothing;

insert into public.lidl_postal_stores (
  postal_code, store_id, match_kind, distance_km, rank, is_default, published
)
values ('03550', 'ES3572', 'exact', 0, 1, true, true)
on conflict (postal_code, store_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Variante tienda-producto y categorias disponibles por tienda
-- ---------------------------------------------------------------------------

create table public.lidl_product_master (
  id                  text primary key,
  retailer_product_id text,
  ean                 text,
  display_name        text not null,
  brand               text,
  packaging           text,
  thumbnail           text,
  product_line        text,
  listing_type        text,
  published           boolean not null default true,
  raw                 jsonb not null default '{}'::jsonb,
  synced_at           timestamptz not null default now(),
  first_seen_at       timestamptz not null default now(),
  display_name_norm   text generated always as (
                        lower(public.f_unaccent(display_name))
                      ) stored,
  constraint lidl_product_master_ean_is_gtin
    check (ean is null or ean ~ '^[0-9]{8,14}$')
);

comment on table public.lidl_product_master is
  'Ficha comun Lidl sin precio, promocion, surtido ni disponibilidad local.';

insert into public.lidl_product_master (
  id, retailer_product_id, ean, display_name, brand, packaging, thumbnail,
  product_line, listing_type, published, raw, synced_at, first_seen_at
)
select
  p.id, p.retailer_product_id, p.ean, p.display_name, p.brand, p.packaging,
  p.thumbnail, p.product_line, p.listing_type, p.published,
  p.raw - 'price' - 'stockAvailability' - 'productValidForClickAndCollect' - 'offer',
  p.synced_at, p.first_seen_at
from public.lidl_products as p
on conflict (id) do nothing;

create table public.lidl_store_products (
  store_id             text not null references public.lidl_stores(id)
                         on update cascade on delete restrict,
  product_id           text not null references public.lidl_product_master(id)
                         on update cascade on delete cascade,
  category_id          text,
  category_name        text,
  category_ids         text[] not null default '{}',
  unit_price           numeric,
  price_format         text,
  price_per_unit       numeric,
  price_per_unit_unit  text,
  promo_name           text,
  promo_text           text,
  promo_price          numeric,
  promo_base_price     numeric,
  promo_start          date,
  promo_end            date,
  is_lidl_plus_offer   boolean not null default false,
  available            boolean not null default false,
  stock_indicator      text,
  click_collect        boolean not null default false,
  published            boolean not null default true,
  raw                  jsonb not null default '{}'::jsonb,
  observed_at          timestamptz not null default now(),
  synced_at            timestamptz not null default now(),
  first_seen_at        timestamptz not null default now(),
  prev_unit_price      numeric,
  price_changed_at     timestamptz,
  price_delta_pct      numeric,
  offer_unit_price     numeric generated always as (
                         coalesce(promo_price, unit_price)
                       ) stored,
  primary key (store_id, product_id),
  constraint lidl_store_products_price_check
    check (unit_price is null or unit_price >= 0),
  constraint lidl_store_products_promo_price_check
    check (promo_price is null or promo_price >= 0),
  constraint lidl_store_products_promo_dates_check
    check (promo_start is null or promo_end is null or promo_start <= promo_end)
);

create table public.lidl_store_categories (
  store_id     text not null references public.lidl_stores(id)
                 on update cascade on delete cascade,
  category_id  text not null references public.lidl_categories(id)
                 on update cascade on delete cascade,
  product_count integer not null default 0 check (product_count >= 0),
  published     boolean not null default true,
  synced_at     timestamptz not null default now(),
  primary key (store_id, category_id)
);

create index lidl_store_products_browse_idx
  on public.lidl_store_products (store_id, product_id)
  where published;
create index lidl_product_master_name_browse_idx
  on public.lidl_product_master (display_name_norm, id)
  where published;
create index lidl_product_master_norm_trgm_idx
  on public.lidl_product_master using gin (display_name_norm gin_trgm_ops);
create index lidl_product_master_search_fts_idx
  on public.lidl_product_master using gin (
    to_tsvector('simple'::regconfig, display_name_norm)
  ) where published;
create index lidl_store_products_category_idx
  on public.lidl_store_products (store_id, category_id, product_id)
  where published;
create index lidl_store_products_category_ids_idx
  on public.lidl_store_products using gin (category_ids);
create index lidl_store_products_price_idx
  on public.lidl_store_products (store_id, unit_price, product_id)
  where published;
create index lidl_store_products_price_per_unit_idx
  on public.lidl_store_products (store_id, price_per_unit, product_id)
  where published;
create index lidl_store_products_new_idx
  on public.lidl_store_products (store_id, first_seen_at desc, product_id)
  where published;
create index lidl_store_products_price_changes_idx
  on public.lidl_store_products (store_id, price_changed_at desc, product_id)
  where published and price_changed_at is not null;
create index lidl_store_products_offers_idx
  on public.lidl_store_products (store_id, promo_end, product_id)
  where published and promo_name is not null;
create index lidl_store_products_offer_price_idx
  on public.lidl_store_products (store_id, offer_unit_price, product_id)
  where published and promo_name is not null;
create index lidl_store_categories_browse_idx
  on public.lidl_store_categories (store_id, category_id)
  where published and product_count > 0;

drop trigger if exists track_price_change on public.lidl_store_products;
create trigger track_price_change
before update of unit_price on public.lidl_store_products
for each row execute function public.catalog_track_price_change();

insert into public.lidl_store_products (
  store_id, product_id, category_id, category_name, category_ids, unit_price,
  price_format, price_per_unit, price_per_unit_unit, promo_name, promo_text,
  promo_price, promo_base_price, promo_start, promo_end, is_lidl_plus_offer,
  available, stock_indicator, click_collect, published, raw, observed_at,
  synced_at, first_seen_at, prev_unit_price, price_changed_at, price_delta_pct
)
select
  p.source_store_id, p.id, p.category_id, p.category_name, p.category_ids,
  p.unit_price, p.price_format, p.price_per_unit, p.price_per_unit_unit,
  p.promo_name, p.promo_text, p.promo_price, p.promo_base_price,
  p.promo_start, p.promo_end, p.is_lidl_plus_offer, p.available,
  p.stock_indicator, p.click_collect, p.published,
  jsonb_build_object(
    'price', p.raw -> 'price',
    'stockAvailability', p.raw -> 'stockAvailability',
    'productValidForClickAndCollect', p.raw -> 'productValidForClickAndCollect',
    'offer', p.raw -> 'offer'
  ),
  p.synced_at,
  p.synced_at, p.first_seen_at, p.prev_unit_price, p.price_changed_at,
  p.price_delta_pct
from public.lidl_products as p
where p.source_store_id = 'ES3572'
on conflict (store_id, product_id) do nothing;

insert into public.lidl_store_categories (
  store_id, category_id, product_count, published, synced_at
)
select 'ES3572', c.id, c.product_count, c.published, c.synced_at
from public.lidl_categories as c
on conflict (store_id, category_id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Lecturas resueltas por tienda
-- ---------------------------------------------------------------------------

create view public.lidl_product_stores
with (security_invoker = true)
as
select
  sp.store_id,
  p.id,
  p.retailer_product_id,
  p.ean,
  p.display_name,
  p.brand,
  p.packaging,
  p.thumbnail,
  sp.category_id,
  sp.category_name,
  sp.category_ids,
  sp.unit_price,
  sp.price_format,
  sp.price_per_unit,
  sp.price_per_unit_unit,
  sp.promo_name,
  sp.promo_text,
  sp.promo_price,
  sp.promo_base_price,
  sp.promo_start,
  sp.promo_end,
  sp.offer_unit_price,
  sp.is_lidl_plus_offer,
  sp.available,
  sp.stock_indicator,
  p.product_line,
  p.listing_type,
  sp.click_collect,
  (p.published and sp.published) as published,
  p.raw,
  sp.raw as store_raw,
  sp.observed_at,
  greatest(p.synced_at, sp.synced_at) as synced_at,
  sp.first_seen_at,
  sp.prev_unit_price,
  sp.price_changed_at,
  sp.price_delta_pct,
  p.display_name_norm
from public.lidl_product_master as p
join public.lidl_store_products as sp on sp.product_id = p.id;

create view public.lidl_store_category_catalog
with (security_invoker = true)
as
select
  sc.store_id,
  c.id,
  c.api_id,
  c.name,
  c.parent_id,
  c.image_url,
  sc.product_count,
  (c.published and sc.published) as published,
  greatest(c.synced_at, sc.synced_at) as synced_at
from public.lidl_categories as c
join public.lidl_store_categories as sc on sc.category_id = c.id;

create or replace function public.find_lidl_stores(
  p_postal_code text,
  p_limit integer default 3
)
returns table (
  id text,
  name text,
  street text,
  street_number text,
  postal_code text,
  city text,
  latitude double precision,
  longitude double precision,
  offer_region text,
  zone text,
  distance_km numeric,
  match_kind text,
  candidate_rank smallint,
  is_default boolean,
  catalog_synced_at timestamptz
)
language sql
stable
parallel safe
security invoker
set search_path = ''
as $function$
  select
    s.id, s.name, s.street, s.street_number, s.postal_code, s.city,
    s.latitude, s.longitude, s.offer_region, s.zone, ps.distance_km,
    ps.match_kind, ps.rank, ps.is_default,
    max(sp.synced_at) as catalog_synced_at
  from public.lidl_postal_stores as ps
  join public.lidl_stores as s on s.id = ps.store_id
  left join public.lidl_store_products as sp
    on sp.store_id = s.id and sp.published
  where ps.postal_code = p_postal_code
    and p_postal_code ~ '^[0-9]{5}$'
    and ps.published
    and s.published
    and s.selectable
  group by
    s.id, s.name, s.street, s.street_number, s.postal_code, s.city,
    s.latitude, s.longitude, s.offer_region, s.zone, ps.distance_km,
    ps.match_kind, ps.rank, ps.is_default
  order by ps.rank, ps.distance_km nulls last, s.id
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$function$;

create or replace function public.search_lidl_store_products(
  p_query text,
  p_store_id text,
  p_order text default 'relevance',
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.lidl_product_stores
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
    from public.lidl_product_stores p cross join search
    where p.store_id = p_store_id and p.published
      and length(search.query_norm) >= 2
      and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query
    union
    select p.id, p.display_name_norm as search_name
    from public.lidl_product_stores p cross join search
    where p.store_id = p_store_id and p.published
      and length(search.query_norm) >= 3
      and search.query_norm operator(public.<%) p.display_name_norm
  )
  select p
  from candidates
  join public.lidl_product_stores p
    on p.store_id = p_store_id and p.id = candidates.id
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

create or replace function public.search_lidl_store_feed_products(
  p_query text,
  p_store_id text,
  p_feed text default 'new',
  p_since timestamptz default (now() - interval '8 days'),
  p_today date default current_date,
  p_categories text[] default null,
  p_price_min numeric default null,
  p_price_max numeric default null,
  p_order text default 'relevance',
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.lidl_product_stores
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
    select
      count(*) filter (where p.first_seen_at >= p_since) as recent_count,
      count(*) as published_count
    from public.lidl_product_stores p
    where p.store_id = p_store_id
      and lower(coalesce(p_feed, '')) = 'new'
      and p.published
  ), feed_stats as (
    select recent_count > 400
      and recent_count::numeric / nullif(published_count, 0) >= 0.75 as initial_fill
    from feed_counts
  ), candidates as (
    select p.id, p.display_name_norm as search_name
    from public.lidl_product_stores p cross join search cross join feed_stats
    where p.store_id = p_store_id and p.published
      and ((lower(coalesce(p_feed, '')) = 'new'
          and p.first_seen_at >= p_since and not feed_stats.initial_fill)
        or (lower(coalesce(p_feed, '')) = 'offer'
          and p.promo_name is not null
          and (p.promo_start is null or p.promo_start <= p_today)
          and (p.promo_end is null or p.promo_end >= p_today)))
      and (p_categories is null or cardinality(p_categories) = 0
        or p.category_name = any(p_categories))
      and (p_price_min is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then p.offer_unit_price else p.unit_price end) > p_price_min)
      and (p_price_max is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then p.offer_unit_price else p.unit_price end) <= p_price_max)
      and to_tsvector('simple'::regconfig, p.display_name_norm) @@ search.parsed_query
    union
    select p.id, p.display_name_norm as search_name
    from public.lidl_product_stores p cross join search cross join feed_stats
    where p.store_id = p_store_id and p.published and length(search.query_norm) >= 3
      and ((lower(coalesce(p_feed, '')) = 'new'
          and p.first_seen_at >= p_since and not feed_stats.initial_fill)
        or (lower(coalesce(p_feed, '')) = 'offer'
          and p.promo_name is not null
          and (p.promo_start is null or p.promo_start <= p_today)
          and (p.promo_end is null or p.promo_end >= p_today)))
      and (p_categories is null or cardinality(p_categories) = 0
        or p.category_name = any(p_categories))
      and (p_price_min is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then p.offer_unit_price else p.unit_price end) > p_price_min)
      and (p_price_max is null or
        (case when lower(coalesce(p_feed, '')) = 'offer'
          then p.offer_unit_price else p.unit_price end) <= p_price_max)
      and search.query_norm operator(public.<%) p.display_name_norm
  )
  select p
  from candidates
  join public.lidl_product_stores p
    on p.store_id = p_store_id and p.id = candidates.id
  cross join search
  order by
    case when lower(coalesce(p_order, 'relevance')) = 'priceasc' then
      case when lower(coalesce(p_feed, '')) = 'offer' then p.offer_unit_price else p.unit_price end
    end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'pricedesc' then
      case when lower(coalesce(p_feed, '')) = 'offer' then p.offer_unit_price else p.unit_price end
    end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitasc' then p.price_per_unit end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitdesc' then p.price_per_unit end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) not in
      ('priceasc', 'pricedesc', 'priceperunitasc', 'priceperunitdesc') then
      public.catalog_search_rank(candidates.search_name, search.query_norm, search.words, search.parsed_query)
    end desc nulls last,
    case when lower(coalesce(p_feed, '')) = 'new' then p.first_seen_at end desc nulls last,
    candidates.search_name,
    p.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

-- La preferencia pertenece al perfil privado y queda cubierta por las policies
-- de ownership ya existentes en profiles.
alter table public.profiles
  add column if not exists lidl_store_id text references public.lidl_stores(id)
    on update cascade on delete set null;

comment on column public.profiles.lidl_store_id is
  'Tienda Lidl confirmada por el usuario; determina precio, promociones, surtido y disponibilidad.';

-- ---------------------------------------------------------------------------
-- 4. RLS, permisos Data API y funciones publicas de lectura
-- ---------------------------------------------------------------------------

alter table public.lidl_stores enable row level security;
alter table public.lidl_postal_stores enable row level security;
alter table public.lidl_product_master enable row level security;
alter table public.lidl_store_products enable row level security;
alter table public.lidl_store_categories enable row level security;

create policy "lidl stores read" on public.lidl_stores
  for select to anon, authenticated using (published);
create policy "lidl postal candidates read" on public.lidl_postal_stores
  for select to anon, authenticated using (published);
create policy "lidl product master read" on public.lidl_product_master
  for select to anon, authenticated using (published);
create policy "lidl store products read" on public.lidl_store_products
  for select to anon, authenticated using (published);
create policy "lidl store categories read" on public.lidl_store_categories
  for select to anon, authenticated using (published);

revoke all on table
  public.lidl_stores,
  public.lidl_postal_stores,
  public.lidl_product_master,
  public.lidl_store_products,
  public.lidl_store_categories,
  public.lidl_product_stores,
  public.lidl_store_category_catalog
from public, anon, authenticated;

grant select on table
  public.lidl_stores,
  public.lidl_postal_stores,
  public.lidl_product_master,
  public.lidl_store_products,
  public.lidl_store_categories,
  public.lidl_product_stores,
  public.lidl_store_category_catalog
to anon, authenticated;

grant select, insert, update, delete on table
  public.lidl_stores,
  public.lidl_postal_stores,
  public.lidl_product_master,
  public.lidl_store_products,
  public.lidl_store_categories
to service_role;
grant select on table
  public.lidl_product_stores,
  public.lidl_store_category_catalog
to service_role;

revoke all on function public.find_lidl_stores(text,integer)
  from public, anon, authenticated;
grant execute on function public.find_lidl_stores(text,integer)
  to anon, authenticated, service_role;

revoke all on function public.search_lidl_store_products(text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_lidl_store_products(text,text,text,integer,integer)
  to anon, authenticated, service_role;

revoke all on function public.search_lidl_store_feed_products(
  text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer
)
from public, anon, authenticated;
grant execute on function public.search_lidl_store_feed_products(
  text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer
)
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
