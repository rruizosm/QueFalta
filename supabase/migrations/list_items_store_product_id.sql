-- Ficha de producto desde la cesta para TODOS los súpers (no solo Mercadona).
-- La cesta solo guardaba `mercadona_product_id`, así que al tocar un producto de
-- Bonpreu/Carrefour/bonÀrea/Consum/Dia no había id con el que abrir su detalle.
--
-- Columna nueva: el id del producto EN SU PROPIO súper (uuid de Bonpreu, code de
-- Consum/Dia, identifier de bonÀrea, id de Carrefour). La tienda se sigue
-- deduciendo en cliente del dominio de la imagen (src/constants/stores.ts), así
-- que con {tienda, store_product_id} se abre el modal correcto.
-- NULL en ítems manuales o anteriores a esta migración (no abrirán ficha, igual
-- que hasta ahora). Mercadona puede seguir usando mercadona_product_id.
-- Ejecutar en: Supabase → SQL Editor.

alter table public.list_items
  add column if not exists store_product_id text;

comment on column public.list_items.store_product_id is
  'Id del producto en su propio súper (para abrir la ficha desde la cesta). NULL = manual/histórico.';

-- También en el archivo de compras: así "repetir compra" desde Historial
-- restaura los ítems con su id y la ficha sigue abriéndose tras repetir.
alter table public.purchase_items
  add column if not exists store_product_id text;
