-- Preferencia de perfil: supermercados que el usuario quiere ver en el catálogo.
-- La app guarda un array de claves de tienda (p.ej. {'mercadona','carrefour'}).
-- NULL o vacío = "todos los supermercados" (comportamiento de usuarios antiguos).
-- Las claves válidas las define el cliente (CatalogStore en constants/stores.ts);
-- aquí no se valida con CHECK para no acoplar la BD a la lista de tiendas.
--
-- Ejecutar en: Supabase → SQL Editor.

alter table public.profiles
  add column if not exists catalog_stores text[];

comment on column public.profiles.catalog_stores is
  'Claves de supermercado visibles en el catálogo. NULL/[] = todos.';

-- No hace falta tocar RLS: la policy UPDATE existente de profiles (el usuario
-- edita su propia fila) ya cubre esta columna.
