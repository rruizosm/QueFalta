-- Espejo del catálogo público de Lidl Plus España para una tienda de referencia.
-- Los ids de Product Catalog son internos y NO se validan como GTIN; ean se
-- mantiene NULL hasta que exista una correspondencia de barcode autorizada.

create extension if not exists pg_trgm;
create extension if not exists unaccent with schema extensions;

create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict
set search_path = pg_catalog, extensions
as $function$
  select extensions.unaccent('extensions.unaccent', $1)
$function$;

create or replace function public.catalog_track_price_change()
returns trigger language plpgsql set search_path = public as $function$
begin
  if new.unit_price is distinct from old.unit_price then
    new.prev_unit_price := old.unit_price;
    new.price_changed_at := now();
    if new.unit_price is null or old.unit_price is null or old.unit_price <= 0 then
      new.price_delta_pct := null;
    else
      new.price_delta_pct := round((new.unit_price - old.unit_price) / old.unit_price * 100, 1);
    end if;
  end if;
  return new;
end;
$function$;

create table if not exists public.lidl_categories (
  id text primary key,
  api_id text not null,
  name text not null,
  parent_id text,
  image_url text,
  product_count integer not null default 0,
  published boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists public.lidl_products (
  id text primary key,
  retailer_product_id text,
  ean text,
  display_name text not null,
  brand text,
  packaging text,
  thumbnail text,
  category_id text,
  category_name text,
  category_ids text[] not null default '{}',
  unit_price numeric,
  price_format text,
  price_per_unit numeric,
  price_per_unit_unit text,
  promo_name text,
  promo_text text,
  promo_base_price numeric,
  is_lidl_plus_offer boolean not null default false,
  available boolean not null default false,
  stock_indicator text,
  product_line text,
  listing_type text,
  click_collect boolean not null default false,
  source_store_id text not null,
  published boolean not null default true,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  first_seen_at timestamptz not null default now(),
  prev_unit_price numeric,
  price_changed_at timestamptz,
  price_delta_pct numeric,
  display_name_norm text generated always as (lower(public.f_unaccent(display_name))) stored,
  constraint lidl_products_ean_is_gtin check (ean is null or ean ~ '^[0-9]{8,14}$')
);

create index if not exists lidl_products_category_idx on public.lidl_products (category_id);
create index if not exists lidl_products_category_ids_idx on public.lidl_products using gin (category_ids);
create index if not exists lidl_products_norm_trgm_idx on public.lidl_products using gin (display_name_norm gin_trgm_ops);
create index if not exists lidl_products_first_seen_idx on public.lidl_products (first_seen_at desc);
create index if not exists lidl_products_price_changed_idx on public.lidl_products (price_changed_at desc)
  where price_changed_at is not null;
create index if not exists lidl_products_available_idx on public.lidl_products (available, category_id)
  where published = true;

drop trigger if exists track_price_change on public.lidl_products;
create trigger track_price_change before update of unit_price on public.lidl_products
  for each row execute function public.catalog_track_price_change();

comment on table public.lidl_products is 'Catálogo público Lidl Plus de una tienda de referencia; no incluye masterdata autenticada de Scan&Go.';
comment on column public.lidl_products.id is 'Identificador interno de Product Catalog; no asumir que sea EAN/GTIN.';
comment on column public.lidl_products.ean is 'NULL hasta obtener un barcode real de una fuente autorizada.';
comment on column public.lidl_products.source_store_id is 'Tienda Lidl usada para precio, surtido y disponibilidad.';

alter table public.lidl_products enable row level security;
alter table public.lidl_categories enable row level security;

drop policy if exists "lidl catalog read" on public.lidl_products;
create policy "lidl catalog read" on public.lidl_products
  for select to anon, authenticated using (true);
drop policy if exists "lidl categories read" on public.lidl_categories;
create policy "lidl categories read" on public.lidl_categories
  for select to anon, authenticated using (true);

revoke all on table public.lidl_products, public.lidl_categories
  from public, anon, authenticated;
grant select on table public.lidl_products, public.lidl_categories
  to anon, authenticated;
grant select, insert, update, delete on table public.lidl_products, public.lidl_categories
  to service_role;
