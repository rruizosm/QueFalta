-- Espejo del catálogo de HiperDino (Canarias) en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-hiperdino.mjs 1×/semana. 13º espejo, tabla aparte
-- (modelo "una tabla por tienda"), como el resto. SOLO castellano (hiperdino.es
-- no es bilingüe), SIN ficha ni EAN ni €/unidad.
--
-- HiperDino es la cadena líder de Canarias. Su web es Magento 2 con GraphQL
-- ABIERTO (POST hiperdino.es/graphql, sin auth/cookies/navegador) → el sync
-- enumera los productos por las ramas de súper (anchor) y reconstruye el árbol
-- N1→N2 desde el `path` de las categorías (fetch puro, patrón Carrefour/Dia).
-- SIN EAN (el sku es un código interno, no de barras) → el comparador casa por
-- nombre. La app SOLO lee; las escrituras van con la service_role key (RLS off).
--
-- OJO NEGOCIO: HiperDino solo opera en Canarias (precios con IGIC, no IVA) → solo
-- relevante para usuarios canarios. El filtrado por comunidad autónoma decide si
-- se muestra (ver COMUNIDAD-AUTONOMA.md).
--
-- Este fichero es AUTOCONTENIDO: incluye las columnas/índices que en los otros
-- súpers añadieron migraciones compartidas posteriores (display_name_norm para
-- búsqueda insensible a acentos, first_seen_at para "Novedades", y
-- prev_unit_price/price_changed_at/price_delta_pct + trigger para "Cambios de
-- precios"). Es idempotente. Ejecutar en: Supabase → SQL Editor. Tras ejecutarlo:
-- lanzar el sync (workflow sync-hiperdino.yml) y re-ejecutar similar_products.sql
-- (ya con el brazo hiperdino).

create extension if not exists pg_trgm;
create extension if not exists unaccent with schema extensions;

-- Wrapper IMMUTABLE de unaccent (idéntico al de catalog_unaccent_search.sql).
create or replace function public.f_unaccent(text)
returns text language sql immutable parallel safe strict as $func$
  select extensions.unaccent('extensions.unaccent', $1)
$func$;

-- Trigger compartido de cambios de precio (idéntico al de catalog_price_changes.sql).
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

-- ── Categorías ───────────────────────────────────────────────────────────────
create table if not exists public.hiperdino_categories (
  id            text primary key,      -- id de categoría Magento ("58", "35")
  name          text not null,         -- nombre visible ("Aceites", "Frescos")
  parent_id     text,                  -- id del N1 (null en N1)
  product_count int,                   -- nº de productos observado al sincronizar
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

-- ── Productos ────────────────────────────────────────────────────────────────
create table if not exists public.hiperdino_products (
  id                  text primary key,   -- sku de Magento ("000000000003970669")
  retailer_product_id text,               -- mismo sku interno (NO es EAN)
  display_name        text not null,      -- name (incluye marca y formato)
  brand               text,               -- null (Magento no lo expone aparte)
  packaging           text,               -- null (el formato va en el nombre)
  thumbnail           text,               -- imagen (cdn.hiperdino.es)
  category_id         text,               -- categoría N2 primaria (id)
  category_name       text,
  category_ids        text[] not null default '{}',  -- N2 + N1 (navegación por cualquier nivel)
  unit_price          numeric,            -- precio en € (final_price)
  price_format        text,               -- texto mostrado ("1,99 €")
  price_per_unit      numeric,            -- NULL (HiperDino no expone €/ud)
  price_per_unit_unit text,
  available           boolean not null default true,
  published           boolean not null default true,
  raw                 jsonb not null,     -- producto GraphQL (incluye regular_price / tachado)
  synced_at           timestamptz not null default now(),
  -- Novedades de la semana (catalog_first_seen.sql).
  first_seen_at       timestamptz not null default '2000-01-01'::timestamptz,
  -- Cambios de precio (catalog_price_changes.sql). Los rellena el trigger.
  prev_unit_price     numeric,
  price_changed_at    timestamptz,
  price_delta_pct     numeric,
  -- Búsqueda insensible a acentos (solo castellano).
  display_name_norm   text generated always as (lower(public.f_unaccent(display_name))) stored
);

-- Filas nuevas a partir de ahora se fechan con now() (novedades reales).
alter table public.hiperdino_products alter column first_seen_at set default now();

create index if not exists hiperdino_products_category_idx
  on public.hiperdino_products (category_id);
create index if not exists hiperdino_products_category_ids_idx
  on public.hiperdino_products using gin (category_ids);
create index if not exists hiperdino_products_name_trgm_idx
  on public.hiperdino_products using gin (display_name gin_trgm_ops);
create index if not exists hiperdino_products_norm_trgm_idx
  on public.hiperdino_products using gin (display_name_norm gin_trgm_ops);
create index if not exists hiperdino_products_first_seen_idx
  on public.hiperdino_products (first_seen_at desc);
create index if not exists hiperdino_products_price_changed_idx
  on public.hiperdino_products (price_changed_at desc)
  where price_changed_at is not null;

drop trigger if exists track_price_change on public.hiperdino_products;
create trigger track_price_change
  before update of unit_price on public.hiperdino_products
  for each row execute function public.catalog_track_price_change();

comment on column public.hiperdino_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato (HiperDino no lo expone).';

-- ── RLS: lectura pública, escritura solo service_role ────────────────────────
alter table public.hiperdino_products   enable row level security;
alter table public.hiperdino_categories enable row level security;

drop policy if exists "hiperdino catalog read" on public.hiperdino_products;
create policy "hiperdino catalog read"
on public.hiperdino_products for select to anon, authenticated using (true);

drop policy if exists "hiperdino categories read" on public.hiperdino_categories;
create policy "hiperdino categories read"
on public.hiperdino_categories for select to anon, authenticated using (true);
