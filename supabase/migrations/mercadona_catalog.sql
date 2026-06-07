-- Espejo del catálogo de Mercadona en Supabase.
-- Lo rellena scripts/sync-catalog.mjs (GitHub Action .github/workflows/sync-catalog.yml),
-- una vez al día. La app SOLO lee de aquí; las escrituras van con la service_role key,
-- que se salta RLS, así que no hace falta política de escritura.
--
-- Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;  -- búsqueda por nombre con ILIKE '%...%'

-- Árbol de categorías (N1 = sin parent, N2 = parent_id apunta a su N1).
create table if not exists public.mercadona_categories (
  id          bigint primary key,
  name        text not null,
  parent_id   bigint references public.mercadona_categories(id) on delete set null,
  sort_order  int,
  published   boolean not null default true,
  synced_at   timestamptz not null default now()
);

-- Productos. `raw` guarda el objeto MercadonaProduct completo tal cual lo da la API,
-- para que la app lo pinte sin tener que mapear campo a campo. Las columnas sueltas
-- (is_new, price_decreased, unit_price...) son solo para filtrar/indexar/buscar.
create table if not exists public.mercadona_products (
  id              text primary key,
  display_name    text not null,
  slug            text,
  packaging       text,
  thumbnail       text,
  category_id     bigint,          -- subcategoría N2 bajo la que se sincronizó
  category_name   text,
  unit_price      numeric,
  is_new          boolean not null default false,
  price_decreased boolean not null default false,
  published       boolean not null default true,
  raw             jsonb not null,
  synced_at       timestamptz not null default now()
);

create index if not exists mercadona_products_is_new_idx
  on public.mercadona_products (is_new) where is_new;
create index if not exists mercadona_products_price_decreased_idx
  on public.mercadona_products (price_decreased) where price_decreased;
create index if not exists mercadona_products_category_idx
  on public.mercadona_products (category_id);
create index if not exists mercadona_products_name_trgm_idx
  on public.mercadona_products using gin (display_name gin_trgm_ops);

alter table public.mercadona_products   enable row level security;
alter table public.mercadona_categories enable row level security;

-- El catálogo es información pública: lectura para todos (anónimos y logueados).
drop policy if exists "catalog read" on public.mercadona_products;
create policy "catalog read"
on public.mercadona_products for select to anon, authenticated using (true);

drop policy if exists "categories read" on public.mercadona_categories;
create policy "categories read"
on public.mercadona_categories for select to anon, authenticated using (true);
