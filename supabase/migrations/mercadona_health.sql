-- Nota de salud 0-100 estilo Yuka para el catálogo de Mercadona (función Plus).
-- Lo rellena scripts/extract-mercadona-nutrition.mjs de forma INCREMENTAL.
--
-- El dato nutricional NO viene como campo en la API de Mercadona: está en la foto
-- de la etiqueta trasera (photos[1].zoom). El extractor la lee con visión (Claude
-- Haiku) → tabla por 100g, calcula el Nutri-Score + aditivos + bonus eco con
-- scripts/lib/health-score.mjs, y guarda aquí los valores + el score ya calculado
-- (la app solo lee). Los ingredientes y el EAN sí vienen como texto en la API.
--
-- SOLO Mercadona: los demás súper no exponen la etiqueta nutricional.
-- Ejecutar en: Supabase → SQL Editor.

alter table public.mercadona_products
  add column if not exists ean13              text,     -- de la API (GET detalle); estable
  add column if not exists ingredients        text,     -- de la API (nutrition_information.ingredients, limpio)
  add column if not exists nutrition          jsonb,    -- {kcal,kj,grasas,saturadas,hidratos,azucares,fibra,proteinas,sal} por 100g
  add column if not exists health_score       int,      -- 0-100 (null = sin etiqueta / no alimentación)
  add column if not exists health_grade       text,     -- Nutri-Score 'A'..'E'
  add column if not exists health             jsonb,    -- desglose: { tier, nutriScore, estimated, components, additives, breakdown[] }
  -- Control del proceso incremental (ver extractor): qué foto se leyó y cuándo.
  -- Si photos[1] cambia de imageId (reformulación) → nutrition_image_id distinto
  -- → se vuelve a extraer. nutrition_status: 'ok' | 'no_label' | 'failed'.
  add column if not exists nutrition_image_id text,
  add column if not exists nutrition_status   text,
  add column if not exists nutrition_synced_at timestamptz;

comment on column public.mercadona_products.health_score is 'Nota de salud 0-100 (estilo Yuka, calculada por el sync). NULL = sin dato.';
comment on column public.mercadona_products.nutrition_status is 'ok = leída; no_label = sin etiqueta/no-alimentación; failed = reintentar.';

-- Para "productos con nota" y para el barrido incremental (los que faltan).
create index if not exists mercadona_health_score_idx
  on public.mercadona_products (health_score) where health_score is not null;

-- La política de lectura del catálogo ya cubre estas columnas (mismo SELECT
-- anon/authenticated de mercadona_products). El gating Plus se aplica en la app
-- (la nota es visible solo para premium), no a nivel de fila.
