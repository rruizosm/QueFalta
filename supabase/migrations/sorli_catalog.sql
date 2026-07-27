-- Espejo del catálogo de Sorli (Sorliclic) en Supabase (CATÁLOGO + BÚSQUEDA).
-- Lo rellena scripts/sync-sorli.mjs 1×/semana. Súper catalán (Maresme/Vallès/
-- Barcelona). Tabla aparte (modelo "una tabla por tienda"), como el resto.
--
-- Sorli tiene API JSON propia (api.sorliclic.com) protegida por un token de
-- sesión `s` que firma su SPA; el sync arranca la sesión con un navegador
-- headless (como Bonpreu) y luego pagina el catálogo entero con fetch. Es
-- BILINGÜE (es/ca): dos pasadas idioma=es|ca rellenan display_name /
-- display_name_ca (como Bonpreu/bonÀrea). nutriScore y agrupaciones
-- (Ecológico/Sin Gluten/Vegano/Sin Lactosa/Producto de Aquí) se conservan en
-- `raw` para features futuras. La app SOLO lee; las escrituras van con la
-- service_role key (se salta RLS).
--
-- Este fichero es AUTOCONTENIDO: incluye las columnas/índices que en los otros
-- súpers añadieron migraciones compartidas posteriores (display_name_norm y
-- display_name_ca_norm para búsqueda insensible a acentos, first_seen_at para
-- "Novedades", y prev_unit_price/price_changed_at/price_delta_pct + trigger para
-- "Cambios de precios"). Así basta ejecutar ESTE SQL para dejar Sorli a la par.
-- Es idempotente. Ejecutar en: Supabase → SQL Editor.

create extension if not exists pg_trgm;
-- En Supabase las extensiones viven en el esquema `extensions`.
create extension if not exists unaccent with schema extensions;

-- Wrapper IMMUTABLE de unaccent (idéntico al de catalog_unaccent_search.sql:
-- create or replace = no molesta si ya existe).
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
create table if not exists public.sorli_categories (
  id            text primary key,      -- id jerárquico de Sorli ("01"/"0101"/"010104")
  name          text not null,         -- description en castellano ("Naranjas")
  name_ca       text,                  -- description en catalán ("Taronges")
  parent_id     text,                  -- id padre (null en N1)
  product_count int,                   -- nº de productos observado al sincronizar
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

-- ── Productos ────────────────────────────────────────────────────────────────
create table if not exists public.sorli_products (
  id                  text primary key,   -- idArticulo ("122"), el id público del artículo
  retailer_product_id text,               -- reservado (Sorli no da un id interno aparte)
  display_name        text not null,      -- descripcion (es); incluye marca/formato ("Naranja Bolsa 2kg")
  display_name_ca     text,               -- descripcion (ca); null hasta la 2ª pasada → fallback al castellano
  brand               text,               -- marca.descripcion (suele ser null en frescos)
  packaging           text,               -- reservado (el formato ya va en el nombre)
  thumbnail           text,               -- urlImagen reescrita a 300x300 (el listado da 135x135; cdn.sorliclic.com)
  category_id         text,               -- categoría HOJA (categoria.idCategoria, nivel 3)
  category_name       text,
  category_ids        text[] not null default '{}',  -- hoja + TODOS sus ancestros (navegación por cualquier nivel)
  unit_price          numeric,            -- precio del envase en € (pvpoferta si hay oferta viva, si no pvp)
  price_format        text,               -- texto mostrado ("3,79 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), de precioUnidadMedida + unidadMedida
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  promo_name          text,               -- tipo corto de oferta en castellano
  promo_name_ca       text,               -- tipo corto de oferta en catalán
  promo_text          text,               -- condiciones de promociones complejas
  promo_text_ca       text,               -- condiciones en catalán
  promo_base_price    numeric check (promo_base_price is null or promo_base_price >= 0),
  promo_start         date,
  promo_end           date,
  available           boolean not null default true,  -- !desactivado
  published           boolean not null default true,
  nutri_score         text check (nutri_score is null or nutri_score in ('A', 'B', 'C', 'D', 'E')),
  raw                 jsonb not null,     -- artículo de la API (incluye nutriScore, agrupaciones, oferta…)
  synced_at           timestamptz not null default now(),
  -- Novedades de la semana (catalog_first_seen.sql). Default sentinel antiguo:
  -- solo metadatos (sin reescritura); las filas futuras toman now() por el
  -- ALTER de abajo. Lo ya existente queda "antiguo" y solo lo nuevo cuenta.
  first_seen_at       timestamptz not null default '2000-01-01'::timestamptz,
  -- Cambios de precio (catalog_price_changes.sql). Los rellena el trigger.
  prev_unit_price     numeric,
  price_changed_at    timestamptz,
  price_delta_pct     numeric,
  -- Búsqueda insensible a acentos (catalog_unaccent_search.sql + mercadona_catalog_ca.sql).
  display_name_norm    text generated always as (lower(public.f_unaccent(display_name))) stored,
  display_name_ca_norm text generated always as (lower(public.f_unaccent(coalesce(display_name_ca, display_name)))) stored
);

-- Filas nuevas a partir de ahora se fechan con now() (novedades reales).
alter table public.sorli_products alter column first_seen_at set default now();

create index if not exists sorli_products_category_idx
  on public.sorli_products (category_id);
create index if not exists sorli_products_category_ids_idx
  on public.sorli_products using gin (category_ids);
create index if not exists sorli_products_name_trgm_idx
  on public.sorli_products using gin (display_name gin_trgm_ops);
create index if not exists sorli_products_norm_trgm_idx
  on public.sorli_products using gin (display_name_norm gin_trgm_ops);
create index if not exists sorli_products_ca_norm_trgm_idx
  on public.sorli_products using gin (display_name_ca_norm gin_trgm_ops);
create index if not exists sorli_products_first_seen_idx
  on public.sorli_products (first_seen_at desc);
create index if not exists sorli_products_price_changed_idx
  on public.sorli_products (price_changed_at desc)
  where price_changed_at is not null;
create index if not exists sorli_products_offers_name_idx
  on public.sorli_products (display_name_norm, id)
  where published = true and promo_name is not null;
create index if not exists sorli_products_offers_name_ca_idx
  on public.sorli_products (display_name_ca_norm, id)
  where published = true and promo_name is not null;

drop trigger if exists track_price_change on public.sorli_products;
create trigger track_price_change
  before update of unit_price on public.sorli_products
  for each row execute function public.catalog_track_price_change();

comment on column public.sorli_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';
comment on column public.sorli_products.promo_name is 'Tipo corto de oferta Sorli en castellano.';
comment on column public.sorli_products.promo_name_ca is 'Tipo corto de oferta Sorli en catalán.';
comment on column public.sorli_products.promo_text is 'Condiciones completas de promociones complejas.';
comment on column public.sorli_products.promo_text_ca is 'Condiciones completas de la promoción en catalán.';
comment on column public.sorli_products.promo_base_price is 'Precio anterior tachado cuando pvp > pvpoferta.';

-- ── RLS: lectura pública, escritura solo service_role ────────────────────────
alter table public.sorli_products   enable row level security;
alter table public.sorli_categories enable row level security;

drop policy if exists "sorli catalog read" on public.sorli_products;
create policy "sorli catalog read"
on public.sorli_products for select to anon, authenticated using (true);

drop policy if exists "sorli categories read" on public.sorli_categories;
create policy "sorli categories read"
on public.sorli_categories for select to anon, authenticated using (true);

grant select on table public.sorli_products, public.sorli_categories to anon, authenticated;
grant select, insert, update, delete on table public.sorli_products, public.sorli_categories to service_role;
