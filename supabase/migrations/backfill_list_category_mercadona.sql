-- Backfill one-off: rellena `category_name` de los ítems de Mercadona ya guardados
-- SIN categoría (los añadidos desde búsqueda/navegación alfabética antes del fix de
-- cliente, o anteriores a la columna), para que la Lista deje de meterlos en "Otros"
-- y los agrupe por zona. El fix de cliente (api/catalog: searchProducts/browseProducts
-- adjuntan la categoría del espejo) solo afecta a lo NUEVO; esto repara lo existente.
--
-- Toma el nombre de categoría (N2) del espejo `mercadona_products` cruzando por el id
-- del producto. Idempotente y acotado: solo filas con category_name NULL, con
-- mercadona_product_id y con coincidencia en el espejo. No toca ítems manuales (sin id)
-- ni de otros súpers (esos ya traían su category_name al añadir).
-- El mapeo categoría → zona sigue siendo de cliente (src/constants/zones.ts).
-- Ejecutar en: Supabase → SQL Editor.

update public.list_items li
set category_name = mp.category_name
from public.mercadona_products mp
where li.category_name is null
  and li.mercadona_product_id is not null
  and mp.id = li.mercadona_product_id
  and mp.category_name is not null;

-- Mismo backfill en el historial, para que "repetir compra" recupere las zonas.
update public.purchase_items pi
set category_name = mp.category_name
from public.mercadona_products mp
where pi.category_name is null
  and pi.mercadona_product_id is not null
  and mp.id = pi.mercadona_product_id
  and mp.category_name is not null;
