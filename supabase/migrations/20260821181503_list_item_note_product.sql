-- Producto de catálogo vinculado opcionalmente a un comentario del carrito.
--
-- Guardamos una referencia estable (tienda + id) y un snapshot mínimo para
-- que el comentario siga siendo comprensible si el producto cambia o deja de
-- publicarse. Las policies actuales de list_items/purchase_items continúan
-- limitando lectura y escritura a los mismos usuarios; no se amplía acceso.

alter table public.list_items
  add column if not exists note_product_store text,
  add column if not exists note_product_id text,
  add column if not exists note_product_name text,
  add column if not exists note_product_image_url text,
  add column if not exists note_product_unit_price numeric;

alter table public.list_items
  drop constraint if exists list_items_note_product_shape;

alter table public.list_items
  add constraint list_items_note_product_shape check (
    (
      note_product_store is null
      and note_product_id is null
      and note_product_name is null
      and note_product_image_url is null
      and note_product_unit_price is null
    )
    or (
      note_product_store is not null
      and note_product_store in (
        'mercadona', 'esclat', 'carrefour', 'bonarea', 'consum', 'dia',
        'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi',
        'hiperdino', 'alcampo', 'plusfresc', 'gadis', 'froiz', 'ahorramas'
      )
      and note_product_id is not null
      and char_length(note_product_id) between 1 and 200
      and note_product_name is not null
      and char_length(btrim(note_product_name)) between 1 and 280
      and (note_product_image_url is null or char_length(note_product_image_url) between 1 and 2048)
      and (note_product_unit_price is null or note_product_unit_price >= 0)
    )
  );

comment on column public.list_items.note_product_store is
  'Supermercado del producto vinculado al comentario.';
comment on column public.list_items.note_product_id is
  'Id del producto vinculado dentro del catálogo de su supermercado.';
comment on column public.list_items.note_product_name is
  'Nombre visible conservado como snapshot del producto vinculado.';
comment on column public.list_items.note_product_image_url is
  'Miniatura conservada como snapshot del producto vinculado.';
comment on column public.list_items.note_product_unit_price is
  'Precio observado al vincular el producto; puede quedar desactualizado.';

alter table public.purchase_items
  add column if not exists note_product_store text,
  add column if not exists note_product_id text,
  add column if not exists note_product_name text,
  add column if not exists note_product_image_url text,
  add column if not exists note_product_unit_price numeric;

alter table public.purchase_items
  drop constraint if exists purchase_items_note_product_shape;

alter table public.purchase_items
  add constraint purchase_items_note_product_shape check (
    (
      note_product_store is null
      and note_product_id is null
      and note_product_name is null
      and note_product_image_url is null
      and note_product_unit_price is null
    )
    or (
      note_product_store is not null
      and note_product_store in (
        'mercadona', 'esclat', 'carrefour', 'bonarea', 'consum', 'dia',
        'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi',
        'hiperdino', 'alcampo', 'plusfresc', 'gadis', 'froiz', 'ahorramas'
      )
      and note_product_id is not null
      and char_length(note_product_id) between 1 and 200
      and note_product_name is not null
      and char_length(btrim(note_product_name)) between 1 and 280
      and (note_product_image_url is null or char_length(note_product_image_url) between 1 and 2048)
      and (note_product_unit_price is null or note_product_unit_price >= 0)
    )
  );

comment on column public.purchase_items.note_product_store is
  'Supermercado del producto vinculado al comentario archivado.';
comment on column public.purchase_items.note_product_id is
  'Id de catálogo del producto vinculado al comentario archivado.';
comment on column public.purchase_items.note_product_name is
  'Nombre conservado del producto vinculado al comentario archivado.';
comment on column public.purchase_items.note_product_image_url is
  'Miniatura conservada del producto vinculado al comentario archivado.';
comment on column public.purchase_items.note_product_unit_price is
  'Precio observado del producto vinculado al archivar la compra.';
