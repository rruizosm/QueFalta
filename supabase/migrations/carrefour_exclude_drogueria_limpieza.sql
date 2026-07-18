-- Retira del espejo de Carrefour la rama N1 "Droguería y limpieza" y todos sus
-- productos. Ejecutado el 2026-07-17; se conserva para poder reproducir el cambio
-- en otra base. scripts/sync-carrefour.mjs omite cat20005 para que no reaparezcan.
--
-- La consulta resuelve los descendientes, por si Carrefour añade otra N2 a la rama.
-- Los productos que compartan una N2 excluida también se eliminan: el próximo sync
-- solo podría recrearlos si Carrefour los lista además bajo una rama permitida.

begin;

with recursive excluded_categories as (
  select id
  from public.carrefour_categories
  where id = 'cat20005'

  union all

  select c.id
  from public.carrefour_categories c
  join excluded_categories e on c.parent_id = e.id
),
excluded_ids as (
  select array_agg(id)::text[] as ids
  from excluded_categories
)
delete from public.carrefour_products p
using excluded_ids e
where p.category_ids && e.ids;

with recursive excluded_categories as (
  select id
  from public.carrefour_categories
  where id = 'cat20005'

  union all

  select c.id
  from public.carrefour_categories c
  join excluded_categories e on c.parent_id = e.id
)
delete from public.carrefour_categories c
using excluded_categories e
where c.id = e.id;

commit;
