-- Favoritos conscientes de la tienda: añade `store` a public.favorites.
-- Hasta ahora la identidad de un favorito era (user_id, kind, ref_id) — válido
-- cuando solo Mercadona se podía marcar. Con 6 súpers los ids se solapan
-- (p.ej. producto Mercadona "1669" vs Consum "1669"), así que la identidad pasa
-- a ser (user_id, kind, store, ref_id) y el Home puede agrupar por súper y abrir
-- el detalle correcto.
--
-- Ejecutar en: Supabase → SQL Editor. (Sin esto, fetchFavorites falla al pedir `store`.)

alter table public.favorites add column if not exists store text;

-- Backfill de filas existentes (réplica en SQL de constants/stores.ts → storeOfItem):
-- los productos por el dominio de la miniatura; las categorías solo podían ser de
-- Mercadona hasta ahora, así que el `else` cubre productos Mercadona y categorías.
update public.favorites set store = case
  when image_url ilike '%bonpreuesclat%' then 'esclat'
  when image_url ilike '%carrefour%'     then 'carrefour'
  when image_url ilike '%bonarea%'       then 'bonarea'
  when image_url ilike '%consum%'        then 'consum'
  when image_url ilike '%dia.es%'        then 'dia'
  else 'mercadona'
end
where store is null;

alter table public.favorites alter column store set not null;

-- Identidad por (user_id, kind, store, ref_id). El nombre del constraint viejo lo
-- generó Postgres a partir de la tabla y las columnas del UNIQUE original.
alter table public.favorites drop constraint if exists favorites_user_id_kind_ref_id_key;
alter table public.favorites add constraint favorites_user_id_kind_store_ref_id_key
  unique (user_id, kind, store, ref_id);
