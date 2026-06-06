-- "Asignar artículos a miembros": cada artículo de la lista puede asignarse a
-- un miembro del grupo (su user id) o quedar sin asignar (null).
--
-- No requiere policy nueva: la policy UPDATE de list_items para miembros del
-- grupo (shopping_lists.sql) ya cubre cambiar esta columna.
--
-- Ejecutar en: Supabase → SQL Editor.

alter table public.list_items add column if not exists assigned_to uuid;
