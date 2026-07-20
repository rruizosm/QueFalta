-- Campos de la ficha pública de producto de BonpreuEsclat.
alter table public.bonpreu_products add column if not exists product_info text;
alter table public.bonpreu_products add column if not exists supplier_name text;
alter table public.bonpreu_products add column if not exists ingredients text;
alter table public.bonpreu_products add column if not exists nutrition text;
alter table public.bonpreu_products add column if not exists detail_synced_at timestamptz;

create index if not exists bonpreu_products_detail_synced_idx
  on public.bonpreu_products (detail_synced_at);
