-- Espejo del catálogo de BonpreuEsclat en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-bonpreu.mjs (GitHub Action) 1×/día.
-- Tabla aparte de Mercadona (modelo "una tabla por tienda").
--
-- Bonpreu protege su API de productos con AWS WAF, así que el sync usa un
-- navegador headless (Playwright) para obtener el token y luego hidrata por lotes.
-- La app SOLO lee; las escrituras van con la service_role key (se salta RLS).
-- Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;

create table if not exists public.bonpreu_categories (
  id          text primary key,      -- categoryId (uuid)
  name        text not null,
  parent_id   text,
  product_count int,
  published   boolean not null default true,
  synced_at   timestamptz not null default now()
);

create table if not exists public.bonpreu_products (
  id                  text primary key,   -- productId (uuid)
  retailer_product_id text,               -- id "humano" del retailer
  display_name        text not null,
  brand               text,
  product_info        text,
  supplier_name       text,
  ingredients         text,
  nutrition           text,
  detail_synced_at    timestamptz,
  packaging           text,               -- packSizeDescription
  thumbnail           text,               -- url de imagen
  category_id         text,               -- categoría "primaria" (1ª de category_ids)
  category_name       text,
  category_ids        text[] not null default '{}',  -- TODAS las categorías que listan el producto
  unit_price          numeric,            -- price.current.amount
  promo_price         numeric,            -- promoPrice.amount (precio final si Bonpreu lo publica)
  promo_base_price    numeric,            -- precio anterior de una rebaja real
  promo_text          text,               -- condición publicada de la promoción
  price_format        text,               -- texto tipo "1,50 €/kg"
  available           boolean not null default true,
  is_new              boolean not null default false,
  published           boolean not null default true,
  raw                 jsonb not null,
  synced_at           timestamptz not null default now()
);

-- Para despliegues donde la tabla ya existía sin la columna.
alter table public.bonpreu_products
  add column if not exists category_ids text[] not null default '{}';
alter table public.bonpreu_products add column if not exists product_info text;
alter table public.bonpreu_products add column if not exists supplier_name text;
alter table public.bonpreu_products add column if not exists ingredients text;
alter table public.bonpreu_products add column if not exists nutrition text;
alter table public.bonpreu_products add column if not exists detail_synced_at timestamptz;
alter table public.bonpreu_products add column if not exists promo_price numeric;
alter table public.bonpreu_products add column if not exists promo_base_price numeric;
alter table public.bonpreu_products add column if not exists promo_text text;

create index if not exists bonpreu_products_category_idx
  on public.bonpreu_products (category_id);
-- Navegación por categoría: contención de array (category_ids @> '{id}').
create index if not exists bonpreu_products_category_ids_idx
  on public.bonpreu_products using gin (category_ids);
create index if not exists bonpreu_products_name_trgm_idx
  on public.bonpreu_products using gin (display_name gin_trgm_ops);

alter table public.bonpreu_products   enable row level security;
alter table public.bonpreu_categories enable row level security;

drop policy if exists "bonpreu catalog read" on public.bonpreu_products;
create policy "bonpreu catalog read"
on public.bonpreu_products for select to anon, authenticated using (true);

drop policy if exists "bonpreu categories read" on public.bonpreu_categories;
create policy "bonpreu categories read"
on public.bonpreu_categories for select to anon, authenticated using (true);
