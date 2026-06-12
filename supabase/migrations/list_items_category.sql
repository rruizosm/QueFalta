-- Lista agrupada por zona del súper (además de por tienda).
-- Columna nueva en list_items: el NOMBRE de la categoría del retailer tal cual
-- se conocía al añadir el producto (N1 si se añadió navegando por categorías;
-- la categoría primaria/hoja si vino de búsqueda o comparativa; NULL en ítems
-- manuales o anteriores a esta migración → caen en la zona "Otros").
--
-- El mapeo a la zona canónica de QuéFalta (Fruta y verdura, Congelados,
-- Droguería…) NO se guarda: se calcula en cliente (src/constants/zones.ts, por
-- palabras clave) para poder afinarlo sin migrar datos.
-- Ejecutar en: Supabase → SQL Editor.

alter table public.list_items
  add column if not exists category_name text;

comment on column public.list_items.category_name is
  'Categoría del retailer al añadir (N1 u hoja). NULL = manual/histórico → zona Otros.';

-- También en el archivo de compras: así "repetir compra" desde Historial
-- restaura los ítems con su categoría y la lista vuelve agrupada por zonas.
alter table public.purchase_items
  add column if not exists category_name text;
