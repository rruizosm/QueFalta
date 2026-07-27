-- Ofertas explícitas de Sorli/Sorliclic.
-- Aplicada en producción con la versión Supabase 20260723212240.
--
-- La ruta oficial /es/ofertas envía `soloOfertas=true`, pero cada producto del
-- catálogo general ya contiene la misma señal estructurada: oferta, textoOferta,
-- ofertaEnVigor, pvp/pvpoferta y fechas. El sync la normaliza sin un crawl extra.

alter table public.sorli_products add column if not exists promo_name text;
alter table public.sorli_products add column if not exists promo_name_ca text;
alter table public.sorli_products add column if not exists promo_text text;
alter table public.sorli_products add column if not exists promo_text_ca text;
alter table public.sorli_products add column if not exists promo_base_price numeric;
alter table public.sorli_products add column if not exists promo_start date;
alter table public.sorli_products add column if not exists promo_end date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sorli_products'::regclass
      and conname = 'sorli_products_promo_base_price_nonnegative'
  ) then
    alter table public.sorli_products
      add constraint sorli_products_promo_base_price_nonnegative
      check (promo_base_price is null or promo_base_price >= 0);
  end if;
end $$;

-- Backfill inmediato desde raw para que Ofertas funcione sin esperar al
-- siguiente sync semanal. La vigencia se vuelve a calcular en cada pasada.
with source as (
  select
    id,
    coalesce((raw->>'ofertaEnVigor')::boolean, false) as is_live,
    coalesce((raw->>'ofertaCompleja')::boolean, false) as is_complex,
    nullif(raw #>> '{oferta,descripcion}', '') as offer_type,
    nullif(raw #>> '{oferta,descripcionCat}', '') as offer_type_ca,
    coalesce(nullif(raw->>'descripcionOferta', ''), nullif(raw->>'textoOferta', ''), '') as detail,
    coalesce(nullif(raw->>'descripcionOfertaCat', ''), nullif(raw->>'textoOferta', ''), '') as detail_ca,
    nullif(raw->>'pvp', '')::numeric as base_price,
    nullif(raw->>'pvpoferta', '')::numeric as offer_price,
    nullif(raw->>'fechaInicioOferta', '')::timestamptz::date as starts_on,
    nullif(raw->>'fechaFinOferta', '')::timestamptz::date as ends_on
  from public.sorli_products
), parsed as (
  select
    *,
    regexp_match(
      detail,
      '2\s*[ªa]\s*(UN(IDAD|ITAT)?|U(D)?\.?)?\s*(AL|A)?\s*([0-9]{1,3})\s*%',
      'i'
    ) as second_unit,
    regexp_match(
      detail,
      '([0-9]+)\s*X\s*([0-9]+[,.][0-9]+)\s*€?',
      'i'
    ) as fixed_decimal,
    regexp_match(
      detail,
      '([0-9]+)\s*X\s*([0-9]+([,.][0-9]+)?)\s*€',
      'i'
    ) as fixed_x,
    regexp_match(
      detail,
      '([0-9]+)\s*(U|UD|UNIDADES?|UNITATS?)\s+([0-9]+([,.][0-9]+)?)\s*€',
      'i'
    ) as fixed_units,
    regexp_match(detail, '([0-9]+)\s*X\s*([0-9]+)\M', 'i') as multi_buy
  from source
), offers as (
  select *
  from parsed
  where is_live
    and (ends_on is null or ends_on >= current_date)
)
update public.sorli_products p
set
  promo_name = case
    when o.second_unit is not null then '2ª unidad al ' || o.second_unit[5] || '%'
    when o.fixed_decimal is not null
      then o.fixed_decimal[1] || ' uds. por ' || replace(o.fixed_decimal[2], '.', ',') || ' €'
    when o.fixed_x is not null
      then o.fixed_x[1] || ' uds. por ' || replace(o.fixed_x[2], '.', ',') || ' €'
    when o.fixed_units is not null
      then o.fixed_units[1] || ' uds. por ' || replace(o.fixed_units[3], '.', ',') || ' €'
    when lower(o.offer_type) = '2ª 50%' then '2ª unidad al 50%'
    when lower(o.offer_type) = '2ª 70%' then '2ª unidad al 70%'
    when o.multi_buy is not null then o.multi_buy[1] || 'x' || o.multi_buy[2]
    when o.detail ~* '\m(regalo|regal)\M' then 'Regalo'
    when lower(o.offer_type) = 'precio' then 'Precio rebajado'
    when lower(o.offer_type) = 'lote fijo' then 'Lote a precio fijo'
    when lower(o.offer_type) = 'lote variable' then 'Lote combinado'
    else coalesce(o.offer_type, 'Oferta')
  end,
  promo_name_ca = case
    when o.second_unit is not null then '2a unitat al ' || o.second_unit[5] || '%'
    when o.fixed_decimal is not null
      then o.fixed_decimal[1] || ' u. per ' || replace(o.fixed_decimal[2], '.', ',') || ' €'
    when o.fixed_x is not null
      then o.fixed_x[1] || ' u. per ' || replace(o.fixed_x[2], '.', ',') || ' €'
    when o.fixed_units is not null
      then o.fixed_units[1] || ' u. per ' || replace(o.fixed_units[3], '.', ',') || ' €'
    when lower(o.offer_type) = '2ª 50%' then '2a unitat al 50%'
    when lower(o.offer_type) = '2ª 70%' then '2a unitat al 70%'
    when o.multi_buy is not null then o.multi_buy[1] || 'x' || o.multi_buy[2]
    when o.detail ~* '\m(regalo|regal)\M' then 'Regal'
    when lower(o.offer_type) = 'precio' then 'Preu rebaixat'
    when lower(o.offer_type) = 'lote fijo' then 'Lot a preu fix'
    when lower(o.offer_type) = 'lote variable' then 'Lot combinat'
    else coalesce(o.offer_type_ca, o.offer_type, 'Oferta')
  end,
  promo_text = case when o.is_complex then nullif(o.detail, '') else null end,
  promo_text_ca = case when o.is_complex then nullif(o.detail_ca, '') else null end,
  promo_base_price = case
    when o.base_price > o.offer_price and o.offer_price > 0 then o.base_price
    else null
  end,
  promo_start = o.starts_on,
  promo_end = o.ends_on
from offers o
where p.id = o.id;

update public.sorli_products
set
  promo_name = null,
  promo_name_ca = null,
  promo_text = null,
  promo_text_ca = null,
  promo_base_price = null,
  promo_start = null,
  promo_end = null
where not (
  coalesce((raw->>'ofertaEnVigor')::boolean, false)
  and (
    nullif(raw->>'fechaFinOferta', '') is null
    or nullif(raw->>'fechaFinOferta', '')::timestamptz::date >= current_date
  )
);

create index if not exists sorli_products_offers_name_idx
  on public.sorli_products (display_name_norm, id)
  where published = true and promo_name is not null;

create index if not exists sorli_products_offers_name_ca_idx
  on public.sorli_products (display_name_ca_norm, id)
  where published = true and promo_name is not null;

comment on column public.sorli_products.promo_name is
  'Tipo corto de oferta Sorli en castellano (3x2, 2ª unidad, lote o precio rebajado).';
comment on column public.sorli_products.promo_name_ca is
  'Tipo corto de oferta Sorli en catalán.';
comment on column public.sorli_products.promo_text is
  'Condiciones completas de promociones complejas publicadas por Sorli.';
comment on column public.sorli_products.promo_text_ca is
  'Condiciones completas de la promoción en catalán.';
comment on column public.sorli_products.promo_base_price is
  'Precio anterior tachado cuando pvp es mayor que pvpoferta.';
comment on column public.sorli_products.promo_start is
  'Primer día de vigencia de la oferta Sorli.';
comment on column public.sorli_products.promo_end is
  'Último día de vigencia de la oferta Sorli.';
