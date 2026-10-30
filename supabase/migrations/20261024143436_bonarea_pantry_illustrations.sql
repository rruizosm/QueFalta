alter table public.bonarea_products
  add column if not exists illustration_url text;

comment on column public.bonarea_products.illustration_url is
  'URL pública de una ilustración aprobada del producto; independiente de la fotografía original.';

update public.bonarea_products
set illustration_url = case id
  when '13*7690' then 'https://images.bonarea.com/13_7690_1.png'
  when '13*5891' then 'https://images.bonarea.com/13_5891_1.png'
  when '13*6699' then 'https://images.bonarea.com/13_6699_1.png'
  when '13*3431' then 'https://images.bonarea.com/13_3431_1.png'
  when '13*0090721' then 'https://images.bonarea.com/13_0090721_1.png'
end
where id in ('13*7690', '13*5891', '13*6699', '13*3431', '13*0090721');

create index if not exists bonarea_products_pantry_illustrated_idx
  on public.bonarea_products (display_name_norm, id)
  where published and available and illustration_url is not null and illustration_url <> '';
