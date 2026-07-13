-- Espejo del catálogo de Alcampo (compraonline.alcampo.es) en Supabase
-- (CATÁLOGO + BÚSQUEDA + FICHA). Lo rellena scripts/sync-alcampo.mjs 1×/semana.
-- 13º espejo, tabla aparte (modelo "una tabla por tienda"). SOLO castellano
-- (compraonline.alcampo.es sirve es-ES).
--
-- Plataforma Ocado (osp.tech) con API REST propia. El listado por categoría trae
-- el producto DECORADO (precio + €/unidad + imagen) vía
-- /api/webproductpagews/v6/product-pages (con cursor pageToken y cookie de sesión);
-- la FICHA (ingredientes/nutrición/características con EAN) va aparte, del HTML SSR
-- de la PDP (/products/x/{retailerProductId}, redirige al slug). El EAN solo está en
-- ~20 % de las fichas → NULL en el resto (el comparador casa por nombre). La app SOLO
-- lee; las escrituras van con la service_role key (se salta RLS).
--
-- Este fichero es AUTOCONTENIDO: incluye las columnas/índices que en los otros
-- súpers añadieron migraciones compartidas posteriores (display_name_norm para
-- búsqueda insensible a acentos, first_seen_at para "Novedades",
-- prev_unit_price/price_changed_at/price_delta_pct + trigger para "Cambios de
-- precios") + las columnas de FICHA (como dia_product_detail.sql). Es idempotente.
-- Ejecutar en: Supabase → SQL Editor. Tras ejecutarlo: lanzar el sync (workflow
-- sync-alcampo.yml) y re-ejecutar similar_products.sql (ya con el brazo alcampo).

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
-- Árbol de 2 niveles para la app (N1 raíz de alimentación → N2 hijo directo). Los
-- productos indexan N1+N2 en category_ids, así que tocar cualquiera lista su subárbol.
create table if not exists public.alcampo_categories (
  id            text primary key,      -- retailerCategoryId (OC####)
  name          text not null,
  parent_id     text,                  -- retailerCategoryId del N1 (null en N1)
  product_count int,
  published     boolean not null default true,
  synced_at     timestamptz not null default now()
);

-- ── Productos ────────────────────────────────────────────────────────────────
create table if not exists public.alcampo_products (
  id                  text primary key,   -- productId (UUID estable de Ocado)
  retailer_product_id text,               -- id corto OC#### (para PDP/ficha)
  display_name        text not null,
  brand               text,
  packaging           text,               -- packSizeDescription ("9000ml", "10x41.5g")
  thumbnail           text,               -- image.src (300x300, images-v3)
  category_id         text,               -- N2 primaria (o N1 si cuelga del root)
  category_name       text,               -- N1 (para la zona de la lista)
  category_ids        text[] not null default '{}',  -- N1 + N2 (navegación por cualquier nivel)
  unit_price          numeric,            -- precio del envase en € (price.amount)
  price_format        text,               -- texto mostrado ("5,04 €")
  price_per_unit      numeric,            -- € por unidad CANÓNICA (l/kg/ud), de unitPrice
  price_per_unit_unit text,               -- 'l' | 'kg' | 'ud'
  available           boolean not null default true,
  published           boolean not null default true,
  raw                 jsonb not null,     -- producto decorado (promos, isNew, imágenes…)
  synced_at           timestamptz not null default now(),
  -- Ficha (PDP HTML). Solo castellano → sin columnas _ca. La rellena el sync de forma
  -- incremental (detail_synced_at); NULL hasta que se rastree cada producto.
  description         text,
  ingredients         text,
  nutrition           text,
  conservation        text,
  preparation         text,
  denomination        text,
  operator            text,
  origin              text,
  ean                 text,               -- solo ~20 % de las fichas lo traen
  detail_synced_at    timestamptz,
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
alter table public.alcampo_products alter column first_seen_at set default now();

create index if not exists alcampo_products_category_idx
  on public.alcampo_products (category_id);
create index if not exists alcampo_products_category_ids_idx
  on public.alcampo_products using gin (category_ids);
create index if not exists alcampo_products_name_trgm_idx
  on public.alcampo_products using gin (display_name gin_trgm_ops);
create index if not exists alcampo_products_norm_trgm_idx
  on public.alcampo_products using gin (display_name_norm gin_trgm_ops);
create index if not exists alcampo_products_first_seen_idx
  on public.alcampo_products (first_seen_at desc);
create index if not exists alcampo_products_price_changed_idx
  on public.alcampo_products (price_changed_at desc)
  where price_changed_at is not null;

drop trigger if exists track_price_change on public.alcampo_products;
create trigger track_price_change
  before update of unit_price on public.alcampo_products
  for each row execute function public.catalog_track_price_change();

comment on column public.alcampo_products.price_per_unit is '€ por unidad canónica (price_per_unit_unit). NULL = sin dato.';
comment on column public.alcampo_products.ean is 'EAN de la ficha (Características). NULL en ~80 % (Alcampo solo lo publica en parte del surtido).';

-- ── RLS: lectura pública, escritura solo service_role ────────────────────────
alter table public.alcampo_products   enable row level security;
alter table public.alcampo_categories enable row level security;

drop policy if exists "alcampo catalog read" on public.alcampo_products;
create policy "alcampo catalog read"
on public.alcampo_products for select to anon, authenticated using (true);

drop policy if exists "alcampo categories read" on public.alcampo_categories;
create policy "alcampo categories read"
on public.alcampo_categories for select to anon, authenticated using (true);
