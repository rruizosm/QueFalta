-- Conserva todas las promociones estructuradas que Alcampo asocia a cada
-- producto. Las columnas promo_* existentes siguen representando el resumen
-- compatible con el cliente actual; promo_details evita perder promociones
-- simultáneas y permite distinguir las exclusivas online individualmente.

alter table public.alcampo_products
  add column if not exists promo_online_only boolean not null default false,
  add column if not exists promo_details jsonb not null default '[]'::jsonb;

alter table public.alcampo_products
  drop constraint if exists alcampo_products_promo_details_array,
  add constraint alcampo_products_promo_details_array
    check (jsonb_typeof(promo_details) = 'array');

update public.alcampo_products
set
  promo_online_only = coalesce(promo_name, '') || ' ' || coalesce(promo_text, '')
    ~* '(solo|exclusiv[ao]s?)[[:space:]]+online|online[[:space:]]+exclusiv[ao]s?',
  promo_details = case
    when promo_name is null then '[]'::jsonb
    else jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', null,
      'retailer_promotion_id', null,
      'description', coalesce(promo_text, promo_name),
      'type', null,
      'presentation_mode', null,
      'required_product_quantity', null,
      'promo_start', promo_start,
      'promo_end', promo_end,
      'online_only', coalesce(promo_name, '') || ' ' || coalesce(promo_text, '')
        ~* '(solo|exclusiv[ao]s?)[[:space:]]+online|online[[:space:]]+exclusiv[ao]s?',
      'source_paths', '[]'::jsonb
    )))
  end;

comment on column public.alcampo_products.promo_online_only is
  'True cuando al menos una promoción activa capturada para el producto es exclusiva online.';
comment on column public.alcampo_products.promo_details is
  'Array normalizado de todas las promociones Alcampo del producto, con identificador, vigencia, modalidad online y rutas de origen.';
