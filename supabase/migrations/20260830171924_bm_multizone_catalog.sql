-- BM Supermercados: catalogo multizona (Fase 2).
--
-- El catalogo fuente tiene hasta seis niveles, pero QueFalta solo navega
-- Categoria -> Subcategoria. `bm_categories` conserva exclusivamente N1 y N2;
-- la ruta fuente completa queda en `bm_products.raw` para trazabilidad.
--
-- Los datos comunes viven en `bm_products`. Precio, promocion, disponibilidad
-- y novedad son autoritativos por `location_id` en la tabla zonal compartida.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $preflight$
begin
  if to_regclass('public.catalog_location_prices') is null
     or to_regclass('public.catalog_location_price_changes') is null then
    raise exception 'bm_multizone_preflight_failed: catalog_location_* tables are missing';
  end if;

  if to_regprocedure('public.f_unaccent(text)') is null
     or to_regprocedure('public.catalog_search_normalize(text)') is null
     or to_regprocedure('public.catalog_search_words(text)') is null
     or to_regprocedure('public.catalog_search_tsquery(text)') is null
     or to_regprocedure('public.catalog_search_rank(text,text,text[],tsquery)') is null then
    raise exception 'bm_multizone_preflight_failed: catalog search helpers are missing';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Jerarquia navegable de dos niveles y producto comun
-- ---------------------------------------------------------------------------

create table public.bm_categories (
  id            text primary key,
  name          text not null,
  parent_id     text references public.bm_categories(id)
                  deferrable initially deferred,
  level         smallint generated always as (
                  case when parent_id is null then 1 else 2 end
                ) stored,
  product_count integer not null default 0 check (product_count >= 0),
  published     boolean not null default true,
  synced_at     timestamptz not null default now(),
  unique (id, parent_id)
);

create or replace function public.bm_validate_category_depth()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.parent_id is not null and not exists (
    select 1
    from public.bm_categories as parent
    where parent.id = new.parent_id
      and parent.parent_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'bm_categories only accepts Category -> Subcategory';
  end if;

  if new.parent_id is not null and exists (
    select 1
    from public.bm_categories as child
    where child.parent_id = new.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'a BM subcategory cannot have children';
  end if;

  return new;
end;
$function$;

create constraint trigger bm_categories_two_levels
after insert or update of id, parent_id on public.bm_categories
deferrable initially deferred
for each row execute function public.bm_validate_category_depth();

create table public.bm_products (
  id                  text primary key, -- product.code
  retailer_product_id text,             -- product.id interno de BM
  ean                 text,
  global_gtin         text,
  display_name        text not null,
  brand               text,
  packaging           text,
  thumbnail           text,
  product_url         text,
  root_category_id    text,
  category_id         text,
  category_name       text,
  category_ids        text[] generated always as (
                        case
                          when category_id is null then '{}'::text[]
                          else array[root_category_id, category_id]
                        end
                      ) stored,
  unit_price          numeric,
  base_unit_price     numeric,
  price_format        text,
  price_per_unit      numeric,
  price_per_unit_unit text,
  price_unit_type     text,
  minimum_unit        numeric,
  interval_unit       numeric,
  promo_type          text,
  promo_name          text,
  promo_text          text,
  promo_price         numeric,
  promo_base_price    numeric,
  promo_start         date,
  promo_end           date,
  offer_id            text,
  promotion_id        text,
  promo_discount      numeric,
  available           boolean not null default true,
  is_new              boolean not null default false,
  published           boolean not null default true,
  raw                 jsonb not null,
  synced_at           timestamptz not null default now(),
  first_seen_at       timestamptz not null default '2000-01-01'::timestamptz,
  display_name_norm   text generated always as (
                        lower(public.f_unaccent(display_name))
                      ) stored,
  constraint bm_products_category_pair_check check (
    (root_category_id is null and category_id is null)
    or (root_category_id is not null and category_id is not null)
  ),
  constraint bm_products_root_category_fk
    foreign key (root_category_id)
    references public.bm_categories(id)
    deferrable initially deferred,
  constraint bm_products_subcategory_fk
    foreign key (category_id, root_category_id)
    references public.bm_categories(id, parent_id)
    deferrable initially deferred
);

alter table public.bm_products alter column first_seen_at set default now();

comment on column public.bm_products.category_ids is
  'Ruta navegable exacta [categoria, subcategoria]. Nunca contiene niveles N3-N6 de BM.';
comment on column public.bm_products.raw is
  'Producto fuente; puede conservar la ruta original completa solo para trazabilidad.';

-- ---------------------------------------------------------------------------
-- 2. Resolucion CP -> ubicacion BM
-- ---------------------------------------------------------------------------

create table public.bm_locations (
  id                text primary key, -- shippingZoneId; contexto completo de catalogo
  zone_id           text not null,    -- X-TOL-ZONE
  store_code        text,
  name              text not null,
  delivery_type_id  text not null,
  group_id          text,
  group_name        text,
  description       text,
  store_postal_code text,
  city              text,
  region            text,
  enabled           boolean not null default true,
  published         boolean not null default true,
  raw               jsonb not null default '{}'::jsonb,
  synced_at         timestamptz not null default now(),
  constraint bm_locations_delivery_type_check
    check (delivery_type_id in ('D', 'X', 'T', 'L')),
  unique (zone_id, id)
);

create table public.bm_postal_locations (
  postal_code  text not null,
  location_id  text not null references public.bm_locations(id)
                 on update cascade on delete cascade,
  is_preferred boolean not null default false,
  enabled      boolean not null default true,
  raw          jsonb not null default '{}'::jsonb,
  synced_at    timestamptz not null default now(),
  primary key (postal_code, location_id),
  constraint bm_postal_locations_postal_code_check
    check (postal_code ~ '^[0-9]{5}$')
);

create unique index bm_postal_locations_one_preferred_idx
  on public.bm_postal_locations (postal_code)
  where is_preferred and enabled;

create index bm_categories_parent_idx
  on public.bm_categories (parent_id, name)
  where published;

create index bm_locations_zone_idx
  on public.bm_locations (zone_id)
  where published and enabled;

create index bm_postal_locations_location_idx
  on public.bm_postal_locations (location_id, postal_code)
  where enabled;

-- ---------------------------------------------------------------------------
-- 3. Variante zonal compartida: precio, oferta, disponibilidad y novedad
-- ---------------------------------------------------------------------------

alter table public.catalog_location_prices
  drop constraint catalog_location_prices_store_check;
alter table public.catalog_location_prices
  add constraint catalog_location_prices_store_check
  check (store in ('consum', 'plusfresc', 'bm')) not valid;
alter table public.catalog_location_prices
  validate constraint catalog_location_prices_store_check;

alter table public.catalog_location_price_changes
  drop constraint catalog_location_price_changes_store_check;
alter table public.catalog_location_price_changes
  add constraint catalog_location_price_changes_store_check
  check (store in ('consum', 'plusfresc', 'bm')) not valid;
alter table public.catalog_location_price_changes
  validate constraint catalog_location_price_changes_store_check;

alter table public.catalog_location_prices
  add column base_unit_price numeric,
  add column price_format text,
  add column promo_type text,
  add column promo_name text,
  add column promo_text text,
  add column promo_price numeric,
  add column promo_base_price numeric,
  add column promo_start date,
  add column promo_end date,
  add column offer_id text,
  add column promotion_id text,
  add column promo_discount numeric,
  add column is_new boolean not null default false,
  add column first_seen_at timestamptz not null default '2000-01-01'::timestamptz,
  add column raw jsonb not null default '{}'::jsonb;

alter table public.catalog_location_prices
  alter column first_seen_at set default now();

create index catalog_location_prices_new_feed_idx
  on public.catalog_location_prices (store, location_id, first_seen_at desc, product_id)
  where published and available;

create index catalog_location_prices_offer_feed_idx
  on public.catalog_location_prices (store, location_id, promo_end, product_id)
  where published and available and promo_type is not null;

-- Vista de lectura: una fila ya resuelta por producto+ubicacion. La app no
-- necesita interpretar JSON zonal ni arriesga usar el precio de otra zona.
create view public.bm_product_locations
with (security_invoker = true)
as
select
  lp.location_id,
  p.id,
  p.retailer_product_id,
  p.ean,
  p.global_gtin,
  p.display_name,
  p.brand,
  p.packaging,
  p.thumbnail,
  p.product_url,
  p.root_category_id,
  p.category_id,
  p.category_name,
  p.category_ids,
  lp.unit_price,
  lp.base_unit_price,
  lp.price_format,
  lp.price_per_unit,
  lp.price_per_unit_unit,
  p.price_unit_type,
  p.minimum_unit,
  p.interval_unit,
  lp.promo_type,
  lp.promo_name,
  lp.promo_text,
  lp.promo_price,
  lp.promo_base_price,
  lp.promo_start,
  lp.promo_end,
  lp.offer_id,
  lp.promotion_id,
  lp.promo_discount,
  lp.available,
  lp.is_new,
  (p.published and lp.published) as published,
  p.raw,
  lp.raw as location_raw,
  greatest(p.synced_at, lp.synced_at) as synced_at,
  lp.first_seen_at,
  p.display_name_norm
from public.bm_products as p
join public.catalog_location_prices as lp
  on lp.store = 'bm'
 and lp.product_id = p.id;

-- ---------------------------------------------------------------------------
-- 4. Indices de catalogo y RPC de busqueda conscientes de ubicacion
-- ---------------------------------------------------------------------------

create index bm_products_category_ids_idx
  on public.bm_products using gin (category_ids);
create index bm_products_name_browse_idx
  on public.bm_products (display_name_norm, id)
  where published;
create index bm_products_norm_trgm_idx
  on public.bm_products using gin (display_name_norm gin_trgm_ops);
create index bm_products_search_fts_idx
  on public.bm_products using gin (
    to_tsvector('simple'::regconfig, display_name_norm)
  ) where published;

create or replace function public.search_bm_products(
  p_query text,
  p_location_id text,
  p_order text default 'relevance',
  p_limit integer default 50,
  p_offset integer default 0
)
returns setof public.bm_product_locations
language sql
stable
parallel safe
security invoker
set search_path = ''
as $function$
  with search as (
    select
      query_norm,
      public.catalog_search_words(query_norm) as words,
      public.catalog_search_tsquery(query_norm) as parsed_query
    from (
      select public.catalog_search_normalize(p_query) as query_norm
    ) as normalized
  ), candidates as (
    select product.id, product.display_name_norm
    from public.bm_product_locations as product
    cross join search
    where product.location_id = p_location_id
      and product.published
      and product.available
      and length(search.query_norm) >= 2
      and to_tsvector('simple'::regconfig, product.display_name_norm) @@ search.parsed_query

    union

    select product.id, product.display_name_norm
    from public.bm_product_locations as product
    cross join search
    where product.location_id = p_location_id
      and product.published
      and product.available
      and length(search.query_norm) >= 3
      and search.query_norm operator(public.<%) product.display_name_norm
  )
  select product
  from candidates
  join public.bm_product_locations as product
    on product.location_id = p_location_id
   and product.id = candidates.id
  cross join search
  order by
    case when lower(coalesce(p_order, 'relevance')) = 'priceasc'
      then product.unit_price end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'pricedesc'
      then product.unit_price end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitasc'
      then product.price_per_unit end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitdesc'
      then product.price_per_unit end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'relevance'
      then public.catalog_search_rank(
        candidates.display_name_norm,
        search.query_norm,
        search.words,
        search.parsed_query
      ) end desc nulls last,
    candidates.display_name_norm,
    product.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

create or replace function public.search_bm_feed_products(
  p_query text,
  p_location_id text,
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
returns setof public.bm_product_locations
language sql
stable
parallel safe
security invoker
set search_path = ''
as $function$
  with search as (
    select
      query_norm,
      public.catalog_search_words(query_norm) as words,
      public.catalog_search_tsquery(query_norm) as parsed_query
    from (
      select public.catalog_search_normalize(p_query) as query_norm
    ) as normalized
    where length(query_norm) >= 2
  ), feed_counts as (
    select
      count(*) filter (where product.first_seen_at >= p_since) as recent_count,
      count(*) as published_count
    from public.bm_product_locations as product
    where product.location_id = p_location_id
      and product.published
      and product.available
  ), feed_stats as (
    select
      recent_count > 400
      and recent_count::numeric / nullif(published_count, 0) >= 0.75
        as initial_fill
    from feed_counts
  ), candidates as (
    select product.id, product.display_name_norm
    from public.bm_product_locations as product
    cross join search
    cross join feed_stats
    where product.location_id = p_location_id
      and product.published
      and product.available
      and (
        (lower(coalesce(p_feed, '')) = 'new'
          and (product.is_new
            or (product.first_seen_at >= p_since and not feed_stats.initial_fill)))
        or
        (lower(coalesce(p_feed, '')) = 'offer'
          and product.promo_type is not null
          and (product.promo_end is null or product.promo_end >= p_today))
      )
      and (p_categories is null or cardinality(p_categories) = 0
        or product.category_name = any(p_categories))
      and (p_price_min is null or product.unit_price > p_price_min)
      and (p_price_max is null or product.unit_price <= p_price_max)
      and to_tsvector('simple'::regconfig, product.display_name_norm) @@ search.parsed_query

    union

    select product.id, product.display_name_norm
    from public.bm_product_locations as product
    cross join search
    cross join feed_stats
    where product.location_id = p_location_id
      and product.published
      and product.available
      and length(search.query_norm) >= 3
      and (
        (lower(coalesce(p_feed, '')) = 'new'
          and (product.is_new
            or (product.first_seen_at >= p_since and not feed_stats.initial_fill)))
        or
        (lower(coalesce(p_feed, '')) = 'offer'
          and product.promo_type is not null
          and (product.promo_end is null or product.promo_end >= p_today))
      )
      and (p_categories is null or cardinality(p_categories) = 0
        or product.category_name = any(p_categories))
      and (p_price_min is null or product.unit_price > p_price_min)
      and (p_price_max is null or product.unit_price <= p_price_max)
      and search.query_norm operator(public.<%) product.display_name_norm
  )
  select product
  from candidates
  join public.bm_product_locations as product
    on product.location_id = p_location_id
   and product.id = candidates.id
  cross join search
  order by
    case when lower(coalesce(p_order, 'relevance')) = 'priceasc'
      then product.unit_price end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'pricedesc'
      then product.unit_price end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitasc'
      then product.price_per_unit end asc nulls last,
    case when lower(coalesce(p_order, 'relevance')) = 'priceperunitdesc'
      then product.price_per_unit end desc nulls last,
    case when lower(coalesce(p_order, 'relevance')) not in (
      'priceasc', 'pricedesc', 'priceperunitasc', 'priceperunitdesc'
    ) then public.catalog_search_rank(
      candidates.display_name_norm,
      search.query_norm,
      search.words,
      search.parsed_query
    ) end desc nulls last,
    case when lower(coalesce(p_feed, '')) = 'new'
      then product.first_seen_at end desc nulls last,
    candidates.display_name_norm,
    product.id
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

-- ---------------------------------------------------------------------------
-- 5. RLS y privilegios explicitos
-- ---------------------------------------------------------------------------

alter table public.bm_categories enable row level security;
alter table public.bm_products enable row level security;
alter table public.bm_locations enable row level security;
alter table public.bm_postal_locations enable row level security;

create policy "bm categories read"
  on public.bm_categories for select to anon, authenticated using (true);
create policy "bm products read"
  on public.bm_products for select to anon, authenticated using (true);
create policy "bm locations read"
  on public.bm_locations for select to anon, authenticated using (true);
create policy "bm postal locations read"
  on public.bm_postal_locations for select to anon, authenticated using (true);

revoke all on table
  public.bm_categories,
  public.bm_products,
  public.bm_locations,
  public.bm_postal_locations,
  public.bm_product_locations
from public, anon, authenticated;

grant select on table
  public.bm_categories,
  public.bm_products,
  public.bm_locations,
  public.bm_postal_locations,
  public.bm_product_locations
to anon, authenticated;

grant select, insert, update, delete on table
  public.bm_categories,
  public.bm_products,
  public.bm_locations,
  public.bm_postal_locations
to service_role;
grant select on table public.bm_product_locations to service_role;

-- Las tablas antiguas tenian RLS de lectura, pero conservaban grants DML
-- heredados. Se deja el limite de solo lectura explicito para los clientes.
revoke insert, update, delete, truncate, references, trigger
  on table public.catalog_location_prices, public.catalog_location_price_changes
  from public, anon, authenticated;
grant select on table public.catalog_location_prices, public.catalog_location_price_changes
  to anon, authenticated;
grant select, insert, update, delete
  on table public.catalog_location_prices, public.catalog_location_price_changes
  to service_role;

revoke all on sequence public.catalog_location_price_changes_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.catalog_location_price_changes_id_seq
  to service_role;

revoke all on function public.bm_validate_category_depth()
  from public, anon, authenticated;
grant execute on function public.bm_validate_category_depth() to service_role;

revoke all on function public.search_bm_products(text,text,text,integer,integer)
  from public, anon, authenticated;
grant execute on function public.search_bm_products(text,text,text,integer,integer)
  to anon, authenticated, service_role;

revoke all on function public.search_bm_feed_products(
  text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer
) from public, anon, authenticated;
grant execute on function public.search_bm_feed_products(
  text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer
) to anon, authenticated, service_role;

comment on table public.bm_categories is
  'Categorias navegables de BM limitadas estrictamente a Categoria -> Subcategoria.';
comment on table public.bm_products is
  'Producto comun de BM; los campos de precio son una referencia, no la fuente zonal autoritativa.';
comment on table public.bm_locations is
  'Contextos BM necesarios para X-TOL-ZONE y X-TOL-SHIPPING-ZONE.';
comment on table public.bm_postal_locations is
  'Resolucion publica de codigo postal a uno o varios contextos BM.';
comment on view public.bm_product_locations is
  'Catalogo BM resuelto por ubicacion con precio, oferta, disponibilidad y novedad autoritativos.';

notify pgrst, 'reload schema';
