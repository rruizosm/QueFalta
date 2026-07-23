-- Espejo del catálogo de Condis (Condisline) en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-condis.mjs 1×/semana. Súper catalán (Cataluña + Madrid).
-- Tabla aparte (modelo "una tabla por tienda"), como el resto de espejos.
--
-- Condis (compraonline.condis.es) es Next.js/RSC; su API de catálogo real está
-- protegida (403), pero su BUSCADOR usa Empathy.co con una API JSON ABIERTA que
-- sirve el catálogo entero categoría a categoría. Es BILINGÜE (es/ca): dos pasadas
-- lang=es|ca rellenan display_name / display_name_ca (como Sorli/Bonpreu). Precio
-- POR TIENDA (store=718 por defecto, área Barcelona). SIN ficha en v1 (el PDP con
-- la ficha estructurada exige reproducir un flujo OAuth de invitado por página).
--
-- Este fichero es AUTOCONTENIDO: incluye las columnas/índices que en los otros
-- súpers añadieron migraciones compartidas posteriores (display_name_norm y
-- display_name_ca_norm para búsqueda insensible a acentos, first_seen_at para
-- "Novedades", y prev_unit_price/price_changed_at/price_delta_pct + trigger para
-- "Cambios de precios"). Así basta ejecutar ESTE SQL para dejar Condis a la par.
-- Es idempotente. Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;
-- En Supabase las extensiones viven en el esquema `extensions`.
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
create table if not exists public.condis_categories (
  id            text primary key,      -- id de Empathy: N1 "c07" / N2 "c07__cat00210003"
  name          text not null,         -- nombre en castellano ("Leche")
  name_ca       text,                  -- nombre en catalán ("Llet")
  parent_id     text,                  -- id N1 (null en N1)
  product_count int,                   -- nº de productos observado al sincronizar
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

-- ── Productos ────────────────────────────────────────────────────────────────
create table if not exists public.condis_products (
  ingredients         text,
  nutrition           text,
  conservation        text,
  manufacturer        text,
  detail_synced_at    timestamptz,
  id                  text primary key,   -- id de Empathy ("704048")
  retailer_product_id text,               -- externalId (suele coincidir con id)
  display_name        text not null,      -- description (es); incluye marca/formato
  display_name_ca     text,               -- description (ca); null hasta la 2ª pasada → fallback al castellano
  brand               text,               -- brand ("CONDIS", "BORGES"…)
  packaging           text,               -- reservado (el formato ya va en el nombre)
  thumbnail           text,               -- cdn.condis.es/fit-in/600x600/es/products/{id}.jpg
  category_id         text,               -- categoría HOJA (N2, family)
  category_name       text,
  category_ids        text[] not null default '{}',  -- N2 + su N1 (navegación por cualquier nivel)
  unit_price          numeric,            -- precio del envase en € (price.current, ya con oferta aplicada)
  price_format        text,               -- texto mostrado ("0,87 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), parseado de pum
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  available           boolean not null default true,  -- state === 'ACTIVE'
  published           boolean not null default true,
  raw                 jsonb not null,     -- producto de Empathy (incluye price.regular/discounted, flags, kcal…)
  synced_at           timestamptz not null default now(),
  -- Novedades de la semana (catalog_first_seen.sql). Default sentinel antiguo.
  first_seen_at       timestamptz not null default '2000-01-01'::timestamptz,
  -- Cambios de precio (catalog_price_changes.sql). Los rellena el trigger.
  prev_unit_price     numeric,
  price_changed_at    timestamptz,
  price_delta_pct     numeric,
  -- Búsqueda insensible a acentos (catalog_unaccent_search.sql + mercadona_catalog_ca.sql).
  display_name_norm    text generated always as (lower(public.f_unaccent(display_name))) stored,
  display_name_ca_norm text generated always as (lower(public.f_unaccent(coalesce(display_name_ca, display_name)))) stored
);

alter table public.condis_products add column if not exists ingredients text;
alter table public.condis_products add column if not exists nutrition text;
alter table public.condis_products add column if not exists conservation text;
alter table public.condis_products add column if not exists manufacturer text;
alter table public.condis_products add column if not exists detail_synced_at timestamptz;

-- Filas nuevas a partir de ahora se fechan con now() (novedades reales).
alter table public.condis_products alter column first_seen_at set default now();

create index if not exists condis_products_category_idx
  on public.condis_products (category_id);
create index if not exists condis_products_category_ids_idx
  on public.condis_products using gin (category_ids);
create index if not exists condis_products_name_trgm_idx
  on public.condis_products using gin (display_name gin_trgm_ops);
create index if not exists condis_products_norm_trgm_idx
  on public.condis_products using gin (display_name_norm gin_trgm_ops);
create index if not exists condis_products_ca_norm_trgm_idx
  on public.condis_products using gin (display_name_ca_norm gin_trgm_ops);
create index if not exists condis_products_first_seen_idx
  on public.condis_products (first_seen_at desc);
create index if not exists condis_products_price_changed_idx
  on public.condis_products (price_changed_at desc)
  where price_changed_at is not null;
drop trigger if exists track_price_change on public.condis_products;
create trigger track_price_change
  before update of unit_price on public.condis_products
  for each row execute function public.catalog_track_price_change();

comment on column public.condis_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';

-- ── RLS: lectura pública, escritura solo service_role ────────────────────────
alter table public.condis_products   enable row level security;
alter table public.condis_categories enable row level security;

drop policy if exists "condis catalog read" on public.condis_products;
create policy "condis catalog read"
on public.condis_products for select to anon, authenticated using (true);

drop policy if exists "condis categories read" on public.condis_categories;
create policy "condis categories read"
on public.condis_categories for select to anon, authenticated using (true);
