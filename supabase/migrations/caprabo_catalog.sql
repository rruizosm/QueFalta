-- Espejo del catálogo de Caprabo (enseña catalana de Eroski) en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-caprabo.mjs 1×/semana. Tabla aparte (modelo "una tabla
-- por tienda"). Caprabo y Eroski comparten backend (Apache Tapestry) pero son
-- tiendas distintas → una tabla cada una (ver eroski_catalog.sql, gemela).
--
-- El sync scrapea las páginas de categoría (SSR del 1er lote + POST loadpage con
-- cookies de sesión) y saca de
-- cada "tile" el JSON data-metrics (id, nombre, marca, categoría, precio). NO hay
-- precio por unidad ni EAN en el listado; la ficha aporta nutrición pero no un
-- EAN verificable → price_per_unit queda null. Solo castellano.
--
-- Autocontenida: incluye búsqueda insensible a acentos (display_name_norm),
-- novedades (first_seen_at) y cambios de precio (prev_unit_price/price_changed_at/
-- price_delta_pct + trigger), como el resto de espejos. Idempotente.
-- Ejecutar en: Supabase → SQL Editor.

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

create table if not exists public.caprabo_categories (
  id            text primary key,      -- id numérico de la categoría ("2059700")
  name          text not null,         -- nombre derivado del slug ("Naranjas y otros citricos")
  parent_id     text,                  -- id padre (null en N1)
  product_count int,
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

create table if not exists public.caprabo_products (
  id                  text primary key,   -- item_id del data-metrics ("14183164")
  display_name        text not null,      -- item_name (incluye marca y formato)
  brand               text,               -- item_brand (sin el punto final de "EROSKI.")
  thumbnail           text,               -- /images/{id}_x.jpg (imagen grande)
  category_id         text,               -- categoría HOJA por la que se rastreó
  category_name       text,
  category_ids        text[] not null default '{}',  -- hoja + ancestros (navegación por cualquier nivel)
  unit_price          numeric,            -- precio del envase en € (item.price)
  price_format        text,               -- texto mostrado ("1,29 €")
  promo_name          text,               -- etiqueta del tile (3x2, 2ª unidad, -25%...)
  promo_text          text,
  promo_price         numeric,            -- item.price si hay descuento directo
  promo_base_price    numeric,            -- price-before tachado
  promo_start         date,
  promo_end           date,
  price_per_unit      numeric,            -- €/unidad canónica: NULL (no está en el listado)
  price_per_unit_unit text,
  available           boolean not null default true,
  published           boolean not null default true,
  ingredients         text,               -- ingredientes de la ficha
  nutrition           text,               -- tabla de la PDP, normalizada por 100 g/ml
  conservation        text,               -- condiciones de conservación de la ficha
  manufacturer        text,               -- fabricante y dirección publicados en la ficha
  detail_synced_at    timestamptz,        -- control incremental de la ficha de producto
  raw                 jsonb not null,     -- item de data-metrics
  synced_at           timestamptz not null default now(),
  first_seen_at       timestamptz not null default '2000-01-01'::timestamptz,
  prev_unit_price     numeric,
  price_changed_at    timestamptz,
  price_delta_pct     numeric,
  display_name_norm   text generated always as (lower(public.f_unaccent(display_name))) stored
);

alter table public.caprabo_products alter column first_seen_at set default now();

create index if not exists caprabo_products_category_idx      on public.caprabo_products (category_id);
create index if not exists caprabo_products_category_ids_idx  on public.caprabo_products using gin (category_ids);
create index if not exists caprabo_products_name_trgm_idx     on public.caprabo_products using gin (display_name gin_trgm_ops);
create index if not exists caprabo_products_norm_trgm_idx     on public.caprabo_products using gin (display_name_norm gin_trgm_ops);
create index if not exists caprabo_products_first_seen_idx    on public.caprabo_products (first_seen_at desc);
create index if not exists caprabo_products_price_changed_idx on public.caprabo_products (price_changed_at desc) where price_changed_at is not null;

drop trigger if exists track_price_change on public.caprabo_products;
create trigger track_price_change
  before update of unit_price on public.caprabo_products
  for each row execute function public.catalog_track_price_change();

alter table public.caprabo_products   enable row level security;
alter table public.caprabo_categories enable row level security;

drop policy if exists "caprabo catalog read" on public.caprabo_products;
create policy "caprabo catalog read"
on public.caprabo_products for select to anon, authenticated using (true);

drop policy if exists "caprabo categories read" on public.caprabo_categories;
create policy "caprabo categories read"
on public.caprabo_categories for select to anon, authenticated using (true);
