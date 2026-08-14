-- Espejo de Gadisline (catálogo, novedades, ofertas y cambios de precio).
-- Lo rellena scripts/sync-gadis.mjs. Gadisline entrega el surtido por código
-- postal/tienda; esta primera versión guarda el surtido público por defecto y
-- deja `raw.currentStore` para una futura normalización por ubicación.

create extension if not exists pg_trgm;
create extension if not exists unaccent with schema extensions;

create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict as $func$
  select extensions.unaccent('extensions.unaccent', $1)
$func$;

create or replace function public.catalog_track_price_change()
returns trigger language plpgsql as $$
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
$$;

create table if not exists public.gadis_categories (
  id text primary key,
  name text not null,
  parent_id text,
  product_count int,
  published boolean not null default true,
  synced_at timestamptz not null default now()
);

create table if not exists public.gadis_products (
  id text primary key,                         -- UUID público de Gadisline
  retailer_product_id text,                    -- product_code interno (no EAN)
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
  promo_name text,                             -- icon.name: oferta explícita
  promo_text text,
  promo_end date,
  promo_group_id text,                         -- combina productos relacionados
  promo_is_related boolean not null default false,
  promo_is_coupon boolean not null default false,
  is_new boolean not null default false,       -- propiedad "Nuevo" publicada
  published boolean not null default true,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  first_seen_at timestamptz not null default '2000-01-01'::timestamptz,
  prev_unit_price numeric,
  price_changed_at timestamptz,
  price_delta_pct numeric,
  display_name_norm text generated always as (lower(public.f_unaccent(display_name))) stored
);

alter table public.gadis_products alter column first_seen_at set default now();

create index if not exists gadis_products_category_idx on public.gadis_products (category_id);
create index if not exists gadis_products_category_ids_idx on public.gadis_products using gin (category_ids);
create index if not exists gadis_products_norm_trgm_idx on public.gadis_products using gin (display_name_norm gin_trgm_ops);
create index if not exists gadis_products_first_seen_idx on public.gadis_products (first_seen_at desc);
create index if not exists gadis_products_price_changed_idx on public.gadis_products (price_changed_at desc) where price_changed_at is not null;
create index if not exists gadis_products_offer_idx on public.gadis_products (promo_end, display_name_norm)
  where published = true and promo_name is not null and not promo_is_coupon;

drop trigger if exists track_price_change on public.gadis_products;
create trigger track_price_change before update of unit_price on public.gadis_products
  for each row execute function public.catalog_track_price_change();

alter table public.gadis_products enable row level security;
alter table public.gadis_categories enable row level security;
drop policy if exists "gadis catalog read" on public.gadis_products;
create policy "gadis catalog read" on public.gadis_products for select to anon, authenticated using (true);
drop policy if exists "gadis categories read" on public.gadis_categories;
create policy "gadis categories read" on public.gadis_categories for select to anon, authenticated using (true);
