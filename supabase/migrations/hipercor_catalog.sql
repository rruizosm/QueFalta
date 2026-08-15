-- Espejo del catálogo público de Hipercor. El surtido y el precio dependen del
-- centro de entrega; scripts/sync-hipercor.mjs guarda únicamente el centro
-- público que sirve la web sin dirección ni sesión de usuario.
create extension if not exists pg_trgm;
create extension if not exists unaccent with schema extensions;

create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict as $$
  select extensions.unaccent('extensions.unaccent', $1)
$$;

create or replace function public.catalog_track_price_change()
returns trigger language plpgsql as $$
begin
  if new.unit_price is distinct from old.unit_price then
    new.prev_unit_price := old.unit_price;
    new.price_changed_at := now();
    new.price_delta_pct := case when new.unit_price is null or old.unit_price is null or old.unit_price <= 0 then null else round((new.unit_price - old.unit_price) / old.unit_price * 100, 1) end;
  end if;
  return new;
end;
$$;

create table if not exists public.hipercor_categories (
  id text primary key,
  name text not null,
  parent_id text,
  product_count int,
  published boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists public.hipercor_products (
  id text primary key, retailer_product_id text, display_name text not null,
  packaging text, thumbnail text, category_id text, category_name text,
  category_ids text[] not null default '{}', unit_price numeric, price_format text,
  price_per_unit numeric, price_per_unit_unit text, promo_name text, promo_text text,
  promo_price numeric, promo_base_price numeric, available boolean not null default true,
  is_new boolean not null default false, published boolean not null default true,
  raw jsonb not null, synced_at timestamptz not null default now(),
  first_seen_at timestamptz not null default '2000-01-01'::timestamptz,
  prev_unit_price numeric, price_changed_at timestamptz, price_delta_pct numeric,
  display_name_norm text generated always as (lower(public.f_unaccent(display_name))) stored
);
alter table public.hipercor_products alter column first_seen_at set default now();

create index if not exists hipercor_products_category_ids_idx on public.hipercor_products using gin (category_ids);
create index if not exists hipercor_products_norm_trgm_idx on public.hipercor_products using gin (display_name_norm gin_trgm_ops);
create index if not exists hipercor_products_name_browse_idx on public.hipercor_products (display_name_norm, id) where published = true;
create index if not exists hipercor_products_first_seen_idx on public.hipercor_products (first_seen_at desc);
create index if not exists hipercor_products_price_changed_idx on public.hipercor_products (price_changed_at desc) where price_changed_at is not null;
create index if not exists hipercor_products_offer_idx on public.hipercor_products (display_name_norm) where published = true and promo_name is not null;
create index if not exists hipercor_products_browse_idx on public.hipercor_products (unit_price, id) where published = true;
create index if not exists hipercor_products_browse_desc_idx on public.hipercor_products (unit_price desc, id) where published = true;
create index if not exists hipercor_products_ppu_browse_idx on public.hipercor_products (price_per_unit, id) where published = true and price_per_unit is not null;
create index if not exists hipercor_products_ppu_browse_desc_idx on public.hipercor_products (price_per_unit desc, id) where published = true and price_per_unit is not null;

drop trigger if exists track_price_change on public.hipercor_products;
create trigger track_price_change before update of unit_price on public.hipercor_products for each row execute function public.catalog_track_price_change();

alter table public.hipercor_products enable row level security;
alter table public.hipercor_categories enable row level security;
drop policy if exists "hipercor catalog read" on public.hipercor_products;
create policy "hipercor catalog read" on public.hipercor_products for select to anon, authenticated using (true);
drop policy if exists "hipercor categories read" on public.hipercor_categories;
create policy "hipercor categories read" on public.hipercor_categories for select to anon, authenticated using (true);
