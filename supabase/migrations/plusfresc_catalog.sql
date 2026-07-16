-- Espejo del catálogo de Plusfresc en Supabase (CATÁLOGO + BÚSQUEDA + FICHA).
-- Lo rellena scripts/sync-plusfresc.mjs 1×/semana. Súper catalán de Lleida
-- (Supsa Supermercats Pujol; 8 centros online, todos en Catalunya). 15º espejo,
-- tabla aparte (modelo "una tabla por tienda"), como el resto.
--
-- Plusfresc tiene una API REST ASP.NET abierta (wscompra.plusfresc.cat) que
-- responde a fetch puro con un JWT de invitado (sin cookies ni navegador). Es
-- BILINGÜE nativa (es/ca): cada producto/categoría trae los dos idiomas en la
-- misma respuesta. FICHA rica (descripción/ingredientes/ALÉRGENOS/nutrición/
-- conservación, bilingüe) vía descarga incremental por producto, como bonÀrea.
-- Sin EAN (item_id interno). La app SOLO lee; las escrituras van con la
-- service_role key (se salta RLS).
--
-- Este fichero es AUTOCONTENIDO: incluye las columnas/índices que en los otros
-- súpers añadieron migraciones compartidas posteriores (display_name_norm y
-- display_name_ca_norm para búsqueda insensible a acentos, first_seen_at para
-- "Novedades", y prev_unit_price/price_changed_at/price_delta_pct + trigger para
-- "Cambios de precios") + las columnas de FICHA (bilingües). Así basta ejecutar
-- ESTE SQL para dejar Plusfresc a la par. Es idempotente. Ejecutar en:
-- Supabase → SQL Editor. Tras ejecutarlo: lanzar el sync (workflow
-- sync-plusfresc.yml) y re-ejecutar similar_products.sql (ya con el brazo plusfresc).

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
-- Ids numéricos jerárquicos por PREFIJO: N1 "09" → N2 "0901" → N3 "090110" →
-- hoja "09011001". Las ramas de marketing (PromoHighlight/Oferta2) llevan id no
-- numérico y el sync las excluye.
create table if not exists public.plusfresc_categories (
  id            text primary key,      -- id numérico jerárquico ("09", "0901"…)
  name          text not null,         -- nombre en castellano ("Fruta y Verdura")
  name_ca       text,                  -- nombre en catalán ("Fruita i Verdura")
  parent_id     text,                  -- id padre (null en N1)
  product_count int,                   -- nº de productos observado al sincronizar
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

-- ── Productos ────────────────────────────────────────────────────────────────
create table if not exists public.plusfresc_products (
  id                  text primary key,   -- item_id de Plusfresc ("002843")
  display_name        text not null,      -- nombre es; incluye marca/formato ("Leche fresca entera LETONA, 1.5 l")
  display_name_ca     text,               -- nombre ca ("Llet fresca sencera LETONA, 1.5 l")
  brand               text,               -- brand_name ("LETONA")
  thumbnail           text,               -- compra.plusfresc.cat/ImatgesProductes/…
  category_id         text,               -- categoría HOJA (filter_id, 8 dígitos)
  category_name       text,
  category_ids        text[] not null default '{}',  -- hoja(s) + TODOS sus ancestros (navegación por cualquier nivel)
  centers             text[],              -- centros online donde se ofrece; NULL = los 8 centros barridos
  center_prices       jsonb,                -- override por centro vs Lleida 12: {center:{p,pf,ppu,ppuu,av}}
  unit_price          numeric,            -- precio del envase en € (value_cents/100)
  price_format        text,               -- texto mostrado ("2,89 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), de value_x_unit + unit_measure
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  available           boolean not null default true,
  published           boolean not null default true,
  -- Ficha (bilingüe es/ca). La rellena la pasada incremental del sync
  -- (productdetails/files/{item}/{lang}). Las _ca solo se guardan si la API
  -- devuelve texto DISTINTO al castellano (a veces llega sin traducir).
  description         text,               -- filedetails.desc
  ingredients         text,               -- filedetails.ingredient_list
  allergens           text,               -- allergens[] agrupados ("Contiene: …\nPuede contener: …")
  nutrition           text,               -- nutritionals[], una línea por nutriente (por 100 g/ml)
  conservation        text,               -- filedetails.conservation
  description_ca      text,
  ingredients_ca      text,
  allergens_ca        text,
  nutrition_ca        text,
  conservation_ca     text,
  detail_synced_at    timestamptz,        -- cuándo se pobló la ficha (incremental, TTL 30 días)
  raw                 jsonb not null,     -- fila del listado (incluye raw.offer si estaba en Oferta2)
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
-- `CREATE TABLE IF NOT EXISTS` no añade campos si una versión anterior de la
-- tabla ya existía. Mantener estas adiciones separadas hace la migración
-- realmente idempotente y permite actualizar instalaciones parciales.
alter table public.plusfresc_products
  add column if not exists centers text[],
  add column if not exists center_prices jsonb;

alter table public.plusfresc_products alter column first_seen_at set default now();

create index if not exists plusfresc_products_category_idx
  on public.plusfresc_products (category_id);
create index if not exists plusfresc_products_category_ids_idx
  on public.plusfresc_products using gin (category_ids);
create index if not exists plusfresc_products_centers_idx
  on public.plusfresc_products using gin (centers);
create index if not exists plusfresc_products_name_trgm_idx
  on public.plusfresc_products using gin (display_name gin_trgm_ops);
create index if not exists plusfresc_products_norm_trgm_idx
  on public.plusfresc_products using gin (display_name_norm gin_trgm_ops);
create index if not exists plusfresc_products_ca_norm_trgm_idx
  on public.plusfresc_products using gin (display_name_ca_norm gin_trgm_ops);
create index if not exists plusfresc_products_first_seen_idx
  on public.plusfresc_products (first_seen_at desc);
create index if not exists plusfresc_products_price_changed_idx
  on public.plusfresc_products (price_changed_at desc)
  where price_changed_at is not null;

drop trigger if exists track_price_change on public.plusfresc_products;
create trigger track_price_change
  before update of unit_price on public.plusfresc_products
  for each row execute function public.catalog_track_price_change();

comment on column public.plusfresc_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';

-- ── RLS: lectura pública, escritura solo service_role ────────────────────────
alter table public.plusfresc_products   enable row level security;
alter table public.plusfresc_categories enable row level security;

drop policy if exists "plusfresc catalog read" on public.plusfresc_products;
create policy "plusfresc catalog read"
on public.plusfresc_products for select to anon, authenticated using (true);

drop policy if exists "plusfresc categories read" on public.plusfresc_categories;
create policy "plusfresc categories read"
on public.plusfresc_categories for select to anon, authenticated using (true);
