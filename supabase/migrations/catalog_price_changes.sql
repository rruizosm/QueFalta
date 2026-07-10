-- Cambios de precio semanales: qué subió y qué bajó en el último sync.
--
-- Hoy el sync PISA unit_price cada lunes sin dejar rastro. Este SQL añade a
-- las 6 tablas *_products:
--   prev_unit_price   numeric      — precio anterior (lo guarda el trigger)
--   price_changed_at  timestamptz  — cuándo se detectó el cambio
--   price_delta_pct   numeric      — % de variación (lo calcula el MISMO
--                                    trigger; permite filtrar bajadas/subidas
--                                    y ordenar por magnitud desde PostgREST,
--                                    que no sabe comparar columna contra
--                                    columna)
-- y un trigger BEFORE UPDATE OF unit_price que, si el precio realmente cambia
-- (IS DISTINCT FROM), guarda el anterior, el momento y el %. Los syncs NO se
-- tocan: su upsert semanal (merge-duplicates = ON CONFLICT DO UPDATE) dispara
-- el trigger solo. markStale solo toca published/synced_at → no lo dispara.
--
-- price_delta_pct fue columna GENERADA en la 1ª versión de esta migración,
-- pero añadirla obligaba a REESCRIBIR cada tabla (statement timeout 57014 en
-- mercadona_products + tablas bloqueadas para lecturas). Calculada por el
-- trigger, TODA la migración es solo metadatos: instantánea y sin bloqueos.
-- El DROP COLUMN de abajo limpia la columna generada si algún intento parcial
-- de la 1ª versión llegó a crearla (un BEFORE trigger no puede escribir en
-- una columna generada). Es instantáneo y ahora mismo no hay datos que perder.
--
-- ⚠️ ORDEN: ejecutar fix_bonpreu_prices.sql ANTES que esto. Su UPDATE masivo
-- repara ~50% de los precios de Bonpreu; con el trigger ya instalado, toda esa
-- reparación se registraría de golpe como "cambios de precio" falsos.
--
-- No habrá datos hasta el primer sync (lunes) posterior a ejecutar esto. La
-- primera vez que un producto tiene precio (old null) NO cuenta como cambio:
-- prev_unit_price y price_delta_pct quedan null → la app lo excluye.
--
-- La app lee la ventana de la última semana (fetchPriceChanges en
-- src/api/catalog.ts): bajadas = price_delta_pct < 0, subidas > 0, ordenado
-- por magnitud. OJO promos: Dia/Consum guardan el precio CON oferta aplicada,
-- así que las promos que entran/salen aparecen como cambios (asumido: son
-- justo lo interesante).
--
-- Ejecutar en: Supabase → SQL Editor (entera o por bloques; es idempotente).

-- Trigger compartido por las 6 tablas (todas llaman igual a sus columnas).
create or replace function public.catalog_track_price_change()
returns trigger
language plpgsql
as $$
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

-- Mercadona
alter table public.mercadona_products drop column if exists price_delta_pct;
alter table public.mercadona_products
  add column if not exists prev_unit_price numeric,
  add column if not exists price_changed_at timestamptz,
  add column price_delta_pct numeric;
drop trigger if exists track_price_change on public.mercadona_products;
create trigger track_price_change
  before update of unit_price on public.mercadona_products
  for each row execute function public.catalog_track_price_change();
create index if not exists mercadona_products_price_changed_idx
  on public.mercadona_products (price_changed_at desc)
  where price_changed_at is not null;

-- BonpreuEsclat
alter table public.bonpreu_products drop column if exists price_delta_pct;
alter table public.bonpreu_products
  add column if not exists prev_unit_price numeric,
  add column if not exists price_changed_at timestamptz,
  add column price_delta_pct numeric;
drop trigger if exists track_price_change on public.bonpreu_products;
create trigger track_price_change
  before update of unit_price on public.bonpreu_products
  for each row execute function public.catalog_track_price_change();
create index if not exists bonpreu_products_price_changed_idx
  on public.bonpreu_products (price_changed_at desc)
  where price_changed_at is not null;

-- Carrefour
alter table public.carrefour_products drop column if exists price_delta_pct;
alter table public.carrefour_products
  add column if not exists prev_unit_price numeric,
  add column if not exists price_changed_at timestamptz,
  add column price_delta_pct numeric;
drop trigger if exists track_price_change on public.carrefour_products;
create trigger track_price_change
  before update of unit_price on public.carrefour_products
  for each row execute function public.catalog_track_price_change();
create index if not exists carrefour_products_price_changed_idx
  on public.carrefour_products (price_changed_at desc)
  where price_changed_at is not null;

-- bonÀrea
alter table public.bonarea_products drop column if exists price_delta_pct;
alter table public.bonarea_products
  add column if not exists prev_unit_price numeric,
  add column if not exists price_changed_at timestamptz,
  add column price_delta_pct numeric;
drop trigger if exists track_price_change on public.bonarea_products;
create trigger track_price_change
  before update of unit_price on public.bonarea_products
  for each row execute function public.catalog_track_price_change();
create index if not exists bonarea_products_price_changed_idx
  on public.bonarea_products (price_changed_at desc)
  where price_changed_at is not null;

-- Consum
alter table public.consum_products drop column if exists price_delta_pct;
alter table public.consum_products
  add column if not exists prev_unit_price numeric,
  add column if not exists price_changed_at timestamptz,
  add column price_delta_pct numeric;
drop trigger if exists track_price_change on public.consum_products;
create trigger track_price_change
  before update of unit_price on public.consum_products
  for each row execute function public.catalog_track_price_change();
create index if not exists consum_products_price_changed_idx
  on public.consum_products (price_changed_at desc)
  where price_changed_at is not null;

-- Dia
alter table public.dia_products drop column if exists price_delta_pct;
alter table public.dia_products
  add column if not exists prev_unit_price numeric,
  add column if not exists price_changed_at timestamptz,
  add column price_delta_pct numeric;
drop trigger if exists track_price_change on public.dia_products;
create trigger track_price_change
  before update of unit_price on public.dia_products
  for each row execute function public.catalog_track_price_change();
create index if not exists dia_products_price_changed_idx
  on public.dia_products (price_changed_at desc)
  where price_changed_at is not null;
