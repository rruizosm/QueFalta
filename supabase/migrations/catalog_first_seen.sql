-- Novedades de la semana: cuándo APARECIÓ cada producto en el espejo.
--
-- Añade `first_seen_at` a las 6 tablas *_products. El truco de la migración:
-- la columna se añade con un DEFAULT antiguo (sentinel) —operación solo de
-- metadatos en Postgres 11+, sin reescritura de tabla ni UPDATE masivo (evita
-- el statement_timeout 57014 de los markStale)— y DESPUÉS se cambia el default
-- a now() para las filas futuras. Así todo lo ya existente queda "antiguo" y
-- solo los productos que aparezcan en próximos syncs cuentan como novedad.
--
-- Los syncs NO se tocan: upsertean con resolution=merge-duplicates, que solo
-- pisa las columnas del payload → first_seen_at se conserva en las filas
-- existentes y toma el default (la fecha del sync) en las nuevas.
--
-- La app lee la ventana de la última semana (fetchWeeklyNewProducts en
-- src/api/catalog.ts) con una guarda en cliente: si el lote "nuevo" es enorme
-- (> ~400) no son novedades, es el PRIMER llenado de un súper recién estrenado
-- (p. ej. Consum o Dia aún sin run real) → se oculta el lote entero.
--
-- El soft-delete (published=false) conserva la fila → un producto que
-- desaparece y vuelve NO cuenta como falsa novedad.
--
-- Ejecutar en: Supabase → SQL Editor (mejor fuera del lunes de syncs).

-- Mercadona
alter table public.mercadona_products
  add column if not exists first_seen_at timestamptz not null default '2000-01-01'::timestamptz;
alter table public.mercadona_products
  alter column first_seen_at set default now();
create index if not exists mercadona_products_first_seen_idx
  on public.mercadona_products (first_seen_at desc);

-- BonpreuEsclat
alter table public.bonpreu_products
  add column if not exists first_seen_at timestamptz not null default '2000-01-01'::timestamptz;
alter table public.bonpreu_products
  alter column first_seen_at set default now();
create index if not exists bonpreu_products_first_seen_idx
  on public.bonpreu_products (first_seen_at desc);

-- Carrefour
alter table public.carrefour_products
  add column if not exists first_seen_at timestamptz not null default '2000-01-01'::timestamptz;
alter table public.carrefour_products
  alter column first_seen_at set default now();
create index if not exists carrefour_products_first_seen_idx
  on public.carrefour_products (first_seen_at desc);

-- bonÀrea
alter table public.bonarea_products
  add column if not exists first_seen_at timestamptz not null default '2000-01-01'::timestamptz;
alter table public.bonarea_products
  alter column first_seen_at set default now();
create index if not exists bonarea_products_first_seen_idx
  on public.bonarea_products (first_seen_at desc);

-- Consum
alter table public.consum_products
  add column if not exists first_seen_at timestamptz not null default '2000-01-01'::timestamptz;
alter table public.consum_products
  alter column first_seen_at set default now();
create index if not exists consum_products_first_seen_idx
  on public.consum_products (first_seen_at desc);

-- Dia
alter table public.dia_products
  add column if not exists first_seen_at timestamptz not null default '2000-01-01'::timestamptz;
alter table public.dia_products
  alter column first_seen_at set default now();
create index if not exists dia_products_first_seen_idx
  on public.dia_products (first_seen_at desc);
