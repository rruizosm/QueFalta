-- Supermercados El Jamón: catálogo común para todas las ubicaciones.
--
-- Fuente: catálogo público Liferay/Comerzzia, extraído por
-- scripts/sync-eljamon.mjs con un centro de recogida de referencia. El análisis
-- de ubicaciones no encontró diferencias de surtido, precio u oferta, por lo
-- que no se introduce una dimensión postal/centro.
--
-- Las ofertas vigentes se guardan en el producto, igual que en los demás
-- espejos de QuéFalta. catalog_sync_status es compartida y ya existe.

set lock_timeout = '5s';
set statement_timeout = '120s';

create extension if not exists pg_trgm;
create extension if not exists unaccent with schema extensions;

create or replace function public.f_unaccent(text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $function$
  select extensions.unaccent('extensions.unaccent', $1)
$function$;

create or replace function public.catalog_track_price_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.unit_price is distinct from old.unit_price then
    new.prev_unit_price := old.unit_price;
    new.price_changed_at := now();
    if new.unit_price is null or old.unit_price is null or old.unit_price <= 0 then
      new.price_delta_pct := null;
    else
      new.price_delta_pct := round(
        (new.unit_price - old.unit_price) / old.unit_price * 100,
        1
      );
    end if;
  end if;
  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- Categorías jerárquicas de Comerzzia: 01 -> 0107 -> 010704.
-- ---------------------------------------------------------------------------

create table if not exists public.eljamon_categories (
  id            text primary key,
  name          text not null,
  parent_id     text,
  source_url    text,
  product_count integer not null default 0,
  published     boolean not null default true,
  synced_at     timestamptz not null default now(),
  constraint eljamon_categories_id_check check (id ~ '^[0-9]{2,}$'),
  constraint eljamon_categories_parent_check check (
    parent_id is null
    or (parent_id ~ '^[0-9]{2,}$' and id like parent_id || '%' and id <> parent_id)
  ),
  constraint eljamon_categories_product_count_check check (product_count >= 0)
);

-- ---------------------------------------------------------------------------
-- Catálogo y oferta pública vigente.
-- ---------------------------------------------------------------------------

create table if not exists public.eljamon_products (
  id                    text primary key,
  retailer_product_id   text,
  ean                   text,
  display_name          text not null,
  brand                 text,
  packaging             text,
  thumbnail             text,
  product_url           text,

  category_id           text,
  category_name         text,
  category_ids          text[] not null default '{}',
  source_category_name  text,

  unit_price            numeric,
  price_format          text,
  price_per_unit        numeric,
  price_per_unit_unit   text,

  promo_name            text,
  promo_text            text,
  promo_price           numeric,
  promo_base_price      numeric,
  promo_start           date,
  promo_end             date,
  promo_discount_pct    numeric generated always as (
    case
      when promo_price is not null
       and promo_base_price is not null
       and promo_base_price > 0
      then round((promo_base_price - promo_price) / promo_base_price * 100, 1)
      else null
    end
  ) stored,

  is_new                boolean not null default false,
  badges                text[] not null default '{}',
  available             boolean not null default true,
  published             boolean not null default true,

  description           text,
  ingredients           text,
  allergens             text,
  nutrition             text,
  conservation          text,
  detail_synced_at      timestamptz,

  raw                   jsonb not null default '{}'::jsonb,
  synced_at             timestamptz not null default now(),
  first_seen_at         timestamptz not null default now(),
  prev_unit_price       numeric,
  price_changed_at      timestamptz,
  price_delta_pct       numeric,

  display_name_norm     text generated always as (
    lower(public.f_unaccent(display_name))
  ) stored,

  constraint eljamon_products_id_check check (id ~ '^[0-9]+$'),
  constraint eljamon_products_unit_price_check check (unit_price is null or unit_price >= 0),
  constraint eljamon_products_price_per_unit_check check (price_per_unit is null or price_per_unit >= 0),
  constraint eljamon_products_price_per_unit_unit_check check (
    price_per_unit_unit is null or price_per_unit_unit in ('l', 'kg', 'ud')
  ),
  constraint eljamon_products_promo_price_check check (promo_price is null or promo_price >= 0),
  constraint eljamon_products_promo_base_price_check check (promo_base_price is null or promo_base_price >= 0),
  constraint eljamon_products_promo_dates_check check (
    promo_start is null or promo_end is null or promo_end >= promo_start
  )
);

-- Navegación y búsqueda.
create index if not exists eljamon_categories_parent_idx
  on public.eljamon_categories (parent_id, id)
  where published;
create index if not exists eljamon_categories_name_trgm_idx
  on public.eljamon_categories using gin (name gin_trgm_ops);

create index if not exists eljamon_products_category_idx
  on public.eljamon_products (category_id, display_name_norm, id)
  where published;
create index if not exists eljamon_products_category_ids_idx
  on public.eljamon_products using gin (category_ids);
create index if not exists eljamon_products_norm_trgm_idx
  on public.eljamon_products using gin (display_name_norm gin_trgm_ops);
create index if not exists eljamon_products_name_browse_idx
  on public.eljamon_products (display_name_norm, id)
  where published;
create index if not exists eljamon_products_price_browse_idx
  on public.eljamon_products (unit_price, id)
  where published;
create index if not exists eljamon_products_price_browse_desc_idx
  on public.eljamon_products (unit_price desc, id)
  where published;
create index if not exists eljamon_products_ppu_browse_idx
  on public.eljamon_products (price_per_unit, id)
  where published and price_per_unit is not null;
create index if not exists eljamon_products_ppu_browse_desc_idx
  on public.eljamon_products (price_per_unit desc, id)
  where published and price_per_unit is not null;
create index if not exists eljamon_products_first_seen_idx
  on public.eljamon_products (first_seen_at desc, id)
  where published;
create index if not exists eljamon_products_price_changed_idx
  on public.eljamon_products (price_changed_at desc, id)
  where published and price_changed_at is not null;
create index if not exists eljamon_products_offer_idx
  on public.eljamon_products (promo_end, display_name_norm, id)
  where published and promo_name is not null;

drop trigger if exists track_price_change on public.eljamon_products;
create trigger track_price_change
before update of unit_price on public.eljamon_products
for each row execute function public.catalog_track_price_change();

comment on table public.eljamon_products is
  'Catálogo común de Supermercados El Jamón; precios y ofertas observados en recogida.';
comment on column public.eljamon_products.price_per_unit is
  'Precio por unidad canónica: €/l, €/kg o €/ud según price_per_unit_unit.';
comment on column public.eljamon_products.promo_discount_pct is
  'Descuento calculado solo cuando la web publica precio anterior y precio de oferta.';
comment on column public.eljamon_products.raw is
  'Señales originales necesarias para auditar la normalización del extractor.';

-- ---------------------------------------------------------------------------
-- Seguridad: lectura del catálogo; todas las mutaciones quedan para service_role.
-- ---------------------------------------------------------------------------

alter table public.eljamon_categories enable row level security;
alter table public.eljamon_products enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.eljamon_categories, public.eljamon_products
  from anon, authenticated;
grant select on public.eljamon_categories, public.eljamon_products
  to anon, authenticated, service_role;
grant insert, update, delete, truncate
  on public.eljamon_categories, public.eljamon_products
  to service_role;

drop policy if exists "eljamon categories read" on public.eljamon_categories;
create policy "eljamon categories read"
on public.eljamon_categories
for select
to anon, authenticated
using (published);

drop policy if exists "eljamon catalog read" on public.eljamon_products;
create policy "eljamon catalog read"
on public.eljamon_products
for select
to anon, authenticated
using (published);
