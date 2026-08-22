-- Comentarios compartidos por producto en el carrito.
--
-- La nota vive en list_items para que cualquier miembro del grupo vea y pueda
-- editar el mismo detalle. También se archiva en purchase_items para que
-- «Repetir compra» la restaure. Las policies actuales de ambas tablas siguen
-- aplicando; no se amplía el acceso a ninguna fila.

alter table public.list_items
  add column if not exists note text;

alter table public.list_items
  drop constraint if exists list_items_note_len;

alter table public.list_items
  add constraint list_items_note_len
  check (note is null or char_length(btrim(note)) between 1 and 280);

comment on column public.list_items.note is
  'Comentario compartido sobre el producto. NULL = sin comentario.';

alter table public.purchase_items
  add column if not exists note text;

alter table public.purchase_items
  drop constraint if exists purchase_items_note_len;

alter table public.purchase_items
  add constraint purchase_items_note_len
  check (note is null or char_length(btrim(note)) between 1 and 280);

comment on column public.purchase_items.note is
  'Comentario del producto archivado al finalizar la compra.';
