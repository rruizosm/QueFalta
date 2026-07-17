-- Espejo del catálogo de bonÀrea en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-bonarea.mjs 1×/día.
-- Tabla aparte de Mercadona/Bonpreu/Carrefour (modelo "una tabla por tienda").
--
-- A diferencia de Carrefour/Bonpreu, bonÀrea expone una API JSON propia: el endpoint
-- POST /es/shop/ShoppingBody {reference:<idNivell>} devuelve { articles:[...], nivells:[...] }
-- con los productos ya estructurados (no hay que parsear HTML) y el árbol de categorías
-- anidado completo. El sync recorre las HOJAS del árbol (las que listan productos).
-- La app SOLO lee; las escrituras van con la service_role key (se salta RLS).
-- Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;

create table if not exists public.bonarea_categories (
  id          text primary key,      -- idNivell con asterisco (p.ej. "13*300*010*010*010")
  name        text not null,         -- descripcio
  parent_id   text,                  -- idNivell padre (null en N1)
  url         text,                  -- ruta amigable (categories/alimentacio/13_300)
  product_count int,                 -- nº de productos observado al sincronizar (solo hojas)
  published   boolean not null default true,
  synced_at   timestamptz not null default now()
);

create table if not exists public.bonarea_products (
  id                  text primary key,   -- identifier con asterisco ("13*5304"); es lo que pide el carrito (ModifGetCart)
  retailer_product_id text,               -- = identifier (mismo valor; se guarda por simetría con las otras tiendas)
  display_name        text not null,      -- description
  thumbnail           text,               -- https://images.bonarea.com/<image[0]>
  ean                 text,               -- la API no expone EAN → null
  category_id         text,               -- categoría "primaria" (1ª de category_ids)
  category_name       text,
  category_ids        text[] not null default '{}',  -- hoja(s) que listan el producto + TODOS sus ancestros (permite navegar por cualquier nivel)
  unit_price          numeric,            -- priceToPay (precio numérico, p.ej. 4.08)
  price_format        text,               -- texto mostrado ("4,08 €/u.")
  available           boolean not null default true,  -- itsOnStock
  published           boolean not null default true,
  raw                 jsonb not null,     -- objeto article completo de la API (incluye unitPrice "6,39 €/kg", urlFriendly, weightGrams…)
  synced_at           timestamptz not null default now()
);

create index if not exists bonarea_products_category_idx
  on public.bonarea_products (category_id);
-- Navegación por categoría: contención de array (category_ids @> '{id}').
create index if not exists bonarea_products_category_ids_idx
  on public.bonarea_products using gin (category_ids);
create index if not exists bonarea_products_name_trgm_idx
  on public.bonarea_products using gin (display_name gin_trgm_ops);

alter table public.bonarea_products   enable row level security;
alter table public.bonarea_categories enable row level security;

drop policy if exists "bonarea catalog read" on public.bonarea_products;
create policy "bonarea catalog read"
on public.bonarea_products for select to anon, authenticated using (true);

drop policy if exists "bonarea categories read" on public.bonarea_categories;
create policy "bonarea categories read"
on public.bonarea_categories for select to anon, authenticated using (true);
