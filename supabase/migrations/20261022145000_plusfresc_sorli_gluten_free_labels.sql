-- Materializa las etiquetas explícitas de sin gluten en los espejos Plusfresc y Sorli.
-- Plusfresc: characteristic SGL_SI; Sorli: agrupación idAgrupacion=4 (Sin Gluten).
update public.plusfresc_products p
set gluten_free_label = case
  when jsonb_typeof(p.raw->'characteristics') = 'array' then exists (
    select 1
    from jsonb_array_elements(p.raw->'characteristics') characteristic
    where characteristic->>'id' = 'SGL_SI'
  )
  else false
end
where p.gluten_free_label is distinct from case
  when jsonb_typeof(p.raw->'characteristics') = 'array' then exists (
    select 1
    from jsonb_array_elements(p.raw->'characteristics') characteristic
    where characteristic->>'id' = 'SGL_SI'
  )
  else false
end;

update public.sorli_products p
set gluten_free_label = case
  when jsonb_typeof(p.raw->'agrupaciones') = 'array' then exists (
    select 1
    from jsonb_array_elements(p.raw->'agrupaciones') agrupacion
    where agrupacion->>'idAgrupacion' = '4'
  )
  else false
end
where p.gluten_free_label is distinct from case
  when jsonb_typeof(p.raw->'agrupaciones') = 'array' then exists (
    select 1
    from jsonb_array_elements(p.raw->'agrupaciones') agrupacion
    where agrupacion->>'idAgrupacion' = '4'
  )
  else false
end;

create index if not exists plusfresc_gluten_unit_price_asc_idx
  on public.plusfresc_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists plusfresc_gluten_unit_price_desc_idx
  on public.plusfresc_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists plusfresc_gluten_ppu_asc_idx
  on public.plusfresc_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
create index if not exists plusfresc_gluten_ppu_desc_idx
  on public.plusfresc_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;

create index if not exists sorli_gluten_unit_price_asc_idx
  on public.sorli_products (unit_price asc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists sorli_gluten_unit_price_desc_idx
  on public.sorli_products (unit_price desc, id asc)
  where published and gluten_free_label and unit_price is not null;
create index if not exists sorli_gluten_ppu_asc_idx
  on public.sorli_products (price_per_unit asc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
create index if not exists sorli_gluten_ppu_desc_idx
  on public.sorli_products (price_per_unit desc, id asc)
  where published and gluten_free_label and price_per_unit is not null;
