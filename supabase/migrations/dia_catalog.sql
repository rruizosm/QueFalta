-- Espejo del catálogo de Dia en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-dia.mjs 1×/semana.
-- Tabla aparte de Mercadona/Bonpreu/Carrefour/bonÀrea/Consum (modelo "una tabla por tienda").
--
-- dia.es expone una API REST JSON abierta (/api/v1/plp-back/plp?navigation=L1)
-- con los productos ya estructurados + el árbol de categorías + total_pages. El
-- sync barre VARIAS zonas (una por provincia): dia.es adapta el surtido al código
-- postal, así que se fija un CP por zona en la sesión y se pagina el catálogo de
-- cada una, uniendo los productos por object_id. La disponibilidad por comunidad
-- autónoma va en la columna `regions` (ver dia_regions.sql). Los precios llevan
-- la promo aplicada (strikethrough_price = original, en raw) y son los de la
-- primera zona que trae cada producto (Madrid primero → datos por defecto).
-- La app SOLO lee; las escrituras van con la service_role key (se salta RLS).
-- Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;

create table if not exists public.dia_categories (
  id          text primary key,      -- id de Dia ("L2132" para N2, "L119" para N1)
  name        text not null,         -- nombre ("Pescado y marisco")
  parent_id   text,                  -- id N1 padre (null en N1)
  url         text,                  -- link relativo ("/congelados/pescado-y-marisco/c/L2132")
  product_count int,                 -- nº de productos observado al sincronizar
  published   boolean not null default true,
  synced_at   timestamptz not null default now()
);

create table if not exists public.dia_products (
  id                  text primary key,   -- object_id ("72170"); va en la URL del producto (/p/72170)
  retailer_product_id text,               -- sku_id (mismo valor que object_id; por simetría)
  display_name        text not null,      -- display_name (incluye marca y formato: "... Dia 600 g")
  brand               text,               -- brand ("Dia Mari Marinera")
  thumbnail           text,               -- https://www.dia.es + image
  ean                 text,               -- la API no expone EAN → null
  category_id         text,               -- N2 "primaria" (1ª en la que se observó)
  category_name       text,
  category_ids        text[] not null default '{}',  -- N2 donde aparece + sus N1 (navegación por ambos niveles)
  unit_price          numeric,            -- prices.price (con promo aplicada si la hay)
  price_format        text,               -- texto mostrado ("5,89 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), de prices.price_per_unit + measure_unit
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  available           boolean not null default true,  -- units_in_stock > 0
  published           boolean not null default true,
  raw                 jsonb not null,     -- item plp completo (incluye strikethrough_price, is_promo_price, is_club_price, url…)
  synced_at           timestamptz not null default now()
);

create index if not exists dia_products_category_idx
  on public.dia_products (category_id);
-- Navegación por categoría: contención de array (category_ids @> '{id}').
create index if not exists dia_products_category_ids_idx
  on public.dia_products using gin (category_ids);
create index if not exists dia_products_name_trgm_idx
  on public.dia_products using gin (display_name gin_trgm_ops);

comment on column public.dia_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';

alter table public.dia_products   enable row level security;
alter table public.dia_categories enable row level security;

drop policy if exists "dia catalog read" on public.dia_products;
create policy "dia catalog read"
on public.dia_products for select to anon, authenticated using (true);

drop policy if exists "dia categories read" on public.dia_categories;
create policy "dia categories read"
on public.dia_categories for select to anon, authenticated using (true);
