-- Espejo del catálogo público de Froiz. Lo rellena scripts/sync-froiz.mjs.
-- Fuente: https://servicios.froiz.com/api/products (sin autenticación).
create extension if not exists pg_trgm;
create extension if not exists unaccent with schema extensions;
create or replace function public.f_unaccent(text) returns text language sql immutable parallel safe strict as $$
  select extensions.unaccent('extensions.unaccent', $1)
$$;

create table if not exists public.froiz_categories (
  id text primary key, name text not null, parent_id text,
  product_count int, published boolean not null default true, synced_at timestamptz not null default now()
);

create table if not exists public.froiz_products (
  id text primary key, retailer_product_id text, display_name text not null,
  brand text, thumbnail text, category_id text, category_name text, category_ids text[] not null default '{}',
  unit_price numeric, price_format text, price_per_unit numeric, price_per_unit_unit text,
  promo_name text, promo_text text, promo_price numeric, promo_base_price numeric, promo_start date, promo_end date,
  is_new boolean not null default false,
  available boolean not null default true, published boolean not null default true, raw jsonb not null,
  synced_at timestamptz not null default now(), first_seen_at timestamptz not null default now(),
  prev_unit_price numeric, price_changed_at timestamptz, price_delta_pct numeric,
  display_name_norm text generated always as (lower(public.f_unaccent(display_name))) stored
);

create or replace function public.catalog_track_price_change() returns trigger language plpgsql as $$
begin
  if new.unit_price is distinct from old.unit_price then
    new.prev_unit_price := old.unit_price; new.price_changed_at := now();
    new.price_delta_pct := case when new.unit_price is null or old.unit_price is null or old.unit_price <= 0 then null else round((new.unit_price-old.unit_price)/old.unit_price*100,1) end;
  end if; return new;
end; $$;
drop trigger if exists track_price_change on public.froiz_products;
create trigger track_price_change before update of unit_price on public.froiz_products for each row execute function public.catalog_track_price_change();
create index if not exists froiz_products_category_ids_idx on public.froiz_products using gin(category_ids);
create index if not exists froiz_products_norm_trgm_idx on public.froiz_products using gin(display_name_norm gin_trgm_ops);
create index if not exists froiz_products_first_seen_idx on public.froiz_products(first_seen_at desc);
create index if not exists froiz_products_price_changed_idx on public.froiz_products(price_changed_at desc) where price_changed_at is not null;
alter table public.froiz_products enable row level security; alter table public.froiz_categories enable row level security;
create policy "froiz catalog read" on public.froiz_products for select to anon, authenticated using (true);
create policy "froiz categories read" on public.froiz_categories for select to anon, authenticated using (true);
