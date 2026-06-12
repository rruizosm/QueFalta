-- Espejo del catálogo de Consum en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-consum.mjs 1×/día.
-- Tabla aparte de Mercadona/Bonpreu/Carrefour/bonÀrea (modelo "una tabla por tienda").
--
-- Consum expone una API REST JSON abierta (sin auth, sin Cloudflare):
--   GET /api/rest/V1.0/shopping/category/menu                → árbol de categorías (4 niveles)
--   GET /api/rest/V1.0/catalog/product?offset=N&limit=100    → catálogo completo paginado
-- Cada producto ya trae sus categorías hoja embebidas (categories[]), así que el sync
-- pagina el catálogo entero (~94 peticiones) en vez de recorrer hojas como en bonÀrea.
-- A diferencia del resto de tiendas, Consum SÍ da el EAN y la marca estructurada.
-- La app SOLO lee; las escrituras van con la service_role key (se salta RLS).
-- Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;

create table if not exists public.consum_categories (
  id          text primary key,      -- id numérico del menú como texto (p.ej. "1985")
  name        text not null,         -- nombre ("Frutos secos")
  parent_id   text,                  -- id padre (null en N1)
  url         text,                  -- URL pública (tienda.consum.es/es/c/...)
  product_count int,                 -- nº de productos observado al sincronizar
  published   boolean not null default true,
  synced_at   timestamptz not null default now()
);

create table if not exists public.consum_products (
  id                  text primary key,   -- `code` del producto ("1669"): el id público, va en la URL y en la imagen
  retailer_product_id text,               -- id interno de la API (campo `id`, p.ej. "4667")
  display_name        text not null,      -- productData.name
  brand               text,               -- productData.brand.name (Consum la da estructurada)
  packaging           text,               -- formato del envase sacado de productData.description ("250 Gr")
  thumbnail           text,               -- productData.imageURL (cdn-consum.aktiosdigitalservices.com)
  ean13               text,               -- ean (Consum SÍ lo expone, único súper que lo da)
  category_id         text,               -- categoría "primaria" (1ª hoja de categories[])
  category_name       text,
  category_ids        text[] not null default '{}',  -- hojas de categories[] + TODOS sus ancestros (navegación por cualquier nivel)
  unit_price          numeric,            -- precio del envase en € (OFFER_PRICE si hay oferta, si no PRICE)
  price_format        text,               -- texto mostrado ("1,45 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), de centUnitAmount + unitPriceUnitType
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  available           boolean not null default true,  -- availability=="1" y no temporaryOutOfStock
  published           boolean not null default true,
  raw                 jsonb not null,     -- producto de la API (sin attributeGroups/attributes, que son códigos internos)
  synced_at           timestamptz not null default now()
);

create index if not exists consum_products_category_idx
  on public.consum_products (category_id);
-- Navegación por categoría: contención de array (category_ids @> '{id}').
create index if not exists consum_products_category_ids_idx
  on public.consum_products using gin (category_ids);
create index if not exists consum_products_name_trgm_idx
  on public.consum_products using gin (display_name gin_trgm_ops);

comment on column public.consum_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';

alter table public.consum_products   enable row level security;
alter table public.consum_categories enable row level security;

drop policy if exists "consum catalog read" on public.consum_products;
create policy "consum catalog read"
on public.consum_products for select to anon, authenticated using (true);

drop policy if exists "consum categories read" on public.consum_categories;
create policy "consum categories read"
on public.consum_categories for select to anon, authenticated using (true);
