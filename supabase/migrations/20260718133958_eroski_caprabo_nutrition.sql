-- Nutrición de las fichas HTML de Eroski y Caprabo.
-- `detail_synced_at` hace incremental el rastreo y también recuerda las fichas
-- válidas que no publican tabla nutricional.

alter table public.eroski_products
  add column if not exists nutrition text,
  add column if not exists detail_synced_at timestamptz;

alter table public.caprabo_products
  add column if not exists nutrition text,
  add column if not exists detail_synced_at timestamptz;

comment on column public.eroski_products.nutrition is
  'Valores nutricionales normalizados por 100 g/ml para el Índice Alimentario.';
comment on column public.caprabo_products.nutrition is
  'Valores nutricionales normalizados por 100 g/ml para el Índice Alimentario.';
