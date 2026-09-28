-- Hipercor: catálogo normalizado por centro de preparación (multicentro).
--
-- El código postal y la modalidad de entrega resuelven un centro. El centro,
-- no la comunidad autónoma, es la dimensión autoritativa de precio, promoción,
-- surtido y disponibilidad. Las tablas hipercor_products/hipercor_categories se
-- conservan sin cambios durante la transición de las builds publicadas.

set lock_timeout = '5s';
set statement_timeout = '120s';

do $preflight$
begin
  if to_regclass('public.hipercor_products') is null
     or to_regclass('public.hipercor_categories') is null then
    raise exception 'hipercor_multicenter_preflight_failed: legacy catalog is missing';
  end if;

  if to_regprocedure('public.f_unaccent(text)') is null then
    raise exception 'hipercor_multicenter_preflight_failed: f_unaccent is missing';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- 1. Directorio de centros y resolución código postal + modalidad -> centro
-- ---------------------------------------------------------------------------

create table public.hipercor_centers (
  id                       text primary key,
  firefly_id               text unique,
  source_site_id           text,
  name                     text not null,
  banner                   text,
  center_kind              text not null default 'unknown',
  street                   text,
  city                     text,
  province                 text,
  autonomous_community     text,
  postal_code              text,
  latitude                 double precision,
  longitude                double precision,
  supports_home_delivery   boolean not null default false,
  supports_click_and_car   boolean not null default false,
  supports_eci_express     boolean not null default false,
  selectable               boolean not null default true,
  published                boolean not null default true,
  raw                      jsonb not null default '{}'::jsonb,
  first_seen_at            timestamptz not null default now(),
  synced_at                timestamptz not null default now(),
  constraint hipercor_centers_id_check check (id ~ '^[0-9]{6}$'),
  constraint hipercor_centers_firefly_id_check
    check (firefly_id is null or btrim(firefly_id) <> ''),
  constraint hipercor_centers_kind_check
    check (center_kind in ('hipercor', 'el_corte_ingles', 'supermercado', 'unknown')),
  constraint hipercor_centers_postal_code_check
    check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  constraint hipercor_centers_coordinates_pair_check
    check ((latitude is null) = (longitude is null)),
  constraint hipercor_centers_latitude_check
    check (latitude is null or latitude between -90 and 90),
  constraint hipercor_centers_longitude_check
    check (longitude is null or longitude between -180 and 180)
);

create table public.hipercor_postal_centers (
  postal_code       text not null,
  delivery_type     text not null,
  center_id         text references public.hipercor_centers(id)
                      on update cascade on delete restrict,
  supported         boolean not null,
  resolution_status text not null default 'resolved',
  failure_reason    text,
  published         boolean not null default true,
  raw               jsonb not null default '{}'::jsonb,
  resolved_at       timestamptz not null default now(),
  synced_at         timestamptz not null default now(),
  primary key (postal_code, delivery_type),
  constraint hipercor_postal_centers_postal_code_check
    check (postal_code ~ '^[0-9]{5}$'),
  constraint hipercor_postal_centers_delivery_type_check
    check (delivery_type in ('home_delivery', 'click_and_car', 'eci_express')),
  constraint hipercor_postal_centers_status_check
    check (resolution_status in ('resolved', 'unsupported', 'empty_catalog', 'error')),
  constraint hipercor_postal_centers_resolution_check check (
    (supported and resolution_status = 'resolved' and center_id is not null)
    or
    (not supported and resolution_status <> 'resolved' and center_id is null)
  )
);

create index hipercor_centers_postal_idx
  on public.hipercor_centers (postal_code, id)
  where published and selectable;
create index hipercor_centers_province_idx
  on public.hipercor_centers (province, id)
  where published and selectable;
create index hipercor_centers_coordinates_idx
  on public.hipercor_centers (latitude, longitude)
  where published and selectable and latitude is not null;
create index hipercor_postal_centers_center_id_idx
  on public.hipercor_postal_centers (center_id, postal_code)
  where center_id is not null;

comment on table public.hipercor_centers is
  'Directorio de centros de preparación Hipercor/ECI. id es page.store_id del catálogo.';
comment on column public.hipercor_centers.firefly_id is
  'Identificador usado por el selector set-delivery-center; no sustituye page.store_id.';
comment on table public.hipercor_postal_centers is
  'Resolución observada de código postal y modalidad hacia un centro de preparación.';

-- ---------------------------------------------------------------------------
-- 2. Ficha común del producto y auditoría de ejecuciones del sincronizador
-- ---------------------------------------------------------------------------

create table public.hipercor_product_master (
  id                  text primary key,
  retailer_product_id text,
  ean                 text,
  display_name        text not null,
  brand               text,
  packaging           text,
  thumbnail           text,
  product_url         text,
  published           boolean not null default true,
  raw                 jsonb not null default '{}'::jsonb,
  first_seen_at       timestamptz not null default now(),
  synced_at           timestamptz not null default now(),
  display_name_norm   text generated always as (
                        lower(public.f_unaccent(display_name))
                      ) stored,
  constraint hipercor_product_master_name_check
    check (btrim(display_name) <> ''),
  constraint hipercor_product_master_ean_check
    check (ean is null or ean ~ '^[0-9]{8,14}$')
);

create table public.hipercor_sync_runs (
  id                 uuid primary key default gen_random_uuid(),
  scope              text not null,
  center_id          text references public.hipercor_centers(id)
                       on update cascade on delete restrict,
  delivery_type      text,
  postal_code        text,
  status             text not null default 'running',
  products_seen      integer not null default 0,
  products_published integer not null default 0,
  categories_seen    integer not null default 0,
  validation         jsonb not null default '{}'::jsonb,
  error              jsonb,
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  constraint hipercor_sync_runs_scope_check
    check (scope in ('center_directory', 'postal_mapping', 'center_catalog')),
  constraint hipercor_sync_runs_delivery_type_check
    check (delivery_type is null or delivery_type in ('home_delivery', 'click_and_car', 'eci_express')),
  constraint hipercor_sync_runs_postal_code_check
    check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  constraint hipercor_sync_runs_status_check
    check (status in ('running', 'validating', 'completed', 'failed', 'cancelled')),
  constraint hipercor_sync_runs_counts_check
    check (products_seen >= 0 and products_published >= 0 and categories_seen >= 0),
  constraint hipercor_sync_runs_completion_check check (
    (status in ('running', 'validating') and finished_at is null)
    or
    (status in ('completed', 'failed', 'cancelled') and finished_at is not null)
  )
);

create index hipercor_product_master_name_browse_idx
  on public.hipercor_product_master (display_name_norm, id)
  where published;
create index hipercor_product_master_norm_trgm_idx
  on public.hipercor_product_master using gin (display_name_norm gin_trgm_ops);
create index hipercor_product_master_search_fts_idx
  on public.hipercor_product_master using gin (
    to_tsvector('simple'::regconfig, display_name_norm)
  ) where published;
create index hipercor_sync_runs_center_started_idx
  on public.hipercor_sync_runs (center_id, started_at desc)
  where center_id is not null;
create index hipercor_sync_runs_active_idx
  on public.hipercor_sync_runs (status, started_at)
  where status in ('running', 'validating');

comment on table public.hipercor_product_master is
  'Ficha común Hipercor sin precio, promoción, surtido ni disponibilidad local.';
comment on table public.hipercor_sync_runs is
  'Auditoría privada de descubrimiento, resolución postal y sincronización por centro.';

-- ---------------------------------------------------------------------------
-- 3. Precio, oferta, disponibilidad y categorías autoritativas por centro
-- ---------------------------------------------------------------------------

create table public.hipercor_center_products (
  center_id            text not null references public.hipercor_centers(id)
                         on update cascade on delete restrict,
  product_id           text not null references public.hipercor_product_master(id)
                         on update cascade on delete cascade,
  category_id          text references public.hipercor_categories(id)
                         on update cascade on delete set null,
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
  available            boolean not null default false,
  published            boolean not null default true,
  raw                  jsonb not null default '{}'::jsonb,
  observed_at          timestamptz not null default now(),
  first_seen_at        timestamptz not null default now(),
  synced_at            timestamptz not null default now(),
  sync_run_id          uuid references public.hipercor_sync_runs(id)
                         on update cascade on delete set null,
  prev_unit_price      numeric,
  price_changed_at     timestamptz,
  price_delta_pct      numeric,
  offer_unit_price     numeric generated always as (
                         coalesce(promo_price, unit_price)
                       ) stored,
  primary key (center_id, product_id),
  constraint hipercor_center_products_unit_price_check
    check (unit_price is null or unit_price >= 0),
  constraint hipercor_center_products_price_per_unit_check
    check (price_per_unit is null or price_per_unit >= 0),
  constraint hipercor_center_products_promo_price_check
    check (promo_price is null or promo_price >= 0),
  constraint hipercor_center_products_promo_base_price_check
    check (promo_base_price is null or promo_base_price >= 0)
);

create table public.hipercor_center_categories (
  center_id     text not null references public.hipercor_centers(id)
                  on update cascade on delete restrict,
  category_id   text not null references public.hipercor_categories(id)
                  on update cascade on delete cascade,
  product_count integer not null default 0,
  published     boolean not null default true,
  synced_at     timestamptz not null default now(),
  sync_run_id   uuid references public.hipercor_sync_runs(id)
                  on update cascade on delete set null,
  primary key (center_id, category_id),
  constraint hipercor_center_categories_count_check check (product_count >= 0)
);

create table public.hipercor_price_history (
  id                   bigint generated always as identity primary key,
  center_id            text not null references public.hipercor_centers(id)
                         on update cascade on delete restrict,
  product_id           text not null references public.hipercor_product_master(id)
                         on update cascade on delete cascade,
  old_unit_price       numeric,
  new_unit_price       numeric,
  old_promo_price      numeric,
  new_promo_price      numeric,
  old_promo_base_price numeric,
  new_promo_base_price numeric,
  old_available        boolean not null,
  new_available        boolean not null,
  sync_run_id          uuid references public.hipercor_sync_runs(id)
                         on update cascade on delete set null,
  observed_at          timestamptz not null default now(),
  constraint hipercor_price_history_changed_check check (
    old_unit_price is distinct from new_unit_price
    or old_promo_price is distinct from new_promo_price
    or old_promo_base_price is distinct from new_promo_base_price
    or old_available is distinct from new_available
  )
);

create index hipercor_center_products_product_id_idx
  on public.hipercor_center_products (product_id, center_id);
create index hipercor_center_products_category_idx
  on public.hipercor_center_products (center_id, category_id, product_id)
  where published;
create index hipercor_center_products_category_ids_idx
  on public.hipercor_center_products using gin (category_ids);
create index hipercor_center_products_price_idx
  on public.hipercor_center_products (center_id, unit_price, product_id)
  where published;
create index hipercor_center_products_ppu_idx
  on public.hipercor_center_products (center_id, price_per_unit, product_id)
  where published and price_per_unit is not null;
create index hipercor_center_products_offer_idx
  on public.hipercor_center_products (center_id, offer_unit_price, product_id)
  where published and promo_name is not null;
create index hipercor_center_products_new_idx
  on public.hipercor_center_products (center_id, first_seen_at desc, product_id)
  where published;
create index hipercor_center_products_price_changed_idx
  on public.hipercor_center_products (center_id, price_changed_at desc, product_id)
  where published and price_changed_at is not null;
create index hipercor_center_products_sync_run_id_idx
  on public.hipercor_center_products (sync_run_id)
  where sync_run_id is not null;
create index hipercor_center_categories_category_id_idx
  on public.hipercor_center_categories (category_id, center_id);
create index hipercor_center_categories_sync_run_id_idx
  on public.hipercor_center_categories (sync_run_id)
  where sync_run_id is not null;
create index hipercor_price_history_product_idx
  on public.hipercor_price_history (center_id, product_id, observed_at desc);
create index hipercor_price_history_sync_run_id_idx
  on public.hipercor_price_history (sync_run_id)
  where sync_run_id is not null;

comment on table public.hipercor_center_products is
  'Estado comercial vigente de cada producto en cada centro de preparación.';
comment on table public.hipercor_center_categories is
  'Categorías y recuentos publicados por centro; evita mezclar surtidos.';
comment on table public.hipercor_price_history is
  'Historial privado de cambios de precio, promoción y disponibilidad por centro.';

create or replace function public.hipercor_prepare_center_price_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.unit_price is distinct from old.unit_price then
    new.prev_unit_price := old.unit_price;
    new.price_changed_at := coalesce(new.observed_at, now());
    new.price_delta_pct := case
      when new.unit_price is null or old.unit_price is null or old.unit_price <= 0
        then null
      else round((new.unit_price - old.unit_price) / old.unit_price * 100, 1)
    end;
  end if;
  return new;
end;
$function$;

create or replace function public.hipercor_record_center_price_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.unit_price is distinct from new.unit_price
     or old.promo_price is distinct from new.promo_price
     or old.promo_base_price is distinct from new.promo_base_price
     or old.available is distinct from new.available then
    insert into public.hipercor_price_history (
      center_id, product_id,
      old_unit_price, new_unit_price,
      old_promo_price, new_promo_price,
      old_promo_base_price, new_promo_base_price,
      old_available, new_available,
      sync_run_id, observed_at
    ) values (
      new.center_id, new.product_id,
      old.unit_price, new.unit_price,
      old.promo_price, new.promo_price,
      old.promo_base_price, new.promo_base_price,
      old.available, new.available,
      new.sync_run_id, coalesce(new.observed_at, now())
    );
  end if;
  return new;
end;
$function$;

create trigger hipercor_center_prepare_price_change
before update of unit_price on public.hipercor_center_products
for each row execute function public.hipercor_prepare_center_price_change();

create trigger hipercor_center_record_price_change
after update of unit_price, promo_price, promo_base_price, available
on public.hipercor_center_products
for each row execute function public.hipercor_record_center_price_change();

-- ---------------------------------------------------------------------------
-- 4. Vistas de lectura ya resueltas por centro
-- ---------------------------------------------------------------------------

create view public.hipercor_product_centers
with (security_invoker = true)
as
select
  cp.center_id,
  p.id,
  p.retailer_product_id,
  p.ean,
  p.display_name,
  p.brand,
  p.packaging,
  p.thumbnail,
  p.product_url,
  cp.category_id,
  cp.category_name,
  cp.category_ids,
  cp.unit_price,
  cp.price_format,
  cp.price_per_unit,
  cp.price_per_unit_unit,
  cp.promo_name,
  cp.promo_text,
  cp.promo_price,
  cp.promo_base_price,
  cp.offer_unit_price,
  cp.available,
  (p.published and cp.published) as published,
  p.raw,
  cp.raw as center_raw,
  cp.observed_at,
  greatest(p.synced_at, cp.synced_at) as synced_at,
  cp.first_seen_at,
  cp.prev_unit_price,
  cp.price_changed_at,
  cp.price_delta_pct,
  p.display_name_norm
from public.hipercor_product_master as p
join public.hipercor_center_products as cp on cp.product_id = p.id;

create view public.hipercor_center_category_catalog
with (security_invoker = true)
as
select
  cc.center_id,
  c.id,
  c.name,
  c.parent_id,
  cc.product_count,
  (c.published and cc.published) as published,
  greatest(c.synced_at, cc.synced_at) as synced_at
from public.hipercor_categories as c
join public.hipercor_center_categories as cc on cc.category_id = c.id;

comment on view public.hipercor_product_centers is
  'Producto Hipercor con precio, oferta y disponibilidad de un único centro.';
comment on view public.hipercor_center_category_catalog is
  'Categorías Hipercor visibles y sus recuentos para un único centro.';

-- ---------------------------------------------------------------------------
-- 5. Migración compatible del catálogo legado del centro 010130
-- ---------------------------------------------------------------------------

insert into public.hipercor_centers (
  id, name, center_kind, supports_home_delivery, published, raw,
  first_seen_at, synced_at
)
select
  '010130',
  'Hipercor (centro 010130)',
  'hipercor',
  true,
  true,
  jsonb_build_object('source', 'legacy_default_catalog'),
  min(first_seen_at),
  max(synced_at)
from public.hipercor_products
where raw ->> 'centerId' = '010130'
having count(*) > 0;

insert into public.hipercor_product_master (
  id, retailer_product_id, display_name, packaging, thumbnail,
  published, raw, first_seen_at, synced_at
)
select
  id,
  retailer_product_id,
  display_name,
  packaging,
  thumbnail,
  published,
  raw - 'centerId',
  first_seen_at,
  synced_at
from public.hipercor_products;

insert into public.hipercor_center_products (
  center_id, product_id, category_id, category_name, category_ids,
  unit_price, price_format, price_per_unit, price_per_unit_unit,
  promo_name, promo_text, promo_price, promo_base_price,
  available, published, raw, observed_at, first_seen_at, synced_at,
  prev_unit_price, price_changed_at, price_delta_pct
)
select
  raw ->> 'centerId',
  id,
  category_id,
  category_name,
  category_ids,
  unit_price,
  price_format,
  price_per_unit,
  price_per_unit_unit,
  promo_name,
  promo_text,
  promo_price,
  promo_base_price,
  available,
  published,
  raw,
  synced_at,
  first_seen_at,
  synced_at,
  prev_unit_price,
  price_changed_at,
  price_delta_pct
from public.hipercor_products
where raw ->> 'centerId' = '010130';

insert into public.hipercor_center_categories (
  center_id, category_id, product_count, published, synced_at
)
select
  '010130',
  c.id,
  count(p.id)::integer,
  c.published,
  greatest(c.synced_at, coalesce(max(p.synced_at), c.synced_at))
from public.hipercor_categories as c
left join public.hipercor_products as p
  on p.category_id = c.id
 and p.raw ->> 'centerId' = '010130'
group by c.id, c.published, c.synced_at;

-- ---------------------------------------------------------------------------
-- 6. RLS y privilegios explícitos para la Data API
-- ---------------------------------------------------------------------------

alter table public.hipercor_centers enable row level security;
alter table public.hipercor_postal_centers enable row level security;
alter table public.hipercor_product_master enable row level security;
alter table public.hipercor_center_products enable row level security;
alter table public.hipercor_center_categories enable row level security;
alter table public.hipercor_price_history enable row level security;
alter table public.hipercor_sync_runs enable row level security;

create policy "hipercor centers read" on public.hipercor_centers
  for select to anon, authenticated using (published);
create policy "hipercor postal centers read" on public.hipercor_postal_centers
  for select to anon, authenticated using (published);
create policy "hipercor product master read" on public.hipercor_product_master
  for select to anon, authenticated using (published);
create policy "hipercor center products read" on public.hipercor_center_products
  for select to anon, authenticated using (published);
create policy "hipercor center categories read" on public.hipercor_center_categories
  for select to anon, authenticated using (published);

revoke all on table
  public.hipercor_centers,
  public.hipercor_postal_centers,
  public.hipercor_product_master,
  public.hipercor_center_products,
  public.hipercor_center_categories,
  public.hipercor_price_history,
  public.hipercor_sync_runs,
  public.hipercor_product_centers,
  public.hipercor_center_category_catalog
from public, anon, authenticated;

grant select on table
  public.hipercor_centers,
  public.hipercor_postal_centers,
  public.hipercor_product_master,
  public.hipercor_center_products,
  public.hipercor_center_categories,
  public.hipercor_product_centers,
  public.hipercor_center_category_catalog
to anon, authenticated;

grant select, insert, update, delete on table
  public.hipercor_centers,
  public.hipercor_postal_centers,
  public.hipercor_product_master,
  public.hipercor_center_products,
  public.hipercor_center_categories,
  public.hipercor_price_history,
  public.hipercor_sync_runs
to service_role;

grant select on table
  public.hipercor_product_centers,
  public.hipercor_center_category_catalog
to service_role;

revoke all on sequence public.hipercor_price_history_id_seq
  from public, anon, authenticated;
grant usage, select on sequence public.hipercor_price_history_id_seq
  to service_role;

revoke all on function public.hipercor_prepare_center_price_change()
  from public, anon, authenticated;
revoke all on function public.hipercor_record_center_price_change()
  from public, anon, authenticated;
grant execute on function public.hipercor_prepare_center_price_change()
  to service_role;
grant execute on function public.hipercor_record_center_price_change()
  to service_role;

notify pgrst, 'reload schema';
