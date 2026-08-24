-- Gadisline entrega el precio de referencia con sufijos naturales en castellano
-- ("el kilo", "el litro", "los 100 ml"...). El cliente solo admite las bases
-- canónicas l/kg/ud y trataba cualquier otro texto como ud.
--
-- Este backfill es idempotente: conserva las filas que ya estén normalizadas,
-- convierte las bases de 100 ml/100 g y docena, reconoce los frescos al peso
-- por raw.weight=P y descarta metro/dosis, que no son comparables.

update public.gadis_products
set
  price_per_unit = case
    when price_per_unit is null or price_per_unit <= 0 then null
    when lower(trim(price_per_unit_unit)) in ('kg', 'el kilo') then price_per_unit
    when lower(trim(price_per_unit_unit)) in ('l', 'el litro') then price_per_unit
    when lower(trim(price_per_unit_unit)) in ('ud', 'la unidad') then price_per_unit
    when lower(trim(price_per_unit_unit)) = 'la docena' then round(price_per_unit / 12, 4)
    when lower(trim(price_per_unit_unit)) = 'los 100 ml' then round(price_per_unit * 10, 4)
    when lower(trim(price_per_unit_unit)) in ('los 100 gr.', 'los 100 gr') then round(price_per_unit * 10, 4)
    when price_per_unit_unit is null then price_per_unit
    else null
  end,
  price_per_unit_unit = case
    when price_per_unit is null or price_per_unit <= 0 then null
    when lower(trim(price_per_unit_unit)) in ('kg', 'el kilo', 'los 100 gr.', 'los 100 gr') then 'kg'
    when lower(trim(price_per_unit_unit)) in ('l', 'el litro', 'los 100 ml') then 'l'
    when lower(trim(price_per_unit_unit)) in ('ud', 'la unidad', 'la docena') then 'ud'
    when price_per_unit_unit is null and raw->>'weight' = 'P' then 'kg'
    when price_per_unit_unit is null then 'ud'
    else null
  end
where price_per_unit is not null
   or price_per_unit_unit is not null;
