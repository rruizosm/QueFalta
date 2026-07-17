-- Espejo del catálogo de Carrefour en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-carrefour.mjs (GitHub Action) 1×/día.
-- Tabla aparte de Mercadona/Bonpreu (modelo "una tabla por tienda").
--
-- A diferencia de Bonpreu, Carrefour NO necesita navegador headless: las páginas
-- de categoría (/supermercado/<slug>/catXXX/c) cargan por HTTP plano (sin Cloudflare)
-- y traen los productos + el árbol de categorías embebidos en el SSR. El sync pagina
-- con ?offset=N (page_size 24) hasta total_results.
-- La app SOLO lee; las escrituras van con la service_role key (se salta RLS).
-- Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;

create table if not exists public.carrefour_categories (
  id          text primary key,      -- categoryId (p.ej. "cat20002")
  name        text not null,
  parent_id   text,                  -- N1 padre (null en N1)
  url         text,                  -- ruta de la página (/supermercado/.../catXXX/c)
  product_count int,                 -- total_results de la página de categoría
  published   boolean not null default true,
  synced_at   timestamptz not null default now()
);

create table if not exists public.carrefour_products (
  id                  text primary key,   -- product_id (formatos mixtos: "719618129", "VC4AECOMM-367090", "fprod1420336")
  retailer_product_id text,               -- sku_id (id numérico del retailer)
  display_name        text not null,      -- name
  thumbnail           text,               -- images.desktop
  ean                 text,               -- código de barras (null en granel/fresco sin EAN)
  category_id         text,               -- categoría "primaria" (1ª de category_ids)
  category_name       text,
  category_ids        text[] not null default '{}',  -- TODAS las N2 que listan el producto
  unit_price          numeric,            -- precio numérico parseado de "15,40 €"
  price_format        text,               -- texto tal cual: "15,40 €"
  available           boolean not null default true,  -- units_in_stock > 0
  published           boolean not null default true,
  raw                 jsonb not null,     -- objeto producto completo del SSR
  synced_at           timestamptz not null default now()
);

-- Para despliegues donde la tabla ya existía sin la columna.
alter table public.carrefour_products
  add column if not exists category_ids text[] not null default '{}';

create index if not exists carrefour_products_category_idx
  on public.carrefour_products (category_id);
-- Navegación por categoría: contención de array (category_ids @> '{id}').
create index if not exists carrefour_products_category_ids_idx
  on public.carrefour_products using gin (category_ids);
create index if not exists carrefour_products_name_trgm_idx
  on public.carrefour_products using gin (display_name gin_trgm_ops);

alter table public.carrefour_products   enable row level security;
alter table public.carrefour_categories enable row level security;

drop policy if exists "carrefour catalog read" on public.carrefour_products;
create policy "carrefour catalog read"
on public.carrefour_products for select to anon, authenticated using (true);

drop policy if exists "carrefour categories read" on public.carrefour_categories;
create policy "carrefour categories read"
on public.carrefour_categories for select to anon, authenticated using (true);
