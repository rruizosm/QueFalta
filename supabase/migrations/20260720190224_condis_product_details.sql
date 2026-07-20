-- Campos estructurados de la ficha pública de Condis.
alter table public.condis_products add column if not exists ingredients text;
alter table public.condis_products add column if not exists nutrition text;
alter table public.condis_products add column if not exists conservation text;
alter table public.condis_products add column if not exists manufacturer text;
alter table public.condis_products add column if not exists detail_synced_at timestamptz;
