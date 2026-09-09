-- Lidl ya forma parte del catálogo canónico. Las restricciones del carrito
-- todavía enumeraban únicamente los supermercados anteriores, por lo que
-- Postgres rechazaba cualquier alta con store_key = 'lidl'. Mantén alineados
-- tanto el carrito activo como el histórico y los productos vinculados a notas.

alter table public.list_items
  drop constraint if exists list_items_store_key_allowed;
alter table public.list_items
  add constraint list_items_store_key_allowed check (store_key in (
    'mercadona', 'esclat', 'carrefour', 'bonarea', 'consum', 'dia',
    'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi', 'lidl',
    'hiperdino', 'alcampo', 'plusfresc', 'gadis', 'froiz', 'ahorramas', 'otros'
  ));

alter table public.purchase_items
  drop constraint if exists purchase_items_store_key_allowed;
alter table public.purchase_items
  add constraint purchase_items_store_key_allowed check (store_key in (
    'mercadona', 'esclat', 'carrefour', 'bonarea', 'consum', 'dia',
    'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi', 'lidl',
    'hiperdino', 'alcampo', 'plusfresc', 'gadis', 'froiz', 'ahorramas', 'otros'
  ));

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
        'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi', 'lidl',
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
        'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi', 'lidl',
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
