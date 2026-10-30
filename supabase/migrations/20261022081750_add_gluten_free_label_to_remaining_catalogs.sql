-- Prepara la bandera de sin gluten en las demás tablas maestras de productos.
-- Queda NULL hasta que se implemente la lectura de la etiqueta de cada súper.
alter table public.ahorramas_products add column if not exists gluten_free_label boolean;
alter table public.alcampo_products add column if not exists gluten_free_label boolean;
alter table public.aldi_products add column if not exists gluten_free_label boolean;
alter table public.ametller_products add column if not exists gluten_free_label boolean;
alter table public.bm_products add column if not exists gluten_free_label boolean;
alter table public.caprabo_products add column if not exists gluten_free_label boolean;
alter table public.carrefour_products add column if not exists gluten_free_label boolean;
alter table public.condis_products add column if not exists gluten_free_label boolean;
alter table public.consum_products add column if not exists gluten_free_label boolean;
alter table public.dia_products add column if not exists gluten_free_label boolean;
alter table public.eljamon_products add column if not exists gluten_free_label boolean;
alter table public.eroski_products add column if not exists gluten_free_label boolean;
alter table public.froiz_products add column if not exists gluten_free_label boolean;
alter table public.gadis_products add column if not exists gluten_free_label boolean;
alter table public.hipercor_products add column if not exists gluten_free_label boolean;
alter table public.hiperdino_products add column if not exists gluten_free_label boolean;
alter table public.lidl_products add column if not exists gluten_free_label boolean;
alter table public.mercadona_products add column if not exists gluten_free_label boolean;
alter table public.plusfresc_products add column if not exists gluten_free_label boolean;
alter table public.sorli_products add column if not exists gluten_free_label boolean;
