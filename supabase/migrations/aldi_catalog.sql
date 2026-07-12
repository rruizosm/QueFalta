-- Espejo del catálogo de Aldi España en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-aldi.mjs 1×/semana. 12º espejo, tabla aparte (modelo
-- "una tabla por tienda"), como el resto. SOLO castellano (aldi.es no es bilingüe).
--
-- Aldi no vende con reparto a domicilio en España, pero publica su surtido
-- permanente con precios online. La web es Next.js con Algolia; los productos van
-- YA RENDERIZADOS EN EL SERVIDOR, embebidos en el __NEXT_DATA__ de cada página de
-- categoría HOJA → el sync los raspa con fetch (patrón Carrefour/Dia, sin cookies
-- ni navegador). SIN EAN (Aldi solo expone su nº de artículo interno) → el
-- comparador casa por nombre. La app SOLO lee; las escrituras van con la
-- service_role key (se salta RLS).
--
-- Este fichero es AUTOCONTENIDO: incluye las columnas/índices que en los otros
-- súpers añadieron migraciones compartidas posteriores (display_name_norm para
-- búsqueda insensible a acentos, first_seen_at para "Novedades", y
-- prev_unit_price/price_changed_at/price_delta_pct + trigger para "Cambios de
-- precios"). Es idempotente. Ejecutar en: Supabase → SQL Editor. Tras ejecutarlo:
-- lanzar el sync (workflow sync-aldi.yml) y re-ejecutar similar_products.sql
-- (ya con el brazo aldi).

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
create table if not exists public.aldi_categories (
  id            text primary key,      -- slug de categoría ("pan-tostado", "lacteos-y-huevos")
  name          text not null,         -- nombre visible ("Pan tostado")
  parent_id     text,                  -- slug del N1 (null en N1)
  product_count int,                   -- nº de productos observado al sincronizar
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

-- ── Productos ────────────────────────────────────────────────────────────────
create table if not exists public.aldi_products (
  id                  text primary key,   -- objectID de Algolia ("970000")
  retailer_product_id text,               -- nº de artículo interno de Aldi (KVArticleNumber; NO es EAN)
  display_name        text not null,      -- name (incluye marca aparte en `brand`)
  brand               text,               -- brandName ("MYVAY®", "EL HORNO®"…)
  packaging           text,               -- salesUnit ("1 l unidad", "140 g unidad")
  thumbnail           text,               -- imagen Scene7 (s7g10.scene7.com) con ?wid=400&fmt=webp
  category_id         text,               -- categoría HOJA primaria (slug)
  category_name       text,
  category_ids        text[] not null default '{}',  -- todas sus hojas + N1 (navegación por cualquier nivel)
  unit_price          numeric,            -- precio del envase en € (currentPrice.priceValue)
  price_format        text,               -- texto mostrado ("1,05 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), de basePrice
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  available           boolean not null default true,  -- isAvailable
  published           boolean not null default true,
  raw                 jsonb not null,     -- hit de Algolia (incluye validez de precio, descripciones…)
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
alter table public.aldi_products alter column first_seen_at set default now();

create index if not exists aldi_products_category_idx
  on public.aldi_products (category_id);
create index if not exists aldi_products_category_ids_idx
  on public.aldi_products using gin (category_ids);
create index if not exists aldi_products_name_trgm_idx
  on public.aldi_products using gin (display_name gin_trgm_ops);
create index if not exists aldi_products_norm_trgm_idx
  on public.aldi_products using gin (display_name_norm gin_trgm_ops);
create index if not exists aldi_products_first_seen_idx
  on public.aldi_products (first_seen_at desc);
create index if not exists aldi_products_price_changed_idx
  on public.aldi_products (price_changed_at desc)
  where price_changed_at is not null;

drop trigger if exists track_price_change on public.aldi_products;
create trigger track_price_change
  before update of unit_price on public.aldi_products
  for each row execute function public.catalog_track_price_change();

comment on column public.aldi_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';

-- ── RLS: lectura pública, escritura solo service_role ────────────────────────
alter table public.aldi_products   enable row level security;
alter table public.aldi_categories enable row level security;

drop policy if exists "aldi catalog read" on public.aldi_products;
create policy "aldi catalog read"
on public.aldi_products for select to anon, authenticated using (true);

drop policy if exists "aldi categories read" on public.aldi_categories;
create policy "aldi categories read"
on public.aldi_categories for select to anon, authenticated using (true);
