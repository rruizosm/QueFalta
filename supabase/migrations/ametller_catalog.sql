-- Espejo del catálogo de Ametller Origen en Supabase (CATÁLOGO + BÚSQUEDA + FICHA).
-- Lo rellena scripts/sync-ametller.mjs 1×/semana. Súper catalán de frescos/
-- proximidad (Barcelona/Girona…). 10º espejo, tabla aparte (modelo "una tabla
-- por tienda"), como el resto.
--
-- Ametller corre sobre Salesforce Commerce Cloud; su API pública (SCAPI) responde
-- con un token de invitado que se obtiene 100% con fetch (PKCE, SIN navegador
-- headless). Es BILINGÜE (es/ca): dos pasadas locale=es|ca rellenan display_name /
-- display_name_ca y la ficha en ambos idiomas (como Bonpreu/bonÀrea/Sorli). Trae
-- EAN estructurado (como Consum) → útil para el comparador. La app SOLO lee; las
-- escrituras van con la service_role key (se salta RLS).
--
-- Este fichero es AUTOCONTENIDO: incluye las columnas/índices que en los otros
-- súpers añadieron migraciones compartidas posteriores (display_name_norm y
-- display_name_ca_norm para búsqueda insensible a acentos, first_seen_at para
-- "Novedades", y prev_unit_price/price_changed_at/price_delta_pct + trigger para
-- "Cambios de precios") + las columnas de FICHA (bilingües). Así basta ejecutar
-- ESTE SQL para dejar Ametller a la par. Es idempotente. Ejecutar en:
-- Supabase → SQL Editor. Tras ejecutarlo: lanzar el sync (workflow
-- sync-ametller.yml) y re-ejecutar similar_products.sql (ya con el brazo ametller).

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
create table if not exists public.ametller_categories (
  id            text primary key,      -- id numérico de la categoría SFCC ("9", "93")
  name          text not null,         -- name en castellano ("Pan tostado")
  name_ca       text,                  -- name en catalán ("Pa torrat")
  parent_id     text,                  -- id padre (null en N1)
  product_count int,                   -- nº de productos observado al sincronizar
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

-- ── Productos ────────────────────────────────────────────────────────────────
create table if not exists public.ametller_products (
  id                  text primary key,   -- productId de SFCC ("55274")
  retailer_product_id text,               -- reservado
  display_name        text not null,      -- name (es); incluye marca/formato ("… Ametller Origen 150 g")
  display_name_ca     text,               -- name (ca); null hasta la 2ª pasada → fallback al castellano
  brand               text,               -- brand ("AMETLLER ORIGEN", "Central Lechera Asturiana"…)
  packaging           text,               -- reservado (el formato ya va en el nombre)
  thumbnail           text,               -- imageGroups[large][0].link (www.ametllerorigen.com)
  ean                 text,               -- código de barras (estructurado, como Consum)
  category_id         text,               -- categoría HOJA (primaryCategoryId)
  category_name       text,
  category_ids        text[] not null default '{}',  -- hoja + TODOS sus ancestros (navegación por cualquier nivel)
  unit_price          numeric,            -- precio del envase en € (price)
  price_format        text,               -- texto mostrado ("1,49 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), de pricePerUnit + unitMeasure
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  available           boolean not null default true,
  published           boolean not null default true,
  -- Ficha (bilingüe es/ca). La rellena el sync del detalle SCAPI (c_ao_*). Los
  -- alérgenos NO se guardan: SFCC los da como códigos numéricos sin leyenda pública.
  ingredients         text,
  nutrition           text,               -- tabla nutricional, una línea por nutriente
  conservation        text,               -- conservación / storage
  origin              text,               -- país/origen
  ingredients_ca      text,
  nutrition_ca        text,
  conservation_ca     text,
  origin_ca           text,
  detail_synced_at    timestamptz,        -- cuándo se pobló la ficha (reservado para incremental futuro)
  raw                 jsonb not null,     -- producto SCAPI (incluye c_ao_preferencias, pesoAproximado…)
  synced_at           timestamptz not null default now(),
  -- Novedades de la semana (catalog_first_seen.sql).
  first_seen_at       timestamptz not null default '2000-01-01'::timestamptz,
  -- Cambios de precio (catalog_price_changes.sql). Los rellena el trigger.
  prev_unit_price     numeric,
  price_changed_at    timestamptz,
  price_delta_pct     numeric,
  -- Búsqueda insensible a acentos (bilingüe).
  display_name_norm    text generated always as (lower(public.f_unaccent(display_name))) stored,
  display_name_ca_norm text generated always as (lower(public.f_unaccent(coalesce(display_name_ca, display_name)))) stored
);

-- Filas nuevas a partir de ahora se fechan con now() (novedades reales).
alter table public.ametller_products alter column first_seen_at set default now();

create index if not exists ametller_products_category_idx
  on public.ametller_products (category_id);
create index if not exists ametller_products_category_ids_idx
  on public.ametller_products using gin (category_ids);
create index if not exists ametller_products_name_trgm_idx
  on public.ametller_products using gin (display_name gin_trgm_ops);
create index if not exists ametller_products_norm_trgm_idx
  on public.ametller_products using gin (display_name_norm gin_trgm_ops);
create index if not exists ametller_products_ca_norm_trgm_idx
  on public.ametller_products using gin (display_name_ca_norm gin_trgm_ops);
create index if not exists ametller_products_first_seen_idx
  on public.ametller_products (first_seen_at desc);
create index if not exists ametller_products_price_changed_idx
  on public.ametller_products (price_changed_at desc)
  where price_changed_at is not null;

drop trigger if exists track_price_change on public.ametller_products;
create trigger track_price_change
  before update of unit_price on public.ametller_products
  for each row execute function public.catalog_track_price_change();

comment on column public.ametller_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';

-- ── RLS: lectura pública, escritura solo service_role ────────────────────────
alter table public.ametller_products   enable row level security;
alter table public.ametller_categories enable row level security;

drop policy if exists "ametller catalog read" on public.ametller_products;
create policy "ametller catalog read"
on public.ametller_products for select to anon, authenticated using (true);

drop policy if exists "ametller categories read" on public.ametller_categories;
create policy "ametller categories read"
on public.ametller_categories for select to anon, authenticated using (true);
