-- Unifica el código de barras en UNA columna `ean` (text) en todas las tablas
-- de catálogo:
--   · renombra ean13 → ean donde existía (mercadona, carrefour, bonarea, dia, consum)
--   · crea ean donde no había (bonpreu, sorli, eroski, caprabo, condis, aldi, hiperdino)
--   · alcampo y ametller ya la llamaban ean → no se tocan
--
-- Idempotente: re-ejecutarla no tiene efecto.
-- ⚠️ Ejecutar ANTES del próximo sync del lunes: los scripts de sync ya escriben
--    `ean` (el upsert fallaría con la columna vieja ean13).

do $$
declare
  t text;
begin
  foreach t in array array[
    'mercadona_products', 'carrefour_products', 'bonarea_products', 'bonpreu_products',
    'consum_products', 'dia_products', 'sorli_products', 'eroski_products',
    'caprabo_products', 'condis_products', 'ametller_products', 'aldi_products',
    'hiperdino_products', 'alcampo_products'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabla % no existe, se salta', t;
      continue;
    end if;

    -- 1) renombrar ean13 → ean si procede
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'ean13')
       and not exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = t and column_name = 'ean')
    then
      execute format('alter table public.%I rename column ean13 to ean', t);
    end if;

    -- 2) crear ean si sigue faltando
    execute format('alter table public.%I add column if not exists ean text', t);

    execute format(
      'comment on column public.%I.ean is %L',
      t, 'Código de barras (EAN-8/13). NULL si la fuente no lo expone.'
    );
  end loop;
end $$;
